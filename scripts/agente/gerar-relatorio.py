#!/usr/bin/env python3
"""Gera o Parecer Técnico do Agente Licitacon (Word .docx e, se houver LibreOffice, PDF) a partir de uma análise (JSON).

Formato: parecer técnico com capa, painel executivo (indicadores e gráficos), sumário paginado,
ementa, relatório, fundamentação, recomendações, conclusão, referências (NBR 6023) e apêndices.
Apresentação conforme a ABNT (NBR 14724 / 6024 / 10520 / 6023): A4, margens 3-2-3-2 cm, Arial 12,
entrelinha 1,5, citações longas recuadas 4 cm em corpo 10, numeração progressiva sem ponto, paginação no alto à direita.

- O texto literal de cada dispositivo citado vem da base oficial (agente/normas/<norma>.json).
- Fundamento, gravidade, risco e dica de cada item vêm do roteiro (agente/roteiros/<regime>.json).
- A jurisprudência vem exclusivamente da Biblioteca (acervo.json), com link para a fonte oficial.

Uso: python3 scripts/agente/gerar-relatorio.py analise.json saida.docx [--pdf]
Estrutura do JSON de análise: ver agente/relatorio/estrutura.md
"""
import datetime, hashlib, io, json, pathlib, re, shutil, subprocess, sys, tempfile, unicodedata
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor, Emu

RAIZ = pathlib.Path(__file__).resolve().parents[2]

# paleta (sóbria, boa leitura impressa e em tela)
C = {"marinho": "12324A", "petroleo": "1F7A8C", "areia": "F5F1EA", "linha": "D9DEE2", "texto": "1E2A32", "fraco": "66757F",
     "alta": "B23A48", "media": "C9781E", "baixa": "3D8FA6", "ok": "2E8B57", "na": "B8C2C8", "nv": "8C7AA9",
     "alta_f": "F8E6E8", "media_f": "FBEEDD", "baixa_f": "E3F1F5", "ok_f": "E3F2EA", "claro": "EEF4F6"}
GRAV = {"alta": "Alta", "media": "Média", "baixa": "Baixa"}
RESULT = {"nao_conforme": "Não conforme", "conforme": "Conforme", "parcial": "Parcialmente conforme",
          "nao_aplicavel": "Não se aplica", "nao_verificavel": "Não verificável", "apontamento": "Apontamento adicional"}
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
MESES_ABNT = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."]
FONTE = "Arial"
LOCAL = "Maricá (RJ)"

NOME_CURTO = {"lei-14133": "Lei 14.133/2021", "lei-13303": "Lei 13.303/2016", "lei-13019": "Lei 13.019/2014",
              "lei-10192": "Lei 10.192/2001", "lei-4320": "Lei 4.320/1964"}
REF_OPINATIVO = [
    "BRASIL. Supremo Tribunal Federal (Plenário). Mandado de Segurança nº 24.631/DF. Relator: Min. Joaquim Barbosa. Julgado em 9 ago. 2007. Diário da Justiça, Brasília, DF, 1 fev. 2008.",
    "BRASIL. Decreto-Lei nº 4.657, de 4 de setembro de 1942. Lei de Introdução às Normas do Direito Brasileiro. Redação dada pela Lei nº 13.655, de 25 de abril de 2018. Disponível em: https://www.planalto.gov.br/ccivil_03/decreto-lei/del4657compilado.htm. Acesso em: {acesso}.",
    "BRASIL. Lei nº 9.784, de 29 de janeiro de 1999. Regula o processo administrativo no âmbito da Administração Pública Federal. Disponível em: https://www.planalto.gov.br/ccivil_03/leis/l9784.htm. Acesso em: {acesso}.",
]
NATUREZA_OPINATIVA = [
    "Este parecer técnico tem natureza exclusivamente opinativa. Ele expõe a análise de conformidade dos documentos examinados, "
    "aponta todos os aspectos identificados — dos críticos aos de baixa vulnerabilidade — e recomenda providências, mas não vincula quem o recebe.",
    "A decisão de adotar, total ou parcialmente, as recomendações, ou de manter o documento como está, é de competência e responsabilidade "
    "exclusivas do destinatário (o agente público, a autoridade competente ou o contratante), que deve ponderá-las com os demais elementos do processo.",
    "Fundamento: o Supremo Tribunal Federal distingue o parecer facultativo, o obrigatório e o vinculante; no parecer facultativo e no obrigatório "
    "não vinculante, a autoridade não fica adstrita à opinião emitida e responde pela decisão que tomar (STF, MS 24.631/DF, Plenário, rel. Min. Joaquim Barbosa, "
    "j. 9 ago. 2007). A distinção entre parecer vinculante e não vinculante também consta da Lei nº 9.784/1999 (art. 42, §§ 1º e 2º). A Lei de Introdução "
    "às Normas do Direito Brasileiro estabelece que o agente público responde pessoalmente por suas decisões ou opiniões técnicas em caso de dolo ou erro grosseiro (art. 28).",
    "Este parecer, contratado livremente e sem previsão legal que o torne obrigatório ou vinculante, não substitui o parecer jurídico de controle prévio "
    "de legalidade (art. 53 da Lei nº 14.133/2021) nem a manifestação dos órgãos de assessoramento e controle.",
]

REF_NORMA = {
    "lei-14133": ("BRASIL. Lei nº 14.133, de 1º de abril de 2021. Lei de Licitações e Contratos Administrativos. "
                  "Diário Oficial da União: seção 1, Brasília, DF, 1 abr. 2021. Disponível em: "
                  "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm. Acesso em: {acesso}.", "BRASIL, 2021"),
    "lei-13303": ("BRASIL. Lei nº 13.303, de 30 de junho de 2016. Dispõe sobre o estatuto jurídico da empresa pública, "
                  "da sociedade de economia mista e de suas subsidiárias. Diário Oficial da União: seção 1, Brasília, DF, 1 jul. 2016. "
                  "Disponível em: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13303.htm. Acesso em: {acesso}.", "BRASIL, 2016"),
}


# ------------------------------------------------------------------ base normativa e Biblioteca
_normas = {}
def norma(nid):
    if nid not in _normas:
        p = RAIZ / "agente" / "normas" / f"{nid}.json"
        _normas[nid] = json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
    return _normas[nid]

def rotulo(f, com_norma=True):
    n = norma(f["norma"])
    disp = f.get("disp", "caput")
    rot = None
    if n:
        art = next((a for a in n["artigos"] if a["num"] == f["art"]), None)
        d = next((x for x in (art or {}).get("dispositivos", []) if x["id"] == disp), None)
        rot = d["rotulo"] if d else None
    if not rot:
        partes = []
        for p in disp.split("."):
            if p == "caput": partes.append("caput")
            elif p == "pu": partes.append("parágrafo único")
            elif p.startswith("p") and p[1:2].isdigit(): partes.append("§ " + p[1:] + ("º" if p[1:].isdigit() and int(p[1:]) < 10 else ""))
            elif re.fullmatch(r"[IVXLCDM]+(-[A-Z])?", p): partes.append("inciso " + p)
            elif re.fullmatch(r"[a-z]", p): partes.append("alínea " + p)
            else: partes.append("item " + p)
        rot = ", ".join(partes)
    rot = "" if rot == "caput" else ", " + rot
    return f"art. {f['art']}{rot}" + (f", da {NOME_CURTO.get(f['norma'], f['norma'])}" if com_norma else "")

def citar_fundamentos(fs):
    """'pelo art. 82, inciso II, e pelo art. 86, § 3º, da Lei 14.133/2021' — a norma aparece uma vez quando é a mesma."""
    normas_ = {f["norma"] for f in fs}
    if len(normas_) == 1:
        partes = ["pelo " + rotulo(f, com_norma=False) for f in fs]
        txt = partes[0] if len(partes) == 1 else ", ".join(partes[:-1]) + " e " + partes[-1]
        return txt + ", da " + NOME_CURTO.get(fs[0]["norma"], fs[0]["norma"])
    return "; ".join("pelo " + rotulo(f) for f in fs)

