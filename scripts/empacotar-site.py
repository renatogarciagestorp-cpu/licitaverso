#!/usr/bin/env python3
"""Gera o index.html do site a partir de src/site.html.

O site era publicado como um pacote do Claude Design: um arquivo único que, a cada carregamento, decodificava
fontes e scripts embutidos (base64 + gzip), montava o documento e o trocava inteiro — o que causava uma leve
travada a cada F5. Agora os recursos ficam em arquivos próprios na pasta assets/ (com nome por conteúdo, que o
navegador guarda em cache) e o index.html é a própria página, pronta para o navegador ler.

Depois de qualquer mudança em src/site.html, rode:

    python3 scripts/empacotar-site.py

e publique o index.html gerado (e a pasta assets/, se mudar).
"""
import base64
import gzip
import hashlib
import json
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTE = RAIZ / "src" / "site.html"
PACOTE = RAIZ / "index.html"
MAPA = RAIZ / "src" / "recursos.json"
ASSETS = RAIZ / "assets"

SITE = "https://renatogarciagestorp-cpu.github.io/licitaverso/"
DESCRICAO = ("Jurisprudência de fontes oficiais, fórum de licitações, cursos e consultoria técnica "
             "para quem trabalha com licitações e contratos administrativos. Cadastro gratuito.")
SEO = f"""<!-- seo -->
<meta name="description" content="{DESCRICAO}">
<link rel="canonical" href="{SITE}">
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

NOMES = {"https://unpkg.com/react@18.3.1/umd/react.production.min.js": "react-18.3.1.min.js",
         "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "react-dom-18.3.1.min.js"}


def extrair_pacote() -> None:
    """Primeira execução: tira do pacote antigo os recursos embutidos e grava em assets/ (uma vez só)."""
    pacote = PACOTE.read_text(encoding="utf-8")
    m = re.search(r'<script type="__bundler/manifest">(.*?)</script>', pacote, re.S)
    if not m:
        raise SystemExit("index.html não tem o pacote antigo e src/recursos.json não existe.")
    manifesto = json.loads(m.group(1))
    ext = json.loads(re.search(r'<script type="__bundler/ext_resources">(.*?)</script>', pacote, re.S).group(1))
    por_uuid = {e["uuid"]: e["id"] for e in ext}
    ASSETS.mkdir(exist_ok=True)
    mapa = {"arquivos": {}, "externos": {}}
    for uuid, e in manifesto.items():
        dados = base64.b64decode(e["data"])
        if e.get("compressed"):
            dados = gzip.decompress(dados)
        h = hashlib.sha256(dados).hexdigest()[:10]
        if uuid in por_uuid:
            nome = NOMES.get(por_uuid[uuid], f"lib-{h}.js")
        elif e["mime"].startswith("font/"):
            nome = f"manrope-{h}.woff2"
        else:
            nome = f"dc-runtime-{h}.js"
        (ASSETS / nome).write_bytes(dados)
        mapa["arquivos"][uuid] = "assets/" + nome
        if uuid in por_uuid:
            mapa["externos"][por_uuid[uuid]] = "assets/" + nome
    MAPA.write_text(json.dumps(mapa, indent=1, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    if not MAPA.exists():
        extrair_pacote()
    mapa = json.loads(MAPA.read_text(encoding="utf-8"))
    html = FONTE.read_text(encoding="utf-8")
    if "<x-dc>" not in html or "</x-dc>" not in html:
        print("src/site.html: falta <x-dc>…</x-dc>", file=sys.stderr)
        return 1
    for uuid, caminho in mapa["arquivos"].items():
        html = html.replace(uuid, caminho)
    runtime = next(c for c in mapa["arquivos"].values() if "dc-runtime" in c)
    externos = mapa["externos"]
    # pré-carrega em paralelo o que a página usa logo de saída (o runtime, o React e as fontes latinas)
    fontes = re.findall(r'url\("(assets/manrope-[0-9a-f]+\.woff2)"\)[^;]*;\s*unicode-range:\s*U\+0000-00FF', html)
    pre = [f'<link rel="preload" href="{runtime}" as="script">'] + [f'<link rel="preload" href="{c}" as="script">' for c in externos.values()]
    pre += [f'<link rel="preload" href="{c}" as="font" type="font/woff2" crossorigin>' for c in dict.fromkeys(fontes)]
    cabeca = ("\n<meta charset=\"utf-8\">\n<script>window.__resources = " + json.dumps(externos) + ";</script>\n" + "\n".join(pre) + "\n"
              + '<style>html{background:#F6F8F7}</style>\n' + SEO + "\n")
    html = html.replace("<html><head>", '<html lang="pt-BR"><head>', 1)
    i = html.index("<head>") + len("<head>")
    html = html[:i] + cabeca + html[i:]
    PACOTE.write_text(html, encoding="utf-8")
    print(f"index.html atualizado ({len(html):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
