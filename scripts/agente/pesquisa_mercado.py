#!/usr/bin/env python3
"""Pesquisa de mercado preliminar no PNCP (Portal Nacional de Contratações Públicas), para o ETP e o TR.

Busca contratações semelhantes de outros órgãos, primeiro no mesmo estado do órgão do assinante e, se houver poucas,
no país, para cada solução possível (por exemplo, aquisição e locação). Para cada contratação encontrada, traz os itens
parecidos com o objeto, com o valor unitário estimado e, quando houver resultado, o valor homologado.
Usa só a API pública do PNCP (sem custo). Nunca interrompe a elaboração: em caso de falha devolve a lista vazia e o erro.

Uso para teste:  python3 scripts/agente/pesquisa_mercado.py --objeto "limpeza predial" --uf RJ --natureza "Bem"
"""
import argparse, json, re, time, unicodedata, urllib.parse, urllib.request

BASE = "https://pncp.gov.br"
UA = {"User-Agent": "Licitacon-pesquisa/1.0", "Accept": "application/json"}
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


def _get(caminho, params=None, timeout=20):
    url = BASE + caminho + ("?" + urllib.parse.urlencode(params) if params else "")
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        if r.status == 204:
            return None
        return json.loads(r.read().decode("utf-8") or "null")


def _buscar(q, uf=None, n=15):
    p = {"q": q, "tipos_documento": "edital", "ordenacao": "-data", "pagina": 1, "tam_pagina": n, "status": "todos"}
    if uf:
        p["ufs"] = uf
    j = _get("/api/search/", p) or {}
    return j.get("items") or []


def _ident(h):
    cnpj, ano, seq = h.get("orgao_cnpj"), h.get("ano"), h.get("numero_sequencial")
    if not (cnpj and ano and seq):
        m = re.search(r"/(\d{14})/(\d{4})/(\d+)", str(h.get("item_url") or ""))
        if m:
            cnpj, ano, seq = m.groups()
    return (str(cnpj), str(ano), str(seq)) if cnpj and ano and seq else None


def _num(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def _itens_parecidos(ident, chaves, max_itens=3):
    cnpj, ano, seq = ident
    itens = _get(f"/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens", {"pagina": 1, "tamanhoPagina": 100}) or []
    raizes = [c[:5] for c in chaves]
    pont = []
    for it in itens:
        d = sem_acento(it.get("descricao"))
        s = sum(1 for r in raizes if r in d)
        if s:
            pont.append((s, it))
    pont.sort(key=lambda x: -x[0])
    saida = []
    for _, it in pont[:max_itens]:
        e = {"descricao": re.sub(r"\s+", " ", str(it.get("descricao") or ""))[:220], "unidade": it.get("unidadeMedida"),
             "quantidade": _num(it.get("quantidade")), "valor_unitario_estimado": _num(it.get("valorUnitarioEstimado")),
             "valor_unitario_homologado": None}
        if it.get("temResultado") and it.get("numeroItem") is not None:
            try:
                res = _get(f"/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens/{it['numeroItem']}/resultados") or []
                vals = [_num(r.get("valorUnitarioHomologado")) for r in res if _num(r.get("valorUnitarioHomologado"))]
                if vals:
                    e["valor_unitario_homologado"] = min(vals)
            except Exception:
                pass
        saida.append(e)
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
    saida = {"fonte": "PNCP — Portal Nacional de Contratações Públicas (pncp.gov.br)", "palavras_chave": chaves, "uf": uf,
             "referencias": [], "erro": ""}
    if not chaves:
        saida["erro"] = "objeto sem palavras-chave"
        return saida
    vistos = set()
    try:
        for rotulo, extra in solucoes_para(natureza, objeto):
            achados = []
            for n in (3, 2, 1):  # da busca mais específica para a mais ampla
                q = " ".join(([extra] if extra else []) + chaves[:n])
                for abr, u in ((("estado", uf),) if uf else ()) + (("nacional", None),):
                    hits = _buscar(q, u)
                    for h in hits:
                        i = _ident(h)
                        if i and i not in vistos and all(i != x[2] for x in achados):
                            achados.append((abr, h, i))
                    if len([a for a in achados if a[0] == "estado"]) >= 3:
                        break
                if len(achados) >= 3:
                    break
            por_solucao = 0
            for abr, h, i in achados:
                if por_solucao >= max(3, max_ref // len(solucoes_para(natureza, objeto))) or time.time() - t0 > limite_s:
                    break
                vistos.add(i)
                try:
                    itens = _itens_parecidos(i, chaves)
                except Exception:
                    itens = []
                if not itens:
                    continue
                cnpj, ano, seq = i
                saida["referencias"].append({
                    "solucao": rotulo, "abrangencia": abr,
                    "orgao": h.get("orgao_nome") or "", "unidade": h.get("unidade_nome") or "",
                    "municipio": h.get("municipio_nome") or "", "uf": h.get("uf") or "",
                    "modalidade": h.get("modalidade_licitacao_nome") or "", "data": str(h.get("data_publicacao_pncp") or "")[:10],
                    "objeto": re.sub(r"\s+", " ", str(h.get("description") or h.get("title") or ""))[:300],
                    "link": f"{BASE}/app/editais/{cnpj}/{ano}/{seq}", "itens": itens})
                por_solucao += 1
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
    linhas = [f"PESQUISA DE MERCADO NO PNCP (dados reais, coletados automaticamente; UF do órgão: {p.get('uf') or 'não informada'}):"]
    for n, r in enumerate(p["referencias"], 1):
        linhas.append(f"[P{n}] Solução pesquisada: {r['solucao']} · {r['orgao']} ({r['municipio']}/{r['uf']}) · {r['modalidade']} · "
                      f"publicado em {r['data']} · {'mesmo estado' if r['abrangencia'] == 'estado' else 'outro estado'} · {r['link']}\n"
                      f"     Objeto: {r['objeto']}")
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
