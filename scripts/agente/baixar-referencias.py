#!/usr/bin/env python3
"""Baixa as fontes técnicas de referência (agente/referencias/fontes.json), extrai o texto e monta o índice de trechos.
Também indexa arquivos enviados manualmente em agente/referencias/manuais/<id>.pdf|.txt (com entrada em fontes.json, tipo "manual").
Uso: python3 scripts/agente/baixar-referencias.py [--so-indice]
Saída: agente/referencias/textos/<id>.txt e agente/referencias/indice.json"""
import html as htmllib, json, pathlib, re, subprocess, sys, tempfile, urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[2]
REF = RAIZ / "agente" / "referencias"
TXT = REF / "textos"
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept": "*/*"}
TAM_TRECHO = 1600

def baixar(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=180) as r:
        return r.read()

def html_para_texto(b):
    h = b.decode("utf-8", "replace")
    m = re.search(r'<div[^>]+id="(content-core|parent-fieldname-text|content)"', h)
    if m:
        h = h[m.start():]
        fim = re.search(r'<div[^>]+(id="viewlet-below-content|class="documentByLine|id="portal-footer)', h)
        if fim: h = h[:fim.start()]
    h = re.sub(r"(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|table)>", "\n", h)
    t = htmllib.unescape(re.sub(r"<[^>]+>", " ", h))
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n\n", t).strip()

def pdf_para_texto(b):
    with tempfile.TemporaryDirectory() as tmp:
        p = pathlib.Path(tmp) / "f.pdf"; p.write_bytes(b)
        r = subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, text=True)
        return r.stdout

def trechos(fonte, texto):
    """Divide em trechos de ~1.600 caracteres, guardando a página (PDF) e o último título visto."""
    out = []
    paginas = texto.split("\f") if "\f" in texto else [texto]
    for npag, pag in enumerate(paginas, 1):
        paras = [re.sub(r"[ \t]+", " ", p).strip() for p in re.split(r"\n\s*\n|\n(?=\s*(?:Art\.|\d+(?:\.\d+)+\s|[IVX]+\s*[-–]))", pag)]
        buf, titulo = "", ""
        for p in paras:
            if not p:
                continue
            if len(p) < 120 and (p.isupper() or re.match(r"^(\d+(\.\d+)*\.?\s+[A-ZÁÉÍÓÚ]|CAPÍTULO|Seção|ANEXO|Art\.\s*\d+)", p)):
                titulo = p[:120]
            if len(buf) + len(p) > TAM_TRECHO and buf:
                out.append({"pagina": npag if len(paginas) > 1 else None, "secao": titulo, "texto": buf.strip()})
                buf = ""
            buf += p + "\n"
        if buf.strip():
            out.append({"pagina": npag if len(paginas) > 1 else None, "secao": titulo, "texto": buf.strip()})
    for k, t in enumerate(out, 1):
        t["id"] = f"{fonte['id']}#{k}"
        t["fonte"] = fonte["id"]
    return [t for t in out if len(t["texto"]) > 200]

def main():
    cat = json.loads((REF / "fontes.json").read_text(encoding="utf-8"))
    TXT.mkdir(parents=True, exist_ok=True)
    relatorio = []
    for f in cat["fontes"]:
        destino = TXT / f"{f['id']}.txt"
        if "--so-indice" in sys.argv and destino.exists():
            continue
        try:
            if f["tipo"] == "manual":
                local = next((p for p in (REF / "manuais").glob(f"{f['id']}.*")), None)
                if not local:
                    relatorio.append(f"{f['id']}: aguardando envio do arquivo"); continue
                b = local.read_bytes()
                texto = pdf_para_texto(b) if local.suffix.lower() == ".pdf" else b.decode("utf-8", "replace")
            else:
                b = baixar(f["url"])
                texto = pdf_para_texto(b) if (f["tipo"] == "pdf" or b[:4] == b"%PDF") else html_para_texto(b)
            if len(texto) < 2000:
                relatorio.append(f"{f['id']}: texto curto demais ({len(texto)}); mantida a versão anterior"); continue
            destino.write_text(texto, encoding="utf-8")
            relatorio.append(f"{f['id']}: ok ({len(texto)} caracteres)")
        except Exception as e:
            relatorio.append(f"{f['id']}: falhou ({type(e).__name__}: {str(e)[:120]})")
    indice = []
    for f in cat["fontes"]:
        p = TXT / f"{f['id']}.txt"
        if p.exists():
            indice += trechos(f, p.read_text(encoding="utf-8"))
    (REF / "indice.json").write_text(json.dumps({"trechos": indice}, ensure_ascii=False), encoding="utf-8")
    print("\n".join(relatorio))
    print(f"índice: {len(indice)} trechos de {len({t['fonte'] for t in indice})} fontes")

if __name__ == "__main__":
    main()
