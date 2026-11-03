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
    saida["segundos"] = round(time.time() - t0)
    return saida


def brl(v):
    return "—" if v is None else "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def bloco_prompt(p):
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
    return "\n".join(linhas)[:14000]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--objeto", required=True); ap.add_argument("--uf", default=""); ap.add_argument("--natureza", default="")
    ap.add_argument("--saida")
    a = ap.parse_args()
    r = pesquisar(a.objeto, a.uf, a.natureza)
    if a.saida:
        open(a.saida, "w", encoding="utf-8").write(json.dumps(r, ensure_ascii=False, indent=1))
    print(bloco_prompt(r)); print(f"\n{len(r['referencias'])} referências · {r.get('segundos')} s · erro: {r['erro'] or '-'}")
