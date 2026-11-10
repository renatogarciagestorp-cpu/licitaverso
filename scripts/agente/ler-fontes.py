#!/usr/bin/env python3
"""Leitor de fontes oficiais para as coletas do Acervo (roda no GitHub Actions, que tem rede livre).

As coletas agendadas rodam num ambiente da nuvem com a rede filtrada e sem ninguém para aprovar os pedidos de
acesso. Elas deixam em pedidos/<nome>.txt os endereços que precisam ler (um por linha) no ramo coleta-fontes; a
automação .github/workflows/acervo-fontes.yml roda este script e devolve, em lidas/<nome>/:
  indice.json   [{url, arquivo, status, tipo, bytes, erro}] na ordem do pedido
  NN.txt        o texto de cada endereço (PDF pelo pdftotext, com OCR se for digitalizado; HTML sem marcação),
                seguido da lista de links da página (para achar boletins, informativos e PDFs novos)

Só lê domínios oficiais (.gov.br, .tc.br, .jus.br, .leg.br), respeita o robots.txt de cada site e se identifica
como LicitaconColeta. Uso: python3 scripts/agente/ler-fontes.py pedidos/<nome>.txt lidas/<nome>
"""
import html.parser, json, pathlib, re, subprocess, sys, tempfile, time, urllib.parse, urllib.request, urllib.robotparser

UA = "LicitaconColeta/1.0 (+https://renatogarciagestorp-cpu.github.io/licitaverso/biblioteca.html)"
OFICIAL = re.compile(r"\.(gov|tc|jus|leg)\.br$")
MAX_URLS, MAX_BYTES, MAX_TEXTO, MAX_LINKS = 60, 25_000_000, 400_000, 400
raiz = pathlib.Path(__file__).resolve().parent

class Texto(html.parser.HTMLParser):
    """Texto visível e links de uma página HTML."""
    PULAR = {"script", "style", "noscript", "svg", "head"}
    BLOCO = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "table", "td", "th"}
    def __init__(self, base):
        super().__init__(convert_charrefs=True); self.base, self.partes, self.links, self.fundo = base, [], [], 0
    def handle_starttag(self, tag, attrs):
        if tag in self.PULAR: self.fundo += 1
        if tag in self.BLOCO: self.partes.append("\n")
        elif tag in ("a", "span", "td", "strong", "em", "b", "i"): self.partes.append(" ")
        if tag == "a":
            href = dict(attrs).get("href") or ""
            if href and not href.startswith(("#", "javascript:", "mailto:")):
                self.links.append(urllib.parse.urljoin(self.base, href))
    def handle_endtag(self, tag):
        if tag in self.PULAR and self.fundo: self.fundo -= 1
    def handle_data(self, d):
        if not self.fundo: self.partes.append(d)
    def texto(self):
        t = re.sub(r"[ \t\r\f\v]+", " ", "".join(self.partes))
        return re.sub(r"\n\s*\n+", "\n\n", t).strip()

robots = {}
def permitido(url):
    p = urllib.parse.urlsplit(url); casa = f"{p.scheme}://{p.netloc}"
    if casa not in robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            with urllib.request.urlopen(urllib.request.Request(casa + "/robots.txt", headers={"User-Agent": UA}), timeout=20) as r:
                rp.parse(r.read(200_000).decode("utf-8", "replace").splitlines())
        except Exception:
            rp.parse([])  # sem robots.txt legível: tudo permitido
        robots[casa] = rp
    return robots[casa].can_fetch(UA, url)

def ler(url, destino):
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    if not url.startswith(("http://", "https://")) or not OFICIAL.search(host):
        return {"erro": "fora dos domínios oficiais (.gov.br, .tc.br, .jus.br, .leg.br)"}
    if not permitido(url):
        return {"erro": "o robots.txt do site não permite leitura automática deste endereço"}
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/pdf,*/*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9"})
    with urllib.request.urlopen(req, timeout=90) as r:
        corpo = r.read(MAX_BYTES + 1)
        tipo = (r.headers.get("Content-Type") or "").lower()
        final = r.geturl()
        status = r.status
    if len(corpo) > MAX_BYTES:
        return {"status": status, "erro": "arquivo maior que 25 MB"}
    links = []
    if "pdf" in tipo or corpo[:5] == b"%PDF-":
        with tempfile.TemporaryDirectory() as tmp:
            pdf = pathlib.Path(tmp) / "f.pdf"; pdf.write_bytes(corpo); txt = pathlib.Path(tmp) / "f.txt"
            subprocess.run([sys.executable, str(raiz / "extrair-texto.py"), str(pdf), str(txt), "--max-ocr", "30"], capture_output=True, timeout=600)
            texto = txt.read_text(encoding="utf-8", errors="replace") if txt.exists() else ""
        tipo = "pdf"
    else:
        cs = re.search(r"charset=([\w-]+)", tipo)
        bruto = corpo.decode(cs.group(1) if cs else "utf-8", "replace")
        if "html" in tipo or re.search(r"<html|<body|<div", bruto[:5000], re.I):
            p = Texto(final); p.feed(bruto); texto = p.texto()
            vistos = set(); links = [l for l in p.links if not (l in vistos or vistos.add(l))][:MAX_LINKS]
            tipo = "html"
        else:
            texto = bruto
    texto = texto[:MAX_TEXTO]
    destino.write_text(f"URL: {url}\n" + (f"URL final: {final}\n" if final != url else "") + "\n" + texto
                       + ("\n\nLINKS DA PÁGINA:\n" + "\n".join(links) if links else "") + "\n", encoding="utf-8")
    return {"status": status, "tipo": tipo, "bytes": len(corpo), "caracteres": len(texto), "links": len(links)}

def main():
    pedido, saida = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    saida.mkdir(parents=True, exist_ok=True)
    urls = []
    for l in pedido.read_text(encoding="utf-8", errors="replace").splitlines():
        l = l.strip()
        if l and not l.startswith("#") and l not in urls: urls.append(l)
    indice = []
    for i, url in enumerate(urls[:MAX_URLS], 1):
        arq = saida / f"{i:02d}.txt"
        try:
            r = ler(url, arq)
        except urllib.error.HTTPError as e:
            r = {"status": e.code, "erro": f"o site respondeu {e.code}"}
        except Exception as e:
            r = {"erro": f"{type(e).__name__}: {e}"[:200]}
        r = {"url": url, "arquivo": arq.name if arq.exists() else None, **r}
        indice.append(r); print(json.dumps(r, ensure_ascii=False))
        time.sleep(1)  # sem pressa: um endereço por segundo
    for url in urls[MAX_URLS:]:
        indice.append({"url": url, "arquivo": None, "erro": f"acima do limite de {MAX_URLS} endereços por pedido"})
    (saida / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
