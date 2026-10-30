#!/usr/bin/env python3
"""Confere se cada dispositivo citado nos roteiros e módulos existe e está vigente no texto oficial da base (agente/normas).
O fundamento pode ser lista ou dicionário por regime ({"lei-14133": [...], "lei-13303": [...]}).
Uso: python3 scripts/agente/conferir-roteiro.py [arquivo.json ...]   (sem argumentos: todos os roteiros e módulos)"""
import json, pathlib, sys
RAIZ = pathlib.Path(__file__).resolve().parents[2]
arquivos = [pathlib.Path(x) for x in sys.argv[1:]] or sorted((RAIZ / "agente/roteiros").rglob("*.json"))
normas, faltam, sem_base, ok = {}, [], set(), 0
for arq in arquivos:
    r = json.loads(arq.read_text(encoding="utf-8"))
    for it in r["itens"]:
        fund = it["fundamento"]
        lista = [f for v in fund.values() for f in v] if isinstance(fund, dict) else fund
        for f in lista:
            p = RAIZ / "agente/normas" / (f["norma"] + ".json")
            if not p.exists():
                sem_base.add(f["norma"]); continue
            n = normas.setdefault(f["norma"], json.loads(p.read_text(encoding="utf-8")))
            art = next((a for a in n["artigos"] if a["num"] == f["art"]), None)
            d = art and next((x for x in art["dispositivos"] if x["id"] == f["disp"]), None)
            if not d: faltam.append(f"{arq.name} {it['id']}: {f['norma']} art. {f['art']} [{f['disp']}] não encontrado")
            elif d.get("revogado") or d.get("vetado") or not d.get("texto"): faltam.append(f"{arq.name} {it['id']}: {f['norma']} art. {f['art']} [{f['disp']}] revogado/vetado/sem texto")
            else: ok += 1
print(f"conferidos: {ok} · problemas: {len(faltam)} · normas ainda fora da base: {', '.join(sorted(sem_base)) or 'nenhuma'}")
for x in faltam: print("  ✗", x)
sys.exit(1 if faltam else 0)
