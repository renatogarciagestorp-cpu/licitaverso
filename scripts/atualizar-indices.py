#!/usr/bin/env python3
"""Baixa as séries mensais dos índices de reajuste (variação % ao mês) do SGS do Banco Central
e grava indices.json, usado pela Calculadora de reajuste do site.
Uso: python3 scripts/atualizar-indices.py [saida=indices.json]
"""
import datetime, json, sys, time, urllib.request

SERIES = {
    "ipca":   {"codigo": 433,   "nome": "IPCA (IBGE)"},
    "ipca_e": {"codigo": 10764, "nome": "IPCA-E (IBGE)"},
    "inpc":   {"codigo": 188,   "nome": "INPC (IBGE)"},
    "igpm":   {"codigo": 189,   "nome": "IGP-M (FGV)"},
    "igpdi":  {"codigo": 190,   "nome": "IGP-DI (FGV)"},
    "incc":   {"codigo": 192,   "nome": "INCC-DI (FGV)"},
}
INICIO = "01/01/2010"

def baixar(codigo):
    hoje = datetime.date.today().strftime("%d/%m/%Y")
    url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial={INICIO}&dataFinal={hoje}"
    for tentativa in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Licitacon/1.0 (calculadora de reajuste)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            print(f"série {codigo}: tentativa {tentativa + 1} falhou ({e})")
            time.sleep(5 * (tentativa + 1))
    raise SystemExit(f"Não foi possível baixar a série {codigo}")

def main():
    saida = sys.argv[1] if len(sys.argv) > 1 else "indices.json"
    try:
        anterior = json.load(open(saida, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        anterior = {"series": {}}
    series = {}
    for chave, info in SERIES.items():
        try:
            dados = baixar(info["codigo"])
            mensal = {}
            for linha in dados:
                d, m, a = linha["data"].split("/")
                mensal[f"{a}-{m}"] = round(float(str(linha["valor"]).replace(",", ".")), 4)
            if len(mensal) < 24:
                raise ValueError("poucos dados")
        except (SystemExit, Exception) as e:  # noqa: BLE001
            print(f"::warning::{info['nome']}: mantendo a versão anterior ({e})")
            if chave in anterior.get("series", {}):
                series[chave] = anterior["series"][chave]
            continue
        ultimos = sorted(mensal)[-3:]
        print(f"::notice::{info['nome']} (SGS {info['codigo']}): {len(mensal)} meses · últimos " + ", ".join(f"{k}={mensal[k]}" for k in ultimos))
        series[chave] = {"nome": info["nome"], "fonte": f"Banco Central do Brasil, SGS {info['codigo']}", "mensal": dict(sorted(mensal.items()))}
    novo = {"formato": "licitacon-indices", "versao": 1, "series": series}
    if {k: v.get("mensal") for k, v in series.items()} == {k: v.get("mensal") for k, v in anterior.get("series", {}).items()}:
        print("sem mudança nos índices")
        return
    novo["gerado_em"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    json.dump(novo, open(saida, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("indices.json atualizado")

if __name__ == "__main__":
    main()
