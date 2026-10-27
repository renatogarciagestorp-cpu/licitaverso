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

# Endereço público do site (troque aqui quando o domínio próprio estiver no ar)
SITE = "https://renatogarciagestorp-cpu.github.io/licitaverso/"
DESCRICAO = ("Jurisprudência de fontes oficiais, fórum de licitações, cursos e consultoria técnica "
             "para quem trabalha com licitações e contratos administrativos. Cadastro gratuito.")
SEO = f"""<!-- seo -->
  <meta name="description" content="{DESCRICAO}">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0A1F2A">
  <link rel="canonical" href="{SITE}">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" type="image/png" href="icones/icone-192.png">
  <link rel="apple-touch-icon" href="icones/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Licitacon">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="Licitacon — Tudo sobre licitações. Em um só lugar.">
  <meta property="og:description" content="{DESCRICAO}">
  <meta property="og:url" content="{SITE}">
  <meta property="og:image" content="{SITE}icones/compartilhar.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Licitacon — Tudo sobre licitações. Em um só lugar.">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebSite","name":"Licitacon","url":"{SITE}","description":"{DESCRICAO}","inLanguage":"pt-BR"}}</script>
  <!-- /seo -->"""


def cabecalho(pacote: str) -> str:
    """Põe (ou atualiza) as etiquetas de busca e compartilhamento no <head> externo do pacote."""
    pacote = re.sub(r"\s*<!-- seo -->.*?<!-- /seo -->", "", pacote, count=1, flags=re.S)
    pacote = pacote.replace("<html>", '<html lang="pt-BR">', 1)
    return pacote.replace("</title>", "</title>\n  " + SEO, 1)


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
    novo = cabecalho(pacote[: m.start(2)]) + codificado + pacote[m.end(2):]
    PACOTE.write_text(novo, encoding="utf-8")
    print(f"index.html atualizado ({len(novo):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
