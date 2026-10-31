#!/usr/bin/env python3
"""Lê, sem inteligência artificial (custo zero), as planilhas de custos e formação de preços no modelo da IN SEGES/MP 5/2017
(Anexo VII-D) a partir do texto (PDF pesquisável ou OCR): por posto, função, CBO, salário-base, totais dos Módulos 1 a 4 e preço
total por posto. Não corrige nem deduz nada: valor ou CBO que não casar exatamente com o padrão fica em branco e o posto é marcado
como ilegível (legivel=false), para que o parecer registre que não foi possível analisá-lo por causa da qualidade do arquivo.

Uso: python3 scripts/agente/postos-in05.py planilha.txt saida.json --uf RJ
"""
import json, re, sys

VAL = r"R\$\s*([\d\.]{1,9},\d{2})(?![\d])"


def num(s):
    return float(s.replace(".", "").replace(",", "."))


def blocos(txt):
    partes = re.split(r"(?im)^.*Composi[çc][ãa]o de Custos\s*[-–]\s*", txt)
    for p in partes[1:]:
        funcao = p.splitlines()[0].strip(" .|")
        if re.fullmatch(r"(?i)folha base|or[çc]amento.*", funcao):  # título do anexo, não é posto
            continue
        yield funcao, p.split("QUADRO RESUMO", 1)[0], (p.split("QUADRO RESUMO", 1) + [""])[1]


def main():
    txt = open(sys.argv[1], encoding="utf-8", errors="replace").read()
    uf = sys.argv[sys.argv.index("--uf") + 1].upper() if "--uf" in sys.argv else ""
    postos = []
    for funcao, corpo, resumo in blocos(txt):
        p = {"funcao": funcao, "uf": uf, "legivel": True, "observacao_legibilidade": ""}
        m = re.search(r"\(CBO\)\s*(\d{4})-?(\d{2})\b", corpo)
        p["cbo"] = (m.group(1) + m.group(2)) if m else ""
        m = re.search(r"Sal[áa]rio Base\s+" + VAL, corpo)
        p["salario_base"] = num(m.group(1)) if m else None
        mods = {}
        for k in range(1, 5):
            m = re.search(rf"TOTAL DO M[ÓO]DULO {k}\b[^\n]*?" + VAL, corpo)
            if m:
                mods[k] = num(m.group(1))
        # quadro-resumo, quando legível, confirma os módulos
        for k, rot in ((1, "MÓDULO 1"), (2, "MÓDULO 2"), (3, "MÓDULO 3"), (4, "MÓDULO 4")):
            m = re.search(rf"{rot}\s*[-–][^\n]*?" + VAL, resumo)
            if m and k in mods and abs(num(m.group(1)) - mods[k]) > 0.05:
                p["legivel"] = False
                p["observacao_legibilidade"] += f"Módulo {k} diverge entre o corpo e o quadro-resumo. "
            elif m and k not in mods:
                mods[k] = num(m.group(1))
        m = re.search(r"PRE[ÇC]O TOTAL POR POSTO\s+" + VAL, resumo)
        p["custo_total_mensal"] = num(m.group(1)) if m else None
        faltam = [f"Módulo {k}" for k in range(1, 5) if k not in mods]
        if not p["cbo"]:
            faltam.append("CBO")
        if faltam:
            p["legivel"] = False
            p["observacao_legibilidade"] += "Ilegível no arquivo: " + ", ".join(faltam) + "."
        p["custo_modulos_1_a_4"] = round(sum(mods.values()), 2) if not faltam or set(mods) == {1, 2, 3, 4} else None
        postos.append(p)
    json.dump({"uf": uf, "postos": postos, "custo_usd": 0, "metodo": "leitura determinística do modelo IN 5/2017"},
              open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"postos lidos: {len(postos)} · ilegíveis: {sum(1 for p in postos if not p['legivel'])}")


if __name__ == "__main__":
    main()