def texto_legal(f):
    n = norma(f["norma"])
    if not n:
        return None
    art = next((a for a in n["artigos"] if a["num"] == f["art"]), None)
    if not art:
        return None
    disp = f.get("disp", "caput")
    d = next((x for x in art["dispositivos"] if x["id"] == disp), None)
    if not d:
        return None
    t = d["texto"]
    if "." in disp or re.fullmatch(r"[IVXLCDM]+(-[A-Z])?", disp):
        pai_id = disp.rsplit(".", 1)[0] if "." in disp else "caput"
        pai = next((x for x in art["dispositivos"] if x["id"] == pai_id), None)
        if pai and pai["id"] != disp:
            t = pai["texto"].rstrip(":") + ": […] " + t
    return t

_acervo = None
def _norm(s):
    return unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode()

def acervo():
    global _acervo
    if _acervo is None:
        p = RAIZ / "acervo.json"
        _acervo = json.loads(p.read_text(encoding="utf-8")).get("itens", []) if p.exists() else []
    return _acervo

def jurisprudencia(temas, n=3):
    termos = [_norm(t) for t in temas or [] if t]
    res = []
    for it in acervo():
        campo = _norm(" ".join([it.get("titulo", ""), it.get("tese", ""), " ".join(it.get("tags") or []), it.get("tema", "")]))
        achados = [t for t in termos if t in campo]
        s = sum((3 if len(t.split()) > 1 else 1) for t in achados)
        contexto = any(k in campo for k in ("licita", "contrat", "edital", "pregao", "registro de precos", "termo de referencia"))
        if contexto and s >= 2:
            res.append((s, it.get("data", ""), it))
    res.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [r[2] for r in res[:n]]


# ------------------------------------------------------------------ utilidades de formatação
def cor(run, hexa): run.font.color.rgb = RGBColor.from_string(hexa)

def sombrear(celula, hexa):
    tcpr = celula._tc.get_or_add_tcPr()
    for s in tcpr.findall(qn("w:shd")): tcpr.remove(s)
    shd = OxmlElement("w:shd"); shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), hexa)
    tcpr.append(shd)

def bordas(celula, **lados):
    """lados: top/left/bottom/right = (cor, espessura_em_oitavos_de_ponto) ou None para sem borda."""
    tcpr = celula._tc.get_or_add_tcPr()
    b = tcpr.find(qn("w:tcBorders"))
    if b is None:
        b = OxmlElement("w:tcBorders"); tcpr.append(b)
    for lado in ("top", "left", "bottom", "right"):
        v = lados.get(lado, None)
        e = OxmlElement(f"w:{lado}")
        if v is None:
            e.set(qn("w:val"), "nil")
        else:
            e.set(qn("w:val"), "single"); e.set(qn("w:sz"), str(v[1])); e.set(qn("w:color"), v[0]); e.set(qn("w:space"), "0")
        b.append(e)

def margens_celula(celula, cm=0.25):
    tcpr = celula._tc.get_or_add_tcPr()
    m = OxmlElement("w:tcMar")
    for lado in ("top", "left", "bottom", "right"):
        e = OxmlElement(f"w:{lado}"); e.set(qn("w:w"), str(int(cm * 567))); e.set(qn("w:type"), "dxa"); m.append(e)
    tcpr.append(m)

def tabela_sem_bordas(doc, linhas, colunas, larguras=None):
    t = doc.add_table(rows=linhas, cols=colunas)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblpr = t._tbl.tblPr
    lay = OxmlElement("w:tblLayout"); lay.set(qn("w:type"), "fixed"); tblpr.append(lay)
    for row in t.rows:
        for i, c in enumerate(row.cells):
            bordas(c)
            if larguras: c.width = Cm(larguras[i])
    if larguras:
        for i, col in enumerate(t.columns): col.width = Cm(larguras[i])
        grade = t._tbl.tblGrid
        for i, gc in enumerate(grade.findall(qn("w:gridCol"))): gc.set(qn("w:w"), str(int(larguras[i] * 567)))
    return t

def fmt(p, recuo1=1.25, antes=0, depois=0, entre=1.5, alinh=WD_ALIGN_PARAGRAPH.JUSTIFY, esq=None, dir_=None):
    pf = p.paragraph_format
    pf.first_line_indent = Cm(recuo1) if recuo1 else Cm(0)
    pf.space_before = Pt(antes); pf.space_after = Pt(depois)
    pf.line_spacing = entre
    if alinh is not None: p.alignment = alinh
    if esq is not None: pf.left_indent = Cm(esq)
    if dir_ is not None: pf.right_indent = Cm(dir_)
    return p

def run(p, texto, negrito=False, italico=False, tam=None, hexa=None, caixa_alta=False):
    r = p.add_run(texto.upper() if caixa_alta else texto)
    r.bold = negrito; r.italic = italico
    if tam: r.font.size = Pt(tam)
    if hexa: cor(r, hexa)
    return r

def paragrafo(doc_ou_celula, texto="", **kw):
    p = doc_ou_celula.add_paragraph()
    estilo = {k: kw.pop(k) for k in list(kw) if k in ("negrito", "italico", "tam", "hexa", "caixa_alta")}
    fmt(p, **kw)
    if texto: run(p, texto, **estilo)
    return p

def run_in(doc, rotulo_txt, texto, hexa_rotulo=None):
    """Parágrafo com rótulo em negrito no início (ex.: 'Constatação. ...')."""
    p = fmt(doc.add_paragraph(), antes=0, depois=6)
    run(p, rotulo_txt + " ", negrito=True, hexa=hexa_rotulo or C["marinho"])
    run(p, texto)
    return p

def citacao_longa(doc, texto, fonte=None):
    """NBR 10520: recuo de 4 cm, corpo menor, entrelinha simples, sem aspas."""
    p = fmt(doc.add_paragraph(), recuo1=0, esq=4, antes=4, depois=10, entre=1.0)
    run(p, texto, tam=10)
    if fonte: run(p, f" ({fonte})", tam=10)
    return p

def link(paragrafo_, texto, url, tam=None):
    rid = paragrafo_.part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    h = OxmlElement("w:hyperlink"); h.set(qn("r:id"), rid)
    r = OxmlElement("w:r"); rpr = OxmlElement("w:rPr")
    c = OxmlElement("w:color"); c.set(qn("w:val"), C["petroleo"]); rpr.append(c)
    u = OxmlElement("w:u"); u.set(qn("w:val"), "single"); rpr.append(u)
    if tam:
        s = OxmlElement("w:sz"); s.set(qn("w:val"), str(int(tam * 2))); rpr.append(s)
    r.append(rpr); t = OxmlElement("w:t"); t.text = texto; t.set(qn("xml:space"), "preserve"); r.append(t); h.append(r)
    paragrafo_._p.append(h)

def campo(paragrafo_, instrucao, tam=None, hexa=None):
    r = paragrafo_.add_run()
    if tam: r.font.size = Pt(tam)
    if hexa: cor(r, hexa)
    f1 = OxmlElement("w:fldChar"); f1.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = instrucao
    f2 = OxmlElement("w:fldChar"); f2.set(qn("w:fldCharType"), "separate")
    t = OxmlElement("w:t"); t.text = "1"
    f3 = OxmlElement("w:fldChar"); f3.set(qn("w:fldCharType"), "end")
    for e in (f1, it, f2, t, f3): r._r.append(e)

def quebra_pagina(doc):
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

