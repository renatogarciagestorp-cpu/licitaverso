#!/usr/bin/env python3
"""Baixa o texto oficial das normas listadas em agente/normas/fontes.json e grava
agente/normas/<id>.json com a estrutura: artigos → dispositivos (caput, incisos, parágrafos, alíneas).

- Texto riscado no site oficial (<strike>, <s>, <del>) é descartado: fica só a redação vigente.
- Notas como "(Incluído pela Lei nº 14.770, de 2023)" são mantidas no fim do dispositivo.
- Só usa a biblioteca padrão do Python.
Uso: python3 scripts/agente/baixar-normas.py [id ...]     (sem id = todas)
     python3 scripts/agente/baixar-normas.py --arquivo pagina.html --id teste   (testar com HTML local)
"""
import datetime, hashlib, html.parser, json, pathlib, re, sys, urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[2]
PASTA = RAIZ / "agente" / "normas"
RISCADO = {"strike", "s", "del"}
BLOCO = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "blockquote"}


class Texto(html.parser.HTMLParser):
    """Converte o HTML em linhas de texto, sem o conteúdo riscado."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.linhas, self.atual, self.riscado, self.ignorar = [], [], 0, 0

    def quebra(self):
        t = re.sub(r"\s+", " ", "".join(self.atual).replace("\xa0", " ")).strip()
        if t:
            self.linhas.append(t)
        self.atual = []

    def handle_starttag(self, tag, attrs):
        if tag in RISCADO:
            self.riscado += 1
        elif tag in ("script", "style", "head", "title"):
            self.ignorar += 1
        elif tag in BLOCO:
            self.quebra()

    def handle_endtag(self, tag):
        if tag in RISCADO:
            self.riscado = max(0, self.riscado - 1)
        elif tag in ("script", "style", "head", "title"):
            self.ignorar = max(0, self.ignorar - 1)
        elif tag in BLOCO:
            self.quebra()

    def handle_data(self, data):
        if not self.riscado and not self.ignorar:
            self.atual.append(data)

    def fim(self):
        self.quebra()
        return self.linhas


R_ART = re.compile(r"^Art\.\s*(\d+)\s*(?:[ºo°])?\s*(?:-\s*([A-Z]))?\s*[\.\-–]?\s*(.*)$")
R_PAR = re.compile(r"^(?:§\s*(\d+)\s*[ºo°]?\s*(?:-\s*([A-Z]))?\s*[\.\-–]?|Parágrafo\s+único\.?)\s*(.*)$", re.I)
R_INC = re.compile(r"^([IVXLCDM]+)(?:\s*-\s*([A-Z]))?\s*[-–—]\s*(.*)$")
R_ALI = re.compile(r"^([a-z])\)\s*(.*)$")
R_ITEM = re.compile(r"^(\d+)\.\s+(.*)$")
R_TITULO = re.compile(r"^(LIVRO|TÍTULO|CAPÍTULO|Seção|SEÇÃO|Subseção|SUBSEÇÃO)\b", re.I)
R_NOTA = re.compile(r"\((?:Incluíd[oa]|Redação dada|Revogad[oa]|Vide|Promulga|Vigência|Regulamento|Produção de efeito|Vetad[oa])[^()]*(?:\([^()]*\)[^()]*)*\)", re.I)


def estruturar(linhas, norma):
    artigos, art, caminho, ctx = [], None, [], {}
    for ln in linhas:
        if R_TITULO.match(ln) and len(ln) < 160:
            nivel = ln.split()[0].upper()
            ordem = ["LIVRO", "TÍTULO", "CAPÍTULO", "SEÇÃO", "SUBSEÇÃO"]
            n = ordem.index(nivel) if nivel in ordem else 4
            caminho = [c for c in caminho if ordem.index(c[0]) < n] + [(nivel, ln)]
            continue
        m = R_ART.match(ln)
        if m and (m.group(3) or "").strip():
            num = m.group(1) + ("-" + m.group(2) if m.group(2) else "")
            art = {"num": num, "rotulo": "Art. " + num, "caminho": " > ".join(c[1] for c in caminho), "dispositivos": []}
            artigos.append(art)
            ctx = {"par": None, "inc": None, "ali": None}
            art["dispositivos"].append({"id": "caput", "rotulo": "caput", "texto": m.group(3).strip()})
            continue
        if not art:
            continue
        m = R_PAR.match(ln)
        if m:
            pid = ("p" + m.group(1) + ("-" + m.group(2) if m.group(2) else "")) if m.group(1) else "pu"
            rot = ("§ " + m.group(1) + ("º" if int(m.group(1)) < 10 else "") + ("-" + m.group(2) if m.group(2) else "")) if m.group(1) else "Parágrafo único"
            ctx = {"par": (pid, rot), "inc": None, "ali": None}
            art["dispositivos"].append({"id": pid, "rotulo": rot, "texto": m.group(3).strip()})
            continue
        m = R_INC.match(ln)
        if m and len(m.group(1)) <= 8:
            inc = m.group(1) + ("-" + m.group(2) if m.group(2) else "")
            ctx["inc"], ctx["ali"] = inc, None
            pre = (ctx["par"][0] + ".") if ctx["par"] else ""
            rot = (ctx["par"][1] + ", " if ctx["par"] else "") + "inciso " + inc
            art["dispositivos"].append({"id": pre + inc, "rotulo": rot, "texto": m.group(3).strip()})
            continue
        m = R_ALI.match(ln)
        if m and ctx.get("inc"):
            ctx["ali"] = m.group(1)
            pre = (ctx["par"][0] + "." if ctx["par"] else "") + ctx["inc"]
            rot = (ctx["par"][1] + ", " if ctx["par"] else "") + "inciso " + ctx["inc"] + ", alínea " + m.group(1)
            art["dispositivos"].append({"id": pre + "." + m.group(1), "rotulo": rot, "texto": m.group(2).strip()})
            continue
        m = R_ITEM.match(ln)
        if m and ctx.get("ali"):
            pre = (ctx["par"][0] + "." if ctx["par"] else "") + ctx["inc"] + "." + ctx["ali"]
            art["dispositivos"].append({"id": pre + "." + m.group(1), "rotulo": "item " + m.group(1), "texto": m.group(2).strip()})
            continue
        # continuação do dispositivo anterior (texto quebrado em duas linhas)
        if art["dispositivos"] and not ln.isupper():
            art["dispositivos"][-1]["texto"] += " " + ln
    for a in artigos:
        for d in a["dispositivos"]:
            notas = R_NOTA.findall(d["texto"])
            d["texto"] = re.sub(r"\s+", " ", R_NOTA.sub("", d["texto"])).strip()
            if notas:
                d["notas"] = [re.sub(r"\s+", " ", n) for n in notas]
            d["vetado"] = bool(re.fullmatch(r"\(?\s*VETADO\s*\)?\.?", d["texto"], re.I))
            d["revogado"] = (not d["texto"]) and any("Revogad" in n for n in d.get("notas", []))
        a["texto"] = "\n".join((("" if d["id"] == "caput" else d["rotulo"] + " ") + d["texto"]).strip() for d in a["dispositivos"])
    return artigos


def baixar(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9"})
    bruto = urllib.request.urlopen(req, timeout=60).read()
    m = re.search(rb'charset=["\']?([\w-]+)', bruto[:3000])
    for cod in ([m.group(1).decode()] if m else []) + ["utf-8", "windows-1252"]:
        try:
            return bruto.decode(cod)
        except (LookupError, UnicodeDecodeError):
            continue
    return bruto.decode("latin-1")


DIAG = []


def gravar(norma, html_txt):
    p = Texto(); p.feed(html_txt)
    linhas = p.fim()
    artigos = estruturar(linhas, norma)
    if len(artigos) < 10:  # diagnóstico para ajustar o leitor
        arts = [l for l in linhas if l.lower().startswith("art")][:5]
        DIAG.append(f"--- {norma['id']}: html={len(html_txt)} linhas={len(linhas)}\n  início: {re.sub(r'\s+', ' ', html_txt[:400])}\n  linhas: {linhas[:15]}\n  'Art': {arts}")
    dados = {"id": norma["id"], "nome": norma["nome"], "apelido": norma.get("apelido", ""), "fonte": norma["url"],
             "baixado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "hash_fonte": hashlib.sha256(html_txt.encode()).hexdigest()[:16],
             "total_artigos": len(artigos), "artigos": artigos}
    destino = PASTA / (norma["id"] + ".json")
    destino.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{norma['id']}: {len(artigos)} artigos → {destino.relative_to(RAIZ)}")
    return artigos


def main(args):
    fontes = json.loads((PASTA / "fontes.json").read_text(encoding="utf-8"))["normas"]
    if args[:1] == ["--arquivo"]:
        gravar({"id": args[3], "nome": args[3], "url": args[1]}, pathlib.Path(args[1]).read_text(encoding="utf-8"))
        return 0
    falhas, log = 0, []
    for n in fontes:
        if args and n["id"] not in args:
            continue
        try:
            arts = gravar(n, baixar(n["url"]))
            if len(arts) < 10:
                raise ValueError("poucos artigos reconhecidos — conferir o formato da página")
            log.append(f"{n['id']}: ok, {len(arts)} artigos")
        except Exception as e:
            falhas += 1
            log.append(f"{n['id']}: FALHOU — {type(e).__name__}: {e}")
            print(log[-1], file=sys.stderr)
    if falhas:
        try:
            t = baixar("https://normas.leg.br/main.d77ca558be6c3a0a.js")
            achados = sorted(set(re.findall(r'["\'`]((?:https?:)?//[^"\'`\s]{4,120}|/api[^"\'`\s]{0,120})["\'`]', t)))
            ctx = [t[max(0, m.start()-120):m.end()+120] for m in re.finditer(r'urn', t)][:6]
            DIAG.append("--- normas.leg.br main.js: " + str(len(t)) + " bytes\n  urls: " + " | ".join(achados[:60]) + "\n  urn ctx: " + " ### ".join(ctx))
        except Exception as e:
            DIAG.append(f"--- normas.leg.br main.js: {type(e).__name__}: {e}")
    # relatório da última execução (vai para o repositório junto com as normas)
    (PASTA / "_ultima-execucao.txt").write_text(
        datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds") + "\n" + "\n".join(log) + "\n\n" + "\n".join(DIAG) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
