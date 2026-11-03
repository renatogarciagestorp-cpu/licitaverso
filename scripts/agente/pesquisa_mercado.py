#!/usr/bin/env python3
"""Pesquisa de mercado preliminar no PNCP (Portal Nacional de Contratações Públicas), para o ETP e o TR.

Busca contratações semelhantes de outros órgãos, primeiro no mesmo estado do órgão do assinante e, se houver poucas,
no país, para cada solução possível (por exemplo, aquisição e locação). Para cada contratação encontrada, traz os itens
parecidos com o objeto, com o valor unitário estimado e, quando houver resultado, o valor homologado.
Usa só a API pública do PNCP (sem custo). Nunca interrompe a elaboração: em caso de falha devolve a lista vazia e o erro.

Uso para teste:  python3 scripts/agente/pesquisa_mercado.py --objeto "limpeza predial" --uf RJ --natureza "Bem"
"""
import argparse, json, re, subprocess, time, unicodedata, urllib.parse

BASE = "https://pncp.gov.br"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "Accept": "application/json"}
PARADAS = set("""a o as os de da do das dos e em no na nos nas para por com sem ao aos um uma uns umas que se sua seu
contratacao contratar aquisicao adquirir servico servicos prestacao fornecimento empresa empresas especializada
especializado eventual eventuais futura futuras registro precos preco objeto visando atender atendimento demanda demandas
municipal municipais estadual secretaria prefeitura orgao continuo continuos continuada continuadas comum comuns
locacao inclusive conforme especificacoes termo referencia anexo""".split())


def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


def palavras_chave(objeto, n=4):
    ps = [p for p in re.findall(r"[a-z0-9]{3,}", sem_acento(objeto)) if p not in PARADAS]
    return list(dict.fromkeys(ps))[:n]


COMPRAS = "https://dadosabertos.compras.gov.br"


def _curl(url, timeout=25, tentativas=3):
    # o PNCP recusa a conexão do urllib (firewall) e às vezes derruba conexões: tenta de novo com espera
    for t in range(tentativas):
        try:
            return _curl1(url, timeout)
        except RuntimeError as e:
            if t == tentativas - 1 or "HTTP 4" in str(e):
                raise
            time.sleep(2 + 3 * t)


def _curl1(url, timeout):
    r = subprocess.run(["curl", "-sS", "-m", str(timeout), "-A", UA["User-Agent"], "-H", "Accept: application/json",
                        "-w", "\n%{http_code}", url], capture_output=True, text=True, timeout=timeout + 5)
    if r.returncode != 0:
        raise RuntimeError(f"curl {r.returncode}: {r.stderr.strip()[:200]}")
    corpo, _, cod = r.stdout.rpartition("\n")
    if cod == "204" or not corpo.strip():
        return None
    if not cod.startswith("2"):
        raise RuntimeError(f"HTTP {cod}")
    return json.loads(corpo)


