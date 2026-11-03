#!/usr/bin/env python3
"""Modelo padrão Licitacon do Estudo Técnico Preliminar (Lei 14.133/2021), para órgãos da administração direta, autárquica
e fundacional. Base: agente/modelos/etp-padrao.docx (modelo de ETP do governo federal). O arquivo é preenchido mantendo capa,
histórico de revisões, faixas numeradas das seções, cabeçalho, rodapé e quadros de assinatura; as orientações em vermelho
do modelo são retiradas e substituídas pelo texto do agente.

Para objetos que não são de TIC, as seções específicas de TIC são renomeadas (ex.: "Necessidades tecnológicas" vira
"Requisitos técnicos da solução") e as referências à IN SGD/ME nº 94/2022 saem.
"""
import copy, datetime, pathlib, re

RAIZ = pathlib.Path(__file__).resolve().parents[2]
MODELO = RAIZ / "agente" / "modelos" / "etp-padrao.docx"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

LISTA = {"type": "array", "items": {"type": "string"}}
CHAVES = ["informacoes", "necessidade", "motivacao", "area", "negocio", "tecnologicas", "requisitos", "demanda", "levantamento",
          "comparativa", "inviaveis", "custos", "solucao", "estimativa", "just_tecnica", "parcelamento_tecnico", "just_economica",
          "parcelamento_economico", "beneficios", "providencias", "correlatas", "ambientais", "viabilidade_justificativa"]

FERRAMENTA = {
    "name": "entregar_documento",
    "description": "Entrega o ETP no modelo padrão, seção por seção, com quadros e pendências.",
    "input_schema": {"type": "object", "properties": {
        "eh_tic": {"type": "boolean", "description": "true só se o objeto for solução de tecnologia da informação e comunicação"},
        "categoria": {"type": "string", "description": "categoria do objeto, ex.: Serviço contínuo sem dedicação exclusiva de mão de obra"},
        "secoes": {"type": "object", "properties": {k: LISTA for k in CHAVES},
                   "description": "parágrafos de cada seção; um parágrafo começando com '### ' vira subtítulo"},
        "solucoes": {"type": "array", "items": {"type": "object", "properties": {
            "id": {"type": "integer"}, "nome": {"type": "string"}, "descricao": {"type": "string"},
            "mercado": LISTA, "custo_total": {"type": ["number", "null"], "description": "custo total para a administração no horizonte (vida útil), da tabela de custos"},
            "vantagens": LISTA, "desvantagens": LISTA, "riscos": LISTA,
            "viavel": {"type": "boolean"}, "motivo_inviabilidade": {"type": "string"}}, "required": ["id", "nome", "descricao", "mercado", "riscos", "viavel"]}},
        "vida_util": {"type": "object", "properties": {"anos": {"type": "number"}, "fundamento": {"type": "string", "description": "de onde vem a vida útil adotada"}}},
        "resumo": {"type": "object", "description": "quadro-resumo no início do estudo", "properties": {
            "necessidade": {"type": "string", "description": "uma frase"}, "solucao": {"type": "string", "description": "solução indicada, em uma frase"},
            "por_que": {"type": "string", "description": "o principal motivo da escolha, em uma frase, com números"},
            "custo_total": {"type": ["number", "null"]}, "horizonte": {"type": "string", "description": "ex.: 5 anos (vida útil)"}}},
        "escolhida": {"type": "integer", "description": "id da solução indicada como a mais vantajosa"},
        "comparativo": {"type": "array", "items": {"type": "object", "properties": {
            "tipo": {"type": "string", "description": "Negócio, Técnico ou Econômico"}, "requisito": {"type": "string"},
            "avaliacao": {"type": "array", "items": {"type": "string"}, "description": "uma por solução viável, na ordem dos ids: Atende, Atende parcialmente ou Não atende"}},
            "required": ["tipo", "requisito", "avaliacao"]}},
        "tco": {"type": "object", "properties": {
            "anos": {"type": "integer", "description": "horizonte da análise, em anos (ex.: 1 para 12 meses)"},
            "solucoes": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "integer"},
                "componentes": {"type": "array", "items": {"type": "object", "properties": {
                    "componente": {"type": "string"},
                    "unidade": {"type": "string", "description": "ex.: unidade, unidade/mês, serviço/ano"},
                    "quantidade": {"type": ["number", "null"]},
                    "valor_unitario": {"type": ["number", "null"], "description": "valor unitário encontrado na pesquisa (preço praticado ou item de contratação semelhante)"},
                    "valores": {"type": "array", "items": {"type": ["number", "null"]}, "description": "custo total do componente em cada ano; null se não houver dado"},
                    "fonte": {"type": "string", "description": "ex.: [C1] mediana dos preços praticados; [P3]; referência do requisitante"}},
                    "required": ["componente", "valores"]}}}, "required": ["id", "componentes"]}}}},
        "itens": {"type": "array", "description": "TODOS os componentes de custo da solução escolhida no horizonte (bem, manutenção, garantia, instalação etc.), com valor unitário e quantidade", "items": {"type": "object", "properties": {
            "item": {"type": "string"}, "descricao": {"type": "string"}, "unidade": {"type": "string"},
            "quantidade": {"type": ["number", "null"]}, "valor_unitario": {"type": ["number", "null"]}, "fonte": {"type": "string"}},
            "required": ["item", "descricao"]}},
        "viabilidade": {"type": "string", "enum": ["Viável", "Viável com restrições", "Inviável"]},
        "pendencias": LISTA,
        "jurisprudencia_ids": LISTA},
        "required": ["eh_tic", "categoria", "secoes", "solucoes", "viabilidade", "pendencias"]},
}

