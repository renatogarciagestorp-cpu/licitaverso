#!/usr/bin/env python3
"""Lista os links (PDF e páginas) de páginas-índice oficiais, para montar o catálogo de referências."""
import json, re, sys, urllib.parse, urllib.request
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
out = {}
for u in sys.argv[2:]:
    try:
        html = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60).read().decode("utf-8", "replace")
        links = sorted({urllib.parse.urljoin(u, h) for h in re.findall(r'href="([^"#]+)"', html)})
        out[u] = [l for l in links if re.search(r"\.pdf|cadernos|manua|cartilha|publicac|/\d-\d|licitacoesecontratos", l, re.I)][:400]
    except Exception as e:
        out[u] = [f"ERRO {type(e).__name__}: {e}"[:200]]
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