def titulo(doc, texto, nivel=1, marcador=None):
    """NBR 6024: seção primária em negrito e caixa alta; secundária em negrito; numeração sem ponto final."""
    p = doc.add_paragraph(style=f"Heading {nivel}")
    fmt(p, recuo1=0, antes=18 if nivel == 1 else 12, depois=8, entre=1.5, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    p.paragraph_format.keep_with_next = True
    r = run(p, texto.upper() if nivel == 1 else texto, negrito=True, tam=12, hexa=C["marinho"])
    r.font.name = FONTE
    if marcador is not None:
        marcador.append(texto)
    return p

def data_extenso(d):
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"

def data_abnt(d):
    return f"{d.day} {MESES_ABNT[d.month - 1]} {d.year}"

def ler_data(s):
    try:
        return datetime.datetime.strptime(s, "%d/%m/%Y").date()
    except Exception:
        return datetime.date.today()


# ------------------------------------------------------------------ gráficos do painel
def graficos(cont_res, indice):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    familia = "Liberation Sans" if any("Liberation Sans" in f.name for f in font_manager.fontManager.ttflist) else "DejaVu Sans"
    plt.rcParams.update({"font.family": familia, "font.size": 9})
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.4, 2.5), dpi=220)
    fig.patch.set_facecolor("white")

    # rosca: distribuição dos resultados
    ordem = [("conforme", "Conforme", C["ok"]), ("parcial", "Parcial", C["media"]), ("nao_conforme", "Não conforme", C["alta"]),
             ("nao_aplicavel", "Não se aplica", C["na"]), ("nao_verificavel", "Não verificável", C["nv"])]
    dados = [(rot, cont_res.get(k, 0), "#" + c) for k, rot, c in ordem if cont_res.get(k, 0)]
    total = sum(v for _, v, _ in dados)
    a1.pie([v for _, v, _ in dados], colors=[c for *_, c in dados], startangle=90, counterclock=False,
           wedgeprops=dict(width=0.32, edgecolor="white", linewidth=2))
    a1.text(0, 0.08, str(total), ha="center", va="center", fontsize=20, fontweight="bold", color="#" + C["marinho"])
    a1.text(0, -0.25, "itens verificados", ha="center", va="center", fontsize=7.5, color="#" + C["fraco"])
    a1.legend([f"{r} ({v})" for r, v, _ in dados], loc="center left", bbox_to_anchor=(0.98, 0.5), frameon=False, fontsize=7.5,
              handlelength=0.9, handleheight=0.9)
    a1.set_title("Resultado da verificação", fontsize=9.5, fontweight="bold", color="#" + C["marinho"], loc="left", pad=6)
    a1.set_aspect("equal")

    # medidor: índice de conformidade
    import numpy as np
    faixas = [(0, 50, C["alta"]), (50, 75, C["media"]), (75, 100, C["ok"])]
    for ini, fim, c in faixas:
        th = np.linspace(np.pi * (1 - ini / 100), np.pi * (1 - fim / 100), 60)
        a2.fill_between(np.cos(th), np.sin(th) * 0 + 0, 0, color="white")
        for r0 in [1.0]:
            xs = np.concatenate([np.cos(th) * r0, np.cos(th[::-1]) * 0.72])
            ys = np.concatenate([np.sin(th) * r0, np.sin(th[::-1]) * 0.72])
            a2.fill(xs, ys, color="#" + c, alpha=0.22, linewidth=0)
    th = np.linspace(np.pi, np.pi * (1 - indice / 100), 80)
    xs = np.concatenate([np.cos(th), np.cos(th[::-1]) * 0.72]); ys = np.concatenate([np.sin(th), np.sin(th[::-1]) * 0.72])
    ccor = C["ok"] if indice >= 75 else (C["media"] if indice >= 50 else C["alta"])
    a2.fill(xs, ys, color="#" + ccor, linewidth=0)
    a2.text(0, 0.18, f"{indice:.0f}%", ha="center", va="center", fontsize=22, fontweight="bold", color="#" + ccor)
    a2.text(0, -0.12, "índice de conformidade", ha="center", va="center", fontsize=7.5, color="#" + C["fraco"])
    a2.text(-0.86, -0.12, "0", ha="center", fontsize=7, color="#" + C["fraco"])
    a2.text(0.86, -0.12, "100", ha="center", fontsize=7, color="#" + C["fraco"])
    a2.set_xlim(-1.1, 1.1); a2.set_ylim(-0.3, 1.1); a2.set_aspect("equal"); a2.axis("off")
    a2.set_title("Conformidade dos itens aplicáveis", fontsize=9.5, fontweight="bold", color="#" + C["marinho"], loc="left", pad=6)

    fig.tight_layout(w_pad=2.5)
    buf = io.BytesIO(); fig.savefig(buf, format="png", facecolor="white"); plt.close(fig); buf.seek(0)
    return buf


# ------------------------------------------------------------------ documento
def preparar(doc):
    st = doc.styles["Normal"]
    st.font.name = FONTE; st.font.size = Pt(12); cor_ = st.font.color; cor_.rgb = RGBColor.from_string(C["texto"])
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONTE)
    st.paragraph_format.line_spacing = 1.5; st.paragraph_format.space_after = Pt(0)
    for n in (1, 2, 3):
        h = doc.styles[f"Heading {n}"]; h.font.name = FONTE; h.font.size = Pt(12); h.font.bold = True
        h.font.color.rgb = RGBColor.from_string(C["marinho"])
        rpr = h.element.get_or_add_rPr(); rf = rpr.find(qn("w:rFonts"))
        if rf is None:
            rf = OxmlElement("w:rFonts"); rpr.append(rf)
        for a in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"): rf.set(qn(a), FONTE)
    for s in doc.sections:
        s.page_height = Cm(29.7); s.page_width = Cm(21)
        s.top_margin = Cm(3); s.left_margin = Cm(3); s.bottom_margin = Cm(2); s.right_margin = Cm(2)
        s.header_distance = Cm(1.5); s.footer_distance = Cm(1)


