#!/usr/bin/env python3
"""Baixa o catálogo do Compras.gov.br (PDMs de materiais do CATMAT e serviços do CATSER) para a pesquisa de preços.
A API de preços praticados só aceita código de catálogo, e o catálogo não tem busca por texto: por isso guardamos
nomes e códigos em catalogo-compras.json, e a pesquisa casa o objeto do assinante com os nomes.
Uso: python3 scripts/atualizar-catalogo.py catalogo-compras.json"""
import json, subprocess, sys, time, urllib.parse

B = "https://dadosabertos.compras.gov.br"


def get(caminho, params):
    url = B + caminho + "?" + urllib.parse.urlencode(params)
    for t in range(4):
        r = subprocess.run(["curl", "-sS", "-m", "90", "-H", "Accept: application/json", url], capture_output=True, text=True)
        if r.returncode == 0:
            try:
                return json.loads(r.stdout)
            except ValueError:
                pass
        time.sleep(5 * (t + 1))
    raise RuntimeError("falha ao baixar " + caminho)


def todos(caminho, params, campos):
    saida, pagina = [], 1
    while True:
        j = get(caminho, {**params, "pagina": pagina, "tamanhoPagina": 500})
        for x in j.get("resultado") or []:
            saida.append([x.get(c) for c in campos])
        if not j.get("paginasRestantes"):
            break
        pagina += 1
    return saida


pdm = todos("/modulo-material/3_consultarPdmMaterial", {"statusPdm": "true"}, ["codigoPdm", "nomePdm", "nomeClasse"])
srv = todos("/modulo-servico/6_consultarItemServico", {"statusServico": "true"}, ["codigoServico", "nomeServico", "nomeClasse"])
if len(pdm) < 1000 or len(srv) < 500:
    sys.exit(f"catálogo incompleto ({len(pdm)} PDMs, {len(srv)} serviços): mantém o anterior")
out = {"fonte": "Compras.gov.br — dados abertos (CATMAT/CATSER)", "pdm": pdm, "servico": srv}
open(sys.argv[1], "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(f"{len(pdm)} PDMs, {len(srv)} serviços")
