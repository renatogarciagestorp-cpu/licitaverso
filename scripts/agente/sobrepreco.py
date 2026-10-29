#!/usr/bin/env python3
"""Análise de sobrepreço do orçamento estimado, com preços de contratações similares publicadas no PNCP.

Critérios (definidos pelo Licitacon, em linha com o art. 23, § 1º, II, da Lei 14.133/2021):
  - objeto igual: mesmo código de catálogo (CATMAT/CATSER) ou descrição equivalente (similaridade alta) e mesma unidade de medida;
  - contratações realizadas em até 1 ano antes da data de referência (divulgação do edital ou data do orçamento);
  - órgãos do mesmo estado (UF);
  - contratações regidas pela mesma lei (Lei 14.133/2021, conforme o amparo legal registrado no PNCP);
  - preço de comparação: valor unitário HOMOLOGADO (contratação efetivamente realizada).
Indicador: mediana dos preços comparáveis (mínimo de 3). Estimado acima da mediana em mais de 25% = indício de sobrepreço;
entre 10% e 25% = ponto de atenção. O sistema calcula; a conclusão sobre sobrepreço depende de análise do caso.

Uso: python3 scripts/agente/sobrepreco.py --itens itens.json --uf RJ --data 2026-09-29 [--excluir CNPJ-ANO-SEQ] --saida precos.json
  itens.json: lista no formato do PNCP (descricao, unidadeMedida, quantidade, valorUnitarioEstimado, catalogoCodigoItem...).
"""
import argparse, datetime, json, re, statistics, sys, time, unicodedata, urllib.parse, urllib.request

H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
     "Accept": "application/json, text/plain, */*", "Referer": "https://pncp.gov.br/app/editais", "Accept-Language": "pt-BR,pt;q=0.9"}
LIMIAR_INDICIO, LIMIAR_ATENCAO, MIN_COMPARAVEIS = 0.25, 0.10, 3
MAX_ITENS, MAX_BUSCA, MAX_COMPARAVEIS = 25, 20, 8
SIMILARIDADE = 0.55
STOP = set("de da do das dos e em para com sem a o as os ou por tipo cor material marca modelo minimo maximo unidade un und aprox cerca "
           "conforme termo referencia especificacao especificacoes item itens nao sim ate no na nos nas um uma".split())

_cache = {}
def get(url, tentativas=3):
    if url in _cache:
        return _cache[url]
    for t in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60) as r:
                b = r.read()
                v = json.loads(b) if b.strip() else None
                _cache[url] = v
                time.sleep(0.15)
                return v
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                _cache[url] = None; return None
            time.sleep(2 * (t + 1))
        except Exception:
            time.sleep(2 * (t + 1))
    _cache[url] = None
    return None

def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", s)

def tokens(s):
    return [t for t in norm(s).split() if len(t) > 2 and t not in STOP and not t.isdigit()]

def similaridade(a, b):
    ta, tb = set(tokens(a)[:30]), set(tokens(b)[:30])
    if not ta or not tb:
        return 0.0
    # cobertura das palavras principais do item analisado (as 8 primeiras pesam mais)
    principais = set(tokens(a)[:8])
    cob = len(principais & tb) / len(principais) if principais else 0
    jac = len(ta & tb) / len(ta | tb)
    return round(0.7 * cob + 0.3 * jac, 3)

UNIDADES = {"un": "un", "und": "un", "unid": "un", "unidade": "un", "unidades": "un", "pc": "un", "peca": "un", "pç": "un",
            "cx": "cx", "caixa": "cx", "kg": "kg", "quilo": "kg", "quilograma": "kg", "l": "l", "litro": "l", "lt": "l",
            "m": "m", "metro": "m", "m2": "m2", "metro quadrado": "m2", "m3": "m3", "mes": "mes", "mensal": "mes", "meses": "mes",
            "hora": "h", "h": "h", "horas": "h", "dia": "dia", "diaria": "dia", "servico": "sv", "serv": "sv", "sv": "sv",
            "pacote": "pct", "pct": "pct", "frasco": "fr", "fr": "fr", "resma": "resma", "par": "par", "kit": "kit", "conjunto": "kit",
            "posto": "posto", "km": "km", "evento": "evento", "ampola": "amp", "amp": "amp", "comprimido": "comp", "comp": "comp"}
def unidade(u):
    n = norm(u).strip()
    return UNIDADES.get(n, UNIDADES.get(n.split(" ")[0] if n else "", n))

def consulta_busca(q, uf, pagina=1):
    url = ("https://pncp.gov.br/api/search/?" + urllib.parse.urlencode({
        "q": q, "tipos_documento": "edital", "ordenacao": "-data", "pagina": pagina, "tam_pagina": MAX_BUSCA, "status": "todos", "ufs": uf}))
    d = get(url)
    return (d or {}).get("items", []) if isinstance(d, dict) else []

def amparo_14133(cnpj, ano, seq):
    c = get(f"https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}")
    if not isinstance(c, dict):
        return None, None
    nome = ((c.get("amparoLegal") or {}).get("nome") or "")
    return ("14.133" in nome), c

