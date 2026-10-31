#!/usr/bin/env python3
"""Extrai da planilha de custos e formação de preços (texto de extrair-planilha.py) os postos/profissionais: função, CBO, UF,
salário-base, jornada semanal, custo total mensal por empregado e quantidade. Usa o Claude Haiku 5.5 (barato).

Uso: ANTHROPIC_API_KEY=... python3 scripts/agente/extrair-postos.py planilha.txt saida.json [--uf RJ]
"""
import json, os, sys, time, urllib.error, urllib.request

MODELO = os.environ.get("AGENTE_MODELO_ITENS", "claude-haiku-5-5")
FERRAMENTA = {
    "name": "registrar_postos",
    "description": "Registra os postos de trabalho encontrados na planilha de custos.",
    "input_schema": {"type": "object", "properties": {
        "uf": {"type": "string", "description": "UF da prestação dos serviços (ex.: RJ), se identificável"},
        "postos": {"type": "array", "items": {"type": "object", "properties": {
            "funcao": {"type": "string"}, "cbo": {"type": "string", "description": "código CBO de 6 dígitos, se informado"},
            "uf": {"type": "string"}, "salario_base": {"type": "number", "description": "salário-base mensal (R$), sem adicionais"},
            "jornada_semanal": {"type": "number", "description": "horas semanais (ex.: 44; 12x36 = 42)"},
            "custo_total_mensal": {"type": "number", "description": "valor total mensal por empregado/posto na planilha (R$), com todos os módulos"},
            "custo_modulos_1_a_4": {"type": "number", "description": "soma dos totais dos Módulos 1 a 4 (remuneração; encargos e benefícios; provisão para rescisão; reposição do profissional ausente), conforme o quadro-resumo da planilha"},
            "legivel": {"type": "boolean", "description": "false se o CBO, o salário ou os totais estiverem ilegíveis, truncados ou incoerentes no texto"},
            "observacao_legibilidade": {"type": "string"},
            "quantidade": {"type": "number"}, "convencao": {"type": "string", "description": "CCT/ACT indicada para o posto"},
            "local": {"type": "string", "description": "aba e linha onde estão o salário-base e o total (ex.: aba Servente, L12 e L80)"}},
            "required": ["funcao"]}}},
        "required": ["postos"]},
}
INSTR = ("A seguir está o conteúdo de uma planilha de custos e formação de preços de serviços com dedicação exclusiva de mão de obra "
         "(cada linha: número da linha e células COLUNA=valor; fórmulas entre colchetes). Identifique cada posto/função e registre: função, "
         "CBO (só se estiver na planilha), UF da prestação, salário-base mensal (sem adicionais), jornada semanal, valor total mensal por "
         "empregado (soma de todos os módulos, com custos indiretos, lucro e tributos), quantidade de postos, convenção coletiva indicada e "
         "local (aba/linha), a soma dos totais dos Módulos 1 a 4 (pelo quadro-resumo) e se os dados estão legíveis. O texto pode vir de "
         "digitalização (OCR): NUNCA adivinhe nem corrija um CBO ou valor ilegível, truncado ou incoerente, nem deduza o CBO pelo nome da "
         "função; deixe o campo em branco e marque legivel=false, explicando em observacao_legibilidade. Registre chamando a ferramenta registrar_postos.")


def main():
    txt = open(sys.argv[1], encoding="utf-8", errors="replace").read()[:400_000]
    corpo = {"model": MODELO, "max_tokens": 8000, "tools": [FERRAMENTA], "tool_choice": {"type": "auto"},
             "messages": [{"role": "user", "content": INSTR + "\n\n<planilha>\n" + txt + "\n</planilha>"}]}
    d = None
    for t in range(3):
        try:
            req = urllib.request.Request("https://api.anthropic.com/v1/messages", method="POST", data=json.dumps(corpo).encode(),
                                         headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                                                  "content-type": "application/json"})
            d = json.load(urllib.request.urlopen(req, timeout=600))
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 529) and t < 2:
                time.sleep(15 * (t + 1)); continue
            sys.exit(f"Erro da API ({e.code}): {e.read().decode()[:300]}")
        except Exception as e:
            if t < 2:
                time.sleep(15 * (t + 1)); continue
            sys.exit(f"Falha de conexão: {type(e).__name__}")
    bloco = next((c for c in d.get("content", []) if c.get("type") == "tool_use"), None)
    dados = bloco["input"] if bloco else {"postos": []}
    uf_arg = sys.argv[sys.argv.index("--uf") + 1].upper() if "--uf" in sys.argv else ""
    uf = (dados.get("uf") or uf_arg or "").upper()[:2]
    postos = []
    for p in dados.get("postos") or []:
        if not p.get("funcao"):
            continue
        p["uf"] = (p.get("uf") or uf).upper()[:2]
        postos.append(p)
    u = d.get("usage", {})
    custo = round((u.get("input_tokens", 0) * (0.5 if u.get("input_tokens", 0) > 100_000 else 0.1) + u.get("output_tokens", 0) * (2.5 if u.get("input_tokens", 0) > 100_000 else 0.5)) / 1e6, 4)  # mesma tabela de extrair-itens.py
    json.dump({"uf": uf, "postos": postos, "custo_usd": custo}, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"postos extraídos: {len(postos)} · UF {uf} · US$ {custo}")


if __name__ == "__main__":
    main()
