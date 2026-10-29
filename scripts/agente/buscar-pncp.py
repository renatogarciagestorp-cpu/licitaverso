#!/usr/bin/env python3
"""Procura no PNCP contratações recentes para testar o agente e lista os documentos publicados (edital, ETP, TR...).
Uso: python3 scripts/agente/buscar-pncp.py <dias> <palavras separadas por vírgula> <saida.json>"""
import datetime, json, sys, time, unicodedata, urllib.request

H = {"User-Agent": "Mozilla/5.0 (Licitacon; agente de análise)", "Accept": "application/json"}
def get(url):
    for t in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60) as r:
                b = r.read(); return json.loads(b) if b.strip() else None
        except Exception as e:
            if t == 2: print("falha", url[:120], type(e).__name__); return None
            time.sleep(3)

def n(s): return unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode()

dias, palavras, saida = int(sys.argv[1]), [n(p.strip()) for p in sys.argv[2].split(",")], sys.argv[3]
fim = datetime.date.today(); ini = fim - datetime.timedelta(days=dias)
achados = []
for modalidade in (6, 8):  # pregão eletrônico, dispensa
    for pagina in range(1, 15):
        url = (f"https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial={ini:%Y%m%d}&dataFinal={fim:%Y%m%d}"
               f"&codigoModalidadeContratacao={modalidade}&pagina={pagina}&tamanhoPagina=50")
        d = get(url)
        if not d or not d.get("data"): break
        for c in d["data"]:
            obj = n(c.get("objetoCompra"))
            if any(p in obj for p in palavras):
                achados.append(c)
        if pagina >= (d.get("totalPaginas") or 1): break
print("contratações com as palavras:", len(achados))
candidatos = []
for c in achados[:120]:
    cnpj = c["orgaoEntidade"]["cnpj"]; ano = c["anoCompra"]; seq = c["sequencialCompra"]
    arqs = get(f"https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos") or []
    tipos = [(a.get("tipoDocumentoNome") or a.get("tipoDocumentoDescricao") or "", a.get("titulo") or "") for a in arqs]
    texto = n(" ".join(t + " " + ti for t, ti in tipos))
    candidatos.append({
        "link": f"https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}",
        "orgao": c["orgaoEntidade"].get("razaoSocial"), "uf": c.get("unidadeOrgao", {}).get("ufSigla"),
        "modalidade": c.get("modalidadeNome"), "srp": c.get("srp"), "objeto": (c.get("objetoCompra") or "")[:300],
        "valor": c.get("valorTotalEstimado"), "publicacao": c.get("dataPublicacaoPncp"),
        "tem_etp": "estudo tecnico" in texto or "etp" in texto.split(), "tem_tr": "termo de referencia" in texto,
        "arquivos": [{"tipo": t, "titulo": ti} for t, ti in tipos]})
    time.sleep(0.3)
candidatos.sort(key=lambda x: (x["tem_etp"] + x["tem_tr"], x["valor"] or 0), reverse=True)
json.dump(candidatos, open(saida, "w"), ensure_ascii=False, indent=1)
print("gravado", saida, len(candidatos))
