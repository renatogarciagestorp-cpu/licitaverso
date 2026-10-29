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
import argparse, datetime, json, os, pathlib, re, sys, time, unicodedata, urllib.error, urllib.request

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

def bloco_roteiro(itens):
    linhas = []
    for it in itens:
        fund = []
        for f in it["fundamento"]:
            tl = rel.texto_legal(f) or "[texto não disponível na base]"
            fund.append(f"    - {rel.rotulo(f)}: \"{tl}\"")
        cands = rel.jurisprudencia(it.get("temas"), n=6)
        js = "\n".join(f"    - [{j['id']}] {j.get('orgao','')} {j.get('numero','')}: {(j.get('tese') or j.get('titulo') or '')[:400]}" for j in cands) or "    (nenhum)"
        linhas.append(
            f"### {it['id']} — {it['titulo']}\n"
            f"  O que verificar: {it['verificar']}\n"
            + (f"  Quando se aplica: {it['quando']}\n" if it.get("quando") else "")
            + f"  Obrigatório: {it.get('obrigatorio', '')}; gravidade se houver falha: {it['gravidade']}\n"
            f"  Fundamento (texto oficial vigente):\n" + "\n".join(fund) + "\n"
            f"  Risco padrão: {it['risco']}\n  Dica padrão: {it['dica']}\n"
            f"  Jurisprudência candidata (use só estes ids, e só se pertinentes ao caso):\n{js}\n")
    return "\n".join(linhas)

