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
          "parcelamento_economico", "beneficios", "providencias", "correlatas", "ambientais", "viabilidade_justificativa",
          "forma_contratacao", "medicao", "particularidades", "riscos_texto"]
MODALIDADES = ["Pregão", "Concorrência", "Concurso", "Diálogo competitivo", "Dispensa", "Inexigibilidade", "Adesão a ata"]
CRITERIOS = ["Menor preço", "Maior desconto", "Melhor técnica ou conteúdo artístico", "Técnica e preço", "Maior retorno econômico", "Não se aplica"]
MODOS = ["Aberto", "Fechado", "Aberto e fechado", "Fechado e aberto", "Não se aplica"]
REGIMES = ["Não se aplica (fornecimento de bens)", "Empreitada por preço unitário", "Empreitada por preço global", "Empreitada integral",
           "Contratação por tarefa", "Contratação integrada", "Contratação semi-integrada", "Fornecimento e prestação de serviço associado",
           "Serviço por preço unitário"]

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
        "contratacao": {"type": "object", "description": "forma de contratação que decorre da solução escolhida (art. 18, VIII, da Lei 14.133/2021)", "properties": {
            "modalidade": {"type": "string", "enum": MODALIDADES, "description": "modalidade de licitação ou forma de contratação direta"},
            "fundamento_modalidade": {"type": "string", "description": "dispositivo legal e motivo, ex.: art. 6º, XLI, e art. 29: bem comum, padrões de desempenho definidos objetivamente"},
            "criterio": {"type": "string", "enum": CRITERIOS},
            "fundamento_criterio": {"type": "string", "description": "art. 33 e motivo"},
            "modo_disputa": {"type": "string", "enum": MODOS, "description": "art. 56"},
            "regime_execucao": {"type": "string", "enum": REGIMES, "description": "art. 46, para obras e serviços"},
            "registro_precos": {"type": "boolean", "description": "true se recomenda o Sistema de Registro de Preços (art. 82)"},
            "fundamento_srp": {"type": "string"},
            "do_requisitante": {"type": "boolean", "description": "true se modalidade e critério foram decididos pelo requisitante"}},
            "required": ["modalidade", "fundamento_modalidade", "criterio", "fundamento_criterio"]},
        "riscos": {"type": "array", "description": "matriz de riscos ESPECÍFICOS desta contratação (não genéricos): 5 a 10 riscos", "items": {"type": "object", "properties": {
            "risco": {"type": "string"}, "categoria": {"type": "string", "enum": ["Técnico", "Operacional", "Financeiro", "Jurídico"]},
            "fase": {"type": "string", "enum": ["Planejamento", "Seleção do fornecedor", "Execução contratual"]},
            "probabilidade": {"type": "string", "enum": ["Baixa", "Média", "Alta"]}, "impacto": {"type": "string", "enum": ["Baixo", "Médio", "Alto"]},
            "mitigacao": {"type": "string", "description": "medida preventiva e de contingência"}, "responsavel": {"type": "string", "description": "cargo ou unidade, ex.: fiscal técnico"}},
            "required": ["risco", "categoria", "probabilidade", "impacto", "mitigacao", "responsavel"]}},
        "viabilidade": {"type": "string", "enum": ["Viável", "Viável com restrições", "Inviável"]},
        "pendencias": LISTA,
        "jurisprudencia_ids": LISTA},
        "required": ["eh_tic", "categoria", "secoes", "solucoes", "contratacao", "riscos", "viabilidade", "pendencias"]},
}

