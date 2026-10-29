#!/usr/bin/env python3
"""Extrai o texto de um PDF para o agente. Se o PDF for digitalizado (imagem, sem texto pesquisável),
faz OCR em português com o Tesseract, página por página (separadas por \\f, como o pdftotext).
Uso: python3 scripts/agente/extrair-texto.py documento.pdf saida.txt [--max-ocr 200]
Sai com código 3 se não houver texto aproveitável nem com OCR."""
import pathlib, re, shutil, subprocess, sys, tempfile

pdf, saida = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
max_ocr = int(sys.argv[sys.argv.index("--max-ocr") + 1]) if "--max-ocr" in sys.argv else 200
MINIMO_POR_PAGINA = 200

def util(t): return len(re.sub(r"\s+", "", t))

subprocess.run(["pdftotext", "-layout", str(pdf), str(saida)], check=True, capture_output=True)
texto = saida.read_text(encoding="utf-8", errors="replace")
paginas = texto.split("\f")
n = max(1, len([p for p in paginas if p is not None]))
fracas = [i for i, p in enumerate(paginas) if util(p) < MINIMO_POR_PAGINA]
# OCR quando a maioria das páginas não tem texto (documento digitalizado), ou só nas páginas sem texto
if fracas and shutil.which("tesseract") and len(fracas) <= max_ocr:
    with tempfile.TemporaryDirectory() as tmp:
        for i in fracas:
            base = pathlib.Path(tmp) / f"p{i}"
            subprocess.run(["pdftoppm", "-r", "300", "-gray", "-png", "-f", str(i + 1), "-l", str(i + 1), "-singlefile", str(pdf), str(base)],
                           capture_output=True)
            img = base.with_suffix(".png")
            if not img.exists():
                continue
            r = subprocess.run(["tesseract", str(img), "-", "-l", "por", "--psm", "1"], capture_output=True, text=True)
            if util(r.stdout) > util(paginas[i]):
                paginas[i] = "[texto obtido por OCR]\n" + r.stdout
    texto = "\f".join(paginas)
    saida.write_text(texto, encoding="utf-8")
    print(f"OCR em {len(fracas)} de {n} páginas")
if util(texto) < 800:
    sys.exit(3)
