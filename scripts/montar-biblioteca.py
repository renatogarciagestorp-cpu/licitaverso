"""Monta biblioteca.html (Biblioteca Jurídica do site) a partir da página do Acervo Licitacon.
Uso: python3 scripts/montar-biblioteca.py <acervo-licitaverso.html> [saida=biblioteca.html]
A página do acervo é usada tal como é; só se acrescentam a barra do site, a conexão com as contas
(licitaverso-auth.js) e o shim que troca o Claude pelos arquivos estáticos e pela conta da pessoa
(scripts/biblioteca-shim.js), e se ocultam os recursos que dependem do Claude.
Para só atualizar o shim e a barra numa biblioteca.html já montada: python3 scripts/atualizar-biblioteca.py"""
import sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "biblioteca.html")
shim = (pathlib.Path(__file__).parent / "biblioteca-shim.js").read_text(encoding="utf-8")

def troca(s, velho, novo):
    if velho not in s:
        sys.exit("Trecho não encontrado na página do acervo: " + velho[:70])
    return s.replace(velho, novo, 1)

# Recursos que dependem do Claude ficam ocultos no site
src = troca(src, '<button class="primary" type="button" id="dosMin">Gerar minuta</button>',
            '${S.sample?`<button class="primary" type="button" id="dosMin">Gerar minuta</button>`:""}')
src = troca(src, '$("dosMin").onclick=()=>abrirMinuta(false);', 'if($("dosMin"))$("dosMin").onclick=()=>abrirMinuta(false);')
src = troca(src, '${pc?" (computador desligado ou app fechado?)":""}', '')
# A situação da coleta só aparece no Acervo, não na Biblioteca do site
src = troca(src, '<div>\n        <h2>Situação da coleta</h2>', '<div hidden>\n        <h2>Situação da coleta</h2>')
src = troca(src, '<title>Acervo Licitacon</title>', '<title>Biblioteca Jurídica — Licitacon</title>')
# as fontes do site (Manrope e Source Serif 4) vêm na barra; as do acervo não são usadas
src = src.replace('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,500;7..72,650&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">', '')

