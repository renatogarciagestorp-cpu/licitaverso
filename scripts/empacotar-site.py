#!/usr/bin/env python3
"""Reempacota o site: grava src/site.html dentro do index.html.

O index.html é um pacote do Claude Design (fontes, runtime e template num
arquivo só). O código editável do site fica em src/site.html; depois de
qualquer mudança nele, rode:

    python3 scripts/empacotar-site.py

e publique o index.html gerado.
"""
import json
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTE = RAIZ / "src" / "site.html"
PACOTE = RAIZ / "index.html"

padrao = re.compile(r'(<script type="__bundler/template">)(.*?)(</script>)', re.S)


def main() -> int:
    pacote = PACOTE.read_text(encoding="utf-8")
    m = padrao.search(pacote)
    if not m:
        print("index.html: bloco do template não encontrado", file=sys.stderr)
        return 1
    template = FONTE.read_text(encoding="utf-8")
    if "<x-dc>" not in template or "</x-dc>" not in template:
        print("src/site.html: falta <x-dc>…</x-dc>", file=sys.stderr)
        return 1
    codificado = json.dumps(template).replace("</", "<\\u002F")
    novo = pacote[: m.start(2)] + codificado + pacote[m.end(2):]
    PACOTE.write_text(novo, encoding="utf-8")
    print(f"index.html atualizado ({len(novo):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
