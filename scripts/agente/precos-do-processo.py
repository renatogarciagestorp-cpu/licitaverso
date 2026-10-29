#!/usr/bin/env python3
"""Prepara a análise de sobrepreço de um processo: usa os itens do PNCP (quando o documento veio do PNCP) ou extrai os itens
do texto do documento (Claude Haiku), e roda sobrepreco.py. Nunca derruba a análise principal: em falha, só avisa.
Uso: python3 scripts/agente/precos-do-processo.py --texto doc.txt [--pasta-pncp DIR] [--excluir CNPJ-ANO-SEQ] --saida precos.json"""
import argparse, datetime, json, pathlib, subprocess, sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--texto", required=True); ap.add_argument("--pasta-pncp"); ap.add_argument("--excluir", default="")
ap.add_argument("--saida", required=True)
a = ap.parse_args()
tmp = pathlib.Path(a.saida).with_suffix(".itens.json")
uf = data = None
try:
    pasta = pathlib.Path(a.pasta_pncp) if a.pasta_pncp else None
    usar_pncp = False
    if pasta and (pasta / "itens.json").exists() and (pasta / "compra.json").exists():
        its = json.loads((pasta / "itens.json").read_text(encoding="utf-8")) or []
        descs = [(i.get("descricao") or "").strip().lower() for i in its if isinstance(i, dict)]
        # itens do PNCP só servem se a descrição identificar o objeto; descrições repetidas ou genéricas (nome de catálogo
        # aplicado a itens diferentes) levam à extração da tabela do próprio documento
        distintas = len(set(descs)) / len(descs) if descs else 0
        media_palavras = sum(len(d.split()) for d in descs) / len(descs) if descs else 0
        usar_pncp = bool(descs) and (len(descs) == 1 or distintas >= 0.6) and media_palavras >= 3
        if not usar_pncp:
            print("descrições dos itens no PNCP genéricas ou repetidas; extraindo a tabela do documento")
    if usar_pncp:
        compra = json.loads((pasta / "compra.json").read_text(encoding="utf-8"))
        uf = (compra.get("unidadeOrgao") or {}).get("ufSigla")
        data = (compra.get("dataPublicacaoPncp") or "")[:10]
        itens = json.loads((pasta / "itens.json").read_text(encoding="utf-8"))
        tmp.write_text(json.dumps(itens, ensure_ascii=False), encoding="utf-8")
    if not usar_pncp:
        r = subprocess.run([sys.executable, str(RAIZ / "scripts/agente/extrair-itens.py"), a.texto, str(tmp)], capture_output=True, text=True, timeout=900)
        if r.returncode != 0:
            sys.exit(f"extração de itens falhou: {r.stderr[-300:]}")
        ext = json.loads(tmp.read_text(encoding="utf-8"))
        uf, data = ext.get("uf"), ext.get("data_referencia")
        if pasta and (pasta / "compra.json").exists():
            c = json.loads((pasta / "compra.json").read_text(encoding="utf-8"))
            uf = (c.get("unidadeOrgao") or {}).get("ufSigla") or uf
            data = (c.get("dataPublicacaoPncp") or "")[:10] or data
        tmp.write_text(json.dumps(ext.get("itens", []), ensure_ascii=False), encoding="utf-8")
        print(r.stdout.strip())
    if not uf:
        sys.exit("UF do órgão não identificada; análise de preços não realizada")
    try:
        datetime.date.fromisoformat((data or "")[:10])
    except ValueError:
        data = datetime.date.today().isoformat()
    r = subprocess.run([sys.executable, str(RAIZ / "scripts/agente/sobrepreco.py"), "--itens", str(tmp), "--uf", uf, "--data", data[:10],
                        "--excluir", a.excluir, "--saida", a.saida], capture_output=True, text=True, timeout=2400)
    print(r.stdout.strip() or r.stderr[-300:])
    if r.returncode != 0:
        sys.exit(1)
    d = json.loads(pathlib.Path(a.saida).read_text(encoding="utf-8"))
    if not d.get("itens"):
        pathlib.Path(a.saida).unlink()  # sem itens com valor (ex.: orçamento sigiloso): o parecer não traz a seção
        print("sem itens com valor estimado; seção de preços omitida")
except subprocess.TimeoutExpired:
    sys.exit("análise de preços excedeu o tempo")
