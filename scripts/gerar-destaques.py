#!/usr/bin/env python3
"""Gera inicio-destaques.json: decisões reais e recentes do acervo para a faixa animada da página inicial.

Mostra as decisões e orientações mais recentes do acervo pela data (julgamento, sessão ou assinatura), na mesma
ordem da lista da Biblioteca. Roda dentro de scripts/empacotar-site.py e na automação
acervo-mesclar (a cada coleta que entra no site); à mão: python3 scripts/gerar-destaques.py
"""
import json
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ACERVO = RAIZ / "acervo.json"
SAIDA = RAIZ / "inicio-destaques.json"
TOTAL = 28
POR_ORGAO = 1  # um por órgão: a decisão mais recente de cada um


def curto(t: str, n: int) -> str:
    t = " ".join((t or "").split())
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0].rstrip(",;:.") + "…"


def main() -> None:
    if not ACERVO.exists():
        return
    itens = json.loads(ACERVO.read_text(encoding="utf-8")).get("itens", [])
    itens = [x for x in itens if x.get("natureza") in ("decisoes", "orientacoes") and x.get("numero") and x.get("titulo") and x.get("data") and x.get("tema") not in ("Outros", "")]
    itens.sort(key=lambda x: (x["data"], (x.get("verificado_em") or "")[:10]), reverse=True)
    conta, saida = {}, []
    for x in itens:
        o = x.get("orgao") or ""
        if conta.get(o, 0) >= POR_ORGAO:
            continue
        conta[o] = conta.get(o, 0) + 1
        a, m, d = x["data"][:10].split("-")
        saida.append({"orgao": o, "tipo": x.get("tipo", ""), "numero": curto(x["numero"], 60), "data": f"{d}/{m}/{a}",
                      "tema": x.get("tema", ""), "titulo": curto(x["titulo"], 150)})
        if len(saida) >= TOTAL:
            break
    SAIDA.write_text(json.dumps({"itens": saida}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"inicio-destaques.json: {len(saida)} decisões")


if __name__ == "__main__":
    main()
