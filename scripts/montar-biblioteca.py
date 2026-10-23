"""Monta biblioteca.html (Biblioteca Jurídica do site) a partir da página do Acervo Licitaverso.
Uso: python3 scripts/montar-biblioteca.py <acervo-licitaverso.html> [saida=biblioteca.html]
A página do acervo é usada tal como é; só se acrescentam a barra do site e o shim que troca o Claude
pelos arquivos estáticos (scripts/biblioteca-shim.js), e se ocultam os recursos que dependem do Claude."""
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
src = troca(src, '<title>Acervo Licitaverso</title>', '<title>Biblioteca Jurídica — Licitaverso</title>')

barra = """<style>
.lvbar{background:#0A1F2A;color:#fff;font-family:"IBM Plex Sans",-apple-system,sans-serif}
.lvbar .in{max-width:1320px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.lvbar .marca{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:700;font-size:18px}
.lvbar .marca span{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#0FA36B;color:#06251A;font-weight:800}
.lvbar nav{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.lvbar nav a{color:#C9D6DB;text-decoration:none;font-size:14px;font-weight:600;padding:8px 12px;border-radius:8px}
.lvbar nav a:hover{color:#fff;background:rgba(255,255,255,.08)}
.lvbar nav a[aria-current]{color:#fff;background:rgba(255,255,255,.1)}
.lvbar .cta{background:#0FA36B;color:#06251A;text-decoration:none;font-weight:700;font-size:14px;padding:9px 16px;border-radius:10px}
.lvbar .conta{color:#C9D6DB;text-decoration:none;font-size:14px;font-weight:600}
@media (max-width:720px){.lvbar nav{order:3;flex-basis:100%}}
</style>
<div class="lvbar"><div class="in">
<a class="marca" href="index.html"><span>L</span>Licitaverso</a>
<nav aria-label="Site">
<a href="biblioteca.html" aria-current="page">Biblioteca Jurídica</a>
<a href="index.html?p=forum">Fórum</a><a href="index.html?p=cursos">Cursos</a><a href="index.html?p=consultoria">Consultoria</a>
<a href="index.html?p=agente">Agente IA</a><a href="index.html?p=planos">Planos</a>
</nav>
<a class="conta" href="index.html?p=conta">Minha conta</a><a class="cta" href="index.html?p=planos">Cadastro gratuito</a>
</div></div>
"""
html = ('<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<script>\n' + shim + '\n</script></head><body>\n' + barra + src + '\n</body></html>\n')
out.write_text(html, encoding="utf-8")
print("gravado", out, len(html), "bytes")
