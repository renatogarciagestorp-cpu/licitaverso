#!/usr/bin/env python3
"""Executa uma análise a partir de um pacote privado (descriptografado no runner) com vários documentos.
Nada do conteúdo vai para o log: só contagens e custo.

manifesto.json:
{"regime": "lei-13019", "objeto": ["mao-de-obra"], "fonte": "descrição",
 "principal": {"tipo": "edital", "arquivo": "edital.pdf"},
 "adicionais": [{"tipo": "plano_trabalho", "nome": "Plano de trabalho", "arquivo": "plano.pdf"}],
 "anexos": [{"tipo": "planilha", "nome": "Planilha de custos (PDF)", "arquivo": "planilha.pdf", "salarios": true}]}

Uso: python3 scripts/agente/privado.py pasta_do_pacote pasta_de_saida
"""
import json, pathlib, re, subprocess, sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
PY = sys.executable


def rodar(args, timeout=3000):
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        # só a última linha, sem conteúdo dos documentos
        raise SystemExit(f"falhou: {pathlib.Path(args[1]).name}: {(r.stderr or r.stdout).strip().splitlines()[-1][:150] if (r.stderr or r.stdout).strip() else r.returncode}")
    return r.stdout


def para_texto(arq, destino):
    suf = arq.suffix.lower()
    if suf == ".pdf":
        rodar([PY, str(RAIZ / "scripts/agente/extrair-texto.py"), str(arq), str(destino)])
    elif suf in (".xlsx", ".xlsm", ".xls", ".ods"):
        rodar([PY, str(RAIZ / "scripts/agente/extrair-planilha.py"), str(arq), str(destino)])
    elif suf == ".docx":
        import docx
        destino.write_text("\n".join(p.text for p in docx.Document(str(arq)).paragraphs), encoding="utf-8")
    else:
        destino.write_text(arq.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
    return destino


def paginas(pdf):
    if pdf.suffix.lower() != ".pdf":
        return None
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    for ln in out.splitlines():
        if ln.startswith("Pages:"):
            return int(ln.split()[1])


def main():
    pac, saida = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    saida.mkdir(parents=True, exist_ok=True)
    m = json.loads((pac / "manifesto.json").read_text(encoding="utf-8"))
    tmp = pac / "_txt"; tmp.mkdir(exist_ok=True)
    p = m["principal"]
    txt_p = para_texto(pac / p["arquivo"], tmp / "principal.txt")
    args = [PY, str(RAIZ / "scripts/agente/analisar.py"), "--doc", p["tipo"], "--texto", str(txt_p), "--regime", m.get("regime", "lei-14133"),
            "--fonte", m.get("fonte", p["arquivo"]), "--saida", str(saida / "analise.json")]
    if paginas(pac / p["arquivo"]):
        args += ["--paginas", str(paginas(pac / p["arquivo"]))]
    for o in m.get("objeto", []):
        args += ["--objeto", o]
    for k, d in enumerate(m.get("adicionais", []), 1):
        t = para_texto(pac / d["arquivo"], tmp / f"adicional{k}.txt")
        args += ["--doc-adicional", f"{d['tipo']}::{d['nome']}::{t}"]
    for k, x in enumerate(m.get("anexos", []), 1):
        t = para_texto(pac / x["arquivo"], tmp / f"anexo{k}.txt")
        args += ["--anexo", f"{x['tipo']}::{x['nome']}::{t}"]
        if x.get("salarios"):
            try:
                txt_pl = t.read_text(encoding="utf-8", errors="replace")
                if "QUADRO RESUMO" in txt_pl.upper() and re.search(r"M[ÓO]DULO 1", txt_pl, re.I):  # modelo IN 5/2017: leitura sem IA
                    rodar([PY, str(RAIZ / "scripts/agente/postos-in05.py"), str(t), str(tmp / "postos.json"), "--uf", m.get("uf", "")], 300)
                else:
                    rodar([PY, str(RAIZ / "scripts/agente/extrair-postos.py"), str(t), str(tmp / "postos.json")], 900)
                rodar([PY, str(RAIZ / "scripts/agente/salarios.py"), str(tmp / "postos.json"), str(saida / "salarios.json")], 900)
                args += ["--salarios", str(saida / "salarios.json")]
                print("referência salarial: ok")
            except SystemExit as e:
                print("referência salarial não obtida:", str(e)[:120])
    for n in m.get("normas_locais", []):
        t = para_texto(pac / n["arquivo"], tmp / (pathlib.Path(n["arquivo"]).stem + ".txt"))
        args += ["--norma-local", f"{n['nome']}::{t}"]
    out = rodar(args, 3000)
    print(out.strip().splitlines()[-1].split(" · ", 1)[-1] if out.strip() else "análise concluída")
    nome = m.get("nome_parecer", "parecer")
    rodar([PY, str(RAIZ / "scripts/agente/gerar-relatorio.py"), str(saida / "analise.json"), str(saida / f"{nome}.docx"), "--pdf"], 900)
    print("parecer gerado")


if __name__ == "__main__":
    main()
