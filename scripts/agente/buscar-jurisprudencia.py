#!/usr/bin/env python3
"""Busca jurisprudência fora do acervo (fontes oficiais) para temas sem precedente na Biblioteca.
Fonte atual: TCU — Jurisprudência Selecionada (API pública da pesquisa do TCU).
Uso: python3 scripts/agente/buscar-jurisprudencia.py "termo 1" ["termo 2" ...] --saida achados.json [--max 10]
Cada achado sai no formato da coleção "decisoes" do acervo (para revisão e inclusão)."""
import json, re, sys, urllib.parse, urllib.request, datetime

H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
     "Accept": "application/json, text/plain, */*", "Referer": "https://pesquisa.apps.tcu.gov.br/"}

def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60) as r:
            return json.loads(r.read() or b"null")
    except Exception as e:
        return {"_erro": f"{type(e).__name__}: {e}"[:200], "_url": url}

def tcu_js(termo, n=10):
    url = ("https://pesquisa.apps.tcu.gov.br/rest/publico/base/jurisprudencia-selecionada/documentosResumidos?"
           + urllib.parse.urlencode({"termo": termo, "ordenacao": "score desc", "quantidade": n, "inicio": 0}))
    return get(url), url

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    saida = sys.argv[sys.argv.index("--saida") + 1]; args = [a for a in args if a != saida]
    n = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 10
    args = [a for a in args if a != str(n)]
    out = {"gerado_em": datetime.datetime.utcnow().isoformat() + "Z", "buscas": []}
    for termo in args:
        d, url = tcu_js(termo, n)
        out["buscas"].append({"fonte": "TCU-JS", "termo": termo, "url": url, "resposta": d})
    json.dump(out, open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
