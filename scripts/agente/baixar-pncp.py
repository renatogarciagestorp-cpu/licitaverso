#!/usr/bin/env python3
"""Baixa os dados e todos os arquivos publicados de uma contratação no PNCP (API pública).
Uso: python3 scripts/agente/baixar-pncp.py <cnpj> <ano> <sequencial> <pasta-destino>
Grava: compra.json, arquivos.json, cada arquivo (com o nome original) e _resultado.txt."""
import json, pathlib, re, sys, urllib.parse, urllib.request

cnpj, ano, seq, destino = sys.argv[1:5]
pasta = pathlib.Path(destino); pasta.mkdir(parents=True, exist_ok=True)
log = []
H = {"User-Agent": "Mozilla/5.0 (Licitacon; agente de análise)", "Accept": "application/json, */*"}

def get(url, binario=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=90) as r:
        dados = r.read()
        return (dados, r.headers.get("Content-Disposition", ""), r.headers.get("Content-Type", "")) if binario else json.loads(dados)

base = f"https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}"
for nome, url in [("compra.json", f"https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}"), ("arquivos.json", base + "/arquivos"), ("itens.json", base + "/itens?pagina=1&tamanhoPagina=500")]:
    try:
        d = get(url)
        (pasta / nome).write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        log.append(f"{nome}: ok")
    except Exception as e:
        log.append(f"{nome}: FALHOU {type(e).__name__}: {e}")

try:
    arquivos = json.loads((pasta / "arquivos.json").read_text(encoding="utf-8"))
except Exception:
    arquivos = []
for a in arquivos if isinstance(arquivos, list) else []:
    url = a.get("url") or a.get("uri")
    if not url:
        continue
    url = re.sub(r"^https://pncp\.gov\.br:\d+/", "https://pncp.gov.br/", url)  # a API devolve uma porta interna que não responde
    try:
        dados, disp, tipo = get(url, binario=True)
        m = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)', disp)
        nome = m.group(1) if m else (a.get("titulo") or f"arquivo-{a.get('sequencialDocumento', '')}")
        nome = re.sub(r"[^\w.\- ]+", "_", urllib.parse.unquote(nome))[:120]
        if "." not in nome[-6:]:
            nome += ".pdf" if "pdf" in tipo else (".zip" if "zip" in tipo else "")
        (pasta / f"{a.get('sequencialDocumento', 0):02d} - {nome}").write_bytes(dados)
        log.append(f"arquivo {a.get('sequencialDocumento')}: {a.get('tipoDocumentoNome', '')} · {a.get('titulo', '')} → {nome} ({len(dados)} bytes)")
    except Exception as e:
        log.append(f"arquivo {a.get('sequencialDocumento')}: FALHOU {type(e).__name__}: {e}")
(pasta / "_resultado.txt").write_text("\n".join(log) + "\n", encoding="utf-8")
print("\n".join(log))