INSTRUCOES = (
    "MODELO PADRÃO DO ETP (preencha cada chave de 'secoes' com parágrafos curtos, uma ideia por parágrafo; a numeração 2.1, 2.1.1 é "
    "automática, então não numere; use **negrito** só para o dado principal do parágrafo e '- ' para itens de lista):\n"
    "informacoes: previsão no Plano de Contratações Anual (inciso II) e alinhamento com o planejamento do órgão; "
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
    "ambientais e medidas mitigadoras (inciso XII); viabilidade_justificativa: posicionamento conclusivo (inciso XIII); "
    "forma_contratacao: por que a modalidade, o critério de julgamento, o modo de disputa e, se for o caso, o registro de preços decorrem da "
    "solução escolhida e do mercado (art. 18, VIII); medicao: só se o objeto for serviço (ou bem com serviço associado), como a execução será "
    "medida (indicadores, instrumento de medição de resultado, nível mínimo de serviço) e a forma e o prazo de pagamento; senão, lista vazia; "
    "particularidades: pontos próprios do tipo de objeto: serviço contínuo: vigência e prorrogação (arts. 106 e 107), transição entre contratos "
    "e repactuação ou reajuste; registro de preços: quantidades mínimas e máximas, órgãos participantes, adesões e risco de desabastecimento; "
    "obras e engenharia: licenças, projeto e prazos; TIC: compatibilidade, licenciamento e obsolescência; lista vazia se nada se aplicar; "
    "riscos_texto: um ou dois parágrafos apresentando a matriz de riscos (gestão de riscos do art. 18, X, e art. 22). "
    "contratacao: a modalidade e o critério recomendados para a solução escolhida, com fundamento legal (adesão a ata: art. 86; dispensa: inciso "
    "do art. 75; inexigibilidade: inciso do art. 74; bem ou serviço comum: pregão, art. 29; obra e serviço especial de engenharia: concorrência). "
    "Se o requisitante já decidiu a modalidade ou o critério, use exatamente a decisão dele (do_requisitante true) e só a fundamente; se pediu "
    "\"Analisar no ETP e recomendar\", recomende. riscos: matriz com riscos específicos desta contratação (técnicos, operacionais, "
    "financeiros e jurídicos), com probabilidade, impacto, medida de mitigação e responsável; nada genérico. "
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
    "Em tco e itens, todo componente precisa de valor_unitario e valores: use a mediana do preço praticado ([C#]) ou o valor unitário "
    "da contratação semelhante ([P#]) que você citou no texto; nunca deixe null quando o texto mencionar um valor. "
    "No texto, cite as fontes só pelo código [P#]/[C#], com órgão, número da contratação e valor; não escreva links (eles ficam na seção de referências). "
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
    c = docj.get("contratacao") or {}
    if c:
        partes.append(f"Forma de contratação recomendada: {c.get('modalidade','')} ({c.get('fundamento_modalidade','')}); critério: {c.get('criterio','')} "
                      f"({c.get('fundamento_criterio','')}); modo de disputa: {c.get('modo_disputa','')}; regime: {c.get('regime_execucao','')}; "
                      f"registro de preços: {'sim' if c.get('registro_precos') else 'não'}")
    for r_ in docj.get("riscos") or []:
        partes.append(f"Risco: {r_.get('risco')} ({r_.get('categoria')}, P {r_.get('probabilidade')}, I {r_.get('impacto')}) — mitigação: {r_.get('mitigacao')} — {r_.get('responsavel')}")
    partes.append(f"Declaração de viabilidade: {docj.get('viabilidade','')}")
    return "\n".join(partes)


def simulado(respostas):
    obj = respostas.get("objeto", "[PREENCHER: objeto]")
    s = {k: [f"[Texto de exemplo da seção '{k}'. Na elaboração real, o texto é redigido a partir das respostas e da pesquisa: {obj}.]"] for k in CHAVES}
    return {"eh_tic": False, "categoria": respostas.get("natureza", "Bem"), "secoes": s,
            "vida_util": {"anos": 5, "fundamento": "vida útil usual de equipamentos de informática na depreciação patrimonial"},
            "resumo": {"necessidade": "Substituir 40 notebooks obsoletos das escolas.", "solucao": "Aquisição com garantia on-site de 36 meses e manutenção nos anos 4 e 5.",
                       "por_que": "Menor custo total em 5 anos: R$ 236.000 contra R$ 288.000 da locação.", "custo_total": 236000, "horizonte": "5 anos (vida útil)"},
            "solucoes": [{"id": 1, "nome": "Aquisição com garantia de 36 meses", "descricao": "Compra dos equipamentos com garantia on-site.", "viavel": True, "custo_total": 236000,
                          "mercado": ["Foram encontradas 40 compras de notebooks no RJ nos últimos 12 meses [C1]; mediana de R$ 5.122 por unidade."],
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
            "contratacao": {"modalidade": "Pregão", "fundamento_modalidade": "Notebooks são bens comuns, com padrões de desempenho e qualidade definidos objetivamente por especificações usuais de mercado (art. 6º, XIII, e art. 29 da Lei nº 14.133/2021).",
                            "criterio": "Menor preço", "fundamento_criterio": "O critério de menor preço por item atende ao interesse público, pois a especificação mínima garante a qualidade (art. 33, I).",
                            "modo_disputa": "Aberto", "regime_execucao": "Não se aplica (fornecimento de bens)", "registro_precos": False,
                            "fundamento_srp": "A quantidade é certa e a entrega é única, sem necessidade de contratações frequentes (art. 82).", "do_requisitante": False},
            "riscos": [{"risco": "Equipamento entregue abaixo da especificação mínima", "categoria": "Técnico", "fase": "Execução contratual", "probabilidade": "Média", "impacto": "Alto",
                        "mitigacao": "Exigir ficha técnica na proposta e conferir cada unidade no recebimento provisório.", "responsavel": "Fiscal técnico"},
                       {"risco": "Licitação deserta ou fracassada por preço estimado defasado", "categoria": "Financeiro", "fase": "Seleção do fornecedor", "probabilidade": "Baixa", "impacto": "Médio",
                        "mitigacao": "Atualizar a pesquisa de preços antes da publicação do edital.", "responsavel": "Agente de contratação"},
                       {"risco": "Atraso na assistência técnica durante a garantia", "categoria": "Operacional", "fase": "Execução contratual", "probabilidade": "Média", "impacto": "Médio",
                        "mitigacao": "Prever prazo máximo de atendimento e multa por atraso no termo de referência.", "responsavel": "Gestor do contrato"}],
            "viabilidade": "Viável", "pendencias": [], "jurisprudencia_ids": []}


def gerar(docj, respostas, saida, logo=None, pesquisa=None, refs=None, conferencia=None):
    """ETP no formato Licitacon: cabeçalho institucional, seções numeradas com faixa cinza, parágrafos numerados em níveis
    (2.1, 2.1.1), quadros de identificação, de alternativas (uma tabela por solução), de requisitos e de custos, e fonte única."""
    from docx import Document
    from docx.enum.section import WD_SECTION
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt, RGBColor

    FONTE, TAM = "Arial", 10.5
    w = Document()
    sec = w.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21)
    sec.top_margin, sec.bottom_margin, sec.left_margin, sec.right_margin = Cm(2.2), Cm(2), Cm(2.5), Cm(2)
    sec.header_distance, sec.footer_distance = Cm(1), Cm(1)
    for st in w.styles:
        try:
            if st.font is not None:
                st.font.name = FONTE
                rpr = st.element.get_or_add_rPr(); rf = rpr.find(qn("w:rFonts"))
                if rf is None: rf = OxmlElement("w:rFonts"); rpr.append(rf)
                for k in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"): rf.set(qn(k), FONTE)
        except Exception:
            pass
    nrm = w.styles["Normal"]; nrm.font.size = Pt(TAM)
    nrm.paragraph_format.space_after = Pt(4); nrm.paragraph_format.line_spacing = 1.2

    tic = bool(docj.get("eh_tic"))
    S = docj.get("secoes") or {}
    hoje = datetime.date.today()
    sols = docj.get("solucoes") or []
    viaveis = [x for x in sols if x.get("viavel")]
    nome_sol = {x.get("id"): x.get("nome") for x in sols}
    escolhida = docj.get("escolhida")
    tco = docj.get("tco") or {}
    anos = max(1, int(tco.get("anos") or (docj.get("vida_util") or {}).get("anos") or 1))
    orgao = (respostas.get("orgao") or "[PREENCHER: órgão ou entidade]").strip()
    unidade = (respostas.get("unidade") or "").strip()
    processo = (respostas.get("processo") or "").strip() or "[PREENCHER: nº do processo]"
    municipio = (respostas.get("municipio") or "").strip() or "[PREENCHER: local]"

    # ------------------------------------------------------------------ primitivas
    def fmt(r, negrito=False, tam=None, cor=None, italico=False):
        r.font.name = FONTE; r.bold = negrito; r.italic = italico
        r.font.size = Pt(tam or TAM)
        if cor: r.font.color.rgb = RGBColor.from_string(cor)

    def escrever(p, texto, negrito=False, tam=None, cor=None, links=False):
        if not links:  # links só na seção de referências
            texto = re.sub(r"\s*\(?(Dispon[ií]vel em:?\s*)?https?://[^\s)]*[^\s).,;]\)?", "", str(texto))
            texto = re.sub(r"\.\s*\.", ".", texto)
        for trecho in re.split(r"(\[PREENCHER[^\]]*\]|\*\*[^*]+\*\*)", str(texto)):
            if not trecho:
                continue
            neg = negrito
            if trecho.startswith("**") and trecho.endswith("**"):
                trecho, neg = trecho[2:-2], True
            r = p.add_run(trecho); fmt(r, neg, tam, cor)
            if trecho.startswith("[PREENCHER"):
                r.font.highlight_color = 7

    def par(texto="", negrito=False, centro=False, tam=None, antes=0, depois=4, recuo=0.0, pendente=0.0, alinhar="j", cor=None, links=False):
        p = w.add_paragraph()
        p.alignment = {"j": WD_ALIGN_PARAGRAPH.JUSTIFY, "c": WD_ALIGN_PARAGRAPH.CENTER, "e": WD_ALIGN_PARAGRAPH.LEFT, "d": WD_ALIGN_PARAGRAPH.RIGHT}["c" if centro else alinhar]
        pf = p.paragraph_format
        pf.space_before, pf.space_after = Pt(antes), Pt(depois)
        if recuo or pendente:
            pf.left_indent = Cm(recuo + pendente); pf.first_line_indent = Cm(-pendente) if pendente else None
            if pendente:
                pf.tab_stops.add_tab_stop(Cm(recuo + pendente))
        if texto != "":
            escrever(p, texto, negrito, tam, cor, links)
        return p

    def sombrear(el_pr, cor):
        shd = OxmlElement("w:shd"); shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), cor)
        el_pr.append(shd)

    def secao(n, titulo):
        p = par("", antes=14, depois=6, alinhar="e")
        r = p.add_run(f"{n}.\t{titulo.upper()}"); fmt(r, True, 11)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(0.9))
        p.paragraph_format.keep_with_next = True
        sombrear(p._p.get_or_add_pPr(), "D9D9D9")
        return p

    def subsecao(cod, titulo):
        p = par("", antes=8, depois=4, alinhar="e", recuo=0.5)
        r = p.add_run(f"{cod}\t{titulo.upper()}"); fmt(r, True, 10.5)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(1.9))
        p.paragraph_format.keep_with_next = True
        sombrear(p._p.get_or_add_pPr(), "EDEDED")
        return p

    class Num:
        """Numeração dos parágrafos em níveis: 2.1, 2.1.1 ..."""
        def __init__(self, base): self.base, self.n = base, 0
        def p(self, texto, nivel_recuo=0.5):
            self.n += 1
            cod = f"{self.base}.{self.n}."
            larg = 0.4 + 0.22 * len(cod)
            pp = par("", recuo=nivel_recuo, pendente=larg)
            r = pp.add_run(cod + "\t"); fmt(r)
            escrever(pp, texto)
            return pp
        def varios(self, lista, nivel_recuo=0.5):
            sub = None
            for t in lista or []:
                t = str(t).strip()
                if not t:
                    continue
                if t.startswith("### "):  # subtítulo do agente vira um parágrafo em negrito numerado
                    self.p(f"**{t[4:].strip()}**", nivel_recuo); continue
                if t.startswith(("- ", "• ")) and self.n:
                    par("•\t" + t[2:].strip(), recuo=nivel_recuo + 0.4 + 0.22 * len(f"{self.base}.{self.n}."), pendente=0.5)
                    continue
                self.p(t, nivel_recuo)

    def celula_txt(cel, texto, negrito=False, tam=9.5, alinhar="e", fundo=None, cor=None):
        cel.text = ""
        p = cel.paragraphs[0]
        p.alignment = {"e": WD_ALIGN_PARAGRAPH.LEFT, "c": WD_ALIGN_PARAGRAPH.CENTER, "d": WD_ALIGN_PARAGRAPH.RIGHT, "j": WD_ALIGN_PARAGRAPH.JUSTIFY}[alinhar]
        p.paragraph_format.space_after = Pt(1); p.paragraph_format.space_before = Pt(1)
        linhas = texto if isinstance(texto, list) else [texto]
        for i, ln in enumerate(linhas):
            if i:
                p = cel.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.LEFT; p.paragraph_format.space_after = Pt(1)
            escrever(p, ln, negrito, tam, cor)
        if fundo:
            sombrear(cel._tc.get_or_add_tcPr(), fundo)

    def tabela(cab, linhas, larguras, total=None, alinhar=None, chave_valor=False):
        t = w.add_table(rows=0, cols=len(larguras))
        t.style = w.styles["Table Grid"]; t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.autofit = False
        tot = sum(larguras); prop = [l * 16.5 / tot for l in larguras]
        for i, gc in enumerate(t._tbl.tblGrid.findall(qn("w:gridCol"))):
            gc.set(qn("w:w"), str(int(Cm(prop[i]).twips)))
        al = alinhar or (["e"] + ["c"] * (len(larguras) - 1))
        if cab:
            row = t.add_row()
            trpr = row._tr.get_or_add_trPr(); h = OxmlElement("w:tblHeader"); h.set(qn("w:val"), "true"); trpr.append(h)
            for i, c in enumerate(cab):
                celula_txt(row.cells[i], c, True, 9, "c", "D9D9D9")
        for ln in linhas:
            row = t.add_row()
            for i, v in enumerate(ln):
                celula_txt(row.cells[i], v, chave_valor and i == 0, 9.5, "e" if chave_valor else al[i], "F2F2F2" if chave_valor and i == 0 else None)
        if total:
            row = t.add_row()
            for i, v in enumerate(total):
                celula_txt(row.cells[i], v, True, 9.5, al[i], "EDEDED")
        for row in t.rows:
            for i, c in enumerate(row.cells):
                c.width = Cm(prop[i])
        par("", depois=2)
        return t

    def quadro_solucao(x):
        """Uma tabela por solução, como nos ETPs dos tribunais: descrição, mercado, vantagens, desvantagens, riscos, custo, resultado."""
        t = w.add_table(rows=0, cols=2)
        t.style = w.styles["Table Grid"]; t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.autofit = False
        for i, gc in enumerate(t._tbl.tblGrid.findall(qn("w:gridCol"))):
            gc.set(qn("w:w"), str(int(Cm([3.6, 12.9][i]).twips)))
        res = ("INDICADA" if x.get("id") == escolhida else "ATENDE") if x.get("viavel") else "NÃO ATENDE / INVIÁVEL"
        linhas = [("Solução", f"{x.get('id')} – {x.get('nome', '')}", True),
                  ("Descrição", x.get("descricao", ""), False),
                  ("Pesquisa de mercado", [m for m in (x.get("mercado") or []) if str(m).strip()] or "—", False),
                  ("Vantagens", ["• " + v for v in (x.get("vantagens") or []) if str(v).strip()] or "—", False),
                  ("Desvantagens", ["• " + v for v in (x.get("desvantagens") or []) if str(v).strip()] or "—", False),
                  ("Riscos", ["• " + v for v in (x.get("riscos") or []) if str(v).strip()] or "—", False)]
        if x.get("viavel"):
            linhas.append(("Custo total", f"{brl(x.get('custo_total'))} em {num(anos)} ano(s)", True))
        else:
            linhas.append(("Motivo", x.get("motivo_inviabilidade") or "[PREENCHER]", False))
        linhas.append(("Resultado", res, True))
        for rot, val, neg in linhas:
            row = t.add_row()
            celula_txt(row.cells[0], rot, True, 9.5, "e", "F2F2F2")
            celula_txt(row.cells[1], val, neg, 9.5, "j" if not isinstance(val, list) else "e",
                       ("DCEFE4" if rot == "Resultado" and x.get("id") == escolhida else None))
        for row in t.rows:
            row.cells[0].width, row.cells[1].width = Cm(3.6), Cm(12.9)
        par("", depois=4)

    def campo(fld):
        p_run = OxmlElement("w:fldSimple"); p_run.set(qn("w:instr"), fld)
        r = OxmlElement("w:r"); rpr = OxmlElement("w:rPr"); rf = OxmlElement("w:rFonts")
        for k in ("w:ascii", "w:hAnsi"): rf.set(qn(k), FONTE)
        sz = OxmlElement("w:sz"); sz.set(qn("w:val"), "16"); rpr.append(rf); rpr.append(sz); r.append(rpr)
        t = OxmlElement("w:t"); t.text = "1"; r.append(t); p_run.append(r)
        return p_run

    # ------------------------------------------------------------------ cabeçalho e rodapé
    cab = sec.header; cab.is_linked_to_previous = False
    p0 = cab.paragraphs[0]; p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if logo:
        try:
            p0.add_run().add_picture(str(logo), height=Cm(1.6)); p0 = cab.add_paragraph(); p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        except Exception as e:
            print(f"logo não incluída ({type(e).__name__})")
    r = p0.add_run(orgao.upper()); fmt(r, True, 10)
    p0.paragraph_format.space_after = Pt(0)
    if unidade:
        pu = cab.add_paragraph(); pu.alignment = WD_ALIGN_PARAGRAPH.CENTER; pu.paragraph_format.space_after = Pt(0)
        r = pu.add_run(unidade.upper()); fmt(r, False, 9)
    ult = cab.paragraphs[-1]; ult.paragraph_format.space_after = Pt(6)
    rod = sec.footer; rod.is_linked_to_previous = False
    if respostas.get("rodape_incluir") == "Sim" and respostas.get("rodape", "").strip():
        pr = rod.paragraphs[0]; pr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = pr.add_run(re.sub(r"\s+", " ", respostas["rodape"].strip())[:500]); fmt(r, False, 8, "555555")
        pf = rod.add_paragraph()
    else:
        pf = rod.paragraphs[0]
    bdr = OxmlElement("w:pBdr"); top = OxmlElement("w:top")
    for k, v in (("w:val", "single"), ("w:sz", "4"), ("w:space", "4"), ("w:color", "999999")): top.set(qn(k), v)
    bdr.append(top); pf._p.get_or_add_pPr().append(bdr)
    pf.paragraph_format.tab_stops.add_tab_stop(Cm(16.5), WD_TAB_ALIGNMENT.RIGHT)
    r = pf.add_run(f"Estudo Técnico Preliminar – ETP · Processo {processo if not processo.startswith('[') else 'nº ____'}\tPágina "); fmt(r, False, 8, "555555")
    pf._p.append(campo("PAGE"))
    r = pf.add_run(" de "); fmt(r, False, 8, "555555")
    pf._p.append(campo("NUMPAGES"))

    # ------------------------------------------------------------------ corpo
    tit = par("", centro=True, antes=0, depois=2)
    r = tit.add_run("ESTUDO TÉCNICO PRELIMINAR"); fmt(r, True, 14)
    sub = par(re.sub(r"\s+", " ", (respostas.get("objeto") or "").strip())[:240], centro=True, depois=2, tam=10.5)
    par(f"Processo administrativo nº {processo}", centro=True, depois=10, tam=9.5)

    # 1. Identificação
    secao(1, "Identificação da unidade demandante")
    fiscais = [f.strip() for f in respostas.get("fiscais", "").splitlines() if f.strip()]
    ident = [["Órgão ou entidade", orgao],
             ["Unidade demandante", unidade or "[PREENCHER: unidade requisitante]"],
             ["Processo administrativo", processo],
             ["Responsável pela elaboração", " · ".join(x for x in [respostas.get("elab_nome", "").strip(), respostas.get("elab_cargo", "").strip()] if x) or "[PREENCHER]"],
             ["Responsável pelo setor", " · ".join(x for x in [respostas.get("resp_nome", "").strip(), respostas.get("resp_cargo", "").strip()] if x) or "[PREENCHER]"],
             ["Gestor do contrato", respostas.get("gestor", "").strip() or "[PREENCHER: nome, cargo e matrícula]"],
             ["Fiscal(is) do contrato", fiscais or "[PREENCHER: fiscais do contrato]"],
             ["Categoria do objeto", docj.get("categoria") or "[PREENCHER]"]]
    tabela(None, ident, [5, 11.5], chave_valor=True)
    rs = docj.get("resumo") or {}
    if rs:
        subsecao("1.1.", "Síntese do estudo")
        tabela(None, [l for l in [["Necessidade", rs.get("necessidade") or ""], ["Solução indicada", rs.get("solucao") or ""],
                                  ["Principal motivo", rs.get("por_que") or ""],
                                  ["Custo total estimado", brl(rs.get("custo_total")) + (f" ({rs['horizonte']})" if rs.get("horizonte") else "")],
                                  ["Viabilidade", docj.get("viabilidade") or ""]] if l[1]], [5, 11.5], chave_valor=True)

    # 2. Necessidade
    secao(2, "Descrição da necessidade da contratação")
    n2 = Num("2"); n2.varios(S.get("necessidade"))
    if S.get("motivacao") or S.get("negocio"):  # a subseção continua a numeração dos parágrafos (2.1, 2.2 ... 2.n)
        c2 = f"2.{n2.n + 1}"
        subsecao(c2 + ".", "Motivação e necessidades de negócio")
        n21 = Num(c2); n21.varios(S.get("motivacao")); n21.varios(S.get("negocio"))

    # 3. PCA e alinhamento
    secao(3, "Previsão no plano de contratações anual e alinhamento estratégico")
    Num("3").varios(S.get("informacoes") or ["[PREENCHER: previsão no Plano de Contratações Anual.]"])

    # 4. Requisitos
    secao(4, "Requisitos da contratação")
    k = 0
    for chave, titulo in (("tecnologicas", "Requisitos tecnológicos" if tic else "Requisitos técnicos"), ("requisitos", "Demais requisitos e sustentabilidade")):
        if S.get(chave):
            k += 1; subsecao(f"4.{k}.", titulo); Num(f"4.{k}").varios(S.get(chave))
    if S.get("area"):
        k += 1; subsecao(f"4.{k}.", "Área requisitante e gestão"); Num(f"4.{k}").varios(S.get("area"))

    # 5. Quantidades
    secao(5, "Estimativa das quantidades")
    Num("5").varios(S.get("demanda"))
    itens = docj.get("itens") or []
    if itens:
        tabela(["Item", "Especificação", "Unidade", "Quantidade"], [[str(it.get("item", "")), it.get("descricao", ""), it.get("unidade") or "—", num(it.get("quantidade"))] for it in itens],
               [1.2, 10.3, 2.5, 2.5], alinhar=["c", "j", "c", "c"])

    # 6. Levantamento de mercado
    secao(6, "Levantamento de mercado")
    subsecao("6.1.", "Contratações similares de outros órgãos e entidades")
    n61 = Num("6.1")
    n61.varios(S.get("levantamento"))
    refs_p = (pesquisa or {}).get("referencias") or []
    if refs_p:
        n61.p("Na pesquisa em bases oficiais (PNCP e Compras.gov.br), foram identificadas as seguintes contratações e atas semelhantes:")
        for n, r_ in enumerate(refs_p[:12], 1):
            par(f"•\t[P{n}] {r_['orgao']} ({r_['municipio']}/{r_['uf']}) – " + (r_.get("numero") or r_.get("tipo", "")) + f", publicada em {'/'.join(reversed(r_['data'].split('-'))) if r_.get('data') else ''}"
                + (f", valor total estimado {brl(r_.get('valor_total_estimado'))}" if r_.get("valor_total_estimado") else "") + ".", recuo=1.6, pendente=0.5, tam=9.5, alinhar="e")
    pp = (pesquisa or {}).get("precos_praticados") or []
    if pp:
        n61.p("Preços unitários praticados nos últimos 12 meses (módulo de pesquisa de preços do Compras.gov.br):")
        tabela(["Ref.", "Item do catálogo", "Unid.", "Compras", "Mínimo", "Mediana", "Máximo"],
               [[f"C{n}", f"{x['catalogo']} ({x.get('solucao', '')})", x["unidade"], str(x["n"]), brl(x["minimo"]), brl(x["mediana"]), brl(x["maximo"])] for n, x in enumerate(pp[:10], 1)],
               [1.0, 5.6, 1.2, 1.3, 2.4, 2.4, 2.6], alinhar=["c", "e", "c", "c", "d", "d", "d"])
    subsecao("6.2.", "Alternativas do mercado")
    Num("6.2").p("Considerando os requisitos desta demanda, identificaram-se as seguintes alternativas para atender à necessidade:")
    for x in sols:
        quadro_solucao(x)
    comp = docj.get("comparativo") or []
    n63 = Num("6.3")
    if comp and viaveis or S.get("comparativa") or S.get("inviaveis"):
        subsecao("6.3.", "Análise das alternativas e atendimento aos requisitos")
        n63.varios(S.get("comparativa"))
    if comp and viaveis:
        larg = [2.2, 6.3] + [8.0 / len(viaveis)] * len(viaveis)
        tabela(["Tipo", "Requisito"] + [f"Solução {x.get('id')}" for x in viaveis],
               [[r_.get("tipo", ""), r_.get("requisito", "")] + [((r_.get("avaliacao") or []) + [""] * len(viaveis))[i] for i in range(len(viaveis))] for r_ in comp], larg,
               alinhar=["c", "e"] + ["c"] * len(viaveis))
    n63.varios(S.get("inviaveis"))
    subsecao("6.4.", "Análise e comparação entre os custos totais das soluções")
    n64 = Num("6.4")
    vu = docj.get("vida_util") or {}
    if vu.get("anos"):
        n64.p(f"**Horizonte da análise: {num(vu.get('anos'))} anos**, correspondente à vida útil do objeto" + (f" ({vu['fundamento']})" if vu.get("fundamento") else "") + ". Todas as soluções foram comparadas nesse mesmo período, para a mesma quantidade e especificação.")
    n64.varios(S.get("custos"))
    for s_ in tco.get("solucoes") or []:
        comps = s_.get("componentes") or []
        par(f"Solução {s_.get('id')} – {nome_sol.get(s_.get('id'), '')}", negrito=True, antes=6, depois=3, alinhar="e")
        ln, soma, falta = [], 0.0, False
        for cp in comps:
            vs = list(cp.get("valores") or [])[:anos]
            tot_c = None if (not vs or any(v is None for v in vs)) else sum(float(v) for v in vs)
            if tot_c is None: falta = True
            else: soma += tot_c
            ln.append([cp.get("componente", ""), cp.get("unidade") or "—", num(cp.get("quantidade")) if cp.get("quantidade") is not None else "—",
                       brl(cp.get("valor_unitario")) if cp.get("valor_unitario") is not None else "—", brl(tot_c), cp.get("fonte", "")])
        tabela(["Componente de custo", "Unidade", "Qtd.", "Valor unitário", f"Total em {num(anos)} ano(s)", "Fonte"], ln, [5.4, 2.2, 1.4, 2.6, 3, 1.9],
               total=["Custo total da solução", "", "", "", brl(None if falta else soma), ""], alinhar=["e", "c", "c", "d", "d", "c"])
    if len(tco.get("solucoes") or []) > 1:
        par("Mapa comparativo", negrito=True, antes=6, depois=3, alinhar="e")
        linhas_m = []
        for s_ in tco.get("solucoes") or []:
            por_ano = []
            for i_ in range(anos):
                vs = [(cp.get("valores") or [])[i_] if i_ < len(cp.get("valores") or []) else None for cp in s_.get("componentes") or []]
                por_ano.append(None if (not vs or any(v is None for v in vs)) else sum(float(v) for v in vs))
            tot_s = None if any(v is None for v in por_ano) else sum(por_ano)
            linhas_m.append([f"Solução {s_.get('id')} – {nome_sol.get(s_.get('id'), '')}"] + [brl(v) for v in por_ano] + [brl(tot_s)])
        if anos <= 3:
            tabela(["Solução"] + [f"Ano {i_ + 1}" for i_ in range(anos)] + ["Total"], linhas_m, [5.5] + [2.6] * anos + [3], alinhar=["e"] + ["d"] * (anos + 1))
        else:  # muitos anos: total e média anual (mais fácil de comparar)
            def media(v):
                try:
                    return brl(float(str(v).replace("R$", "").replace(".", "").replace(",", ".").strip()) / anos)
                except ValueError:
                    return v
            tabela(["Solução", f"Total em {num(anos)} anos", "Média por ano"], [[l_[0], l_[-1], media(l_[-1])] for l_ in linhas_m], [9, 4, 3.5], alinhar=["e", "d", "d"])

    # 7. Estimativa do valor
    secao(7, "Estimativa preliminar do valor da contratação")
    n7 = Num("7")
    n7.varios(S.get("estimativa"))
    if itens:
        ln, soma, falta = [], 0.0, False
        for it in itens:
            q, v_u = it.get("quantidade"), it.get("valor_unitario")
            vt = None if q is None or v_u is None else float(q) * float(v_u)
            if vt is None: falta = True
            else: soma += vt
            ln.append([str(it.get("item", "")), it.get("descricao", ""), it.get("unidade") or "—", num(q), brl(v_u), brl(vt)])
        tabela(["Item", "Descrição", "Unidade", "Qtd.", "Valor unitário (mediana)", "Valor total"], ln, [1.1, 6.6, 1.9, 1.5, 2.7, 2.7],
               total=["", "TOTAL ESTIMADO", "", "", "", brl(None if falta else soma)], alinhar=["c", "j", "c", "c", "d", "d"])
        n7.p("Estimativa preliminar (art. 18, § 1º, VI, da Lei nº 14.133/2021), a ser confirmada pela pesquisa de preços do art. 23, cujos documentos integram os autos.")

    # 8. Escolha da solução
    secao(8, "Escolha da solução")
    subsecao("8.1.", "Descrição da solução escolhida")
    n81 = Num("8.1")
    if escolhida in nome_sol:
        n81.p(f"**Solução {escolhida} – {nome_sol.get(escolhida)}.**")
    subsecao("8.2.", "Justificativa")
    n82 = Num("8.2"); n82.varios(S.get("just_tecnica")); n82.varios(S.get("just_economica"))
    ct = docj.get("contratacao") or {}
    if ct or S.get("forma_contratacao"):
        subsecao("8.3.", "Forma de contratação recomendada")
        n83 = Num("8.3")
        if ct:
            n83.p("Decorre da solução escolhida e do mercado pesquisado a seguinte forma de contratação (art. 18, VIII, da Lei nº 14.133/2021)"
                  + (", conforme a decisão da área requisitante:" if ct.get("do_requisitante") else ", que se recomenda à autoridade competente:"))
            linhas = [["Modalidade / forma", [f"**{ct.get('modalidade', '')}**", ct.get("fundamento_modalidade", "")]],
                      ["Critério de julgamento", [f"**{ct.get('criterio', '')}**", ct.get("fundamento_criterio", "")]]]
            if ct.get("modo_disputa") and ct["modo_disputa"] != "Não se aplica":
                linhas.append(["Modo de disputa", ct["modo_disputa"]])
            if ct.get("regime_execucao") and not ct["regime_execucao"].startswith("Não se aplica"):
                linhas.append(["Regime de execução", ct["regime_execucao"]])
            if ct.get("registro_precos") is not None:
                linhas.append(["Registro de preços", [f"**{'Sim' if ct.get('registro_precos') else 'Não'}**"] + ([ct["fundamento_srp"]] if ct.get("fundamento_srp") else [])])
            tabela(None, linhas, [4.2, 12.3], chave_valor=True)
        n83.varios(S.get("forma_contratacao"))

    # 9..16
    secao(9, "Descrição da solução como um todo")
    n9 = Num("9"); n9.varios(S.get("solucao"))
    k9 = n9.n
    for chave, titulo in (("medicao", "Execução, medição e pagamento"), ("particularidades", "Aspectos específicos do objeto")):
        if [t_ for t_ in (S.get(chave) or []) if str(t_).strip()]:
            k9 += 1; subsecao(f"9.{k9}.", titulo); Num(f"9.{k9}").varios(S.get(chave))
    secao(10, "Justificativas para o parcelamento ou não da solução")
    n10 = Num("10"); n10.varios(S.get("parcelamento_tecnico")); n10.varios(S.get("parcelamento_economico"))
    parc = sem_acento(respostas.get("parcelamento", ""))
    divisivel = "PARCELAR" in parc and "NAO" not in parc
    par("Avaliação da divisibilidade do objeto considerando o mercado fornecedor:", negrito=True, antes=4, recuo=0.5)
    par(f"( {'x' if divisivel else ' '} ) É possível a contratação de forma divisível, sem prejuízo técnico, econômico ou de competitividade (adjudicação por item).", recuo=0.5, tam=10)
    par(f"( {' ' if divisivel else 'x'} ) Os itens devem ser agrupados para fornecimento por uma única empresa (adjudicação por lote ou global).", recuo=0.5, tam=10)
    secao(11, "Resultados pretendidos")
    Num("11").varios(S.get("beneficios"))
    secao(12, "Providências prévias à contratação")
    Num("12").varios(S.get("providencias") or ["Não se aplica."])
    secao(13, "Contratações correlatas e/ou interdependentes")
    Num("13").varios(S.get("correlatas") or ["Não há contratações correlatas ou interdependentes."])
    secao(14, "Possíveis impactos ambientais e medidas mitigadoras")
    Num("14").varios(S.get("ambientais") or ["[PREENCHER: impactos ambientais e medidas mitigadoras.]"])
    secao(15, "Análise de riscos")
    n15 = Num("15")
    n15.varios(S.get("riscos_texto") or ["Foram identificados os riscos específicos desta contratação, com as medidas de prevenção e de contingência e os responsáveis por acompanhá-los (art. 18, X, e art. 22 da Lei nº 14.133/2021):"])
    rk = docj.get("riscos") or []
    if rk:
        cores = {"Alta": "F4CCCC", "Alto": "F4CCCC", "Média": "FCE8B2", "Médio": "FCE8B2", "Baixa": "D9EAD3", "Baixo": "D9EAD3"}
        t_r = tabela(["Nº", "Risco", "Categoria", "Prob.", "Impacto", "Medida de mitigação", "Responsável"],
                     [[str(i_), r_.get("risco", "") + (f" ({r_['fase']})" if r_.get("fase") else ""), r_.get("categoria", ""), r_.get("probabilidade", ""),
                       r_.get("impacto", ""), r_.get("mitigacao", ""), r_.get("responsavel", "")] for i_, r_ in enumerate(rk, 1)],
                     [0.9, 3.5, 2.4, 1.5, 1.8, 4.0, 2.7], alinhar=["c", "e", "c", "c", "c", "e", "c"])
        for row in t_r.rows[1:]:
            for ci in (3, 4):
                cor_ = cores.get(row.cells[ci].text.strip())
                if cor_: sombrear(row.cells[ci]._tc.get_or_add_tcPr(), cor_)
    secao(16, "Posicionamento conclusivo sobre a adequação da contratação")
    Num("16").varios(S.get("viabilidade_justificativa"))
    secao(17, "Declaração de viabilidade da contratação")
    v = docj.get("viabilidade") or "[PREENCHER]"
    Num("17").p(f"Com base nos estudos e justificativas apresentados, declara-se que a contratação é **{v.upper()}**"
                + (f", sendo indicada a Solução {escolhida} – {nome_sol.get(escolhida)}" if escolhida in nome_sol else "") + ".")

    n_sec = 17
    if refs or refs_p or pp:
        n_sec += 1; secao(n_sec, "Referências")
        for j in refs or []:
            par("•\t" + (j.get("citacao_abnt") or f"{j.get('orgao','')} {j.get('numero','')}") + (f" Disponível em: {j['fonte_url']}." if j.get("fonte_url") else ""), recuo=0.5, pendente=0.5, tam=9.5, alinhar="e", links=True)
        for n, r_ in enumerate(refs_p[:12], 1):
            par(f"•\t[P{n}] {r_['orgao'].upper()}. " + (r_.get("numero") or r_.get("tipo", "")) + f". {r_.get('objeto', '')[:180]}"
                + f" Portal Nacional de Contratações Públicas (PNCP), publicada em {'/'.join(reversed(r_['data'].split('-'))) if r_.get('data') else ''}. Disponível em: {r_['link']}.",
                recuo=0.5, pendente=0.5, tam=9, alinhar="e", links=True)
        for n, x in enumerate(pp[:10], 1):
            par(f"•\t[C{n}] BRASIL. Compras.gov.br – dados abertos, módulo de pesquisa de preços: {x['catalogo']}, {x['n']} compras dos últimos 12 meses. "
                "Disponível em: https://dadosabertos.compras.gov.br.", recuo=0.5, pendente=0.5, tam=9, alinhar="e", links=True)

    # responsáveis e aprovação
    n_sec += 1; secao(n_sec, "Responsáveis pela elaboração")
    par(f"{municipio}, {hoje.day} de {MESES[hoje.month - 1]} de {hoje.year}.", alinhar="d", antes=4, depois=18)
    t = w.add_table(rows=1, cols=2); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, pre in enumerate(("elab", "resp")):
        cel = t.rows[0].cells[i]; cel.text = ""
        nome = respostas.get(pre + "_nome", "").strip() or "[PREENCHER: nome]"
        cargo = respostas.get(pre + "_cargo", "").strip() or "[PREENCHER: cargo]"
        mat = respostas.get(pre + "_matricula", "").strip()
        p_ = cel.paragraphs[0]; p_.alignment = WD_ALIGN_PARAGRAPH.CENTER; escrever(p_, "\n\n________________________________", False, 10)
        for linha, neg, tam_ in ((nome.upper(), True, 10), (cargo + (f" · Matrícula {mat}" if mat else ""), False, 9.5),
                                 ("Responsável pela elaboração" if pre == "elab" else "Responsável pelo setor", False, 9)):
            q = cel.add_paragraph(); q.alignment = WD_ALIGN_PARAGRAPH.CENTER; q.paragraph_format.space_after = Pt(0); escrever(q, linha, neg, tam_)
    n_sec += 1; secao(n_sec, "Aprovação do estudo técnico preliminar")
    norma = "da Lei nº 14.133/2021" + (" e da Instrução Normativa SGD/ME nº 94/2022" if tic else "")
    par(f"Aprovo este Estudo Técnico Preliminar e atesto sua conformidade às disposições {norma}.", recuo=0.5, antes=2, depois=18).paragraph_format.keep_with_next = True
    aut = [x.strip() for x in re.split(r"[,;·]", respostas.get("autoridade", "")) if x.strip()]
    bloco = [par("________________________________", centro=True, antes=12, depois=0),
             par((aut[0] if aut else "[PREENCHER: nome da autoridade]").upper(), negrito=True, centro=True, depois=0),
             par(" · ".join(aut[1:]) if len(aut) > 1 else "[PREENCHER: cargo e matrícula]", centro=True, tam=9.5, depois=0),
             par("Autoridade competente", centro=True, tam=9, depois=0)]
    for b_ in bloco[:-1]:
        b_.paragraph_format.keep_with_next = True

    # anexo: só o que o assinante optou por completar depois
    pend = [t_ for t_ in (docj.get("pendencias") or []) if str(t_).strip()]
    if pend:
        q = par(""); q.add_run().add_break(WD_BREAK.PAGE)
        par("ANEXO – INFORMAÇÕES PARA COMPLETAR (retire antes de juntar ao processo)", negrito=True, centro=True, depois=6)
        par("Estes são os pontos que você informou não ter no momento da elaboração. Eles estão destacados em amarelo no texto.", tam=9.5)
        for t_ in pend:
            par("•\t" + t_, recuo=0.5, pendente=0.5, tam=10, alinhar="e")

    w.core_properties.author = "Licitacon"
    w.core_properties.title = "Estudo Técnico Preliminar"
    w.save(str(saida))
    return 0
