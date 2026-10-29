#!/usr/bin/env python3
"""Extrai do documento a tabela do orçamento estimado (itens, unidade, quantidade, valor unitário), a UF do órgão e a data
de referência, para a análise de sobrepreço quando o documento foi enviado em PDF (sem os dados do PNCP).
Usa o Claude Haiku 5.5 (barato). Saída no formato de itens do PNCP + metadados.

Uso: ANTHROPIC_API_KEY=... python3 scripts/agente/extrair-itens.py documento.txt saida.json
"""
import json, os, sys, time, urllib.error, urllib.request

MODELO = os.environ.get("AGENTE_MODELO_ITENS", "claude-haiku-5-5")
FERRAMENTA = {
    "name": "registrar_itens",
    "description": "Registra os itens do orçamento estimado encontrados no documento.",
    "input_schema": {"type": "object", "properties": {
        "uf": {"type": "string", "description": "Sigla da UF do órgão contratante (ex.: RJ)"},
        "data_referencia": {"type": "string", "description": "Data do orçamento estimado ou, na falta, do documento (AAAA-MM-DD)"},
        "orcamento_sigiloso": {"type": "boolean"},
        "itens": {"type": "array", "items": {"type": "object", "properties": {
            "numeroItem": {"type": "integer"}, "descricao": {"type": "string"}, "unidadeMedida": {"type": "string"},
            "quantidade": {"type": "number"}, "valorUnitarioEstimado": {"type": "number"}},
            "required": ["descricao", "unidadeMedida", "quantidade", "valorUnitarioEstimado"]}}},
        "required": ["uf", "itens"]},
}
INSTR = ("Extraia do documento a tabela do orçamento estimado da contratação: para cada item, número, descrição completa (como no documento), "
         "unidade de medida, quantidade e valor unitário estimado em reais. Só inclua itens com valor unitário informado no documento — "
         "não estime nem calcule valores. Se o orçamento for sigiloso ou não houver valores, devolva a lista vazia e orcamento_sigiloso=true. "
         "Informe a UF do órgão contratante e a data do orçamento (ou do documento). Registre chamando a ferramenta registrar_itens.")

def main():
    txt = open(sys.argv[1], encoding="utf-8", errors="replace").read()[:600_000]
    corpo = {"model": MODELO, "max_tokens": 16000, "tools": [FERRAMENTA], "tool_choice": {"type": "auto"},
             "messages": [{"role": "user", "content": INSTR + "\n\n<documento>\n" + txt + "\n</documento>"}]}
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
    dados = bloco["input"] if bloco else {"uf": "", "itens": []}
    itens = []
    for k, i in enumerate(dados.get("itens") or [], 1):
        try:
            v, q = float(i["valorUnitarioEstimado"]), float(i.get("quantidade") or 1)
        except (TypeError, ValueError, KeyError):
            continue
        if v <= 0:
            continue
        itens.append({"numeroItem": i.get("numeroItem") or k, "descricao": i.get("descricao", "")[:500], "unidadeMedida": i.get("unidadeMedida", ""),
                      "quantidade": q, "valorUnitarioEstimado": v, "valorTotal": round(v * q, 2), "orcamentoSigiloso": False})
    u = d.get("usage", {})
    custo = round((u.get("input_tokens", 0) * (0.5 if u.get("input_tokens", 0) > 100_000 else 0.1) + u.get("output_tokens", 0) * (2.5 if u.get("input_tokens", 0) > 100_000 else 0.5)) / 1e6, 4)
    json.dump({"uf": (dados.get("uf") or "").upper()[:2], "data_referencia": dados.get("data_referencia") or "",
               "orcamento_sigiloso": bool(dados.get("orcamento_sigiloso")), "itens": itens, "custo_usd": custo},
              open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"itens extraídos: {len(itens)} · UF {dados.get('uf')} · US$ {custo}")

if __name__ == "__main__":
    main()