def _get(caminho, params=None, timeout=25, base=BASE):
    return _curl(base + caminho + ("?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote) if params else ""), timeout)


def _buscar(q, uf=None, tipo="edital", n=50):
    """Busca do PNCP (inclui estados e municípios). Ordena por data; a relevância é filtrada aqui pelas palavras-chave."""
    p = {"q": q, "tipos_documento": tipo, "ordenacao": "-data", "pagina": 1, "tam_pagina": n, "status": "todos"}
    if uf:
        p["ufs"] = uf
    j = _get("/api/search/", p) or {}
    return j.get("items") or []


def _num(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def _pontos(texto, raizes):
    t = sem_acento(texto)
    return sum(1 for r in raizes if r in t)


def _campo(d, *nomes):
    for n in nomes:
        if d.get(n) not in (None, ""):
            return d[n]
    return None


def _itens_parecidos(controle, raizes, max_itens=3):
    """Itens da contratação com preço unitário (dados abertos do Compras.gov.br, quando a compra passou por lá)."""
    if not controle:
        return []
    q = {"tipo": "numeroControlePNCPCompra", "codigo": controle}
    itens = (_get("/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id", q, base=COMPRAS) or {}).get("resultado") or []
    minimo = min(2, len(raizes))
    pont = sorted(((_pontos(_campo(it, "descricaoResumida", "descricao") or "", raizes), it) for it in itens), key=lambda x: -x[0])
    pont = [(p, it) for p, it in pont if p >= minimo][:max_itens]
    if not pont:
        return []
    homolog = {}
    try:
        res = (_get("/modulo-contratacoes/3.1_consultarResultadoItensContratacoes_PNCP_14133_Id", q, base=COMPRAS) or {}).get("resultado") or []
        for r in res:
            v = _num(_campo(r, "valorUnitarioHomologado"))
            k = _campo(r, "idCompraItem", "numeroItemPncp")
            if v and k is not None:
                homolog[str(k)] = min(v, homolog.get(str(k), v))
    except Exception:
        pass
    saida = []
    for _, it in pont:
        saida.append({"descricao": re.sub(r"\s+", " ", str(_campo(it, "descricaoResumida", "descricao") or ""))[:220],
                      "unidade": _campo(it, "unidadeMedida"), "quantidade": _num(_campo(it, "quantidade")),
                      "valor_unitario_estimado": _num(_campo(it, "valorUnitarioEstimado")),
                      "valor_unitario_homologado": homolog.get(str(_campo(it, "idCompraItem"))) or homolog.get(str(_campo(it, "numeroItemPncp")))})
    return saida


# ---------------------------------------------------------------- preços praticados (Compras.gov.br)
SINONIMOS = {"notebook": ["computador"], "notebooks": ["computador"], "laptop": ["notebook", "computador"], "desktop": ["microcomputador"],
             "carro": ["veiculo"], "carros": ["veiculo"], "automovel": ["veiculo"], "veiculos": ["veiculo"], "onibus": ["veiculo"],
             "predial": ["areas", "internas"], "faxina": ["limpeza"], "seguranca": ["vigilancia"], "vigia": ["vigilancia"],
             "climatizacao": ["condicionado"], "impressao": ["impressora", "reprografia"], "copias": ["reprografia"]}
_CATALOGO = None


def catalogo():
    global _CATALOGO
    if _CATALOGO is None:
        try:
            import pathlib
            _CATALOGO = json.loads((pathlib.Path(__file__).resolve().parents[2] / "catalogo-compras.json").read_text(encoding="utf-8"))
        except Exception:
            _CATALOGO = {"pdm": [], "servico": []}
    return _CATALOGO


def codigos_catalogo(objeto, tipo, extra=None, n=3):
    """Casa o objeto com os nomes do catálogo (PDM de material ou serviço do CATSER). Devolve [(codigo, nome)]."""
    chaves = palavras_chave(objeto, 5) + [t for t in re.findall(r"\b[a-z]\d{1,2}\b", sem_acento(objeto))][:1]
    if extra:
        chaves = [extra] + chaves
    raiz = lambda w: w if len(w) <= 3 else w[:max(5, len(w) - 1)]  # tira só o plural/última letra: "condicionado" não casa com "condicionamento"
    raizes = []
    for c in chaves:
        for x in [c] + SINONIMOS.get(c, []):
            if raiz(x) not in raizes:
                raizes.append(raiz(x))
    if not raizes:
        return []
    obrig = raiz(extra or chaves[0])  # a palavra principal (ou um sinônimo) tem de aparecer
    cand = []
    for cod, nome, _ in catalogo().get("pdm" if tipo == "material" else "servico", []):
        nm = sem_acento(re.sub(r"-\s*", "", nome or ""))
        if "inativo" in nm:
            continue
        palavras = re.findall(r"[a-z0-9]+", nm)
        casa = lambda w, r: w.startswith(r) if len(r) >= 6 else (w == r or w == r + "s" or w == r + "es")
        if not any(casa(w, obrig) for w in palavras) and not any(casa(w, r) for r in [raiz(x) for x in SINONIMOS.get(chaves[0], [])] for w in palavras):
            continue
        casa = lambda w, r: w.startswith(r) if len(r) >= 6 else (w == r or w == r + "s" or w == r + "es")  # palavra curta: inteira
        p = sum(1 for r in raizes if any(casa(w, r) for w in palavras))
        inicio = 1 if palavras and any(casa(palavras[0], r) for r in raizes) else 0
        cand.append((p, inicio, -len(palavras), cod, nome))
    cand.sort(reverse=True)
    if not cand or cand[0][0] < 1:
        return []
    melhor, ini = cand[0][0], cand[0][1]
    empatados = [c for c in cand if c[0] == melhor and c[1] == ini]
    if melhor == 1 and len(empatados) > 10:  # termo genérico demais (ex.: "papel"): só serve o item cujo nome é a própria palavra
        exato = [c for c in empatados if c[2] == -1]
        return [(c[3], c[4]) for c in exato[:1]]
    return [(c[3], c[4]) for c in cand if c[0] == melhor and c[1] == ini][:n]  # só os de maior pontuação


def mediana(v):
    v = sorted(v)
    return v[len(v) // 2] if len(v) % 2 else round((v[len(v) // 2 - 1] + v[len(v) // 2]) / 2, 2)


def filtrar_discrepantes(vals):
    """Tira valores muito fora do conjunto (inexequíveis ou excessivos), pelo critério de Tukey: fora de 1,5 × a distância
    interquartil. Só com 4 ou mais valores. Devolve (mantidos, quantidade excluída)."""
    if len(vals) < 4:
        return vals, 0
    q1, q3 = vals[len(vals) // 4], vals[(3 * len(vals)) // 4]
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    ok = [v for v in vals if lo <= v <= hi] or vals
    return ok, len(vals) - len(ok)


def precos_praticados(objeto, natureza="", uf="", extra=None, max_linhas=12):
    """Preços unitários praticados em compras públicas (módulo de pesquisa de preços do Compras.gov.br), últimos 12 meses."""
    import datetime
    nat = sem_acento(natureza)
    tipo = "material" if ("bem" in nat or "compra" in nat) and not extra else "servico"
    inicio = (datetime.date.today() - datetime.timedelta(days=365)).isoformat()
    saida = []
    for cod, nome in codigos_catalogo(objeto, tipo, extra):
        linhas = []
        for est in ([uf] if uf else []) + [""]:
            p = {"pagina": 1, "tamanhoPagina": 50, "dataCompraInicio": inicio, "dataCompraFim": datetime.date.today().isoformat()}
            if est:
                p["estado"] = est
            if tipo == "material":
                p.update({"tipo": "codigoPdm", "codigo": cod}); caminho = "/modulo-pesquisa-preco/1_consultarMaterial"
            else:
                p.update({"codigoItemCatalogo": cod}); caminho = "/modulo-pesquisa-preco/3_consultarServico"
            try:
                res = (_get(caminho, p, base=COMPRAS, timeout=30) or {}).get("resultado") or []
            except Exception:
                res = []
            linhas = [r for r in res if (_num(r.get("precoUnitario")) or 0) > 0.01 and str(r.get("dataCompra") or r.get("dataResultado") or "9")[:10] >= inicio]
            if len(linhas) >= 3:
                break
        if not linhas:
            continue
        por_un = {}
        for r in linhas:
            un = str(r.get("siglaUnidadeFornecimento") or r.get("siglaUnidadeMedida") or r.get("nomeUnidadeFornecimento") or r.get("nomeUnidadeMedida") or "—").strip().upper()
            un = {"UNIDADE": "UN", "UND": "UN", "METRO QUADRADO": "M2", "M²": "M2", "MES": "MÊS"}.get(un, un)
            por_un.setdefault(un, []).append(r)
        for un, rs in sorted(por_un.items(), key=lambda x: -len(x[1])):
            todos = sorted(_num(r["precoUnitario"]) for r in rs)
            vals, excl = filtrar_discrepantes(todos)
            rs = [r for r in rs if vals[0] <= _num(r["precoUnitario"]) <= vals[-1]]
            med = mediana(vals)
            saida.append({"catalogo": f"{'PDM' if tipo == 'material' else 'CATSER'} {cod} — {nome}", "unidade": un, "n": len(vals), "excluidos": excl,
                          "minimo": vals[0], "mediana": med, "maximo": vals[-1],
                          "abrangencia": "estado" if uf and all((r.get("estado") or "") == uf for r in rs) else "nacional",
                          "exemplos": [{"orgao": r.get("nomeOrgao") or r.get("nomeUasg") or "", "municipio": r.get("municipio") or "",
                                        "uf": r.get("estado") or "", "data": str(r.get("dataCompra") or r.get("dataResultado") or "")[:10],
                                        "descricao": re.sub(r"\s+", " ", str(r.get("descricaoDetalhadaItem") or r.get("descricaoItem") or ""))[:160],
                                        "quantidade": _num(r.get("quantidade")), "preco_unitario": _num(r.get("precoUnitario")),
                                        "id_compra": r.get("idCompra")} for r in rs[:4]]})
        if len(saida) >= max_linhas:
            break
    return saida


def solucoes_para(natureza, objeto):
    """Soluções a pesquisar (o ETP compara todas; a escolha é analisada no documento, não aqui)."""
    nat = sem_acento(natureza)
    if "obra" in nat or "engenharia" in nat or "reforma" in nat:
        return [("execução indireta (contratação da obra ou serviço)", "")]
    if "bem" in nat or "compra" in nat or "locacao" in nat:
        return [("aquisição", ""), ("locação", "locacao"), ("serviço com fornecimento do bem (outsourcing)", "outsourcing")]
    return [("contratação do serviço", "")]


def pesquisar(objeto, uf="", natureza="", max_ref=12, limite_s=150):
    t0 = time.time()
    chaves = palavras_chave(objeto)
    raizes = [c[:5] for c in chaves]
    saida = {"fonte": "PNCP (pncp.gov.br) e dados abertos do Compras.gov.br", "palavras_chave": chaves, "uf": uf,
             "referencias": [], "erro": ""}
    if not chaves:
        saida["erro"] = "objeto sem palavras-chave"
        return saida
    sols = solucoes_para(natureza, objeto)
    por_sol = max(3, max_ref // len(sols))
    vistos = set()
    try:
        for rotulo, extra in sols:
            achados = []
            for abr, u in ((("estado", uf),) if uf else ()) + (("nacional", None),):
                for n in (2, 1):  # termos mais específicos primeiro
                    q = " ".join(([extra] if extra else []) + chaves[:n])
                    for tipo in ("edital", "ata"):
                        try:
                            hits = _buscar(q, u, tipo)
                        except Exception as e:
                            saida["erro"] = f"{type(e).__name__}: {e}"[:300]
                            continue
                        for h in hits:
                            ctrl = h.get("numero_controle_pncp") or h.get("item_url")
                            texto = (h.get("description") or "") + " " + (h.get("title") or "")
                            if extra and extra[:5] not in sem_acento(texto):
                                continue
                            if re.search(r"revogad|anulad|cancelad|desert|fracassad", sem_acento(h.get("situacao_nome") or "")):
                                continue
                            if ctrl in vistos or _pontos(texto, raizes) < min(2, len(raizes)):
                                continue
                            vistos.add(ctrl)
                            achados.append((abr, tipo, h))
                    if len(achados) >= por_sol:
                        break
                if len([a for a in achados if a[0] == "estado"]) >= por_sol:
                    break
            n_sol = 0
            for abr, tipo, h in achados:
                if n_sol >= por_sol or time.time() - t0 > limite_s:
                    break
                controle = str(h.get("numero_controle_pncp") or "")
                try:
                    itens = _itens_parecidos(re.sub(r"-\d{6}$", "", controle) if tipo == "ata" else controle, raizes)
                except Exception:
                    itens = []
                url = str(h.get("item_url") or "")
                saida["referencias"].append({
                    "solucao": rotulo, "abrangencia": abr, "tipo": "ata de registro de preços" if tipo == "ata" else "contratação",
                    "orgao": h.get("orgao_nome") or "", "municipio": h.get("municipio_nome") or "", "uf": h.get("uf") or "",
                    "modalidade": h.get("modalidade_licitacao_nome") or "", "situacao": h.get("situacao_nome") or "",
                    "data": str(h.get("data_publicacao_pncp") or "")[:10],
                    "objeto": re.sub(r"\s+", " ", str(h.get("description") or h.get("title") or ""))[:300],
                    "valor_total_estimado": _num(h.get("valor_total_estimado")), "valor_global": _num(h.get("valor_global")),
                    "link": BASE + "/app" + url.replace("/compras/", "/editais/") if url else "", "itens": itens})
                n_sol += 1
            if len(saida["referencias"]) >= max_ref or time.time() - t0 > limite_s:
                break
    except Exception as e:
        saida["erro"] = f"{type(e).__name__}: {e}"[:300]
    saida["precos_praticados"] = []
    try:
        for rotulo, extra in sols:
            for linha in precos_praticados(objeto, natureza, uf, extra or None):
                linha["solucao"] = rotulo
                saida["precos_praticados"].append(linha)
    except Exception as e:
        saida["erro"] = (saida["erro"] + " · " if saida["erro"] else "") + f"preços praticados: {type(e).__name__}"
    saida["segundos"] = round(time.time() - t0)
    return saida


def brl(v):
    return "—" if v is None else "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def bloco_precos(p):
    pp = (p or {}).get("precos_praticados") or []
    if not pp:
        return ""
    linhas = ["PREÇOS PRATICADOS (módulo de pesquisa de preços do Compras.gov.br, compras dos últimos 12 meses; preço unitário real):"]
    for n, x in enumerate(pp, 1):
        linhas.append(f"[C{n}] Solução: {x.get('solucao','')} · {x['catalogo']} · unidade {x['unidade']} · {x['n']} compras "
                      f"({'mesmo estado' if x['abrangencia'] == 'estado' else 'país'}) · mínimo {brl(x['minimo'])} · mediana {brl(x['mediana'])} · máximo {brl(x['maximo'])}"
                      + (f" · {x['excluidos']} valores discrepantes excluídos (fora de 1,5 × intervalo interquartil)" if x.get("excluidos") else ""))
        for e in x["exemplos"]:
            linhas.append(f"     - {e['orgao']} ({e['municipio']}/{e['uf']}) em {e['data']}: {e['descricao']} · qtd {e['quantidade']} · {brl(e['preco_unitario'])} (compra {e['id_compra']})")
    linhas.append("Atenção: confira se o item do catálogo corresponde de fato ao objeto e à especificação antes de usar o valor.")
    return "\n".join(linhas)[:9000]


def bloco_prompt(p):
    extra = bloco_precos(p)
    if p and not p.get("referencias") and extra:
        return extra
    if not p or not p.get("referencias"):
        return ("PESQUISA DE MERCADO NO PNCP: nenhuma contratação semelhante encontrada automaticamente"
                + (f" ({p.get('erro')})" if p and p.get("erro") else "") + ". Não estime valores: use [PREENCHER] e registre a pendência.")
    linhas = [f"PESQUISA DE MERCADO (PNCP e Compras.gov.br; dados reais, coletados automaticamente; UF do órgão: {p.get('uf') or 'não informada'}):"]
    for n, r in enumerate(p["referencias"], 1):
        linhas.append(f"[P{n}] Solução pesquisada: {r['solucao']} · {r['orgao']} ({r['municipio']}/{r['uf']}) · {r['modalidade']} · "
                      f"publicado em {r['data']} · {'mesmo estado' if r['abrangencia'] == 'estado' else 'outro estado'} · {r['link']}\n"
                      f"     Tipo: {r.get('tipo','')} · situação: {r.get('situacao','')} · valor total estimado: {brl(r.get('valor_total_estimado'))}"
                      + (f" · valor global: {brl(r.get('valor_global'))}" if r.get('valor_global') else "") + f"\n     Objeto: {r['objeto']}")
        if not r["itens"]:
            linhas.append("     (preço unitário dos itens não disponível nos dados abertos: use só como referência de objeto e valor total)")
        for it in r["itens"]:
            linhas.append(f"     - {it['descricao']} | unidade: {it['unidade'] or '—'} | qtd: {it['quantidade'] if it['quantidade'] is not None else '—'}"
                          f" | estimado: {brl(it['valor_unitario_estimado'])} | homologado: {brl(it['valor_unitario_homologado'])}")
    return ("\n".join(linhas)[:14000] + ("\n\n" + extra if extra else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--objeto", required=True); ap.add_argument("--uf", default=""); ap.add_argument("--natureza", default="")
    ap.add_argument("--saida")
    a = ap.parse_args()
    r = pesquisar(a.objeto, a.uf, a.natureza)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(json.dumps(r, ensure_ascii=False, indent=1))
    print(bloco_prompt(r)); print(f"\n{len(r['referencias'])} referências · {len(r.get('precos_praticados') or [])} linhas de preço praticado · {r.get('segundos')} s · erro: {r['erro'] or '-'}")