INSTRUCOES = """Você é o Agente Licitacon, analista sênior em licitações e contratos públicos (Lei 14.133/2021).
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
12. "outros_apontamentos": problemas relevantes encontrados no documento que NÃO se encaixam em nenhum item do roteiro (ex.: erros materiais,
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
    pesquisa adequada ou quantitativos superdimensionados. Use "media" para falhas formais ou de instrução com risco moderado e "baixa" para
    imprecisões e boas práticas. Ajuste a gravidade padrão do roteiro sempre que o caso concreto se enquadrar nesta política.
15. INDÍCIOS DAS TRILHAS AUTOMÁTICAS: o sistema procurou no documento padrões de texto associados a irregularidades (como fazem as trilhas
    do ALICE, da CGU/TCU). Avalie CADA indício no contexto: confirme quando a irregularidade de fato existe (registre-a no item do roteiro
    indicado ou em outros_apontamentos) ou descarte quando for falso positivo (por exemplo, texto que proíbe a prática, ou percentual que
    não se refere à exigência). Informe a decisão em "trilhas_avaliadas" ({id, confirmado, motivo}).
16. Preencha também: processo (órgão, número, objeto, modalidade), ementa (palavras-chave em caixa alta separadas por ponto),
    ementa_texto (síntese de 2–3 frases), resumo (um parágrafo de visão geral) e conclusao (um parágrafo)."""

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
                "jurisprudencia_ids": {"type": "array", "items": {"type": "string"}}},
                "required": ["item", "resultado"]}},
            "trilhas_avaliadas": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "string"}, "confirmado": {"type": "boolean"}, "motivo": {"type": "string"}}, "required": ["id", "confirmado"]}},
            "outros_apontamentos": {"type": "array", "items": {"type": "object", "properties": {
                "titulo": {"type": "string"}, "constatacao": {"type": "string"}, "trecho": {"type": "string"}, "local": {"type": "string"},
                "fundamento": {"type": "array", "items": {"type": "object", "properties": {"art": {"type": "string"}, "disp": {"type": "string"}},
                                                          "required": ["art"]}},
                "porque": {"type": "string"}, "risco": {"type": "string"}, "correcao": {"type": "string"},
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
            cb["input"] = json.loads(cb["_json"] or "{}")
        cb.pop("_json", None)
        msg["content"].append(cb)
    return msg


def chamar(system, usuario, max_tokens=56000):
    chave = os.environ.get("ANTHROPIC_API_KEY")
    if not chave:
        sys.exit("ANTHROPIC_API_KEY ausente")
    corpo = {"model": MODELO, "max_tokens": max_tokens, "system": system, "tools": [FERRAMENTA],
             "tool_choice": {"type": "auto"},  # o Sonnet 5.5 não aceita escolha forçada de ferramenta
             "stream": True,  # mantém a conexão ativa enquanto o modelo raciocina (evita queda em análises longas)
             "messages": [{"role": "user", "content": usuario}]}
    for tentativa in range(4):
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", method="POST", data=json.dumps(corpo).encode(),
                                     headers={"x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return _ler_stream(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:500]
            if e.code in (429, 500, 502, 503, 529) and tentativa < 3:
                time.sleep(20 * (tentativa + 1)); continue
            sys.exit(f"Erro da API ({e.code}): {msg}")
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError, json.JSONDecodeError) as e:
            if tentativa < 3:
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
        cands = {j["id"] for j in rel.jurisprudencia(permitidos[iid].get("temas"), n=6)}
        if "jurisprudencia_ids" in r:
            fora = [j for j in r["jurisprudencia_ids"] if j not in cands]
            if fora: avisos.append(f"{iid}: jurisprudência fora dos candidatos removida: {fora}")
            r["jurisprudencia_ids"] = [j for j in r["jurisprudencia_ids"] if j in cands]
        else:
            r["jurisprudencia_ids"] = []
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
    n = rel.norma("lei-14133")
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
            a = next((x for x in (n or {}).get("artigos", []) if x["num"] == art), None)
            d = next((x for x in (a or {}).get("dispositivos", []) if x["id"] == disp), None) if a else None
            if d and not d.get("revogado") and not d.get("vetado"):
                fund.append({"norma": "lei-14133", "art": art, "disp": disp})
            else:
                avisos.append(f"fundamento inexistente removido: art. {art}, {disp}")
        o["fundamento"] = fund
        if o.get("gravidade") not in ("alta", "media", "baixa"): o["gravidade"] = "baixa"
        saida.append(o)
    return saida, avisos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", required=True, choices=["edital", "etp", "tr", "riscos", "planilha"])
    ap.add_argument("--texto", required=True)
    ap.add_argument("--compra")
    ap.add_argument("--fonte", default="")
    ap.add_argument("--paginas", type=int)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()

    roteiro = json.loads((RAIZ / "agente" / "roteiros" / "lei-14133.json").read_text(encoding="utf-8"))
    itens = itens_aplicaveis(roteiro, a.doc)
    bruto = pathlib.Path(a.texto).read_text(encoding="utf-8", errors="replace")
    texto, npags = texto_com_paginas(bruto)
    if len(texto) > MAX_CARACTERES:
        sys.exit(f"Documento grande demais ({len(texto)} caracteres; limite {MAX_CARACTERES}).")
    compra = json.loads(pathlib.Path(a.compra).read_text(encoding="utf-8")) if a.compra else None
    fatos = fatos_pncp(compra)
    trilhas = rodar_trilhas(bruto)

    system = [
        {"type": "text", "text": INSTRUCOES},
        {"type": "text", "text": f"ROTEIRO DE VERIFICAÇÃO — {roteiro['documentos'].get(a.doc, a.doc)} (versão {roteiro['versao']})\n\n" + bloco_roteiro(itens),
         "cache_control": {"type": "ephemeral"}},
    ]
    usuario = (f"Data da análise: {datetime.date.today():%d/%m/%Y}.\n\n"
               + ("FATOS CALCULADOS PELO SISTEMA (confiáveis):\n" + "\n".join("- " + f for f in fatos) + "\n\n" if fatos else "")
               + ("INDÍCIOS DAS TRILHAS AUTOMÁTICAS (confirme ou descarte cada um):\n" + "\n".join(
                   f"- [{t['id']}] {t['nome']} (gravidade se confirmado: {t['gravidade']}; item: {t['item'] or 'outros_apontamentos'}; {t['fundamento']}). {t['nota']}\n"
                   + "\n".join(f"    · [página {o['pagina']}] …{o['trecho']}…" for o in t["ocorrencias"]) for t in trilhas) + "\n\n" if trilhas else "")
               + f"DOCUMENTO ({roteiro['documentos'].get(a.doc, a.doc)}; {npags or 'sem marcação de'} páginas):\n<documento>\n{texto}\n</documento>\n\n"
               "Verifique todos os itens do roteiro e registre o resultado chamando a ferramenta registrar_analise uma única vez, com todos os itens. Não responda em texto.")
    t0 = time.time()
    resp = chamar(system, usuario)
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
    resultados, avisos = validar(dados, itens, bruto)
    outros, avisos2 = validar_outros(dados.get("outros_apontamentos"), bruto)
    avisos += avisos2

    analise = {
        "regime": "lei-14133",
        "regime_texto": "Lei 14.133/2021",
        "data": datetime.date.today().strftime("%d/%m/%Y"),
        "processo": dados.get("processo", {}),
        "documentos": [{"tipo": a.doc, "arquivo": a.fonte or pathlib.Path(a.texto).name, "paginas": a.paginas or npags or None,
                        "ocr": "[texto obtido por OCR]" in bruto}],
        "ementa": dados.get("ementa"), "ementa_texto": dados.get("ementa_texto"),
        "resumo": dados.get("resumo"), "conclusao": dados.get("conclusao"),
        "resultados": resultados,
        "outros_apontamentos": outros,
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