def comparaveis_do_item(item, uf, data_ref, excluir):
    desc = item.get("descricao") or ""
    toks = tokens(desc)
    if not toks:
        return []
    q = " ".join(toks[:5])
    un_alvo = unidade(item.get("unidadeMedida"))
    cat_alvo = str(item.get("catalogoCodigoItem") or "").strip()
    inicio = data_ref - datetime.timedelta(days=365)
    achados = []
    for r in consulta_busca(q, uf):
        chave = f"{r.get('orgao_cnpj')}-{r.get('ano')}-{r.get('numero_sequencial')}"
        if chave == excluir:
            continue
        try:
            dpub = datetime.date.fromisoformat((r.get("data_publicacao_pncp") or "")[:10])
        except ValueError:
            continue
        if not (inicio <= dpub <= data_ref):
            continue
        cnpj, ano, seq = r.get("orgao_cnpj"), r.get("ano"), r.get("numero_sequencial")
        itens = get(f"https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens?pagina=1&tamanhoPagina=500") or []
        if not isinstance(itens, list):
            continue
        melhor, nota = None, 0
        for it in itens:
            if not it.get("temResultado"):
                continue
            if un_alvo and unidade(it.get("unidadeMedida")) != un_alvo:
                continue
            cat = str(it.get("catalogoCodigoItem") or "").strip()
            s = 1.0 if (cat_alvo and cat and cat == cat_alvo) else similaridade(desc, it.get("descricao"))
            if s > nota:
                melhor, nota = it, s
        if not melhor or nota < SIMILARIDADE:
            continue
        lei, compra = amparo_14133(cnpj, ano, seq)
        if not lei:
            continue
        res = get(f"https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens/{melhor['numeroItem']}/resultados") or []
        valores = [x.get("valorUnitarioHomologado") for x in res if isinstance(x, dict) and x.get("valorUnitarioHomologado")]
        if not valores:
            continue
        uo = (compra or {}).get("unidadeOrgao") or {}
        achados.append({
            "orgao": r.get("orgao_nome"), "municipio": r.get("municipio_nome") or uo.get("municipioNome"), "uf": r.get("uf"),
            "data": dpub.isoformat(), "valor_unitario": round(min(valores), 4), "descricao": (melhor.get("descricao") or "")[:300],
            "unidade": melhor.get("unidadeMedida"), "similaridade": nota, "mesmo_catalogo": nota == 1.0,
            "link": f"https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}", "amparo": ((compra or {}).get("amparoLegal") or {}).get("nome")})
        if len(achados) >= MAX_COMPARAVEIS:
            break
    return achados

def analisar(itens, uf, data_ref, excluir=""):
    validos = [i for i in itens if (i.get("valorUnitarioEstimado") or 0) > 0 and not i.get("orcamentoSigiloso")]
    validos.sort(key=lambda i: (i.get("valorTotal") or (i.get("valorUnitarioEstimado") or 0) * (i.get("quantidade") or 1)), reverse=True)
    total_orc = sum((i.get("valorTotal") or (i.get("valorUnitarioEstimado") or 0) * (i.get("quantidade") or 1)) for i in validos)
    saida = []
    for it in validos[:MAX_ITENS]:
        comp = comparaveis_do_item(it, uf, data_ref, excluir)
        est = float(it["valorUnitarioEstimado"]); qtd = float(it.get("quantidade") or 1)
        reg = {"numero": it.get("numeroItem"), "descricao": (it.get("descricao") or "")[:300], "unidade": it.get("unidadeMedida"),
               "quantidade": qtd, "valor_estimado": est, "valor_total": round(est * qtd, 2), "comparaveis": comp, "n": len(comp)}
        if len(comp) >= MIN_COMPARAVEIS:
            vals = [c["valor_unitario"] for c in comp]
            med = statistics.median(vals)
            desvio = (est - med) / med if med else 0
            reg.update({"mediana": round(med, 4), "minimo": min(vals), "maximo": max(vals), "desvio": round(desvio, 4),
                        "situacao": "indicio" if desvio > LIMIAR_INDICIO else ("atencao" if desvio > LIMIAR_ATENCAO else "compativel"),
                        "excesso_estimado": round(max(0.0, est - med) * qtd, 2)})
        else:
            reg["situacao"] = "amostra_insuficiente"
        saida.append(reg)
        print(f"item {reg['numero']}: {reg['n']} comparáveis · {reg['situacao']}", file=sys.stderr)
    analisados = sum(r["valor_total"] for r in saida)
    return {
        "criterios": {"uf": uf, "data_referencia": data_ref.isoformat(), "janela_dias": 365, "lei": "Lei 14.133/2021",
                      "preco": "valor unitário homologado", "estatistica": "mediana", "minimo_comparaveis": MIN_COMPARAVEIS,
                      "limiar_indicio": LIMIAR_INDICIO, "limiar_atencao": LIMIAR_ATENCAO, "similaridade_minima": SIMILARIDADE},
        "itens": saida, "itens_no_orcamento": len(itens), "itens_analisados": len(saida),
        "cobertura_valor": round(analisados / total_orc, 4) if total_orc else 0,
        "com_indicio": sum(1 for r in saida if r["situacao"] == "indicio"),
        "excesso_total": round(sum(r.get("excesso_estimado", 0) for r in saida if r["situacao"] == "indicio"), 2),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--itens", required=True); ap.add_argument("--uf", required=True); ap.add_argument("--data", required=True)
    ap.add_argument("--excluir", default=""); ap.add_argument("--saida", required=True)
    a = ap.parse_args()
    itens = json.load(open(a.itens, encoding="utf-8"))
    if isinstance(itens, dict):
        itens = itens.get("itens") or itens.get("data") or []
    r = analisar(itens, a.uf.upper(), datetime.date.fromisoformat(a.data[:10]), a.excluir)
    json.dump(r, open(a.saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"preços: {r['itens_analisados']} itens analisados · {r['com_indicio']} com indício · cobertura {r['cobertura_valor']:.0%}")

if __name__ == "__main__":
    main()