INSTRUCOES = (
    "MODELO PADRÃO DO ETP (preencha cada chave de 'secoes' com parágrafos; use '### ' para subtítulos internos):\n"
    "informacoes: processo, categoria do objeto e previsão no Plano de Contratações Anual (inciso II); "
    "necessidade: descrição da necessidade e do problema, sob a perspectiva do interesse público (inciso I); motivacao: motivação e justificativa; "
    "area: área requisitante e responsáveis (gestor e fiscais informados); negocio: necessidades de negócio (resultados que a solução deve entregar); "
    "tecnologicas: se TIC, necessidades tecnológicas; se não, requisitos técnicos da solução; requisitos: demais requisitos necessários e "
    "suficientes à escolha da solução, inclusive sustentabilidade (inciso III); demanda: estimativa das quantidades com memória de cálculo "
    "(inciso IV); levantamento: levantamento de mercado com TODAS as soluções possíveis (aquisição, locação, serviço com fornecimento, adesão a "
    "ata, execução direta etc., conforme o objeto) e o que a pesquisa encontrou para cada uma (inciso V); comparativa: análise crítica comparando "
    "as soluções; inviaveis: soluções consideradas inviáveis e por quê; custos: método da análise comparativa de custos (custo total ao longo do "
    "ciclo de vida) e origem dos valores; solucao: descrição da solução escolhida como um todo, inclusive manutenção e assistência técnica "
    "(inciso VII); estimativa: estimativa do valor, preliminar, dependente da pesquisa de preços do art. 23 (inciso VI); just_tecnica e "
    "just_economica: justificativas técnica e econômica da escolha; parcelamento_tecnico e parcelamento_economico: justificativa do parcelamento "
    "ou não (inciso VIII), seguindo a decisão do requisitante; beneficios: resultados pretendidos (inciso IX); providencias: providências prévias, "
    "inclusive capacitação de fiscais e gestores (inciso X); correlatas: contratações correlatas e interdependentes (inciso XI); ambientais: impactos "
    "ambientais e medidas mitigadoras (inciso XII); viabilidade_justificativa: posicionamento conclusivo (inciso XIII). "
    "Em solucoes, para CADA solução (inclusive adesão a ata e as inviáveis) escreva em 'mercado' o que a pesquisa encontrou para ela "
    "(contratações e atas semelhantes, preços unitários, faixa e mediana, fontes [P#]/[C#]), em 'custo_total' o custo para a administração no "
    "horizonte, e liste vantagens, desvantagens e riscos (ex.: adesão: vigência e saldo da ata, aceite do órgão gerenciador e do fornecedor, "
    "limites do art. 86, compatibilidade da especificação; locação: dependência do fornecedor, reajuste; aquisição: obsolescência, manutenção). "
    "Vida útil (vida_util): defina-a com fundamento (referência técnica ou contábil usual para o bem, ou a informação do requisitante) e use-a "
    "como horizonte do estudo de custos (tco.anos), comparando compra e locação no MESMO horizonte. Em itens, inclua o bem E a manutenção "
    "(e demais custos da solução escolhida), cada um com unidade, quantidade e valor unitário. Preencha o resumo (quadro do início do estudo). "
    "Preencha também: solucoes (todas, viáveis e inviáveis), escolhida, comparativo, tco (o estudo de custo total de cada solução viável: "
    "para cada componente informe unidade, quantidade, valor unitário da pesquisa, o custo de cada ano e a fonte; inclua manutenção, "
    "assistência e demais custos de cada solução; valores só com dados da pesquisa ou do requisitante; sem dado, null), itens da solução escolhida (valor_unitario null se não houver dado) e viabilidade. "
    "Se o objeto não for de TIC, não cite a IN SGD/ME nº 94/2022 nem o SISP."
)


def brl(v):
    if v is None:
        return "[PREENCHER]"
    return "R$ " + f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def num(v):
    return "[PREENCHER]" if v is None else (f"{v:,.0f}".replace(",", ".") if float(v).is_integer() else f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))


