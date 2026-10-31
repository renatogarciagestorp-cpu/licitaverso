#!/usr/bin/env python3
"""Agente Licitacon — análise automática de um documento com o Claude Sonnet 5.5.

Fluxo: texto do documento → fatos calculados por programa (prazos, dados do PNCP) → modelo verifica cada item
do roteiro → validação (itens, trechos literais, jurisprudência só entre candidatos da Biblioteca) → analise.json.
Depois: gerar-relatorio.py analise.json parecer.docx --pdf

Uso:
  ANTHROPIC_API_KEY=... python3 scripts/agente/analisar.py --doc edital --texto edital.txt [--compra compra.json] \
      [--fonte "link ou nome do arquivo"] --saida analise.json

A chave vem só da variável de ambiente (segredo do GitHub/Supabase); nunca é gravada em arquivo.
"""
import argparse, datetime, json, os, pathlib, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "scripts" / "agente"))
import importlib.util
_spec = importlib.util.spec_from_file_location("rel", RAIZ / "scripts" / "agente" / "gerar-relatorio.py")
rel = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(rel)

MODELO = os.environ.get("AGENTE_MODELO", "claude-sonnet-5-5")
PRECO = {"claude-sonnet-5-5": (2.0, 10.0, 0.10, 2.5), "claude-opus-5-5": (4.0, 20.0, 0.20, 5.0)}  # US$/milhão: entrada, saída, leitura de cache, escrita de cache(1,25x)
MAX_CARACTERES = 900_000  # ~250 mil tokens; documento maior que isso é recusado


# ------------------------------------------------------------------ fatos calculados por programa
def pascoa(ano):
    a = ano % 19; b = ano // 100; c = ano % 100; d = b // 4; e = b % 4; f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; mes = (h + l - 7 * m + 114) // 31; dia = ((h + l - 7 * m + 114) % 31) + 1
    return datetime.date(ano, mes, dia)