barra = """<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<script type="speculationrules">{"prerender":[{"where":{"href_matches":"*index.html*"},"eagerness":"moderate"}],"prefetch":[{"where":{"href_matches":"*index.html*"},"eagerness":"conservative"}]}</script>

<style>
/* mesma barra do site (index.html): mesmos itens, tamanhos, cores e destaque da página atual */
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.16s}
:root:root{--f-display:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;--f-body:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;--f-mono:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif}
body{margin:0}
button,input,select,textarea{font-family:inherit}
.lvbar{margin-left:calc(-1*max(16px,env(safe-area-inset-left,0px)));margin-right:calc(-1*max(16px,env(safe-area-inset-right,0px)));position:sticky;top:0;z-index:40;background:#0A1F2A;border-bottom:1px solid rgba(255,255,255,.09);font-family:Manrope,-apple-system,"Segoe UI",sans-serif}
.lvbar .in{max-width:1240px;margin:0 auto;padding:0 24px;height:68px;display:flex;align-items:center;gap:28px}
.lvbar .marca{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:800;font-size:18px;letter-spacing:-.02em}
.lvbar .marca span{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(150deg,#0FA36B,#0F6B7E);color:#fff;font-weight:800;font-size:15px;letter-spacing:0}
.lvbar nav.prin{display:flex;align-items:center;gap:2px;margin-left:8px;white-space:nowrap}
.lvbar nav a{position:relative;color:#C9D6DB;text-decoration:none;font-size:14px;font-weight:600;padding:8px 11px;border-radius:8px}
.lvbar nav a:hover{color:#fff;background:rgba(255,255,255,.07)}
.lvbar nav.prin a[aria-current]{color:#fff}
.lvbar nav.prin a[aria-current]::after{content:"";position:absolute;left:11px;right:11px;bottom:1px;height:2px;background:#0FA36B;border-radius:2px}
.lvbar .dir{margin-left:auto;display:flex;align-items:center;gap:10px}
.lvbar .cta{background:#0FA36B;color:#06251A;text-decoration:none;font-weight:700;font-size:14px;padding:10px 16px;border-radius:10px;box-shadow:none}
.lvbar .cta:hover{background:#14B978}
.lvbar .conta{color:#C9D6DB;text-decoration:none;font-size:14px;font-weight:600;padding:8px 4px}
.lvbar .conta:hover{color:#fff}
.lvbar .menu{display:none;width:42px;height:42px;place-items:center;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:11px;color:#fff;font-size:20px;cursor:pointer;padding:0}
.lvbar nav.movel{display:grid;gap:2px;background:#0A1F2A;border-top:1px solid rgba(255,255,255,.09);padding:8px 16px 16px}
.lvbar nav.movel a{color:#E3ECEF;font-size:16px;font-weight:700;padding:14px 12px;border-radius:10px}
.lvbar [hidden]{display:none!important}
@media (max-width:1200px){.lvbar nav.prin{display:none}.lvbar .menu{display:grid}}
@media (max-width:960px){.lvbar{position:relative}}
@media (max-width:860px){.lvbar .in{gap:12px;padding:0 16px;height:60px}.lvbar .cta{padding:9px 12px;font-size:13.5px}.lvbar .marca{font-size:17px}}
</style>
<div class="lvbar"><div class="in">
<a class="marca" href="index.html" aria-label="Licitacon — página inicial"><span>L</span>Licitacon</a>
<nav class="prin" aria-label="Navegação principal">
<a href="biblioteca.html" aria-current="page">Biblioteca Jurídica</a><a href="index.html?p=forum">Fórum</a><a href="index.html?p=cursos">Cursos</a>
<a href="index.html?p=consultoria">Consultoria</a><a href="index.html?p=agente">O Parecerista</a><a href="index.html?p=elaborar">O Elaborador</a>
<a href="index.html?p=calculadora">Calculadora</a><a href="index.html?p=gestao">Gestão contratual</a><a href="index.html?p=planos">Planos</a>
</nav>
<div class="dir">
<a class="conta" id="lvEntrar" href="index.html?p=login&amp;volta=biblioteca">Entrar</a><a class="cta" id="lvCadastro" href="index.html?p=cadastro&amp;volta=biblioteca">Cadastre-se</a>
<a class="cta" id="lvConta" href="index.html?p=conta" hidden>Minha conta</a><a class="conta" id="lvSair" href="index.html" hidden>Sair</a>
<button class="menu" type="button" aria-label="Abrir menu" aria-expanded="false" onclick="var m=document.getElementById('lvMenu'),a=m.hidden;m.hidden=!a;this.setAttribute('aria-expanded',a);this.textContent=a?'✕':'☰'">☰</button>
</div></div>
<nav class="movel" id="lvMenu" aria-label="Menu" hidden>
<a href="biblioteca.html" aria-current="page">Biblioteca Jurídica</a><a href="index.html?p=forum">Fórum</a><a href="index.html?p=cursos">Cursos</a>
<a href="index.html?p=consultoria">Consultoria</a><a href="index.html?p=agente">O Parecerista</a><a href="index.html?p=elaborar">O Elaborador</a>
<a href="index.html?p=calculadora">Calculadora</a><a href="index.html?p=gestao">Gestão contratual</a><a href="index.html?p=planos">Planos</a>
</nav></div>
"""
html = ('<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><script>/* impede que o site seja aberto dentro de outro site (clickjacking) */if(window.top!==window.self){try{window.top.location=window.self.location}catch(e){document.documentElement.style.display=\"none\"}}</script>'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="theme-color" content="#0A1F2A"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icones/apple-touch-icon.png"><link rel="icon" type="image/png" href="icones/icone-192.png">'
        '<script src="licitaverso-auth.js?v=7"></script><script src="chatbot.js?v=13" defer></script>\n'
        '<script>\n' + shim + '\n</script></head><body>\n' + barra + src + '\n</body></html>\n')
out.write_text(html, encoding="utf-8")
print("gravado", out, len(html), "bytes")
