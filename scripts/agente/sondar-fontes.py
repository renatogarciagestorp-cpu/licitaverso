#!/usr/bin/env python3
"""Testa se o robô (GitHub Actions) consegue baixar cada fonte normativa candidata."""
import json, sys, urllib.request
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
URLS = sys.argv[2:]
out = []
for u in URLS:
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60) as r:
            b = r.read(400000)
            out.append({"url": u, "status": r.status, "tipo": r.headers.get("Content-Type"), "bytes": len(b), "inicio": b[:300].decode("latin-1", "replace")})
    except Exception as e:
        out.append({"url": u, "erro": f"{type(e).__name__}: {e}"[:200]})
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