def feriados_nacionais(ano):
    fixos = [(1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (11, 20), (12, 25)]
    f = {datetime.date(ano, m, d) for m, d in fixos}
    f.add(pascoa(ano) - datetime.timedelta(days=2))  # Sexta-feira Santa
    return f

def dia_util(d):
    return d.weekday() < 5 and d not in feriados_nacionais(d.year)

def contar_dias_uteis_art183(divulgacao, fim):
    """Art. 183: exclui o dia do começo (o primeiro dia útil seguinte à divulgação), inclui o do vencimento."""
    d = divulgacao + datetime.timedelta(days=1)
    while not dia_util(d): d += datetime.timedelta(days=1)
    inicio = d  # dia do começo (excluído)
    n = 0; d = inicio + datetime.timedelta(days=1)
    while d <= fim:
        if dia_util(d): n += 1
        d += datetime.timedelta(days=1)
    return inicio, n

def fatos_pncp(compra):
    if not compra:
        return []
    f = []
    def data(k):
        v = compra.get(k)
        return datetime.datetime.fromisoformat(v) if v else None
    pub, enc = data("dataPublicacaoPncp"), data("dataEncerramentoProposta")
    f.append(f"Número de controle PNCP: {compra.get('numeroControlePNCP')}; modalidade: {compra.get('modalidadeNome')}; "
             f"registro de preços: {'sim' if compra.get('srp') else 'não'}; modo de disputa: {compra.get('modoDisputaNome')}.")
    if compra.get("valorTotalEstimado") is not None:
        f.append(f"Valor total estimado publicado no PNCP: R$ {compra['valorTotalEstimado']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                 + f"; situação do sigilo no PNCP: {compra.get('orcamentoSigilosoDescricao')}.")
    if compra.get("valorTotalHomologado"):
        f.append(f"Valor homologado: R$ {compra['valorTotalHomologado']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " (o certame já tem resultado).")
    if pub and enc:
        inicio, n = contar_dias_uteis_art183(pub.date(), enc.date())
        f.append(f"Divulgação no PNCP em {pub:%d/%m/%Y %H:%M}; fim do recebimento de propostas em {enc:%d/%m/%Y %H:%M}. "
                 f"Contagem pelo art. 183 (cálculo do sistema, só feriados nacionais): o dia do começo é {inicio:%d/%m/%Y} (excluído) "
                 f"e o encerramento cai no {n}º dia útil. Feriados estaduais ou municipais não foram considerados.")
    return f


# ------------------------------------------------------------------ trilhas automáticas (tipologias)
def _mapa_normalizado(t):
    """Texto sem acentos e minúsculo, com o índice do caractere original de cada posição."""
    out, idx = [], []
    for i, ch in enumerate(t):
        for c in unicodedata.normalize("NFD", ch.lower()):
            if unicodedata.category(c) != "Mn":
                out.append(c); idx.append(i)
    return "".join(out), idx

def _num(v):
    try:
        return float(str(v).replace(".", "").replace(",", ".")) if "," in str(v) else float(v)
    except Exception:
        return None

def rodar_trilhas(bruto):
    arq = RAIZ / "agente" / "tipologias" / "lei-14133.json"
    if not arq.exists():
        return []
    trilhas = json.loads(arq.read_text(encoding="utf-8"))["trilhas"]
    paginas = bruto.split("\f")
    achados = []
    for tr in trilhas:
        ocorr = []
        for npag, pag in enumerate(paginas, 1):
            norm, idx = _mapa_normalizado(pag)
            norm1 = re.sub(r"\s", " ", norm)
            for pad in tr["padroes"]:
                for m in re.finditer(pad, norm1):
                    if "limite" in tr:
                        vals = [_num(v) for k, v in m.groupdict().items() if v]
                        if not vals or max(v for v in vals if v is not None) <= tr["limite"]:
                            continue
                    a, b = idx[max(0, m.start() - 160)], idx[min(len(idx) - 1, m.end() + 160)]
                    ocorr.append({"pagina": npag, "trecho": re.sub(r"\s+", " ", pag[a:b]).strip()})
                    if len(ocorr) >= 3: break
                if len(ocorr) >= 3: break
            if len(ocorr) >= 3: break
        if ocorr:
            achados.append({"id": tr["id"], "nome": tr["nome"], "gravidade": tr["gravidade"], "item": tr.get("item"), "nota": tr["nota"],
                            "fundamento": "; ".join(rel.rotulo({"norma": "lei-14133", **f}) for f in tr["fundamento"]), "ocorrencias": ocorr})
    return achados


# ------------------------------------------------------------------ montagem do pedido
def texto_com_paginas(txt):
    pags = txt.split("\f")
    if len(pags) <= 1:
        return txt, 0
    return "\n".join(f"\n[página {i}]\n{p.strip()}" for i, p in enumerate(pags, 1) if p.strip()), len(pags)

def itens_aplicaveis(roteiro, doc):
    """Itens do tipo de documento. O edital costuma trazer a planilha/orçamento como anexo: aplica também os itens de planilha
    (o modelo marca 'nao_aplicavel' quando não houver mão de obra dedicada ou planilha)."""
    tipos = {doc} | ({"planilha"} if doc == "edital" else set())
    return [i for i in roteiro["itens"] if i["doc"] in tipos]

REGIMES = {"lei-14133": "Lei 14.133/2021", "lei-13303": "Lei 13.303/2016 (empresas estatais)",
           "lei-13019": "Lei 13.019/2014 (parcerias com organizações da sociedade civil)"}
OBJETOS = {"obras": "obras-engenharia", "mao-de-obra": "mao-de-obra"}
OBJETO_TEXTO = {"obras": "obras e serviços de engenharia", "mao-de-obra": "serviço com dedicação exclusiva de mão de obra"}
ANEXO_TEXTO = {"orcamento": "Planilha orçamentária, BDI e composições", "planilha": "Planilha de custos e formação de preços (mão de obra)",
               "plano-custos": "Planilha de custos do plano de trabalho", "cct": "Convenção ou acordo coletivo de trabalho",
               "outro": "Planilha anexa"}
FONTES_OBJETO = {"obras": {"tcu-roteiro-obras", "tcu-obras-edificacoes", "tcu-engenharia-custos"},
                 "mao-de-obra": {"in-05-2017", "manual-planilha-custos", "cad-limpeza", "cad-vigilancia", "cad-conta-vinculada", "cad-fato-gerador"}}


def carregar_roteiro(regime):
    """Roteiro do regime; enquanto não houver roteiro próprio, usa o da Lei 14.133 como base (o modelo adapta os fundamentos)."""
    p = RAIZ / "agente" / "roteiros" / f"{regime}.json"
    proprio = p.exists()
    r = json.loads((p if proprio else RAIZ / "agente" / "roteiros" / "lei-14133.json").read_text(encoding="utf-8"))
    r["_proprio"] = proprio
    return r


def fundamento_do_regime(it, regime):
    f = it.get("fundamento") or []
    if isinstance(f, dict):
        f = f.get(regime) or f.get("lei-14133") or []
    return f


def montar_itens(roteiro, doc, regime, objetos, extras=()):
    """Itens do roteiro do regime para o(s) documento(s) + itens dos módulos do objeto (obras, mão de obra), com o fundamento do regime.
    Com mais de um documento, entram também os itens de coerência entre documentos ('cruzado')."""
    itens = itens_aplicaveis(roteiro, doc)
    for t in dict.fromkeys(extras):
        itens += [i for i in itens_aplicaveis(roteiro, t) if i["id"] not in {x["id"] for x in itens}]
    if extras:
        itens += [i for i in roteiro["itens"] if i["doc"] == "cruzado" and i["id"] not in {x["id"] for x in itens}]
    ids = {i["id"] for i in itens}
    if "mao-de-obra" in objetos:  # itens de planilha do roteiro do regime valem para qualquer documento
        itens += [i for i in roteiro["itens"] if i["doc"] == "planilha" and i["id"] not in ids]
    versoes = [f"roteiro {roteiro['versao']}"]
    for o in objetos:
        m = json.loads((RAIZ / "agente" / "roteiros" / "modulos" / f"{OBJETOS[o]}.json").read_text(encoding="utf-8"))
        itens += [dict(i, modulo=o) for i in m["itens"]]
        versoes.append(f"módulo {m['titulo'].lower()} {m['versao']}")
    return [dict(i, fundamento=fundamento_do_regime(i, regime)) for i in itens], versoes


def carregar_anexos(specs):
    """--anexo "tipo::nome::caminho.txt" → lista de anexos (texto já extraído da planilha)."""
    out = []
    for k, sp in enumerate(specs, 1):
        partes = sp.split("::")
        if len(partes) != 3:
            sys.exit(f"--anexo inválido: {sp!r} (use tipo::nome::caminho)")
        tipo, nome, cam = partes
        txt = pathlib.Path(cam).read_text(encoding="utf-8", errors="replace").strip()
        if txt:
            out.append({"id": f"anexo-{k}", "tipo": tipo if tipo in ANEXO_TEXTO else "outro", "nome": nome.strip()[:200], "texto": txt[:300_000]})
    return out


def bloco_anexos(anexos):
    if not anexos:
        return ""
    partes = ["ANEXOS ENVIADOS PELO DESTINATÁRIO. Nas planilhas (Excel), cada linha traz o número da linha e as células preenchidas no formato "
              "COLUNA=valor; fórmulas aparecem entre colchetes após o valor calculado. Ao citar, copie em \"trecho\" o conteúdo literal "
              "de uma linha e indique em \"local\" o anexo, a aba e a linha (ex.: \"Planilha orçamentária, aba Orçamento, L12\"). "
              "Na convenção coletiva, cite a cláusula:"]
    for a in anexos:
        partes.append(f"<anexo id=\"{a['id']}\" tipo=\"{ANEXO_TEXTO[a['tipo']]}\" arquivo=\"{a['nome']}\">\n{a['texto']}\n</anexo>")
    return "\n\n".join(partes) + "\n\n"


# ------------------------------------------------------------------ jurisprudência fora do acervo (varredura em fonte oficial)
EXTERNOS = {}  # id -> documento no formato do acervo (achados nesta análise)
_cand_cache = {}
_busca_cache = {}
_VARREDURA = {"inicio": None, "limite_s": 120, "falhas": 0}  # orçamento de tempo: a varredura nunca atrasa muito a análise

def _tcu_js(termo, n=4):
    if termo in _busca_cache:
        return _busca_cache[termo]
    if _VARREDURA["inicio"] is None:
        _VARREDURA["inicio"] = time.time()
    if time.time() - _VARREDURA["inicio"] > _VARREDURA["limite_s"] or _VARREDURA["falhas"] >= 3:
        return []
    url = ("https://pesquisa.apps.tcu.gov.br/rest/publico/base/jurisprudencia-selecionada/documentosResumidos?"
           + urllib.parse.urlencode({"termo": termo, "ordenacao": "score desc", "quantidade": n, "inicio": 0}))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://pesquisa.apps.tcu.gov.br/"})
        _busca_cache[termo] = json.load(urllib.request.urlopen(req, timeout=12)).get("documentos", [])
    except Exception:
        _VARREDURA["falhas"] += 1
        _busca_cache[termo] = []
    return _busca_cache[termo]

def _doc_tcu(x):
    limpa = lambda t: re.sub(r"<[^>]+>", "", t or "").strip()
    key = x["KEY"].rsplit("-", 1)[-1]
    d, m, a = (x.get("DATASESSAOFORMATADA") or "//").split("/")
    enun = limpa(x.get("ENUNCIADO"))
    num = f"Acórdão {x.get('NUMACORDAO')}/{x.get('ANOACORDAO')}-{x.get('COLEGIADO')}"
    url = f"https://pesquisa.apps.tcu.gov.br/documento/jurisprudencia-selecionada/*/KEY%253AJURISPRUDENCIA-SELECIONADA-{key}/score%2520desc/0"
    meses = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."]
    rel_ = (x.get("AUTORTESE") or "").title()
    return {"id": f"tcu-js-{key}", "orgao": "TCU", "numero": num, "colegiado": x.get("COLEGIADO"), "relator": f"Min. {rel_}" if rel_ else "",
            "data": f"{a}-{m}-{d}" if a else "", "tema": limpa(x.get("TEMA")), "titulo": enun[:170], "tese": enun,
            "tags": [limpa(x.get("TEMA")), limpa(x.get("SUBTEMA"))], "fonte_nome": "TCU – Jurisprudência Selecionada", "fonte_url": url,
            "citacao_abnt": (f"BRASIL. Tribunal de Contas da União ({x.get('COLEGIADO')}). {num}. Relator: Ministro(a) {rel_}. "
                             f"Julgado em {int(d)} {meses[int(m) - 1]} {a}. TCU – Jurisprudência Selecionada. Disponível em: {url}.") if a else num,
            "_externo": True}

def candidatos(it, n=6):
    """Precedentes do acervo; se não houver, varredura na Jurisprudência Selecionada do TCU com os temas do item."""
    if it["id"] in _cand_cache:
        return _cand_cache[it["id"]]
    c = rel.jurisprudencia(it.get("temas"), n=n)
    if not c and os.environ.get("AGENTE_SEM_VARREDURA") != "1":
        vistos = set()
        for t in (it.get("temas") or [])[:4]:
            for x in _tcu_js(t):
                doc = _doc_tcu(x)
                if doc["id"] not in vistos and doc["tese"]:
                    vistos.add(doc["id"]); c.append(doc); EXTERNOS[doc["id"]] = doc
            if len(c) >= 4:
                break
    _cand_cache[it["id"]] = c[:n]
    return _cand_cache[it["id"]]


# ------------------------------------------------------------------ fontes técnicas de referência (busca de trechos)
_REF = None
_STOP = set("a o as os de da do das dos e em no na nos nas um uma por para com sem que se ao aos à às ou como mais ser sua seu suas seus "
            "este esta isso pelo pela pelos pelas sobre entre quando deve deverá poderá caso não sim art lei nº".split())

def _tok(t):
    t = unicodedata.normalize("NFD", (t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return [w for w in re.findall(r"[a-z0-9]{3,}", t) if w not in _STOP]

def _carregar_ref():
    global _REF
    if _REF is None:
        ind, cat = RAIZ / "agente/referencias/indice.json", RAIZ / "agente/referencias/fontes.json"
        if not ind.exists():
            _REF = ([], {}, {}, 0, {}); return _REF
        trechos = json.loads(ind.read_text(encoding="utf-8"))["trechos"]
        fontes = {f["id"]: f for f in json.loads(cat.read_text(encoding="utf-8"))["fontes"]}
        import collections, math
        df = collections.Counter()
        for t in trechos:
            t["_tf"] = collections.Counter(_tok(t["texto"] + " " + (t.get("secao") or "")))
            t["_len"] = sum(t["_tf"].values()) or 1
            df.update(t["_tf"].keys())
        n = len(trechos)
        idf = {w: math.log(1 + (n - c + 0.5) / (c + 0.5)) for w, c in df.items()}
        media = sum(t["_len"] for t in trechos) / max(1, n)
        _REF = (trechos, fontes, idf, media, {t["id"]: t for t in trechos})
    return _REF

def _bm25(q, t, idf, media, k1=1.4, b=0.75):
    s = 0.0
    for w in q:
        f = t["_tf"].get(w)
        if f:
            s += idf.get(w, 0) * f * (k1 + 1) / (f + k1 * (1 - b + b * t["_len"] / media))
    return s

def selecionar_referencias(itens, texto_doc, limite=16, forcar=()):
    trechos, fontes, idf, media, _ = _carregar_ref()
    if not trechos:
        return []
    import collections
    termos_doc = [w for w, _ in collections.Counter(w for w in _tok(texto_doc[:60000]) if len(w) >= 5).most_common(30)]
    doc_norm = " ".join(_tok(texto_doc[:6000]))  # o objeto aparece no início do documento
    permitidas = {fid for fid, f in fontes.items() if not f.get("exige") or re.search(f["exige"], doc_norm) or fid in forcar}
    trechos = [t for t in trechos if t["fonte"] in permitidas]
    escolhidos = {}
    for it in itens:
        q = list(dict.fromkeys(_tok(" ".join([it["titulo"], it["verificar"], " ".join(it.get("temas") or [])]))))
        melhores = sorted(((_bm25(q, t, idf, media) + 0.3 * _bm25(termos_doc, t, idf, media), t) for t in trechos), key=lambda x: -x[0])[:2]
        for sc, t in melhores:
            if sc >= 12 and (t["id"] not in escolhidos or escolhidos[t["id"]][0] < sc):
                escolhidos[t["id"]] = (sc, t, it["id"])
    lista = sorted(escolhidos.values(), key=lambda x: -x[0])
    por_fonte, saida = collections.Counter(), []
    for sc, t, iid in lista:
        if por_fonte[t["fonte"]] >= 4:
            continue
        por_fonte[t["fonte"]] += 1
        f = fontes.get(t["fonte"], {})
        saida.append({"id": t["id"], "fonte": t["fonte"], "titulo_fonte": f.get("titulo", t["fonte"]), "alcance": f.get("alcance", ""),
                      "secao": t.get("secao") or "", "pagina": t.get("pagina"), "texto": t["texto"][:1500], "item": iid,
                      "abnt": f.get("abnt", ""), "url": f.get("url", "")})
        if len(saida) >= limite:
            break
    return saida

# ------------------------------------------------------------------ regulamentação específica enviada pelo assinante
NORMAS_LOCAIS = []  # [{id, nome, texto}]

def carregar_normas_locais(specs):
    for k, spec in enumerate(specs or [], 1):
        nome, _, caminho = spec.partition("::")
        p = pathlib.Path(caminho)
        if p.exists():
            NORMAS_LOCAIS.append({"id": f"local-{k}", "nome": nome.strip() or f"Regulamentação local {k}",
                                  "texto": p.read_text(encoding="utf-8", errors="replace")})

def artigo_local(nid, art):
    n = next((x for x in NORMAS_LOCAIS if x["id"] == nid), None)
    if not n:
        return None
    m = re.search(r"(?:^|\n)\s*Art\.?\s*" + re.escape(str(art)) + r"\s*[º°o]?\s*[.\-–]?\s*(.+?)(?=\n\s*Art\.?\s*\d|\Z)", n["texto"], re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:900] if m else None

def bloco_normas_locais(itens, limite_total=150_000):
    if not NORMAS_LOCAIS:
        return ""
    partes = ["REGULAMENTAÇÃO ESPECÍFICA ENVIADA PELO DESTINATÁRIO (considere-a na análise; cite-a no fundamento com norma = id indicado):"]
    total = sum(len(n["texto"]) for n in NORMAS_LOCAIS)
    for n in NORMAS_LOCAIS:
        if total <= limite_total:
            partes.append(f'<norma id="{n["id"]}" nome="{n["nome"]}">\n{n["texto"]}\n</norma>')
            continue
        # norma extensa: só os artigos mais pertinentes aos itens do roteiro
        arts = [a for a in re.split(r"\n(?=\s*Art\.?\s*\d)", n["texto"]) if len(a.strip()) > 40]
        import collections, math
        tfs = [collections.Counter(_tok(a)) for a in arts]
        df = collections.Counter(w for tf in tfs for w in tf)
        idf = {w: math.log(1 + (len(arts) - c + 0.5) / (c + 0.5)) for w, c in df.items()}
        q = _tok(" ".join(it["titulo"] + " " + " ".join(it.get("temas") or []) for it in itens))
        notas = sorted(range(len(arts)), key=lambda i: -sum(idf.get(w, 0) * min(tfs[i].get(w, 0), 3) for w in set(q)))[:40]
        trechos = "\n".join(arts[i].strip()[:2500] for i in sorted(notas))
        partes.append(f'<norma id="{n["id"]}" nome="{n["nome"]}" (trechos mais pertinentes; norma extensa)>\n{trechos}\n</norma>')
    return "\n".join(partes) + "\n\n"


ALCANCE = {"nacional": "aplicação nacional", "federal-parametro": "norma/orientação federal — vincula a União; para estados, municípios e DF é parâmetro de boa prática, salvo adoção pelo ente (art. 187 da Lei 14.133/2021)"}

def bloco_referencias(refs):
    if not refs:
        return ""
    linhas = ["TRECHOS DE REFERÊNCIA TÉCNICA (fontes oficiais; use como fundamento complementar e cite em referencias_ids):"]
    for r in refs:
        loc = (f", {r['secao']}" if r["secao"] else "") + (f", p. {r['pagina']}" if r["pagina"] else "")
        linhas.append(f"[{r['id']}] {r['titulo_fonte']}{loc} ({ALCANCE.get(r['alcance'], r['alcance'])}):\n{r['texto']}\n")
    return "\n".join(linhas) + "\n\n"


def bloco_roteiro(itens):
    linhas = []
    for it in itens:
        fund = []
        for f in it["fundamento"]:
            tl = rel.texto_legal(f) or "[texto não disponível na base]"
            fund.append(f"    - {rel.rotulo(f)}: \"{tl}\"")
        cands = candidatos(it)
        js = "\n".join(f"    - [{j['id']}] {j.get('orgao','')} {j.get('numero','')}{' (fonte oficial, fora do acervo)' if j.get('_externo') else ''}: {(j.get('tese') or j.get('titulo') or '')[:400]}" for j in cands) or "    (nenhum)"
        linhas.append(
            f"### {it['id']} — {it['titulo']}\n"
            f"  O que verificar: {it['verificar']}\n"
            + (f"  Quando se aplica: {it['quando']}\n" if it.get("quando") else "")
            + f"  Obrigatório: {it.get('obrigatorio', '')}; gravidade se houver falha: {it['gravidade']}\n"
            f"  Fundamento (texto oficial vigente):\n" + "\n".join(fund) + "\n"
            f"  Risco padrão: {it['risco']}\n  Dica padrão: {it['dica']}\n"
            f"  Jurisprudência candidata (use só estes ids, e só se pertinentes ao caso):\n{js}\n")
    return "\n".join(linhas)

INSTRUCOES = """Você é o Agente Licitacon, analista sênior em licitações, contratos públicos e parcerias (Leis 14.133/2021, 13.303/2016 e 13.019/2014).
Sua tarefa: verificar o documento enviado contra CADA item do roteiro abaixo e registrar o resultado com a ferramenta registrar_analise.

Regras obrigatórias:
1. Avalie todos os itens do roteiro, um a um. Resultados possíveis:
   conforme · parcial (atende em parte) · nao_conforme · nao_aplicavel (o item não se aplica a este caso; diga por quê em constatacao) ·
   nao_verificavel (a informação depende de documento que não foi enviado).
2. Fundamente-se apenas no texto do documento, nos fatos calculados pelo sistema e no texto legal fornecido. Não invente dispositivos,
   números de acórdão, datas ou valores. Não cite leis fora do roteiro.
3. O campo "trecho" deve ser cópia LITERAL de até ~400 caracteres do documento (o sistema confere), e "local" deve indicar item/cláusula e a página ([página N]).
4. Para parcial e nao_conforme: preencha constatacao (o que está errado no caso concreto), porque (por que contraria a lei, relacionando
   com o texto legal), correcao (providência concreta) e, quando útil, redacao_sugerida (texto pronto para o edital/ETP/TR) e risco (específico do caso).
5. Para conforme: constatacao curta é opcional; preencha "dica" apenas quando houver melhoria real e específica (não repita a dica padrão genérica).
6. jurisprudencia_ids: escolha só entre os candidatos listados no item, e só os que tratam do mesmo problema. Lista vazia é melhor que precedente impertinente.
7. Seja rigoroso e equilibrado: não aponte falha sem base no texto; não deixe passar falha evidente. Em dúvida razoável, use parcial e explique.
8. Considere a situação do processo (ex.: se já foi homologado, as providências se dirigem à execução/ata e aos próximos certames).
9. Escreva em português formal, claro e objetivo, no registro de um parecer técnico (sem "eu"; prefira a voz impessoal).
10. O parecer é OPINATIVO e deve ser COMPLETO: registre todos os aspectos relevantes, dos críticos aos leves. Um ponto de baixa
    vulnerabilidade, que hoje não invalida o processo mas pode gerar questionamento, retrabalho ou risco no futuro, também deve ser informado
    (como parcial com gravidade "baixa", ou como dica). A decisão de corrigir ou manter é de quem recebe o parecer; omitir um ponto tira dele essa escolha.
11. "gravidade" (opcional, por item): ajuste ao caso concreto quando a gravidade padrão do roteiro não refletir o risco real (alta, media ou baixa).
12. BASE LEGAL NACIONAL: além da Lei 14.133/2021, a base tem o texto oficial vigente da Constituição Federal (norma "cf-1988"), da LC
    101/2000 – LRF ("lc-101"), da LC 123/2006 ("lc-123"), da LINDB ("dl-4657") e das Leis 13.303/2016 ("lei-13303", estatais), 13.019/2014
    ("lei-13019", parcerias com OSC), 4.320/1964 ("lei-4320") e 10.192/2001 ("lei-10192"), aplicáveis a todos os entes. Use-as quando pertinentes, indicando a norma
    no fundamento dos outros_apontamentos (campo "norma"). Se o documento for de empresa estatal, o regime é o da Lei 13.303/2016 e do seu
    regulamento interno (RILC), e não o da Lei 14.133 (salvo nas matérias em que esta se aplica); registre isso e adapte a análise.
12-A. "outros_apontamentos": problemas relevantes encontrados no documento que NÃO se encaixam em nenhum item do roteiro (ex.: erros materiais,
    cláusulas contraditórias, exigências sem previsão legal, prazos inconsistentes). Para cada um: titulo, constatacao, trecho literal, local,
    fundamento (lista de {art, disp} da Lei 14.133/2021, use disp como "caput", "I", "p1", "p1.I", "pu", "I.a"; deixe vazio se não houver dispositivo
    específico), porque, risco, correcao, gravidade. Não repita o que já está nos itens do roteiro.
13. Contratação direta (dispensa ou inexigibilidade): o ETP é exigido "se for o caso" (art. 72, I, da Lei 14.133/2021) e pode ter sido
    dispensado por norma local. Se o documento enviado como ETP for, na verdade, uma justificativa de não elaboração do ETP, NÃO aplique
    os itens de conteúdo do ETP como se fossem obrigatórios: marque-os como nao_aplicavel ("ETP dispensado — art. 72, I") e avalie a
    motivação da dispensa no item de justificativa (parcial/nao_conforme se for genérica). Lacunas que continuam obrigatórias na contratação
    direta (estimativa de despesa, razão da escolha do contratado, justificativa de preço — art. 72, II, VI e VII) vão em outros_apontamentos,
    com esse fundamento, e não como falha do ETP.
14. GRAVIDADE ALTA (política do Licitacon): classifique como "alta" toda irregularidade que possa (a) comprometer ou restringir a
    competitividade, (b) direcionar o certame para determinada empresa ou marca, ou (c) indicar sobrepreço no orçamento estimado ou risco
    de superfaturamento na execução — inclusive orçamento montado com convenção coletiva de categoria diversa da contratada, preços sem
    pesquisa adequada ou quantitativos superdimensionados. Exemplos que são SEMPRE alta: especificação excessivamente detalhada ou sem
    tolerâncias que reduza o número de fornecedores aptos (risco de direcionamento); exigência de habilitação fora do rol legal ou acima dos
    limites; prazo de divulgação abaixo do mínimo legal; orçamento sem pesquisa de preços que permita aferir sua compatibilidade com o mercado. Use "media" para falhas formais ou de instrução com risco moderado e "baixa" para
    imprecisões e boas práticas. Ajuste a gravidade padrão do roteiro sempre que o caso concreto se enquadrar nesta política.
15. INDÍCIOS DAS TRILHAS AUTOMÁTICAS: o sistema procurou no documento padrões de texto associados a irregularidades (como fazem as trilhas
    do ALICE, da CGU/TCU). Avalie CADA indício no contexto: confirme quando a irregularidade de fato existe (registre-a no item do roteiro
    indicado ou em outros_apontamentos) ou descarte quando for falso positivo (por exemplo, texto que proíbe a prática, ou percentual que
    não se refere à exigência). Informe a decisão em "trilhas_avaliadas" ({id, confirmado, motivo}).
16. FONTES TÉCNICAS: os trechos de referência (instruções normativas, cadernos de logística, manuais e cartilhas oficiais) servem
    de fundamento complementar. Cite-os em "referencias_ids" quando embasarem a análise. Respeite o alcance indicado: instrução normativa,
    caderno ou manual federal vincula a União; para estados, municípios e DF apresente como parâmetro ou boa prática ("conforme orientação
    federal...", "recomenda-se, por analogia..."), salvo se o ente o tiver adotado (art. 187 da Lei 14.133/2021) ou se a regulamentação local
    enviada assim dispuser. Nunca trate norma federal infralegal como obrigatória para município sem essa ressalva.
17. REGULAMENTAÇÃO ESPECÍFICA: se o destinatário enviou decreto, regulamento ou RILC, considere-o na análise. Hierarquia: a
    Constituição e as normas gerais nacionais (Lei 14.133/2021, Lei 13.303/2016 etc.) prevalecem; o regulamento local vale no que as
    complementa e no espaço que a lei geral deixou ao ente (ex.: art. 187 da Lei 14.133/2021). Se o regulamento local adotar instrução
    normativa federal, trate-a como obrigatória para aquele ente. Se uma regra local contrariar a norma geral, aponte o conflito (sem deixar
    de informar o que o regulamento diz). Cite artigos do regulamento local em fundamento com norma = "local-N" e o número do artigo.
18. ANÁLISE DE PREÇOS: quando os fatos do sistema trouxerem "INDÍCIO DE SOBREPREÇO", registre-o como irregularidade de gravidade ALTA
    no item de estimativa de valor do roteiro (ou em outros_apontamentos, se o documento não tiver item correspondente), com fundamento
    no art. 23 da Lei 14.133/2021, citando o desvio calculado; recomende revisar a pesquisa de preços. "Ponto de atenção" é gravidade média.
    Amostra insuficiente ou heterogênea não permite concluir: não aponte sobrepreço nesses casos.
19. Preencha também: processo (órgão, número, objeto, modalidade), ementa (palavras-chave em caixa alta separadas por ponto),
    ementa_texto (síntese de 2–3 frases), resumo (um parágrafo de visão geral) e conclusao (um parágrafo).
20. REGIME E OBJETO: a mensagem informa o regime jurídico da contratação e, quando for o caso, o objeto especial (obras e serviços de
    engenharia; dedicação exclusiva de mão de obra). O ponto central é sempre analisar os documentos pelo que estabelece a lei do regime
    informado: conformidade, legalidade, economicidade, vantajosidade, eventual direcionamento ou restrição à competitividade, sobrepreço e
    risco de superfaturamento. Cada item traz o fundamento do regime; se o roteiro for o da Lei 14.133 usado como base para outro regime
    (a mensagem avisa), avalie a mesma questão pela lei do regime e cite os dispositivos dela em outros_apontamentos ou na análise, sem
    aplicar regra da Lei 14.133 que não valha para aquele regime. Na Lei 13.019/2014 o termo de referência é substituído pelo plano de
    trabalho e pela planilha de custos do projeto; havendo profissional com dedicação exclusiva previsto no plano, o custo dele deve ser
    formado pelo modelo de planilha de custos e formação de preços do Anexo VII-D da IN SEGES/MP 5/2017 (parâmetro técnico).
21. PLANILHAS EM EXCEL: quando houver anexos em planilha, verifique neles os itens dos módulos (BDI, encargos, tabelas, datas-base,
    CBO, piso, adicionais, provisões, tributos) e confira os cálculos pelas fórmulas e valores informados. Divergência numérica relevante
    (BDI aplicado diferente do declarado, total que não fecha, percentual acima do legal) deve ser apontada com a linha da planilha e o
    valor esperado. Se o objeto exigir planilha e ela não tiver sido enviada, procure as informações no documento; não as encontrando,
    marque os itens como nao_verificavel e recomende a juntada da planilha.
22. REFERÊNCIA SALARIAL (salario.com.br): a economicidade do custo da mão de obra se avalia pelo CUSTO TOTAL do profissional na
    planilha modelo, e não pelo salário-base. Quando os fatos trouxerem "CUSTO DO PROFISSIONAL ACIMA DA REFERÊNCIA DO ESTADO", registre
    o ponto com gravidade ALTA (risco de sobrepreço), no item de custos do módulo de mão de obra (ou em outros_apontamentos),
    demonstrando a diferença. Posto "não analisado" por qualidade do arquivo: informe que a verificação não foi possível porque o
    arquivo fornecido não permitiu leitura segura, sem estimar ou deduzir valores ou CBO, e recomende a apresentação de versão legível. Como não há norma
    que adote o salario.com.br como balizador, NÃO seja incisivo: não afirme sobrepreço nem superfaturamento; apresente a inconsistência
    como indício que merece verificação e oriente o ajuste (conferir o piso da convenção da categoria e da base territorial, justificar
    salário acima do piso ou do mercado, revisar a planilha). "Ligeiramente acima" é gravidade média; "compatível" pode ser citado como
    indicativo de vantajosidade. O salário-base igual ao piso da convenção correta, ainda que acima da média do site, deve ser
    reconhecido como justificativa, sem prejuízo de apontar a diferença."""

FERRAMENTA = {
    "name": "registrar_analise",
    "description": "Registra o resultado da análise do documento contra o roteiro.",
    "input_schema": {
        "type": "object",
        "properties": {
            "processo": {"type": "object", "properties": {k: {"type": "string"} for k in ("orgao", "numero", "objeto", "modalidade")},
                         "required": ["orgao", "numero", "objeto", "modalidade"]},
            "ementa": {"type": "string"}, "ementa_texto": {"type": "string"},
            "resumo": {"type": "string"}, "conclusao": {"type": "string"},
            "resultados": {"type": "array", "items": {"type": "object", "properties": {
                "item": {"type": "string"},
                "resultado": {"type": "string", "enum": ["conforme", "parcial", "nao_conforme", "nao_aplicavel", "nao_verificavel"]},
                "local": {"type": "string"}, "trecho": {"type": "string"}, "constatacao": {"type": "string"},
                "porque": {"type": "string"}, "risco": {"type": "string"}, "correcao": {"type": "string"},
                "redacao_sugerida": {"type": "string"}, "dica": {"type": "string"},
                "gravidade": {"type": "string", "enum": ["alta", "media", "baixa"]},
                "referencias_ids": {"type": "array", "items": {"type": "string"}},
                "jurisprudencia_ids": {"type": "array", "items": {"type": "string"}}},
                "required": ["item", "resultado"]}},
            "trilhas_avaliadas": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "string"}, "confirmado": {"type": "boolean"}, "motivo": {"type": "string"}}, "required": ["id", "confirmado"]}},
            "outros_apontamentos": {"type": "array", "items": {"type": "object", "properties": {
                "titulo": {"type": "string"}, "constatacao": {"type": "string"}, "trecho": {"type": "string"}, "local": {"type": "string"},
                "fundamento": {"type": "array", "items": {"type": "object", "properties": {
                    "norma": {"type": "string", "description": "lei-14133 (padrão), lei-13303, lei-13019, lei-4320, lei-10192 ou outra norma da base"},
                    "art": {"type": "string"}, "disp": {"type": "string"}}, "required": ["art"]}},
                "porque": {"type": "string"}, "risco": {"type": "string"}, "correcao": {"type": "string"},
                "referencias_ids": {"type": "array", "items": {"type": "string"}},
                "gravidade": {"type": "string", "enum": ["alta", "media", "baixa"]}},
                "required": ["titulo", "constatacao", "gravidade"]}},
        },
        "required": ["processo", "ementa", "ementa_texto", "resumo", "conclusao", "resultados"],
    },
}


def _ler_stream(resp):
    """Lê a resposta em streaming (SSE) e remonta a mensagem no mesmo formato da resposta comum."""
    msg = {"content": [], "usage": {}, "stop_reason": None, "model": None}
    blocos = {}
    evento = None
    for bruta in resp:
        linha = bruta.decode("utf-8", errors="replace").rstrip("\r\n")
        if linha.startswith("event:"):
            evento = linha[6:].strip(); continue
        if not linha.startswith("data:"):
            continue
        d = json.loads(linha[5:].strip() or "{}")
        t = d.get("type", evento)
        if t == "message_start":
            m = d.get("message", {}); msg["model"] = m.get("model"); msg["usage"].update(m.get("usage") or {})
        elif t == "content_block_start":
            cb = dict(d["content_block"]); cb["_json"] = ""; blocos[d["index"]] = cb
        elif t == "content_block_delta":
            cb = blocos[d["index"]]; dl = d["delta"]
            if dl.get("type") == "input_json_delta": cb["_json"] += dl.get("partial_json", "")
            elif dl.get("type") == "text_delta": cb["text"] = cb.get("text", "") + dl.get("text", "")
        elif t == "message_delta":
            msg["stop_reason"] = d.get("delta", {}).get("stop_reason") or msg["stop_reason"]
            for k, v in (d.get("usage") or {}).items():
                msg["usage"][k] = v
        elif t == "error":
            raise ConnectionError("erro no streaming: " + json.dumps(d)[:300])
    for i in sorted(blocos):
        cb = blocos[i]
        if cb.get("type") == "tool_use":
            try:
                cb["input"] = json.loads(cb["_json"] or "{}")
            except json.JSONDecodeError:  # saída cortada (limite de tokens): não é falha de conexão, não repetir às cegas
                cb["input"] = None
                msg["truncado"] = True
        cb.pop("_json", None)
        msg["content"].append(cb)
    return msg


def chamar(system, usuario, max_tokens=128000):
    chave = os.environ.get("ANTHROPIC_API_KEY")
    if not chave:
        sys.exit("ANTHROPIC_API_KEY ausente")
    corpo = {"model": MODELO, "max_tokens": max_tokens, "system": system, "tools": [FERRAMENTA],
             "tool_choice": {"type": "auto"},  # o Sonnet 5.5 não aceita escolha forçada de ferramenta
             "stream": True,  # mantém a conexão ativa enquanto o modelo raciocina (evita queda em análises longas)
             # o documento vai em cache: se for preciso repetir a chamada, a releitura custa ~10% do preço
             "messages": [{"role": "user", "content": [{"type": "text", "text": usuario, "cache_control": {"type": "ephemeral"}}]}]}
    for tentativa in range(4):
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", method="POST", data=json.dumps(corpo).encode(),
                                     headers={"x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return _ler_stream(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:500]
            if e.code == 400 and "max_tokens" in msg and corpo["max_tokens"] > 64000:
                corpo["max_tokens"] = 64000; continue  # limite de saída do modelo menor que o pedido
            if e.code in (429, 500, 502, 503, 529) and tentativa < 3:
                time.sleep(20 * (tentativa + 1)); continue
            sys.exit(f"Erro da API ({e.code}): {msg}")
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError, json.JSONDecodeError) as e:
            if tentativa < 1:  # no máximo 1 repetição (com o documento em cache) — cada tentativa longa custa caro
                time.sleep(20 * (tentativa + 1)); continue
            sys.exit(f"Falha de conexão com a API: {type(e).__name__}")


def custo(uso):
    p = PRECO.get(MODELO, PRECO["claude-sonnet-5-5"])
    usd = (uso.get("input_tokens", 0) * p[0] + uso.get("output_tokens", 0) * p[1]
           + uso.get("cache_read_input_tokens", 0) * p[2] + uso.get("cache_creation_input_tokens", 0) * p[3]) / 1e6
    return round(usd, 4)


# ------------------------------------------------------------------ validação
def _n(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip().lower()

def validar(dados, itens, texto):
    permitidos = {i["id"]: i for i in itens}
    norm_txt = _n(texto)
    avisos, vistos, res = [], set(), []
    for r in dados.get("resultados", []):
        iid = r.get("item")
        if iid not in permitidos or iid in vistos:
            avisos.append(f"item ignorado: {iid}"); continue
        vistos.add(iid)
        r = {k: v for k, v in r.items() if v not in (None, "", [])}
        if r.get("trecho"):
            t = _n(r["trecho"]).strip('"').strip(".")
            partes = [p for p in re.split(r"\s*(?:\[\.\.\.\]|\[…\]|\.\.\.|…)\s*", t) if len(p) > 12]
            if not partes or not all(p in norm_txt for p in partes):
                avisos.append(f"{iid}: trecho não localizado literalmente no documento; removido")
                r.pop("trecho")
        cands = {j["id"] for j in candidatos(permitidos[iid])}
        if "jurisprudencia_ids" in r:
            fora = [j for j in r["jurisprudencia_ids"] if j not in cands]
            if fora: avisos.append(f"{iid}: jurisprudência fora dos candidatos removida: {fora}")
            r["jurisprudencia_ids"] = [j for j in r["jurisprudencia_ids"] if j in cands]
        else:
            r["jurisprudencia_ids"] = []
        if r.get("resultado") not in ("conforme", "parcial", "nao_conforme", "nao_aplicavel", "nao_verificavel"):
            avisos.append(f"{iid}: resultado inválido '{r.get('resultado')}' tratado como não verificável")
            r["resultado"] = "nao_verificavel"
        if r.get("gravidade") not in (None, "alta", "media", "baixa"): r.pop("gravidade")
        if r["resultado"] in ("parcial", "nao_conforme") and not r.get("constatacao"):
            r["constatacao"] = "Ver análise."
        res.append(r)
    for iid in permitidos:
        if iid not in vistos:
            avisos.append(f"{iid}: não avaliado pelo modelo; marcado como não verificável")
            res.append({"item": iid, "resultado": "nao_verificavel", "jurisprudencia_ids": []})
    return res, avisos


def validar_outros(lista, texto):
    norm_txt = _n(texto)
    saida, avisos = [], []
    for o in lista or []:
        o = {k: v for k, v in o.items() if v not in (None, "", [])}
        if o.get("trecho"):
            t = _n(o["trecho"]).strip('"').strip(".")
            partes = [p for p in re.split(r"\s*(?:\[\.\.\.\]|\[…\]|\.\.\.|…)\s*", t) if len(p) > 12]
            if not partes or not all(p in norm_txt for p in partes):
                avisos.append(f"outro apontamento '{o.get('titulo', '')[:40]}': trecho não localizado; removido"); o.pop("trecho")
        fund = []
        for f in o.get("fundamento", []):
            art = re.sub(r"[^0-9A-Z-]", "", str(f.get("art", "")).upper())
            disp = str(f.get("disp") or "caput").strip()
            nid = f.get("norma") or "lei-14133"
            if nid.startswith("local-"):
                txt = artigo_local(nid, art)
                if txt:
                    nome = next((x["nome"] for x in NORMAS_LOCAIS if x["id"] == nid), nid)
                    fund.append({"norma": nid, "art": art, "disp": disp, "texto": txt, "nome_norma": nome})
                else:
                    avisos.append(f"artigo {art} não localizado na regulamentação local {nid}; removido")
                continue
            n = rel.norma(nid)
            a = next((x for x in (n or {}).get("artigos", []) if x["num"] == art), None)
            d = next((x for x in (a or {}).get("dispositivos", []) if x["id"] == disp), None) if a else None
            if d and not d.get("revogado") and not d.get("vetado"):
                fund.append({"norma": nid, "art": art, "disp": disp})
            else:
                avisos.append(f"fundamento inexistente removido: {nid} art. {art}, {disp}")
        o["fundamento"] = fund
        if o.get("gravidade") not in ("alta", "media", "baixa"): o["gravidade"] = "baixa"
        saida.append(o)
    return saida, avisos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", required=True, choices=["edital", "etp", "tr", "riscos", "planilha", "plano_trabalho", "orcamento"])
    ap.add_argument("--regime", default="lei-14133", choices=sorted(REGIMES))
    ap.add_argument("--objeto", action="append", default=[], choices=sorted(OBJETOS), help="obras e/ou mao-de-obra (repetível)")
    ap.add_argument("--anexo", action="append", default=[], help='planilha anexa já extraída: "tipo::nome::caminho.txt" (tipo: orcamento, planilha, plano-custos, outro)')
    ap.add_argument("--texto", required=True)
    ap.add_argument("--compra")
    ap.add_argument("--fonte", default="")
    ap.add_argument("--paginas", type=int)
    ap.add_argument("--precos", help="resultado de sobrepreco.py (análise de preços)")
    ap.add_argument("--doc-adicional", action="append", default=[], help='outro documento da mesma contratação: "tipo::nome::texto.txt" (repetível)')
    ap.add_argument("--salarios", help="resultado de salarios.py (referência salarial do estado, salario.com.br)")
    ap.add_argument("--norma-local", action="append", default=[], help='regulamentação específica: "Nome da norma::caminho/do/texto.txt" (repetível)')
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()

    objetos = list(dict.fromkeys(a.objeto))
    roteiro = carregar_roteiro(a.regime)
    adicionais = []
    for sp in a.doc_adicional:
        t, nome, cam = sp.split("::", 2)
        tb = pathlib.Path(cam).read_text(encoding="utf-8", errors="replace")
        tx, np_ = texto_com_paginas(tb)
        adicionais.append({"tipo": t, "nome": nome, "bruto": tb, "texto": tx, "paginas": np_})
    itens, versoes = montar_itens(roteiro, a.doc, a.regime, objetos, [x["tipo"] for x in adicionais])
    anexos = carregar_anexos(a.anexo)
    if sum(len(x["texto"]) for x in anexos) > 450_000:
        sys.exit("Planilhas anexas grandes demais para uma análise (limite de 450 mil caracteres no total).")
    bruto = pathlib.Path(a.texto).read_text(encoding="utf-8", errors="replace")
    texto, npags = texto_com_paginas(bruto)
    if len(texto) + sum(len(x["texto"]) for x in adicionais) > MAX_CARACTERES:
        sys.exit(f"Documento grande demais ({len(texto)} caracteres; limite {MAX_CARACTERES}).")
    compra = json.loads(pathlib.Path(a.compra).read_text(encoding="utf-8")) if a.compra else None
    fatos = fatos_pncp(compra)
    trilhas = rodar_trilhas(bruto + "".join("\f" + x["bruto"] for x in adicionais))
    texto_total = bruto + "".join("\n" + x["bruto"] for x in adicionais) + "\n".join("\n" + x["texto"] for x in anexos)  # trechos literais podem vir das planilhas
    forcar = set().union(*[FONTES_OBJETO[o] for o in objetos]) if objetos else set()
    referencias = selecionar_referencias(itens, bruto + "\n" + "\n".join(x["texto"][:20000] for x in anexos), forcar=forcar)
    carregar_normas_locais(a.norma_local)
    precos = None
    if a.precos and pathlib.Path(a.precos).exists():
        precos = json.loads(pathlib.Path(a.precos).read_text(encoding="utf-8"))
        brl = lambda v: ("R$ " + f"{v:,.2f}").replace(",", "X").replace(".", ",").replace("X", ".")
        sit = {"indicio": "INDÍCIO DE SOBREPREÇO", "atencao": "ponto de atenção", "compativel": "compatível",
               "amostra_insuficiente": "amostra insuficiente", "amostra_heterogenea": "amostra heterogênea"}
        linhas = [f"Análise de preços calculada pelo sistema (critérios: mesma UF {precos['criterios']['uf']}, contratações homologadas em até 1 ano, "
                  f"Lei 14.133/2021, objeto equivalente; mediana de no mínimo {precos['criterios']['minimo_comparaveis']} preços; indício acima de 25%):"]
        for r in precos.get("itens", []):
            if r["situacao"] in ("indicio", "atencao"):
                linhas.append(f"item {r['numero']} — {r['descricao'][:120]}: estimado {brl(r['valor_estimado'])} × mediana {brl(r['mediana'])} "
                              f"({r['n']} comparáveis) = {r['desvio']:+.0%} → {sit[r['situacao']]}")
        resto = [r for r in precos.get("itens", []) if r["situacao"] not in ("indicio", "atencao")]
        linhas.append(f"Demais itens analisados: {sum(1 for r in resto if r['situacao']=='compativel')} compatíveis, "
                      f"{sum(1 for r in resto if r['situacao']=='amostra_insuficiente')} sem amostra suficiente, "
                      f"{sum(1 for r in resto if r['situacao']=='amostra_heterogenea')} com amostra heterogênea.")
        fatos.append("\n  ".join(linhas))

    tipos_anexo = {x["tipo"] for x in anexos}
    exigido = {"obras": [("orcamento", "planilha orçamentária com BDI em Excel")],
               "mao-de-obra": [("planilha", "planilha de custos e formação de preços em Excel"), ("cct", "convenção ou acordo coletivo de trabalho usado na composição do salário")]}
    for o in objetos:
      for t, nome in exigido[o]:
        if t not in tipos_anexo and a.doc != t:
            fatos.append(f"O destinatário NÃO enviou a {nome}. Verifique os itens do módulo de {OBJETO_TEXTO[o]} no orçamento ou planilha que "
                         "constar do próprio documento; não havendo, marque-os como nao_verificavel e recomende a juntada.")
    if a.regime == "lei-13019" and "plano-custos" not in tipos_anexo:
        fatos.append("O destinatário NÃO enviou a planilha de custos do plano de trabalho em Excel; avalie a previsão de receitas e despesas "
                     "pelo que constar do documento.")
    cabecalho = (f"REGIME JURÍDICO DA CONTRATAÇÃO: {REGIMES[a.regime]}."
                 + (f" OBJETO: {'; '.join(OBJETO_TEXTO[o] for o in objetos)}." if objetos else "")
                 + ("" if roteiro["_proprio"] else f" ATENÇÃO: ainda não há roteiro próprio para a {REGIMES[a.regime]}; o roteiro abaixo é o da "
                    "Lei 14.133/2021, usado como base — avalie cada questão pela lei do regime (regra 20)."))

    salarios = None
    if a.salarios and pathlib.Path(a.salarios).exists():
        salarios = json.loads(pathlib.Path(a.salarios).read_text(encoding="utf-8"))
        brl = lambda v: ("R$ " + f"{v:,.2f}").replace(",", "X").replace(".", ",").replace("X", ".")
        sit = {"acima": "CUSTO DO PROFISSIONAL ACIMA DA REFERÊNCIA DO ESTADO", "atencao": "ligeiramente acima da referência (até 5%)",
               "compativel": "compatível (igual ou abaixo da referência)"}
        linhas = ["Economicidade do custo da mão de obra calculada pelo sistema: custo do profissional na planilha (Módulos 1 a 4 — remuneração, "
                  "encargos e benefícios, rescisão e reposição) × 'custo para a empresa' do salário médio do estado no salario.com.br (Novo CAGED, "
                  "12 meses), ajustado à jornada. Não é parâmetro normativo (regra 22). Postos 'não analisados' por qualidade do arquivo devem "
                  "ser registrados como tal, sem presumir valores, atribuindo a quem forneceu o arquivo o ônus de apresentar versão legível:"]
        for p in salarios.get("postos", []):
            ref = p.get("referencia") or {}
            if p.get("situacao") in sit:
                linhas.append(f"{p.get('funcao')} (CBO {p.get('cbo')}, {p.get('uf')}; {p.get('local') or 'planilha'}): custo do profissional {brl(p['custo_modulos_1_a_4'])}"
                              + (f" (custo total do posto {brl(p['custo_total_mensal'])})" if p.get("custo_total_mensal") else "")
                              + f" × custo para a empresa no estado {brl(ref['custo_empresa'])}/{ref.get('jornada') or '?'}h (ajustado {brl(p['custo_referencia_ajustado'])}; "
                              f"salário médio {brl(ref['media'])}) = {p['desvio']:+.1%} → {sit[p['situacao']]}. Fonte: {ref.get('url')}"
                              + (f" (atualizado em {ref['atualizado']})" if ref.get("atualizado") else ""))
            else:
                linhas.append(f"{p.get('funcao')}: {p.get('motivo', 'sem referência')}.")
        fatos.append("\n  ".join(linhas))

    orient = RAIZ / "agente" / "orientacoes-especialista.md"
    system = [
        {"type": "text", "text": INSTRUCOES + ("\n\nORIENTAÇÕES DO ESPECIALISTA (prevalecem sobre a regra geral quando tratarem do mesmo ponto):\n"
                                               + orient.read_text(encoding="utf-8") if orient.exists() else "")},
        {"type": "text", "text": f"ROTEIRO DE VERIFICAÇÃO — {roteiro['documentos'].get(a.doc, a.doc)} ({'; '.join(versoes)})\n\n" + bloco_roteiro(itens),
         "cache_control": {"type": "ephemeral"}},
    ]
    usuario = (f"Data da análise: {datetime.date.today():%d/%m/%Y}.\n{cabecalho}\n\n"
               + ("FATOS CALCULADOS PELO SISTEMA (confiáveis):\n" + "\n".join("- " + f for f in fatos) + "\n\n" if fatos else "")
               + ("INDÍCIOS DAS TRILHAS AUTOMÁTICAS (confirme ou descarte cada um):\n" + "\n".join(
                   f"- [{t['id']}] {t['nome']} (gravidade se confirmado: {t['gravidade']}; item: {t['item'] or 'outros_apontamentos'}; {t['fundamento']}). {t['nota']}\n"
                   + "\n".join(f"    · [página {o['pagina']}] …{o['trecho']}…" for o in t["ocorrencias"]) for t in trilhas) + "\n\n" if trilhas else "")
               + bloco_referencias(referencias)
               + bloco_normas_locais(itens)
               + bloco_anexos(anexos)
               + f"DOCUMENTO ({roteiro['documentos'].get(a.doc, a.doc)}; {npags or 'sem marcação de'} páginas):\n<documento>\n{texto}\n</documento>\n\n"
               + "".join(f"DOCUMENTO ADICIONAL DA MESMA CONTRATAÇÃO ({roteiro['documentos'].get(x['tipo'], x['nome'])} — {x['nome']}; {x['paginas'] or 'sem marcação de'} páginas; "
                         f"em \"local\", identifique este documento pelo nome):\n<documento nome=\"{x['nome']}\">\n{x['texto']}\n</documento>\n\n" for x in adicionais)
               + "Verifique todos os itens do roteiro e registre o resultado chamando a ferramenta registrar_analise uma única vez, com todos os itens. Não responda em texto.")
    t0 = time.time()
    resp = chamar(system, usuario)
    if resp.get("truncado") or resp.get("stop_reason") == "max_tokens":
        sys.exit(f"A resposta do modelo foi cortada no limite de tokens (parada: {resp.get('stop_reason')}; uso: {resp.get('usage')}). "
                 "Divida a análise (menos documentos por vez) em vez de repetir.")
    bloco = next((c for c in resp.get("content", []) if c.get("type") == "tool_use"), None)
    if bloco:
        dados = bloco["input"]
    else:  # sem chamada de ferramenta: tenta ler um JSON no texto
        txt = "".join(c.get("text", "") for c in resp.get("content", []) if c.get("type") == "text")
        m = re.search(r"\{.*\}", txt, re.S)
        try:
            dados = json.loads(m.group(0)) if m else None
        except Exception:
            dados = None
        if not dados or "resultados" not in dados:
            sys.exit("O modelo não devolveu a análise (parada: " + str(resp.get("stop_reason")) + "): " + txt[:600])
    resultados, avisos = validar(dados, itens, texto_total)
    ids_ref = {r["id"] for r in referencias}
    outros, avisos2 = validar_outros(dados.get("outros_apontamentos"), texto_total)
    avisos += avisos2
    for x in resultados + outros:  # só referências que foram de fato oferecidas ao modelo
        if x.get("referencias_ids"):
            fora = [i for i in x["referencias_ids"] if i not in ids_ref]
            if fora: avisos.append(f"referências inexistentes removidas: {fora}")
            x["referencias_ids"] = [i for i in x["referencias_ids"] if i in ids_ref]

    analise = {
        "regime": a.regime,
        "regime_texto": REGIMES[a.regime].split(" (")[0],
        "objeto": objetos,
        "roteiro_versao": "; ".join(versoes),
        "itens_roteiro": [{k: v for k, v in i.items() if k in ("id", "doc", "titulo", "verificar", "fundamento", "gravidade", "risco", "dica", "temas", "modulo")} for i in itens],
        "documentos_nomes": {**roteiro["documentos"], "orcamento": "Planilha orçamentária e BDI", "plano_trabalho": "Plano de trabalho"},
        "data": datetime.date.today().strftime("%d/%m/%Y"),
        "processo": dados.get("processo", {}),
        "documentos": [{"tipo": a.doc, "arquivo": a.fonte or pathlib.Path(a.texto).name, "paginas": a.paginas or npags or None,
                        "ocr": "[texto obtido por OCR]" in bruto}]
                      + [{"tipo": x["tipo"], "nome": x["nome"], "arquivo": x["nome"], "paginas": x["paginas"] or None, "anexo": True} for x in adicionais]
                      + [{"tipo": x["tipo"], "nome": ANEXO_TEXTO[x["tipo"]], "arquivo": x["nome"], "anexo": True} for x in anexos],
        "ementa": dados.get("ementa"), "ementa_texto": dados.get("ementa_texto"),
        "resumo": dados.get("resumo"), "conclusao": dados.get("conclusao"),
        "resultados": resultados,
        "outros_apontamentos": outros,
        "precos": precos,
        "salarios": salarios,
        "normas_locais": [{"id": n["id"], "nome": n["nome"]} for n in NORMAS_LOCAIS],
        "referencias_tecnicas": [r for r in referencias if r["id"] in {i for x in resultados + outros for i in x.get("referencias_ids", [])}],
        "jurisprudencia_externa": [EXTERNOS[j] for j in sorted({j for r in resultados for j in r.get("jurisprudencia_ids", [])}) if j in EXTERNOS],
        "_execucao": {"modelo": resp.get("model"), "segundos": round(time.time() - t0), "uso": resp.get("usage"),
                      "custo_usd": custo(resp.get("usage", {})), "parada": resp.get("stop_reason"), "avisos": avisos, "fatos": fatos,
                      "trilhas": [{"id": t["id"], "ocorrencias": len(t["ocorrencias"])} for t in trilhas],
                      "trilhas_avaliadas": dados.get("trilhas_avaliadas", [])},
    }
    if a.fonte.startswith("http"):
        o = analise["processo"].get("orgao", "")
        analise["referencia_documento"] = (f"{o.upper()}. {roteiro['documentos'].get(a.doc, a.doc)} — {analise['processo'].get('numero', '')}. "
                                           f"Disponível em: {a.fonte}. Acesso em: {{acesso}}.")
    pathlib.Path(a.saida).write_text(json.dumps(analise, ensure_ascii=False, indent=2), encoding="utf-8")
    ex = analise["_execucao"]
    print(f"análise gravada: {a.saida} · {ex['segundos']} s · US$ {ex['custo_usd']} · avisos: {len(avisos)} · parada: {ex['parada']}")


if __name__ == "__main__":
    main()
