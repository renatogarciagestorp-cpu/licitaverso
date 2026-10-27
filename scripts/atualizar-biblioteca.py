#!/usr/bin/env python3
"""Atualiza, numa biblioteca.html já montada, o shim (scripts/biblioteca-shim.js), a conexão
com as contas (licitaverso-auth.js) e os links de conta da barra do site — sem precisar da
página original do acervo. Idempotente.
Uso: python3 scripts/atualizar-biblioteca.py [biblioteca.html]"""
import pathlib, re, sys
raiz = pathlib.Path(__file__).resolve().parent.parent
alvo = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else raiz / "biblioteca.html"
html = alvo.read_text(encoding="utf-8")
shim = (raiz / "scripts" / "biblioteca-shim.js").read_text(encoding="utf-8")

# 1) shim: o primeiro <script> inline do <head>
cab, sep, corpo = html.partition("</head>")
if not sep:
    sys.exit("biblioteca.html sem </head>")
m = re.search(r"<script>\n.*?\n</script>", cab, re.S)
if not m:
    sys.exit("shim não encontrado no <head>")
cab = cab[:m.start()] + "<script>\n" + shim + "\n</script>" + cab[m.end():]
if "licitaverso-auth.js" not in cab:
    cab = cab.replace("<script>\n" + shim, '<script src="licitaverso-auth.js?v=3"></script>\n<script>\n' + shim, 1)
html = cab + sep + corpo

# 2) barra: links de conta
velho = '<a class="conta" href="index.html?p=conta">Minha conta</a><a class="cta" href="index.html?p=planos">Cadastro gratuito</a>'
novo = ('<a class="conta" id="lvEntrar" href="index.html?p=login&amp;volta=biblioteca">Entrar</a>'
        '<a class="cta" id="lvCadastro" href="index.html?p=cadastro&amp;volta=biblioteca">Cadastre-se</a>\n'
        '<a class="cta" id="lvConta" href="index.html?p=conta" hidden>Minha conta</a>'
        '<a class="conta" id="lvSair" href="index.html" hidden>Sair</a>')
if velho in html:
    html = html.replace(velho, novo, 1)
css = ".lvbar .conta{color:#C9D6DB;text-decoration:none;font-size:14px;font-weight:600}"
if css in html and ".lvbar [hidden]" not in html:
    html = html.replace(css, css + "\n.lvbar [hidden]{display:none!important}", 1)

TAGS_APP = ('<meta name="theme-color" content="#0A1F2A"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icones/apple-touch-icon.png"><link rel="icon" type="image/png" href="icones/icone-192.png">')
if 'rel="manifest"' not in html:
    html = html.replace('<meta name="viewport" content="width=device-width,initial-scale=1">',
                        '<meta name="viewport" content="width=device-width,initial-scale=1">' + TAGS_APP, 1)

# 3) assistente de dúvidas
if "chatbot.js" not in html:
    html = html.replace('<script src="licitaverso-auth.js?v=3"></script>', '<script src="licitaverso-auth.js?v=3"></script><script src="chatbot.js?v=1" defer></script>', 1)

alvo.write_text(html, encoding="utf-8")
print("atualizado", alvo, len(html), "bytes")