def sem_acento(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").upper()) if unicodedata.category(c) != "Mn")


SECOES_MODELO = [("INFORMACOES BASICAS", "informacoes"), ("DESCRICAO DA NECESSIDADE", "necessidade"), ("AREA REQUISITANTE", "area"),
                 ("NECESSIDADES DE NEGOCIO", "negocio"), ("NECESSIDADES TECNOLOGICA", "tecnologicas"), ("DEMAIS REQUISITOS", "requisitos"),
                 ("ESTIMATIVA DA DEMANDA", "demanda"), ("LEVANTAMENTO DE SOLUCOES", "levantamento"), ("ANALISE COMPARATIVA DAS SOLUCOES", "comparativa"),
                 ("REGISTRO DE SOLUCOES", "inviaveis"), ("ANALISE COMPARATIVA DE CUSTOS", "custos"), ("CALCULO DOS CUSTOS", "tco"),
                 ("MAPA COMPARATIVO", "mapa"), ("DESCRICAO DA SOLUCAO", "solucao"), ("ESTIMATIVA DE CUSTO TOTAL", "estimativa"),
                 ("JUSTIFICATIVA TECNICA", "just_tecnica"), ("JUSTIFICATIVA ECONOMICA", "just_economica"), ("BENEFICIOS", "beneficios"),
                 ("PROVIDENCIAS", "providencias"), ("DECLARACAO DE VIABILIDADE", "viabilidade"), ("RESPONSAVEIS", "responsaveis"),
                 ("APROVACAO", "aprovacao")]
TITULOS_NAO_TIC = {"tecnologicas": "REQUISITOS TÉCNICOS DA SOLUÇÃO", "solucao": "DESCRIÇÃO DA SOLUÇÃO A SER CONTRATADA"}


def texto_plano(docj):
    s = docj.get("secoes") or {}
    partes = ["ESTUDO TÉCNICO PRELIMINAR", f"Categoria: {docj.get('categoria','')}"]
    for k in CHAVES:
        if s.get(k):
            partes.append(f"\n[{k}]")
            partes += s[k]
    for x in docj.get("solucoes") or []:
        partes.append(f"Solução {x.get('id')}: {x.get('nome')} — {x.get('descricao')} ({'viável' if x.get('viavel') else 'inviável: ' + str(x.get('motivo_inviabilidade') or '')})")
    for it in docj.get("itens") or []:
        partes.append(f"Item {it.get('item')}: {it.get('descricao')} · {num(it.get('quantidade'))} {it.get('unidade') or ''} · {brl(it.get('valor_unitario'))}")
    partes.append(f"Declaração de viabilidade: {docj.get('viabilidade','')}")
    return "\n".join(partes)


def simulado(respostas):
    obj = respostas.get("objeto", "[PREENCHER: objeto]")
    s = {k: [f"[Texto de exemplo da seção '{k}'. Na elaboração real, eu redijo a partir das respostas e da pesquisa: {obj}.]"] for k in CHAVES}
    return {"eh_tic": False, "categoria": respostas.get("natureza", "Bem"), "secoes": s,
            "vida_util": {"anos": 5, "fundamento": "vida útil usual de equipamentos de informática na depreciação patrimonial"},
            "resumo": {"necessidade": "Substituir 40 notebooks obsoletos das escolas.", "solucao": "Aquisição com garantia on-site de 36 meses e manutenção nos anos 4 e 5.",
                       "por_que": "Menor custo total em 5 anos: R$ 236.000 contra R$ 288.000 da locação.", "custo_total": 236000, "horizonte": "5 anos (vida útil)"},
            "solucoes": [{"id": 1, "nome": "Aquisição com garantia de 36 meses", "descricao": "Compra dos equipamentos com garantia on-site.", "viavel": True, "custo_total": 236000,
                          "mercado": ["Encontrei 40 compras de notebooks no RJ nos últimos 12 meses [C1]; mediana de R$ 5.122 por unidade."],
                          "vantagens": ["Menor custo total no horizonte"], "desvantagens": ["Manutenção após a garantia"], "riscos": ["Obsolescência antes do fim da vida útil"]},
                         {"id": 2, "nome": "Locação com manutenção incluída", "descricao": "Locação mensal com suporte.", "viavel": True, "custo_total": 288000,
                          "mercado": ["Contratações de locação de notebooks [P5][P6] indicam R$ 120 por unidade/mês."], "vantagens": ["Manutenção incluída"],
                          "desvantagens": ["Custo maior em 5 anos"], "riscos": ["Reajuste anual", "Dependência do fornecedor"]},
                         {"id": 3, "nome": "Adesão a ata de registro de preços", "descricao": "Adesão a ata vigente de outro órgão.", "viavel": True, "custo_total": 241000,
                          "mercado": ["Ata [P8] com item compatível a R$ 5.300 por unidade."], "riscos": ["Vigência e saldo da ata", "Aceite do órgão gerenciador e do fornecedor (art. 86)"]},
                         {"id": 4, "nome": "Execução direta", "descricao": "Uso de equipamentos próprios.", "viavel": False, "mercado": ["Não se aplica."], "riscos": [], "motivo_inviabilidade": "Não há equipamentos disponíveis."}],
            "escolhida": 1,
            "comparativo": [{"tipo": "Negócio", "requisito": "Disponibilidade contínua", "avaliacao": ["Atende", "Atende", "Atende"]},
                            {"tipo": "Econômico", "requisito": "Menor custo total", "avaliacao": ["Atende", "Não atende", "Atende parcialmente"]}],
            "tco": {"anos": 5, "solucoes": [
                {"id": 1, "componentes": [{"componente": "Notebook", "unidade": "unidade", "quantidade": 40, "valor_unitario": 5122, "valores": [204880, 0, 0, 0, 0], "fonte": "[C1]"},
                                          {"componente": "Manutenção (anos 4 e 5)", "unidade": "unidade/ano", "quantidade": 40, "valor_unitario": 390, "valores": [0, 0, 0, 15600, 15600], "fonte": "[C3]"}]},
                {"id": 2, "componentes": [{"componente": "Locação com manutenção", "unidade": "unidade/mês", "quantidade": 40, "valor_unitario": 120, "valores": [57600] * 5, "fonte": "[P5]"}]}]},
            "itens": [{"item": "1", "descricao": "Notebook conforme especificação", "unidade": "unidade", "quantidade": 40, "valor_unitario": 5122, "fonte": "[C1]"},
                      {"item": "2", "descricao": "Manutenção corretiva após a garantia (2 anos)", "unidade": "unidade/ano", "quantidade": 80, "valor_unitario": 390, "fonte": "[C3]"}],
            "viabilidade": "Viável", "pendencias": [], "jurisprudencia_ids": []}


def gerar(docj, respostas, saida, logo=None, pesquisa=None, refs=None, conferencia=None):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.shared import Cm, Pt, RGBColor

    w = Document(str(MODELO))
    corpo = w.element.body
    tic = bool(docj.get("eh_tic"))
    S = docj.get("secoes") or {}
    hoje = datetime.date.today()

    # ---------------------------------------------------------------- utilitários
    def run_fmt(r, negrito=False, tam=None, cor=None):
        r.font.name = "Calibri"; r.bold = negrito
        if tam: r.font.size = Pt(tam)
        if cor: r.font.color.rgb = RGBColor.from_string(cor)

    def escrever(p, texto, negrito=False, tam=None):
        for trecho in re.split(r"(\[PREENCHER[^\]]*\])", str(texto)):
            if not trecho:
                continue
            r = p.add_run(trecho); run_fmt(r, negrito, tam)
            if trecho.startswith("[PREENCHER"):
                r.font.highlight_color = 7

    def novo_par(texto="", negrito=False, centro=False, tam=None, antes=0, depois=120, cor=None, recuo=None):
        p = w.add_paragraph(style="Standard")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if centro else WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.space_before = Pt(antes / 20); p.paragraph_format.space_after = Pt(depois / 20)
        p.paragraph_format.line_spacing = 1.15
        if recuo is not None:
            p.paragraph_format.left_indent = Cm(recuo)
        if texto:
            escrever(p, texto, negrito, tam)
            if cor:
                for r in p.runs:
                    if not r.font.highlight_color: r.font.color.rgb = RGBColor.from_string(cor)
        return p

    def faixa(texto):  # subtítulo interno: negrito, cor da marca, respiro antes
        return novo_par(texto, negrito=True, antes=200, depois=80, cor="0F4C5C", tam=11.5)

    def sombrear(cel, cor):
        shd = OxmlElement("w:shd"); shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), cor)
        cel._tc.get_or_add_tcPr().append(shd)

    def nova_tabela(cab, linhas, larguras=None, total=None, chave_valor=False):
        t = w.add_table(rows=1 if cab else 0, cols=len(cab) if cab else 2)
        try:
            t.style = w.styles["Table Grid"]
        except KeyError:
            pass
        tblW = t._tbl.tblPr.find(qn("w:tblW"))
        if tblW is None:
            tblW = OxmlElement("w:tblW"); t._tbl.tblPr.append(tblW)
        tblW.set(qn("w:w"), "5000"); tblW.set(qn("w:type"), "pct")
        if cab:
            for i, c in enumerate(cab):
                cel = t.rows[0].cells[i]; cel.text = ""
                p = cel.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r = p.add_run(c); run_fmt(r, True, 9.5, "FFFFFF")
                sombrear(cel, "1F3B45")
        for n, ln in enumerate(linhas + ([total] if total else [])):
            cells = t.add_row().cells
            for i, v in enumerate(ln):
                cells[i].text = ""
                p = cells[i].paragraphs[0]
                esquerda = i == 0 or chave_valor or (larguras and larguras[i] >= 5)
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT if esquerda else WD_ALIGN_PARAGRAPH.CENTER
                escrever(p, v, ln is total or (chave_valor and i == 0), 9.5)
                if ln is total:
                    sombrear(cells[i], "DCE8E4")
                elif chave_valor and i == 0:
                    sombrear(cells[i], "EEF3F2")
                elif n % 2 == 1:
                    sombrear(cells[i], "F5F8F7")
        if larguras:
            t.autofit = False
            total_cm = sum(larguras)
            prop = [l * 16.0 / total_cm for l in larguras]  # largura útil ~16 cm
            grid = t._tbl.tblGrid
            for i, gc in enumerate(grid.findall(qn("w:gridCol"))):
                if i < len(prop): gc.set(qn("w:w"), str(int(Cm(prop[i]).twips)))
            for row in t.rows:
                for i, c in enumerate(row.cells):
                    c.width = Cm(prop[i])
        return t

    def lista(cur, titulo, itens):
        itens = [str(x).strip() for x in itens or [] if str(x).strip()]
        if not itens:
            return
        cur.add(novo_par(titulo, negrito=True, antes=60, depois=40))
        for x in itens:
            cur.add(novo_par("• " + x, recuo=0.5, depois=40))

    class Cursor:
        def __init__(self, el): self.el = el
        def add(self, obj):
            el = obj._p if hasattr(obj, "_p") else obj._tbl
            self.el.addnext(el); self.el = el
        def pars(self, lista):
            for t in lista or []:
                t = str(t).strip()
                if not t:
                    continue
                if t.startswith("### "):
                    self.add(faixa(t[4:]))
                else:
                    self.add(novo_par(t))
        def sub(self, titulo):
            self.add(faixa(titulo))
        def espaco(self):
            self.add(novo_par("", antes=0, depois=60))

    def texto_tabela(tb):
        return sem_acento(" ".join(c.text for r in tb.rows for c in r.cells)).strip()

    def trocar_texto_celula(cel, texto, negrito=True):
        ps = cel.paragraphs
        for p in ps[1:]:
            p._p.getparent().remove(p._p)
        p = ps[0]
        for r in list(p.runs):
            r._r.getparent().remove(r._r)
        r = p.add_run(texto); run_fmt(r, negrito, cor="000000")

    def preencher_paragrafo(p, texto, negrito=None, cor="000000"):
        neg = p.runs[0].bold if negrito is None and p.runs else negrito
        tam = p.runs[0].font.size if p.runs else None
        for r in list(p.runs):
            r._r.getparent().remove(r._r)
        for trecho in re.split(r"(\[PREENCHER[^\]]*\])", texto):
            if trecho:
                r = p.add_run(trecho); run_fmt(r, bool(neg), cor=cor)
                if tam: r.font.size = tam
                if trecho.startswith("[PREENCHER"): r.font.highlight_color = 7

    # ---------------------------------------------------------------- cabeçalho, rodapé
    sec = w.sections[0]
    orgao = (respostas.get("orgao") or "[PREENCHER: órgão ou entidade]").strip()
    for tb in sec.header.tables:
        for row in tb.rows:
            for cel in row.cells:
                if "ESPACO DESTINADO" in sem_acento(cel.text):
                    trocar_texto_celula(cel, orgao.upper())
                    cel.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    if logo:
                        try:
                            pl = cel.paragraphs[0].insert_paragraph_before()
                            pl.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            pl.add_run().add_picture(str(logo), height=Cm(1.8))
                        except Exception as e:
                            print(f"logo não incluída ({type(e).__name__})")
    if respostas.get("rodape_incluir") == "Sim" and respostas.get("rodape", "").strip():
        pr = sec.footer.add_paragraph(); pr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = pr.add_run(re.sub(r"\s+", " ", respostas["rodape"].strip())[:500]); run_fmt(r, tam=8)

    # ---------------------------------------------------------------- capa e páginas iniciais
    processo = (respostas.get("processo") or "").strip() or "[PREENCHER: nº do processo]"
    for p in w.paragraphs:
        t = p.text
        if "<XXXXXXXX>" in t:
            preencher_paragrafo(p, t.replace("<XXXXXXXX>", processo))
        elif "<Nome do Projeto" in t:
            obj = (respostas.get("objeto") or "").strip()[:180] or "[PREENCHER: objeto]"
            preencher_paragrafo(p, obj)
            if len(obj) > 50:  # título longo não pode empurrar o local e a data para a página seguinte
                for r in p.runs:
                    r.font.size = Pt(18 if len(obj) <= 110 else 15)
                p.paragraph_format.line_spacing = 1.15
        elif "<Local>" in t:
            preencher_paragrafo(p, f"{respostas.get('municipio', '').strip() or '[PREENCHER: local]'}, {MESES[hoje.month - 1]} de {hoje.year}", negrito=False)
        elif "Perguntas frequentes" in t or "perguntas-frequentes" in t:
            p._p.getparent().remove(p._p)
    for p in list(w.paragraphs):  # links do modelo federal (página de orientação)
        if re.search(r"gov\.br/compras|comprasnet", p.text) and len(p.text) < 200:
            p._p.getparent().remove(p._p)

    tabelas = list(w.tables)
    # histórico de revisões
    hist = next((t for t in tabelas if "HISTORICO" in texto_tabela(t) or (len(t.columns) == 4 and "VERSAO" in texto_tabela(t))), None)
    if hist is not None:
        linhas = hist.rows
        vals = [hoje.strftime("%d/%m/%Y"), "1.0", "Minuta elaborada com apoio do Agente Licitacon", respostas.get("elab_nome", "").strip() or "[PREENCHER]"]
        for i, c in enumerate(linhas[1].cells):
            trocar_texto_celula(c, vals[i], negrito=False)
        for row in linhas[2:]:
            for c in row.cells:
                trocar_texto_celula(c, "", negrito=False)
    # caixa "ATENÇÃO" do modelo
    for t in tabelas:
        if texto_tabela(t).startswith("ATENCAO"):
            t._tbl.getparent().remove(t._tbl)
    # introdução: referência legal
    for t in w.tables:
        if texto_tabela(t).startswith("INTRODUCAO"):
            for p in t.rows[-1].cells[0].paragraphs:
                if p.text.strip().startswith("Referência") and not tic:
                    preencher_paragrafo(p, "Referência: art. 6º, inciso XX, e art. 18 da Lei nº 14.133, de 1º de abril de 2021.", negrito=True)

    # ---------------------------------------------------------------- seções
    cabecalhos = []
    for el in corpo.iterchildren():
        if el.tag == qn("w:tbl"):
            from docx.table import Table
            tb = Table(el, w)
            if len(tb.rows) == 1 and len(tb.columns) == 1:
                txt = texto_tabela(tb)
                chave = next((k for pref, k in SECOES_MODELO if txt.startswith(pref)), None)
                if chave:
                    cabecalhos.append((chave, el, tb))
    if len(cabecalhos) < 15:
        raise RuntimeError(f"modelo do ETP sem as seções esperadas ({len(cabecalhos)})")

    # apaga o conteúdo de orientação entre os cabeçalhos (mantém os quadros de assinatura)
    ids = {id(el) for _, el, _ in cabecalhos}
    for n, (chave, el, tb) in enumerate(cabecalhos):
        prox = cabecalhos[n + 1][1] if n + 1 < len(cabecalhos) else None
        x = el.getnext()
        while x is not None and x is not prox and x.tag != qn("w:sectPr"):
            seguinte = x.getnext()
            manter = chave in ("responsaveis", "aprovacao") and x.tag == qn("w:tbl")
            if not manter:
                corpo.remove(x)
            x = seguinte
        if not tic and chave in TITULOS_NAO_TIC:
            trocar_texto_celula(tb.rows[0].cells[0], TITULOS_NAO_TIC[chave])
        elif not tic and re.search(r"\bDE TIC\b", tb.rows[0].cells[0].text):
            trocar_texto_celula(tb.rows[0].cells[0], re.sub(r"\s+DE TIC\b", "", tb.rows[0].cells[0].text).strip())

    sols = docj.get("solucoes") or []
    viaveis = [x for x in sols if x.get("viavel")]
    nome_sol = {x.get("id"): x.get("nome") for x in sols}
    tco = docj.get("tco") or {}
    anos = max(1, int(tco.get("anos") or 1))
    escolhida = docj.get("escolhida")

    rs = docj.get("resumo") or {}
    if rs:
        primeiro = cabecalhos[0][1]
        antes_el = primeiro.getprevious()
        cur = Cursor(antes_el if antes_el is not None else primeiro)
        cur.add(faixa("RESUMO DO ESTUDO"))
        linhas_r = [["Necessidade", rs.get("necessidade") or ""], ["Solução indicada", rs.get("solucao") or ""],
                    ["Por que", rs.get("por_que") or ""],
                    ["Custo total estimado", brl(rs.get("custo_total")) + (f" — {rs['horizonte']}" if rs.get("horizonte") else "")],
                    ["Viabilidade", docj.get("viabilidade") or ""]]
        cur.add(nova_tabela([], [l for l in linhas_r if l[1]], [4.3, 11.7], chave_valor=True))
        cur.espaco()

    for chave, el, tb in cabecalhos:
        c = Cursor(el)
        c.espaco()
        if chave == "informacoes":
            c.add(novo_par(f"Processo administrativo nº {processo}."))
            c.add(novo_par(f"Categoria do objeto: {docj.get('categoria') or '[PREENCHER]'}."))
            c.pars(S.get("informacoes"))
        elif chave == "necessidade":
            c.pars(S.get("necessidade"))
            if S.get("motivacao"):
                c.sub("Motivação/Justificativa"); c.pars(S.get("motivacao"))
        elif chave == "area":
            c.pars(S.get("area"))
            linhas = [["Área requisitante", respostas.get("unidade", "").strip() or "[PREENCHER: unidade requisitante]"],
                      ["Gestor do contrato", respostas.get("gestor", "").strip() or "[PREENCHER: nome, cargo e matrícula]"]]
            fiscais = [f.strip() for f in respostas.get("fiscais", "").splitlines() if f.strip()]
            for f in fiscais or ["[PREENCHER: fiscais do contrato]"]:
                linhas.append(["Fiscal do contrato", f])
            c.add(nova_tabela(["Função", "Nome, cargo e matrícula"], linhas, [5, 11]))
        elif chave == "levantamento":
            c.pars(S.get("levantamento"))
            if sols:
                c.add(nova_tabela(["Id", "Solução", "Custo total no horizonte", "Situação"],
                                  [[str(x.get("id")), x.get("nome", ""), brl(x.get("custo_total")) if x.get("viavel") else "—",
                                    ("Indicada" if x.get("id") == escolhida else "Viável") if x.get("viavel") else "Inviável"] for x in sols], [1.2, 8, 4, 2.8]))
                for x in sols:
                    c.sub(f"Solução {x.get('id')} — {x.get('nome', '')}")
                    c.add(novo_par(x.get("descricao", "")))
                    if x.get("mercado"):
                        c.add(novo_par("O que a pesquisa de mercado mostrou", negrito=True, antes=60, depois=40))
                        c.pars(x.get("mercado"))
                    if x.get("custo_total") is not None:
                        c.add(novo_par(f"Custo total estimado para a administração: {brl(x.get('custo_total'))}" + (f" ({hz})" if (hz := (docj.get('resumo') or {}).get('horizonte')) else "") + ".", negrito=True))
                    lista(c, "Vantagens", x.get("vantagens")); lista(c, "Desvantagens", x.get("desvantagens")); lista(c, "Riscos", x.get("riscos"))
                    if not x.get("viavel") and x.get("motivo_inviabilidade"):
                        c.add(novo_par("Por que é inviável: " + x["motivo_inviabilidade"]))
        elif chave == "comparativa":
            c.pars(S.get("comparativa"))
            comp = docj.get("comparativo") or []
            if comp and viaveis:
                cab = ["Tipo", "Requisito"] + [f"Solução {x.get('id')}" for x in viaveis]
                ln = [[r.get("tipo", ""), r.get("requisito", "")] + [(r.get("avaliacao") or [])[i] if i < len(r.get("avaliacao") or []) else "" for i in range(len(viaveis))] for r in comp]
                c.add(nova_tabela(cab, ln))
        elif chave == "inviaveis":
            c.pars(S.get("inviaveis"))
            inv = [x for x in sols if not x.get("viavel")]
            if inv:
                c.add(nova_tabela(["Id", "Solução", "Motivo da inviabilidade"], [[str(x.get("id")), x.get("nome", ""), x.get("motivo_inviabilidade") or "[PREENCHER]"] for x in inv], [1.2, 5, 9.8]))
            elif not S.get("inviaveis"):
                c.add(novo_par("Não foram identificadas soluções inviáveis entre as levantadas."))
        elif chave == "custos":
            vu = docj.get("vida_util") or {}
            if vu.get("anos"):
                c.add(novo_par(f"Horizonte da análise: {num(vu.get('anos'))} anos, correspondente à vida útil do objeto" + (f" ({vu['fundamento']})" if vu.get("fundamento") else "") + ".", negrito=True))
            c.pars(S.get("custos"))
        elif chave == "tco":
            for s_ in tco.get("solucoes") or []:
                comps = s_.get("componentes") or []
                c.sub(f"Solução {s_.get('id')} – {nome_sol.get(s_.get('id'), '')}")
                ln, soma, falta = [], 0.0, False
                for cp in comps:
                    vs = list(cp.get("valores") or [])[:anos]
                    tot = None if (not vs or any(v is None for v in vs)) else sum(float(v) for v in vs)
                    if tot is None: falta = True
                    else: soma += tot
                    ln.append([cp.get("componente", ""), cp.get("unidade") or "—", num(cp.get("quantidade")) if cp.get("quantidade") is not None else "—",
                               brl(cp.get("valor_unitario")) if cp.get("valor_unitario") is not None else "—", brl(tot), cp.get("fonte", "")])
                c.add(nova_tabela(["Componente de custo", "Unidade", "Qtd.", "Valor unitário", f"Total em {anos} ano(s)", "Fonte"], ln, [5.2, 2.2, 1.4, 2.6, 2.8, 1.8],
                                  total=["Custo total da solução", "", "", "", brl(None if falta else soma), ""]))
            if not tco.get("solucoes"):
                c.add(novo_par("[PREENCHER: cálculo dos custos totais das soluções viáveis.]"))
        elif chave == "mapa":
            linhas = []
            for s_ in tco.get("solucoes") or []:
                por_ano = []
                for i in range(anos):
                    vs = [(cp.get("valores") or [None] * anos)[i] if i < len(cp.get("valores") or []) else None for cp in s_.get("componentes") or []]
                    por_ano.append(None if (not vs or any(v is None for v in vs)) else sum(float(v) for v in vs))
                tot = None if any(v is None for v in por_ano) else sum(por_ano)
                linhas.append([f"Solução {s_.get('id')} – {nome_sol.get(s_.get('id'), '')}"] + [brl(v) for v in por_ano] + [brl(tot)])
            if linhas:
                c.add(nova_tabela(["Solução"] + [f"Ano {i + 1}" for i in range(anos)] + ["Total"], linhas, [4.6] + [2.0] * anos + [2.6]))
        elif chave == "estimativa":
            c.pars(S.get("estimativa"))
            itens = docj.get("itens") or []
            if itens:
                ln, soma, falta = [], 0.0, False
                for it in itens:
                    q, vu = it.get("quantidade"), it.get("valor_unitario")
                    vt = None if q is None or vu is None else float(q) * float(vu)
                    if vt is None: falta = True
                    else: soma += vt
                    ln.append([str(it.get("item", "")), it.get("descricao", ""), it.get("unidade") or "", num(q), brl(vu), brl(vt)])
                c.add(nova_tabela(["Item", "Descrição", "Unidade", "Qtd.", "Valor unitário", "Valor total"], ln, [1.2, 6.3, 2, 1.6, 2.5, 2.4],
                                  total=["", "Total estimado", "", "", "", brl(None if falta else soma)]))
                c.add(novo_par("Estimativa preliminar (art. 18, § 1º, VI, da Lei nº 14.133/2021), a ser confirmada pela pesquisa de preços do art. 23.", tam=9))
        elif chave == "just_tecnica":
            c.pars(S.get("just_tecnica"))
            if S.get("parcelamento_tecnico"):
                c.sub("Do parcelamento da contratação decorrente de aspectos técnicos"); c.pars(S.get("parcelamento_tecnico"))
        elif chave == "just_economica":
            c.pars(S.get("just_economica"))
            if S.get("parcelamento_economico"):
                c.sub("Do parcelamento da contratação decorrente de aspectos econômicos"); c.pars(S.get("parcelamento_economico"))
        elif chave == "providencias":
            c.pars(S.get("providencias"))
            c.sub("Contratações correlatas e/ou interdependentes"); c.pars(S.get("correlatas") or ["Não foram identificadas contratações correlatas ou interdependentes."])
            c.sub("Impactos ambientais e medidas mitigadoras"); c.pars(S.get("ambientais") or ["[PREENCHER: impactos ambientais e medidas mitigadoras.]"])
        elif chave == "viabilidade":
            v = docj.get("viabilidade") or "[PREENCHER]"
            sol = f" A solução indicada é a Solução {escolhida} – {nome_sol.get(escolhida, '')}." if escolhida in nome_sol else ""
            c.add(novo_par(f"Com base nas análises deste estudo, declara-se que a contratação é: {v.upper()}.{sol}", negrito=True))
            c.sub("Justificativa"); c.pars(S.get("viabilidade_justificativa"))
            # referências e fontes, antes dos responsáveis
            if refs:
                c.sub("Referências")
                for j in refs:
                    c.add(novo_par((j.get("citacao_abnt") or f"{j.get('orgao','')} {j.get('numero','')}") + (f" Disponível em: {j['fonte_url']}." if j.get("fonte_url") else ""), tam=9))
            if pesquisa and (pesquisa.get("referencias") or pesquisa.get("precos_praticados")):
                c.sub("Fontes da pesquisa de mercado")
                for n, r in enumerate(pesquisa.get("referencias") or [], 1):
                    c.add(novo_par(f"[P{n}] {r['orgao']} ({r['municipio']}/{r['uf']}), {r.get('tipo','')}, publicada em {r['data']}. Disponível em: {r['link']}.", tam=9))
                for n, x in enumerate(pesquisa.get("precos_praticados") or [], 1):
                    c.add(novo_par(f"[C{n}] Compras.gov.br, preços praticados: {x['catalogo']}, unidade {x['unidade']}, {x['n']} compras, mediana {brl(x['mediana'])}. Disponível em: https://dadosabertos.compras.gov.br.", tam=9))
        elif chave == "responsaveis":
            c.add(novo_par(f"{respostas.get('municipio', '').strip() or '[PREENCHER: local]'}, {hoje.day} de {MESES[hoje.month - 1]} de {hoje.year}."))
            quadro = next((x for x in (el.itersiblings()) if x.tag == qn("w:tbl")), None)
            if quadro is not None:
                from docx.table import Table
                q = Table(quadro, w)
                trocar_texto_celula(q.rows[0].cells[0], "RESPONSÁVEL PELA ELABORAÇÃO")
                trocar_texto_celula(q.rows[0].cells[1], "RESPONSÁVEL PELO SETOR")
                for i, pre in enumerate(("elab", "resp")):
                    cel = q.rows[1].cells[i]
                    nome = respostas.get(pre + "_nome", "").strip() or "[PREENCHER: nome]"
                    cargo = respostas.get(pre + "_cargo", "").strip() or "[PREENCHER: cargo]"
                    mat = respostas.get(pre + "_matricula", "").strip()
                    trocar_texto_celula(cel, "\n\n_____________________________", negrito=False)
                    for linha, neg in ((nome, True), (cargo + (f" · Matrícula {mat}" if mat else ""), False)):
                        pp = cel.add_paragraph(); pp.alignment = WD_ALIGN_PARAGRAPH.CENTER; escrever(pp, linha, neg, 10)
                    cel.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif chave == "aprovacao":
            norma = "da Lei nº 14.133/2021" + (" e da Instrução Normativa SGD/ME nº 94/2022" if tic else "")
            c.add(novo_par(f"Aprovo este Estudo Técnico Preliminar e atesto sua conformidade às disposições {norma}."))
            quadro = next((x for x in el.itersiblings() if x.tag == qn("w:tbl")), None)
            if quadro is not None:
                from docx.table import Table
                q = Table(quadro, w)
                trocar_texto_celula(q.rows[0].cells[0], "AUTORIDADE MÁXIMA DA ÁREA DE TIC (OU AUTORIDADE SUPERIOR)" if tic else "AUTORIDADE COMPETENTE")
                cel = q.rows[-1].cells[0]
                trocar_texto_celula(cel, "\n\n_____________________________", negrito=False)
                aut = [x.strip() for x in re.split(r"[,;·]", respostas.get("autoridade", "")) if x.strip()]
                linhas_aut = ((aut[0], True), (" · ".join(aut[1:]) or "[PREENCHER: cargo]", False)) if aut else \
                    (("[PREENCHER: nome da autoridade]", True), ("[PREENCHER: cargo] · Matrícula [PREENCHER]", False))
                for linha, neg in linhas_aut:
                    pp = cel.add_paragraph(); pp.alignment = WD_ALIGN_PARAGRAPH.CENTER; escrever(pp, linha, neg, 10)
                cel.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            c.pars(S.get(chave))
            if not S.get(chave):
                c.add(novo_par("[PREENCHER]"))
        if chave not in ("responsaveis", "aprovacao"):
            c.espaco()

    # ---------------------------------------------------------------- anexo: só o que o assinante optou por completar depois
    pend = [t for t in (docj.get("pendencias") or []) if str(t).strip()]
    if pend:
        fim = novo_par(""); fim.add_run().add_break(WD_BREAK.PAGE)
        novo_par("ANEXO — INFORMAÇÕES PARA COMPLETAR (retire antes de juntar ao processo)", negrito=True, centro=True)
        novo_par("Estes são os pontos que você informou não ter no momento da elaboração. Eles estão destacados em amarelo no texto.", tam=10)
        for t in pend:
            novo_par("• " + t, tam=10)

    # segurança: nenhuma orientação em vermelho do modelo pode sobrar no documento
    vermelhos = [r for r in corpo.iter(qn("w:color")) if (r.get(qn("w:val")) or "").upper() in ("FF0000", "FF3333", "0000FF")]
    for cor in vermelhos:
        cor.set(qn("w:val"), "000000")
    def padronizar_fonte(raiz):
        for rf in raiz.iter(qn("w:rFonts")):
            for att in list(rf.attrib):
                if att.endswith("Theme"):
                    del rf.attrib[att]
            for k in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
                rf.set(qn(k), "Calibri")
    padronizar_fonte(w.element)
    padronizar_fonte(w.styles.element)
    for sec_ in w.sections:
        for parte in (sec_.header, sec_.footer, sec_.first_page_header, sec_.first_page_footer):
            try:
                padronizar_fonte(parte._element)
            except Exception:
                pass
    for st in w.styles:
        try:
            if st.font is not None: st.font.name = "Calibri"
        except Exception:
            pass
    w.core_properties.author = "Agente Licitacon"
    w.core_properties.title = "Estudo Técnico Preliminar"
    w.save(str(saida))
    return len(vermelhos)