def cabecalho_rodape(doc, numero, verificador):
    s = doc.sections[0]
    s.different_first_page_header_footer = True  # capa sem cabeçalho nem número
    h = s.header
    t = h.add_table(rows=1, cols=2, width=Cm(16))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    a, b = t.rows[0].cells
    a.width = Cm(12); b.width = Cm(4)
    for c in (a, b): bordas(c, bottom=(C["linha"], 6))
    pa = a.paragraphs[0]; fmt(pa, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    run(pa, "LICITACON", negrito=True, tam=8, hexa=C["petroleo"]); run(pa, f"  ·  Parecer Técnico nº {numero}", tam=8, hexa=C["fraco"])
    pb = b.paragraphs[0]; fmt(pb, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.RIGHT)
    campo(pb, "PAGE", tam=10, hexa=C["marinho"])
    h.paragraphs[0].text = ""
    f = s.footer
    pf = f.paragraphs[0]; fmt(pf, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.CENTER)
    run(pf, f"Parecer técnico opinativo · a decisão final cabe exclusivamente ao destinatário · não substitui o parecer jurídico do art. 53 da Lei 14.133/2021 · código {verificador}",
        tam=7, hexa=C["fraco"])


def capa(doc, a, numero, data, situacao, cor_sit):
    proc = a["processo"]
    # faixa superior
    t = tabela_sem_bordas(doc, 1, 1, [16])
    c = t.rows[0].cells[0]; sombrear(c, C["marinho"]); margens_celula(c, 0.6)
    p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT, depois=2)
    run(p, "LICITACON", negrito=True, tam=11, hexa="9FD3DC"); run(p, "   ANÁLISE TÉCNICA EM LICITAÇÕES E CONTRATOS", tam=8, hexa="C9D6DE")
    p = c.add_paragraph(); fmt(p, recuo1=0, entre=1.0, antes=40, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    run(p, "PARECER TÉCNICO", negrito=True, tam=26, hexa="FFFFFF")
    p = c.add_paragraph(); fmt(p, recuo1=0, entre=1.0, antes=2, depois=30, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    run(p, f"nº {numero}", tam=13, hexa="9FD3DC")
    # faixa de destaque
    t2 = tabela_sem_bordas(doc, 1, 1, [16])
    c2 = t2.rows[0].cells[0]; sombrear(c2, C["petroleo"]); margens_celula(c2, 0.35)
    p = c2.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    run(p, "Conformidade do " + ", ".join(sorted({d.get('nome') or DOCS_ROTULO.get(d['tipo'], d['tipo']) for d in a['documentos']})).lower()
        + " com a " + NOME_CURTO.get(a["regime"], a["regime"]), negrito=True, tam=10.5, hexa="FFFFFF")

    p = paragrafo(doc, "", recuo1=0, antes=36, depois=6, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    run(p, "OBJETO", negrito=True, tam=8, hexa=C["petroleo"])
    paragrafo(doc, proc.get("objeto", ""), recuo1=0, entre=1.2, depois=18, alinh=WD_ALIGN_PARAGRAPH.LEFT, tam=15, hexa=C["marinho"], negrito=True)

    linhas = [("Interessado", proc.get("orgao", "")), ("Processo", proc.get("numero", "")), ("Modalidade", proc.get("modalidade", "")),
              ("Base legal", a.get("regime_texto", NOME_CURTO.get(a["regime"], ""))), ("Data", data_extenso(data))]
    tb = tabela_sem_bordas(doc, len(linhas), 2, [3.3, 12.7])
    for i, (k, v) in enumerate(linhas):
        k_c, v_c = tb.rows[i].cells
        for cc in (k_c, v_c): bordas(cc, bottom=(C["linha"], 4)); margens_celula(cc, 0.12)
        pk = k_c.paragraphs[0]; fmt(pk, recuo1=0, entre=1.1, alinh=WD_ALIGN_PARAGRAPH.LEFT); run(pk, k.upper(), negrito=True, tam=7.5, hexa=C["fraco"])
        pv = v_c.paragraphs[0]; fmt(pv, recuo1=0, entre=1.1, alinh=WD_ALIGN_PARAGRAPH.LEFT); run(pv, v, tam=9.5)

    p = paragrafo(doc, "", recuo1=0, antes=26, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    t3 = tabela_sem_bordas(doc, 1, 1, [16])
    c3 = t3.rows[0].cells[0]; sombrear(c3, cor_sit[1]); bordas(c3, left=(cor_sit[0], 36)); margens_celula(c3, 0.3)
    p = c3.paragraphs[0]; fmt(p, recuo1=0, entre=1.1, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    run(p, "SITUAÇÃO GERAL  ", negrito=True, tam=7.5, hexa=cor_sit[0]); run(p, situacao, negrito=True, tam=10.5, hexa=cor_sit[0])
    p = paragrafo(doc, "", recuo1=0, antes=8, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.LEFT)
    run(p, "PARECER OPINATIVO  ", negrito=True, tam=7.5, hexa=C["petroleo"])
    run(p, "As recomendações não vinculam o destinatário; a decisão final é sempre de quem recebe este parecer.", tam=9, hexa=C["texto"])

    p = paragrafo(doc, "", recuo1=0, antes=60, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.CENTER)
    run(p, LOCAL.replace(" (RJ)", " – RJ"), negrito=True, tam=11)
    p = paragrafo(doc, "", recuo1=0, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.CENTER)
    run(p, str(data.year), negrito=True, tam=11)


DOCS_ROTULO = {}

def sumario(doc, entradas, paginas):
    titulo(doc, "Sumário")
    for e in entradas:
        nivel = 2 if re.match(r"^\d+\.\d+", e) else 1
        p = doc.add_paragraph(); fmt(p, recuo1=0, entre=1.5, alinh=WD_ALIGN_PARAGRAPH.LEFT, esq=0 if nivel == 1 else 0.6)
        tabs = p.paragraph_format.tab_stops
        from docx.enum.text import WD_TAB_ALIGNMENT, WD_TAB_LEADER
        tabs.add_tab_stop(Cm(16), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        txt = e.upper() if nivel == 1 else e
        run(p, txt, negrito=(nivel == 1), tam=11 if nivel == 1 else 10.5)
        run(p, "\t" + str(paginas.get(e, "")), negrito=(nivel == 1), tam=11 if nivel == 1 else 10.5)


def caixa(doc, rotulo_txt, texto, borda, fundo):
    t = tabela_sem_bordas(doc, 1, 1, [16])
    c = t.rows[0].cells[0]; sombrear(c, fundo); bordas(c, left=(borda, 30)); margens_celula(c, 0.25)
    p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.JUSTIFY)
    run(p, rotulo_txt.upper() + "  ", negrito=True, tam=8, hexa=borda); run(p, texto, tam=10)
    paragrafo(doc, "", recuo1=0, entre=1.0, depois=4)


def gerar(analise, saida, paginas=None):
    roteiro = json.loads((RAIZ / "agente" / "roteiros" / f"{analise['regime']}.json").read_text(encoding="utf-8"))
    itens = {i["id"]: i for i in roteiro["itens"]}
    docs_nome = roteiro["documentos"]
    DOCS_ROTULO.update({"edital": "Edital", "etp": "Estudo Técnico Preliminar", "tr": "Termo de Referência",
                        "riscos": "Matriz de Riscos", "planilha": "Planilha de Custos"})
    resultados = list(analise["resultados"])
    for r in resultados:
        if r["item"] not in itens:
            raise SystemExit(f"Item desconhecido no roteiro: {r['item']}")
        if r.get("gravidade") in GRAV and r["gravidade"] != itens[r["item"]]["gravidade"]:
            itens[r["item"]] = {**itens[r["item"]], "gravidade": r["gravidade"]}  # ajustada ao caso concreto
    doc_padrao = analise["documentos"][0]["tipo"] if analise.get("documentos") else "edital"
    for k, o in enumerate(analise.get("outros_apontamentos") or [], 1):
        iid = f"outro-{k}"
        itens[iid] = {"id": iid, "doc": doc_padrao, "titulo": o["titulo"], "verificar": o.get("porque", ""), "fundamento": o.get("fundamento") or [],
                      "gravidade": o.get("gravidade", "baixa"), "risco": o.get("risco", ""), "dica": o.get("correcao", ""), "temas": []}
        resultados.append({"item": iid, "resultado": "apontamento", "local": o.get("local"), "trecho": o.get("trecho"),
                           "constatacao": o["constatacao"], "porque": o.get("porque"), "risco": o.get("risco"), "correcao": o.get("correcao"),
                           "jurisprudencia_ids": []})
    data = ler_data(analise.get("data", ""))
    falhas = [r for r in resultados if r["resultado"] in ("nao_conforme", "parcial", "apontamento")]
    cont = {g: sum(1 for r in falhas if itens[r["item"]]["gravidade"] == g) for g in ("alta", "media", "baixa")}
    cont_res = {}
    for r in resultados: cont_res[r["resultado"]] = cont_res.get(r["resultado"], 0) + 1
    aplic = cont_res.get("conforme", 0) + cont_res.get("parcial", 0) + cont_res.get("nao_conforme", 0)
    indice = 100 * (cont_res.get("conforme", 0) + 0.5 * cont_res.get("parcial", 0)) / aplic if aplic else 100
    if cont["alta"]:
        situacao, cor_sit = "Há falhas graves que recomendam correção.", (C["alta"], C["alta_f"])
    elif falhas:
        situacao, cor_sit = "Há ajustes recomendados, sem falha grave identificada.", (C["media"], C["media_f"])
    else:
        situacao, cor_sit = "Nenhuma não conformidade identificada nos itens verificados.", (C["ok"], C["ok_f"])
    bruto = json.dumps(analise, ensure_ascii=False, sort_keys=True).encode()
    verificador = hashlib.sha256(bruto).hexdigest()[:10].upper()
    numero = analise.get("numero_parecer") or f"{verificador[:4]}/{data.year}"

    doc = Document(); preparar(doc)
    cabecalho_rodape(doc, numero, verificador)
    capa(doc, analise, numero, data, situacao, cor_sit)
    quebra_pagina(doc)

    entradas = []  # títulos para o sumário (na ordem)
    # sumário (2ª página) — paginação obtida na primeira passagem
    ordem = {"alta": 0, "media": 1, "baixa": 2}
    lst = sorted(falhas, key=lambda x: ordem[itens[x["item"]]["gravidade"]])
    entradas = ["1 Painel executivo", "2 Relatório"] + ["3 Fundamentação"] + \
               [f"3.{n} {itens[r['item']]['titulo']}" for n, r in enumerate(lst, 1)] + \
               (["4 Análise de preços"] if analise.get("precos") else []) + \
               [f"{5 if analise.get('precos') else 4} Recomendações de melhoria", f"{6 if analise.get('precos') else 5} Conclusão", "Referências", "Apêndice A – Lista de verificação", "Apêndice B – Metodologia e limites"]
    sumario(doc, entradas, paginas or {})
    quebra_pagina(doc)

    # 1 PAINEL
    titulo(doc, "1 Painel executivo")
    paragrafo(doc, "Visão geral do resultado. O detalhamento, com o texto legal e os precedentes, está na seção 3.", recuo1=0,
              depois=8, tam=10, hexa=C["fraco"], italico=True)
    _painel_corpo(doc, itens, resultados, lst, cont, cont_res, indice)
    quebra_pagina(doc)

    # EMENTA + identificação
    proc = analise["processo"]
    t = tabela_sem_bordas(doc, 4, 2, [3.2, 12.8])
    for i, (k, v) in enumerate([("Parecer técnico", f"nº {numero}"), ("Interessado", proc.get("orgao", "")),
                                ("Assunto", "Análise de conformidade — " + proc.get("objeto", "")), ("Referência", proc.get("numero", ""))]):
        kc, vc = t.rows[i].cells
        for cc in (kc, vc): bordas(cc, bottom=(C["linha"], 4)); margens_celula(cc, 0.1)
        pk = kc.paragraphs[0]; fmt(pk, recuo1=0, entre=1.1, alinh=WD_ALIGN_PARAGRAPH.LEFT); run(pk, k.upper(), negrito=True, tam=8, hexa=C["fraco"])
        pv = vc.paragraphs[0]; fmt(pv, recuo1=0, entre=1.1, alinh=WD_ALIGN_PARAGRAPH.LEFT); run(pv, v, tam=10)
    paragrafo(doc, "", recuo1=0, entre=1.0, depois=10)
    ementa_chaves = analise.get("ementa") or ("LICITAÇÃO. " + NOME_CURTO.get(analise["regime"], "").upper() + ". ANÁLISE DE CONFORMIDADE.")
    ementa_txt = analise.get("ementa_texto") or (situacao + " " + (analise.get("resumo", "").split(". ")[0] + "." if analise.get("resumo") else ""))
    p = fmt(doc.add_paragraph(), recuo1=0, esq=6, entre=1.0, depois=4)
    run(p, "EMENTA: ", negrito=True, tam=10, hexa=C["marinho"]); run(p, ementa_chaves + " ", negrito=True, tam=10); run(p, ementa_txt, tam=10)
    paragrafo(doc, "", recuo1=0, entre=1.0, depois=6)
    t = tabela_sem_bordas(doc, 1, 1, [16])
    c = t.rows[0].cells[0]; sombrear(c, C["claro"]); bordas(c, left=(C["petroleo"], 30)); margens_celula(c, 0.3)
    p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.1, alinh=WD_ALIGN_PARAGRAPH.LEFT, depois=4)
    run(p, "NATUREZA OPINATIVA DESTE PARECER", negrito=True, tam=9, hexa=C["petroleo"])
    for txt in NATUREZA_OPINATIVA:
        q = c.add_paragraph(); fmt(q, recuo1=0, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.JUSTIFY, depois=4); run(q, txt, tam=9.5)
    paragrafo(doc, "", recuo1=0, entre=1.0, depois=6)

    # 2 RELATÓRIO
    titulo(doc, "2 Relatório")
    docs_txt = "; ".join(f"{docs_nome.get(d['tipo'], d['tipo'])} ({d.get('arquivo', '')}{', ' + str(d['paginas']) + ' páginas' if d.get('paginas') else ''})"
                         for d in analise["documentos"])
    paragrafo(doc, f"Trata-se de análise técnica de conformidade solicitada em relação ao processo {proc.get('numero', '')}, "
                   f"do {proc.get('orgao', '')}, cujo objeto é: {proc.get('objeto', '').rstrip('.')}.", depois=6)
    paragrafo(doc, f"Foram examinados os seguintes documentos: {docs_txt}. O exame teve por parâmetro a "
                   f"{analise.get('regime_texto', NOME_CURTO.get(analise['regime'], ''))}, aplicando-se o roteiro de verificação "
                   f"Licitacon (versão {roteiro['versao']}), com {len(resultados)} itens pertinentes ao caso.", depois=6)
    if analise.get("resumo"):
        paragrafo(doc, analise["resumo"], depois=6)
    paragrafo(doc, "É o relatório. Passa-se à fundamentação.", depois=6)

    # 3 FUNDAMENTAÇÃO
    titulo(doc, "3 Fundamentação")
    paragrafo(doc, "Cada apontamento indica a constatação no documento, o dispositivo legal aplicável (transcrito do texto oficial vigente), "
                   "a análise do caso, o risco de manutenção, a providência recomendada e os precedentes localizados na Biblioteca Licitacon.", depois=6)
    referencias_juris = {}
    normas_usadas = set()
    for n, r in enumerate(lst, 1):
        it = itens[r["item"]]; g = it["gravidade"]
        titulo(doc, f"3.{n} {it['titulo']}", nivel=2)
        # selo
        t = tabela_sem_bordas(doc, 1, 1, [16])
        c = t.rows[0].cells[0]; sombrear(c, C[g + "_f"]); bordas(c, left=(C[g], 30)); margens_celula(c, 0.15)
        p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
        run(p, f"GRAVIDADE {GRAV[g].upper()}", negrito=True, tam=8, hexa=C[g])
        run(p, f"   ·   {RESULT[r['resultado']]}   ·   {docs_nome.get(it['doc'], it['doc'])}" + (f", {r['local']}" if r.get("local") else ""), tam=8, hexa=C["texto"])
        paragrafo(doc, "", recuo1=0, entre=1.0, depois=2)

        run_in(doc, "Constatação.", r["constatacao"])
        if r.get("trecho"):
            if len(r["trecho"]) > 240:
                citacao_longa(doc, r["trecho"], "documento analisado" + (f", {r['local']}" if r.get("local") else ""))
            else:
                p = fmt(doc.add_paragraph(), depois=6)
                run(p, "O documento dispõe: “" + r["trecho"] + "”" + (f" ({r['local']})." if r.get("local") else "."), italico=False)
        p = fmt(doc.add_paragraph(), depois=4)
        run(p, "Dispositivo aplicável. ", negrito=True, hexa=C["marinho"])
        if it["fundamento"]:
            run(p, "A matéria é disciplinada " + citar_fundamentos(it["fundamento"]) + ", que assim dispõe" + (":" if len(it["fundamento"]) == 1 else "m:"))
        else:
            run(p, "Não há dispositivo legal específico; o apontamento decorre da coerência e da boa instrução do processo.")
        for f in it["fundamento"]:
            normas_usadas.add(f["norma"])
            tl = texto_legal(f)
            ano = (REF_NORMA.get(f["norma"], (None, "BRASIL"))[1])
            if tl and tl.rstrip().endswith(":"): tl = tl.rstrip() + " […]"
            citacao_longa(doc, tl if tl else "[texto a conferir na fonte oficial]", f"{ano}, {rotulo(f, com_norma=False)}")
        run_in(doc, "Análise.", r.get("porque") or it["verificar"])
        run_in(doc, "Risco de manutenção.", r.get("risco") or it["risco"], hexa_rotulo=C[g])
        run_in(doc, "Providência recomendada.", r.get("correcao") or it["dica"])
        if r.get("redacao_sugerida"):
            caixa(doc, "Redação sugerida", r["redacao_sugerida"], C["ok"], C["ok_f"])

        if "jurisprudencia_ids" in r:
            por_id = {j.get("id"): j for j in acervo()}
            js = [por_id[i] for i in r["jurisprudencia_ids"] if i in por_id]
        else:
            js = jurisprudencia(r.get("temas") or it.get("temas"))
        p = fmt(doc.add_paragraph(), depois=4)
        run(p, "Precedentes. ", negrito=True, hexa=C["marinho"])
        if not js:
            run(p, "Não foram localizadas decisões sobre o tema na Biblioteca Licitacon até esta data, o que não significa inexistência de jurisprudência.")
            continue
        grupos = {}
        for j in js:
            grupos.setdefault((j.get("orgao", ""), j.get("numero", "")), []).append(j)
        run(p, "Na Biblioteca Licitacon foram localizados os seguintes entendimentos" + (":" if grupos else "."))
        for (orgao, numero_dec), lista in grupos.items():
            ano = (lista[0].get("data") or "")[:4]
            for k, j in enumerate(lista, 1):
                referencias_juris[j["id"]] = j
                tese = (j.get("tese") or j.get("titulo") or "").strip()
                fonte = f"{orgao}, {numero_dec}" + (f", enunciado {k}" if len(lista) > 1 else "")
                pc = citacao_longa(doc, tese, fonte)
                if j.get("fonte_url"):
                    run(pc, " ", tam=10); link(pc, "[fonte oficial]", j["fonte_url"], tam=9)

    # 4 ANÁLISE DE PREÇOS (sobrepreço)
    if analise.get("precos"):
        secao_precos(doc, analise["precos"])
    n_rec = 5 if analise.get("precos") else 4

    # RECOMENDAÇÕES
    titulo(doc, f"{n_rec} Recomendações de melhoria")
    dicas = [r for r in resultados if r["resultado"] == "conforme" and r.get("dica")]
    paragrafo(doc, "Os pontos a seguir não configuram irregularidade, mas podem ser aperfeiçoados para dar mais segurança ao processo:"
              if dicas else "Não há recomendações adicionais.", depois=6)
    for k, r in enumerate(dicas, 1):
        it = itens[r["item"]]
        p = fmt(doc.add_paragraph(), recuo1=0, esq=0.75, depois=6)
        p.paragraph_format.first_line_indent = Cm(-0.75)
        run(p, f"{chr(96 + k)}) ", negrito=True, hexa=C["petroleo"]); run(p, it["titulo"] + ": ", negrito=True)
        run(p, r["dica"] + " (" + "; ".join(rotulo(f) for f in it["fundamento"]) + ").")

    # 5 CONCLUSÃO
    titulo(doc, f"{n_rec + 1} Conclusão")
    if analise.get("conclusao"):
        paragrafo(doc, analise["conclusao"], depois=6)
    else:
        paragrafo(doc, f"Diante do exposto, dos {aplic} itens aplicáveis e verificáveis, {cont_res.get('conforme', 0)} estão conformes, "
                       f"{cont_res.get('parcial', 0)} parcialmente conformes e {cont_res.get('nao_conforme', 0)} não conformes. "
                       + situacao, depois=6)
    if lst:
        paragrafo(doc, "Recomendam-se, por ordem de prioridade, as seguintes providências:", depois=4)
        for n, r in enumerate(lst, 1):
            it = itens[r["item"]]; g = it["gravidade"]
            prov = r.get("providencia") or (r.get("correcao") or it["dica"]).strip()
            p = fmt(doc.add_paragraph(), recuo1=0, esq=0.75, depois=4)
            p.paragraph_format.first_line_indent = Cm(-0.75)
            run(p, f"{n}. ", negrito=True, hexa=C[g]); run(p, it["titulo"] + " ", negrito=True)
            run(p, f"(gravidade {GRAV[g].lower()}, item 3.{n}): ", hexa=C[g]); run(p, prov)
    paragrafo(doc, "Todos os aspectos identificados foram informados, inclusive os de baixa vulnerabilidade, para que o destinatário disponha "
                   "de visão completa do processo. Trata-se de parecer técnico de natureza opinativa: as recomendações não o vinculam, e a decisão de "
                   "promover os ajustes ou manter os documentos como estão compete exclusivamente a quem recebe este parecer, sob sua responsabilidade "
                   "(STF, MS 24.631/DF; art. 28 do Decreto-Lei nº 4.657/1942). Este parecer não substitui o parecer jurídico de controle prévio de "
                   "legalidade (art. 53 da Lei nº 14.133/2021).", antes=6, depois=6)
    paragrafo(doc, "É o parecer técnico, de caráter opinativo, salvo melhor juízo.", depois=18)
    paragrafo(doc, f"{LOCAL}, {data_extenso(data)}.", recuo1=0, alinh=WD_ALIGN_PARAGRAPH.RIGHT, depois=36)
    p = paragrafo(doc, "", recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.CENTER)
    run(p, "_" * 42, hexa=C["linha"])
    resp = analise.get("responsavel")
    p = paragrafo(doc, "", recuo1=0, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.CENTER)
    run(p, resp.get("nome") if resp else "Agente Licitacon", negrito=True, tam=11)
    p = paragrafo(doc, "", recuo1=0, entre=1.15, alinh=WD_ALIGN_PARAGRAPH.CENTER)
    run(p, resp.get("qualificacao") if resp else "Análise técnica automatizada em licitações e contratos", tam=9.5, hexa=C["fraco"])

    # REFERÊNCIAS (NBR 6023) — sem indicativo numérico, centralizado
    quebra_pagina(doc)
    p = titulo(doc, "Referências"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    acesso = data_abnt(data)
    refs = []
    for nid in sorted(normas_usadas):
        if nid in REF_NORMA: refs.append(REF_NORMA[nid][0].format(acesso=acesso))
    refs += [r_.format(acesso=acesso) for r_ in REF_OPINATIVO]
    if analise.get("referencia_documento"):
        refs.append(analise["referencia_documento"].format(acesso=acesso))
    for j in referencias_juris.values():
        refs.append(j.get("citacao_abnt") or f"{j.get('orgao', '')}. {j.get('numero', '')}. Disponível em: {j.get('fonte_url', '')}.")
    vistos = []
    for rtxt in sorted(set(refs), key=lambda s: _norm(s)):
        p = fmt(doc.add_paragraph(), recuo1=0, entre=1.0, depois=12, alinh=WD_ALIGN_PARAGRAPH.LEFT)
        run(p, rtxt, tam=11)

    # APÊNDICE A
    quebra_pagina(doc)
    p = titulo(doc, "Apêndice A – Lista de verificação"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragrafo(doc, "Todos os itens do roteiro aplicados a este processo.", recuo1=0, depois=6, tam=10, hexa=C["fraco"], italico=True)
    t = doc.add_table(rows=1, cols=4); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    larg = [6.2, 3.0, 2.8, 4.0]
    for i, h in enumerate(["Item", "Documento", "Resultado", "Fundamento"]):
        c = t.rows[0].cells[i]; sombrear(c, C["marinho"]); c.width = Cm(larg[i]); margens_celula(c, 0.1); bordas(c)
        p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT); run(p, h.upper(), negrito=True, tam=8, hexa="FFFFFF")
    for i, col in enumerate(t.columns): col.width = Cm(larg[i])
    for i, gc in enumerate(t._tbl.tblGrid.findall(qn("w:gridCol"))): gc.set(qn("w:w"), str(int(larg[i] * 567)))
    cores_res = {"apontamento": C["baixa"], "conforme": C["ok"], "parcial": C["media"], "nao_conforme": C["alta"], "nao_aplicavel": C["fraco"], "nao_verificavel": C["nv"]}
    for k, r in enumerate(sorted(resultados, key=lambda x: ["nao_conforme", "parcial", "apontamento", "conforme", "nao_verificavel", "nao_aplicavel"].index(x["resultado"]))):
        it = itens[r["item"]]; row = t.add_row().cells
        vals = [it["titulo"], docs_nome.get(it["doc"], it["doc"]), RESULT[r["resultado"]], "; ".join(rotulo(f, com_norma=False) for f in it["fundamento"])]
        for i, v in enumerate(vals):
            c = row[i]; c.width = Cm(larg[i]); margens_celula(c, 0.1); bordas(c, bottom=(C["linha"], 4))
            if k % 2: sombrear(c, "FAFBFC")
            p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
            if i == 2:
                run(p, "● ", tam=8, hexa=cores_res[r["resultado"]]); run(p, v, tam=8, negrito=True, hexa=cores_res[r["resultado"]])
            else:
                run(p, v, tam=8)

    # APÊNDICE B
    paragrafo(doc, "", recuo1=0, depois=6)
    p = titulo(doc, "Apêndice B – Metodologia e limites"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for k, txt in enumerate([
        "Cada item do roteiro de verificação foi conferido nos documentos enviados; o trecho transcrito indica onde a constatação foi feita.",
        "Os dispositivos legais reproduzem o texto oficial vigente constante da base normativa do Licitacon na data da análise, conferido automaticamente quanto à existência, revogação e veto.",
        "Os precedentes provêm exclusivamente da Biblioteca Licitacon, com indicação da fonte oficial; a ausência de precedente listado não significa ausência de jurisprudência.",
        "Cálculos de planilha são conferidos por programa a partir de arquivo em Excel; planilhas em PDF não permitem conferir fórmulas.",
        "Normas estaduais e municipais, regulamentos internos e orientações locais somente são considerados quando enviados com os documentos.",
        "O parecer é opinativo: aponta todos os aspectos identificados, inclusive os de baixa vulnerabilidade, e a decisão sobre cada recomendação cabe ao destinatário.",
        "Trilhas automáticas, inspiradas nas tipologias do sistema ALICE (CGU/TCU), procuram no texto padrões associados a restrição de competitividade e direcionamento; cada indício é confirmado ou descartado pela análise no contexto do documento.",
        "Classificação de gravidade: é alta toda irregularidade que possa comprometer a competitividade, direcionar o certame ou indicar sobrepreço ou risco de superfaturamento; média, falhas formais ou de instrução com risco moderado; baixa, imprecisões e boas práticas.",
    ] + ([
        "Parte do documento estava digitalizada (imagem) e foi lida por reconhecimento óptico de caracteres (OCR); trechos de baixa qualidade de digitalização podem conter erros de leitura e devem ser conferidos no original.",
    ] if any(d.get("ocr") for d in analise.get("documentos", [])) else []) + [
        "Apontamentos adicionais são questões relevantes encontradas no documento que não constam do roteiro padrão; seus fundamentos legais também são conferidos na base oficial.",
        f"O código de verificação {verificador} identifica o conteúdo desta análise; qualquer alteração no resultado gera código diferente.",
    ], 1):
        p = fmt(doc.add_paragraph(), recuo1=0, esq=0.75, depois=6)
        p.paragraph_format.first_line_indent = Cm(-0.75)
        run(p, f"{chr(96 + k)}) ", negrito=True, hexa=C["petroleo"]); run(p, txt)

    doc.save(saida)
    return entradas


def _brl(v):
    return ("R$ " + f"{float(v):,.2f}").replace(",", "X").replace(".", ",").replace("X", ".")

SIT_PRECO = {"indicio": ("Indício de sobrepreço", "alta"), "atencao": ("Ponto de atenção", "media"), "compativel": ("Compatível", "ok"),
             "amostra_insuficiente": ("Amostra insuficiente", "na"), "amostra_heterogenea": ("Amostra heterogênea", "na")}

def secao_precos(doc, pr):
    cr = pr.get("criterios", {})
    titulo(doc, "4 Análise de preços")
    itens = pr.get("itens", [])
    ind = [r for r in itens if r["situacao"] == "indicio"]
    paragrafo(doc, f"O orçamento estimado foi confrontado com preços de contratações similares publicadas no Portal Nacional de Contratações "
                   f"Públicas (PNCP), conforme o parâmetro do art. 23, § 1º, II, da Lei nº 14.133/2021. Critérios adotados: objeto equivalente "
                   f"(descrição compatível e mesma unidade de medida); contratações homologadas nos 365 dias anteriores a "
                   f"{'/'.join(reversed(cr.get('data_referencia', '').split('-')))}; órgãos e entidades localizados no estado ({cr.get('uf', '')}); "
                   f"contratações regidas pela Lei nº 14.133/2021; preço de comparação igual ao valor unitário homologado. Calcula-se a mediana de, "
                   f"no mínimo, {cr.get('minimo_comparaveis', 3)} preços, após o descarte de valores extremos pelo intervalo interquartil. "
                   f"Considera-se indício de sobrepreço o valor estimado superior à mediana em mais de 25%, e ponto de atenção o excesso entre 10% e 25%.",
              depois=6)
    paragrafo(doc, f"Foram analisados {pr.get('itens_analisados', 0)} dos {pr.get('itens_no_orcamento', 0)} itens do orçamento, que representam "
                   f"{pr.get('cobertura_valor', 0):.0%} do valor estimado. " + (
                   f"Há indício de sobrepreço em {len(ind)} item(ns), com excesso estimado de {_brl(pr.get('excesso_total', 0))} em relação à mediana."
                   if ind else "Não foi identificado indício de sobrepreço nos itens com amostra suficiente."), depois=6)
    t = tabela_sem_bordas(doc, len(itens) + 1, 6, [1.0, 6.2, 2.4, 2.4, 1.4, 2.6])
    for i, h in enumerate(["Item", "Descrição", "Estimado", "Mediana", "Desvio", "Situação"]):
        c = t.rows[0].cells[i]; sombrear(c, C["marinho"]); margens_celula(c, 0.1)
        p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT); run(p, h.upper(), negrito=True, tam=7.5, hexa="FFFFFF")
    for k, r in enumerate(itens, 1):
        rot, cor_ = SIT_PRECO.get(r["situacao"], (r["situacao"], "na"))
        vals = [str(r.get("numero", "")), r["descricao"][:110], _brl(r["valor_estimado"]), _brl(r["mediana"]) if r.get("mediana") else "—",
                f"{r['desvio']:+.0%}" if r.get("desvio") is not None else "—", f"{rot} ({r['n']})"]
        for i, v in enumerate(vals):
            c = t.rows[k].cells[i]; bordas(c, bottom=(C["linha"], 4)); margens_celula(c, 0.1)
            if k % 2 == 0: sombrear(c, "FAFBFC")
            p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
            run(p, v, tam=8, negrito=(i == 5), hexa=C[cor_] if i == 5 else None)
    paragrafo(doc, "Entre parênteses, o número de preços comparáveis encontrados. Amostra insuficiente (menos de três preços) ou heterogênea "
                   "(coeficiente de variação acima de 0,5, o que sugere especificações diferentes) não permite concluir sobre sobrepreço.",
              recuo1=0, tam=8.5, hexa=C["fraco"], italico=True, antes=4, depois=8)
    for r in [x for x in itens if x["situacao"] in ("indicio", "atencao")]:
        rot, cor_ = SIT_PRECO[r["situacao"]]
        p = fmt(doc.add_paragraph(), recuo1=0, depois=4, alinh=WD_ALIGN_PARAGRAPH.LEFT)
        run(p, f"Item {r['numero']} — {rot}: ", negrito=True, hexa=C[cor_])
        run(p, f"estimado {_brl(r['valor_estimado'])} por {r.get('unidade') or 'unidade'}, contra mediana de {_brl(r['mediana'])} "
               f"({r['desvio']:+.0%}); excesso de {_brl(r.get('excesso_estimado', 0))} para {r['quantidade']:g} unidade(s). Preços comparáveis:")
        for cpa in r["comparaveis"]:
            q = fmt(doc.add_paragraph(), recuo1=0, esq=0.8, depois=2, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
            run(q, f"{_brl(cpa['valor_unitario'])} · {cpa.get('orgao', '')} ({cpa.get('municipio', '')}/{cpa.get('uf', '')}) · "
                   f"{'/'.join(reversed(cpa.get('data', '').split('-')))}" + (" · descartado (valor extremo)" if cpa.get("descartado") else "") + " ",
                tam=9, hexa=C["fraco"] if cpa.get("descartado") else None)
            link(q, "[PNCP]", cpa["link"], tam=8.5)
    paragrafo(doc, "A análise de preços é indicativa e calculada por programa a partir de dados públicos do PNCP; a comparação depende da "
                   "equivalência das especificações e não substitui a pesquisa de preços do processo (art. 23 da Lei nº 14.133/2021).",
              recuo1=0, tam=8.5, hexa=C["fraco"], italico=True, antes=6, depois=6)


def _painel_corpo(doc, itens, resultados, lst, cont, cont_res, indice):
    cartoes = [("Gravidade alta", cont["alta"], "alta"), ("Gravidade média", cont["media"], "media"),
               ("Gravidade baixa", cont["baixa"], "baixa"), ("Melhorias", sum(1 for r in resultados if r["resultado"] == "conforme" and r.get("dica")), "ok")]
    t = tabela_sem_bordas(doc, 1, 7, [3.55, 0.6, 3.55, 0.6, 3.55, 0.6, 3.55])
    for i, (rot, val, g) in enumerate(cartoes):
        c = t.rows[0].cells[i * 2]; sombrear(c, C[g + "_f"]); bordas(c, top=(C[g], 24)); margens_celula(c, 0.2)
        p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
        run(p, str(val), negrito=True, tam=24, hexa=C[g])
        p = c.add_paragraph(); fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT, depois=2)
        run(p, rot.upper(), negrito=True, tam=7, hexa=C["texto"])
    paragrafo(doc, "", recuo1=0, entre=1.0, depois=4)
    p = paragrafo(doc, "", recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.CENTER, depois=2)
    p.add_run().add_picture(graficos(cont_res, indice), width=Cm(16))
    p = paragrafo(doc, "", recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT, depois=12)
    run(p, "Índice de conformidade: ", negrito=True, tam=7.5, hexa=C["fraco"])
    run(p, "itens conformes mais metade dos parcialmente conformes, divididos pelos itens aplicáveis e verificáveis. "
           "Indicador de leitura rápida; não substitui o exame de cada apontamento.", tam=7.5, hexa=C["fraco"])
    paragrafo(doc, "PRINCIPAIS ACHADOS", recuo1=0, entre=1.0, depois=6, negrito=True, tam=9, hexa=C["petroleo"])
    if not lst:
        paragrafo(doc, "Nenhuma falha identificada nos itens aplicáveis.", recuo1=0, tam=10, italico=True)
        return
    t = tabela_sem_bordas(doc, len(lst) + 1, 4, [1.0, 8.6, 2.6, 3.8])
    for i, h in enumerate(["Item", "Achado", "Gravidade", "Dispositivo"]):
        c = t.rows[0].cells[i]; sombrear(c, C["marinho"]); margens_celula(c, 0.12)
        p = c.paragraphs[0]; fmt(p, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT); run(p, h.upper(), negrito=True, tam=7.5, hexa="FFFFFF")
    for n, r in enumerate(lst, 1):
        it = itens[r["item"]]; g = it["gravidade"]; row = t.rows[n].cells
        for c in row:
            bordas(c, bottom=(C["linha"], 4)); margens_celula(c, 0.12)
            if n % 2 == 0: sombrear(c, "FAFBFC")
        vals = [f"3.{n}", it["titulo"], GRAV[g], (rotulo(it["fundamento"][0], com_norma=False) + (" e outros" if len(it["fundamento"]) > 1 else "")) if it["fundamento"] else "—"]
        for i, v in enumerate(vals):
            p = row[i].paragraphs[0]; fmt(p, recuo1=0, entre=1.05, alinh=WD_ALIGN_PARAGRAPH.LEFT)
            if i == 2:
                run(p, "● ", tam=9, hexa=C[g]); run(p, v, negrito=True, tam=8.5, hexa=C[g])
                p2 = row[i].add_paragraph(); fmt(p2, recuo1=0, entre=1.0, alinh=WD_ALIGN_PARAGRAPH.LEFT)
                run(p2, RESULT[r["resultado"]], tam=7, hexa=C["fraco"])
            else:
                run(p, v, tam=8.5, negrito=(i == 0), hexa=C["marinho"] if i == 0 else None)


# ------------------------------------------------------------------ paginação do sumário e PDF
def para_pdf(docx, pasta):
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None
    subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", str(pasta), str(docx)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
    pdf = pathlib.Path(pasta) / (pathlib.Path(docx).stem + ".pdf")
    return pdf if pdf.exists() else None

def paginas_dos_titulos(pdf, entradas):
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
    pags = out.split("\f")
    achou = {}
    def chave(s): return re.sub(r"\s+", " ", _norm(s)).strip()
    inicio = 2  # índice da página a partir da qual procurar (ignora capa e sumário); avança em ordem
    for e in entradas:
        alvo = chave(e)[:40]
        for i in range(inicio, len(pags)):
            linhas = [chave(l) for l in pags[i].splitlines()]
            if any(l.startswith(alvo) for l in linhas if l):
                achou[e] = i + 1; inicio = i
                if e.startswith("1 "): inicio = i + 1  # o painel repete os títulos dos achados
                break
    return achou

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    analise = json.loads(pathlib.Path(args[0]).read_text(encoding="utf-8"))
    saida = pathlib.Path(args[1])
    entradas = gerar(analise, saida)
    with tempfile.TemporaryDirectory() as tmp:
        pdf = para_pdf(saida, tmp)
        if pdf:
            pags = paginas_dos_titulos(pdf, entradas)
            gerar(analise, saida, pags)
            if "--pdf" in sys.argv:
                pdf2 = para_pdf(saida, tmp)
                shutil.copy(pdf2, saida.with_suffix(".pdf"))
                print("PDF gravado:", saida.with_suffix(".pdf"))
        else:
            print("aviso: LibreOffice ausente; sumário sem paginação")
    print("relatório gravado:", saida)


if __name__ == "__main__":
    main()
