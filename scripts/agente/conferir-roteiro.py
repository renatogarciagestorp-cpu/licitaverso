#!/usr/bin/env python3
"""Confere se cada dispositivo citado nos roteiros existe no texto oficial da base (agente/normas).
Uso: python3 scripts/agente/conferir-roteiro.py [agente/roteiros/lei-14133.json]"""
import json, pathlib, sys
RAIZ = pathlib.Path(__file__).resolve().parents[2]
arq = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "agente/roteiros/lei-14133.json"
r = json.loads(arq.read_text(encoding="utf-8"))
normas, faltam, sem_base, ok = {}, [], set(), 0
for it in r["itens"]:
    for f in it["fundamento"]:
        p = RAIZ / "agente/normas" / (f["norma"] + ".json")
        if not p.exists():
            sem_base.add(f["norma"]); continue
        n = normas.setdefault(f["norma"], json.loads(p.read_text(encoding="utf-8")))
        art = next((a for a in n["artigos"] if a["num"] == f["art"]), None)
        d = art and next((x for x in art["dispositivos"] if x["id"] == f["disp"]), None)
        if not d: faltam.append(f"{it['id']}: {f['norma']} art. {f['art']} [{f['disp']}] não encontrado")
        elif d.get("revogado") or d.get("vetado"): faltam.append(f"{it['id']}: {f['norma']} art. {f['art']} [{f['disp']}] está {'revogado' if d.get('revogado') else 'vetado'}")
        else: ok += 1
print(f"conferidos: {ok} · problemas: {len(faltam)} · normas ainda fora da base: {', '.join(sorted(sem_base)) or 'nenhuma'}")
for x in faltam: print("  ✗", x)
sys.exit(1 if faltam else 0)
