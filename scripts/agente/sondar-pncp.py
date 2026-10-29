#!/usr/bin/env python3
"""Sonda os formatos da API do PNCP (busca, itens, resultados) e grava amostras para o desenvolvimento."""
import json, sys, urllib.parse, urllib.request
H = {"User-Agent": "Mozilla/5.0 (Licitacon; agente)", "Accept": "application/json"}
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60) as r:
            return json.loads(r.read() or b"null")
    except Exception as e:
        return {"_erro": f"{type(e).__name__}: {e}"[:300], "_url": u}
out = {}
q = urllib.parse.quote("ultrassom doppler")
out["busca"] = get(f"https://pncp.gov.br/api/search/?q={q}&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=5&ufs=RJ")
out["itens_428"] = get("https://pncp.gov.br/api/pncp/v1/orgaos/29131075000193/compras/2026/428/itens?pagina=1&tamanhoPagina=5")
out["compra_428"] = get("https://pncp.gov.br/api/consulta/v1/orgaos/29131075000193/compras/2026/428")
# um item com resultado: pega a primeira compra da busca que tenha resultado
alvos = []
for it in (out["busca"] or {}).get("items", [])[:5] if isinstance(out["busca"], dict) else []:
    alvos.append((it.get("orgao_cnpj"), it.get("ano"), it.get("numero_sequencial")))
out["alvos"] = alvos
for cnpj, ano, seq in alvos[:3]:
    its = get(f"https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens?pagina=1&tamanhoPagina=3")
    out[f"itens_{cnpj}_{ano}_{seq}"] = its
    if isinstance(its, list) and its:
        n = its[0].get("numeroItem")
        out[f"res_{cnpj}_{ano}_{seq}_{n}"] = get(f"https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens/{n}/resultados")
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
