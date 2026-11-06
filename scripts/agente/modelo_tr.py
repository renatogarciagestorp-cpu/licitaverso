#!/usr/bin/env python3
"""Termo de Referência de COMPRAS (aquisições, exceto TIC) no modelo da AGU (Lei 14.133/2021, versão dez/2025):
agente/modelos/tr-compras-agu.docx.

O arquivo da AGU é preenchido mantendo a numeração automática, os estilos e as cláusulas padrão. Das cláusulas
alternativas ("OU") fica só a escolhida; as opcionais que não se aplicam saem; os campos entre colchetes e reticências
são preenchidos com os dados do requisitante e o texto do agente; o vermelho e o itálico do modelo (marcas de cláusula
variável) viram texto normal. O Anexo I (regras do instrumento substitutivo ao contrato) e o Anexo II (termo de ciência)
só ficam quando a contratação dispensar o termo de contrato (art. 95 da Lei 14.133/2021).

Os índices dos parágrafos abaixo são os do modelo de dez/2025; conferir() verifica o início de cada um e acusa se a AGU
mudar o arquivo.
"""
import copy, datetime, json, pathlib, re

RAIZ = pathlib.Path(__file__).resolve().parents[2]
MODELO = RAIZ / "agente" / "modelos" / "tr-compras-agu.docx"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
LISTA = {"type": "array", "items": {"type": "string"}}
NUM = {"type": ["number", "null"]}

# início do texto de parágrafos-chave do modelo (conferência de versão)
ANCORAS = {0: "MODELO DE TERMO DE REFERÊNCIA", 6: "Aquisição de [INSERIR OBJETO]", 10: "Os bens objeto desta contratação são caracterizados como comuns",
           14: "O prazo de vigência da contratação é de [indicar o prazo]", 23: "O objeto da contratação está previsto no Plano",
           34: "Sustentabilidade", 45: "Da exigência de amostra", 64: "Subcontratação", 80: "Garantia da contratação", 111: "Reserva de cotas",
           118: "MODELO DE EXECUÇÃO DO OBJETO", 126: "Garantia, manutenção e assistência técnica", 159: "Além do disposto acima",
           188: "Moratória, para as infrações", 221: "O recebimento definitivo ocorrerá", 256: "Antecipação de pagamento", 280: "Os preços inicialmente contratados",
           290: "O fornecedor será selecionado por meio da realização", 323: "balanço patrimonial", 332: "Qualificação Técnica", 351: "O custo estimado total",
           363: "As despesas decorrentes", 374: "As informações contidas neste Termo", 378: "ANEXO I", 401: "OBRIGAÇÕES DO CONTRATANTE", 480: "Fica definido o Foro",
           482: "ANEXO II", 487: "(Nome e Cargo do Representante Legal)"}

FERRAMENTA = {
    "name": "entregar_documento",
    "description": "Entrega o Termo de Referência de compras no modelo da AGU: as escolhas de cada cláusula e os textos variáveis.",
    "input_schema": {"type": "object", "properties": {
        "objeto": {"type": "string", "description": "frase do item 1.1, começando por 'Aquisição de ...', com instalação ou montagem se houver; sem 'nos termos da tabela abaixo'"},
        "itens": {"type": "array", "description": "tabela do item 1.1: um por item da compra", "items": {"type": "object", "properties": {
            "item": {"type": "string"}, "especificacao": {"type": "string", "description": "especificação objetiva, sem marca (salvo art. 41, I), suficiente para julgar a proposta"},
            "catmat": {"type": "string", "description": "código CATMAT se informado; senão vazio"}, "unidade": {"type": "string"},
            "quantidade": NUM, "valor_unitario": NUM}, "required": ["item", "especificacao", "unidade", "quantidade"]}},
        "natureza_bem": {"type": "string", "enum": ["comum", "especial"]},
        "vigencia": {"type": "object", "properties": {
            "tipo": {"type": "string", "enum": ["unica", "continuado", "emergencial"], "description": "unica: entrega única ou parcelada sem continuidade (art. 105); continuado: fornecimento contínuo (arts. 106 e 107); emergencial: art. 75, VIII"},
            "prazo": {"type": "string", "description": "ex.: 12 (doze) meses"}, "termo_inicial": {"type": "string", "description": "com a preposição, ex.: da assinatura do contrato"},
            "justificativa_continuado": {"type": "string", "description": "só no fornecimento continuado: por que é continuado e por que a vigência plurianual é mais vantajosa"}},
            "required": ["tipo", "prazo", "termo_inicial"]},
        "sustentabilidade": {**LISTA, "description": "requisitos de sustentabilidade ESPECÍFICOS do bem (Guia Nacional de Contratações Sustentáveis da AGU); lista vazia se não houver"},
        "marcas": {"type": "string", "description": "marcas ou modelos admitidos como referência (art. 41, I) e a justificativa; vazio se não houver"},
        "amostra": {"type": "object", "properties": {"exigir": {"type": "boolean"}, "itens": LISTA, "endereco": {"type": "string"}, "prazo": {"type": "string"},
                                                     "aspectos": {**LISTA, "description": "aspectos e padrões mínimos avaliados, por item"}}},
        "carta_solidariedade": {"type": "boolean", "description": "true só se a execução depender do fabricante (revenda de bem de alta complexidade); motive em pendencias se duvidoso"},
        "subcontratacao": {"type": "object", "properties": {"permitir": {"type": "boolean"}, "limite_pct": NUM, "vedadas": LISTA, "permitidas": LISTA}},
        "garantia_contratacao": {"type": "object", "properties": {"exigir": {"type": "boolean"}, "percentual": NUM, "base": {"type": "string", "enum": ["total", "anual"]},
                                                                  "motivo": {"type": "string"}}},
        "cota_reservada": {"type": "boolean", "description": "true se houver cota de até 25% para ME/EPP (bem divisível, art. 48, III, da LC 123/2006)"},
        "entrega": {"type": "object", "properties": {
            "parcelada": {"type": "boolean"}, "prazo_dias": NUM, "termo_inicial": {"type": "string", "description": "com a preposição, ex.: do recebimento da nota de empenho"},
            "parcelas": {"type": "array", "items": {"type": "object", "properties": {"parcela": {"type": "string"}, "composicao": {"type": "string"}, "prazo": {"type": "string"}}}},
            "antecedencia_dias": NUM, "endereco": {"type": "string"}, "perecivel_validade": {"type": "string", "description": "só para perecíveis: ex.: 12 (doze) meses ou dois terços do prazo de validade"}},
            "required": ["parcelada", "endereco"]},
        "garantia_bem": {"type": "object", "properties": {"tipo": {"type": "string", "enum": ["legal", "contratual"]}, "meses": NUM, "prazo_reparo_dias": NUM},
                         "required": ["tipo"]},
        "rotinas_fiscalizacao": {**LISTA, "description": "rotinas específicas de fiscalização do objeto; vazio se as cláusulas padrão bastam"},
        "multas": {"type": "object", "properties": {"moratoria_pct": NUM, "moratoria_dias": NUM,
                                                    "comp_eh": LISTA, "comp_c": LISTA, "comp_b": LISTA, "comp_d": LISTA, "comp_a": LISTA,
                                                    "recolhimento_dias": NUM},
                   "description": "percentuais (texto, ex.: ['10','20']) dentro do limite do art. 156, § 3º (0,5% a 30% do valor do contrato)"},
        "recebimento": {"type": "object", "properties": {"substituicao_dias": NUM, "definitivo_dias": NUM, "definitivo_pequeno_dias": NUM}},
        "indice_correcao": {"type": "string", "description": "índice de correção monetária por atraso no pagamento, ex.: IPCA"},
        "reajuste": {"type": "object", "properties": {"data_orcamento": {"type": "string", "description": "dd/mm/aaaa"}, "indice": {"type": "string", "description": "ex.: IPCA (IBGE)"}}},
        "selecao": {"type": "object", "properties": {
            "tipo": {"type": "string", "enum": ["licitacao", "direta"]}, "modalidade": {"type": "string", "enum": ["PREGÃO", "CONCORRÊNCIA"]},
            "criterio": {"type": "string", "enum": ["MENOR PREÇO", "MAIOR DESCONTO", "TÉCNICA E PREÇO"]},
            "artigo": {"type": "string", "enum": ["74", "75"]}, "inciso": {"type": "string"}, "fundamento": {"type": "string"}},
            "required": ["tipo"]},
        "forma_fornecimento": {"type": "string", "enum": ["integral", "parcelado", "continuado"]},
        "registro_precos": {"type": "boolean"},
        "habilitacao": {"type": "object", "properties": {
            "autorizacao": {"type": "string", "description": "ato de autorização da atividade exigido por lei (ex.: licença da ANVISA), com o órgão e a norma; vazio se não houver"},
            "exercicios": {"type": "string", "enum": ["do último exercício social", "dos dois últimos exercícios sociais"]},
            "capital_tipo": {"type": "string", "enum": ["capital mínimo", "patrimônio líquido mínimo"]}, "capital_pct": NUM,
            "registro_entidade": {"type": "string", "description": "conselho profissional exigido por lei para o fornecedor; vazio se não houver"},
            "atestado": {"type": "boolean"}, "caracteristicas": {**LISTA, "description": "características mínimas dos atestados (parcelas de maior relevância, até 50% do quantitativo, art. 67, § 2º)"},
            "requisitos_lei": {"type": "string", "description": "requisito previsto em lei especial (art. 67, IV), com a lei; vazio se não houver"},
            "sem_tecnica": {"type": "string", "description": "se não houver qualificação técnica, a justificativa em uma frase"}}},
        "estimativa": {"type": "object", "properties": {"valor_total": NUM, "sigiloso": {"type": "boolean"}, "valor_referencia_desconto": NUM},
                       "required": ["sigiloso"]},
        "dotacao": {"type": "object", "properties": {"informar": {"type": "boolean"}, "gestao": {"type": "string"}, "fonte": {"type": "string"},
                                                     "programa": {"type": "string"}, "elemento": {"type": "string"}, "plano_interno": {"type": "string"}}},
        "instrumento": {"type": "string", "enum": ["contrato", "substitutivo_pequeno_valor", "substitutivo_entrega_imediata"],
                        "description": "substitutivo só se o contrato puder ser substituído por nota de empenho ou equivalente (art. 95)"},
        "prazo_decisao": {"type": "string", "description": "prazo para a Administração decidir requerimentos, ex.: 1 (um) mês (art. 92, X e XI)"},
        "pendencias": LISTA,
        "jurisprudencia_ids": LISTA},
        "required": ["objeto", "itens", "natureza_bem", "vigencia", "entrega", "garantia_bem", "selecao", "forma_fornecimento", "estimativa", "instrumento", "pendencias"]},
}

INSTRUCOES = (
    "MODELO DA AGU – TERMO DE REFERÊNCIA DE COMPRAS (Lei 14.133/2021, art. 6º, XXIII, e art. 40, § 1º). O texto padrão da AGU já está "
    "pronto: você só escolhe as cláusulas alternativas e preenche os dados variáveis pela ferramenta. Regras: (1) use as decisões do "
    "requisitante (modalidade, critério, adjudicação, prazo, entrega, garantia) sem trocá-las; (2) especificação objetiva e sem marca, "
    "salvo o art. 41, I, motivado; (3) amostra só se indispensável para aferir a qualidade (art. 41, II), e restrita ao primeiro colocado; "
    "(4) qualificação técnica mínima e proporcional (art. 67): atestado só de parcelas de maior relevância e até 50% do quantitativo; em "
    "compras simples e de pronta entrega, normalmente dispensável (diga por quê em habilitacao.sem_tecnica); (5) garantia da contratação "
    "(arts. 96 a 98) só se o risco justificar, até 5% (10% com análise de risco); (6) multas dentro do art. 156, § 3º (0,5% a 30%), "
    "moratória com teto em dias; (7) reajuste pelo índice do contrato contado da data do orçamento estimado (art. 25, § 7º); "
    "(8) cota reservada de até 25% para ME/EPP em bem divisível (art. 48, III, da LC 123/2006) quando cabível; (9) instrumento substitutivo "
    "(nota de empenho) só nas hipóteses do art. 95; (10) o que o requisitante não informou e você não pode presumir vai para pendencias, "
    "e o campo correspondente fica com [PREENCHER: ...]. Escreva em português claro e impessoal."
)


def brl(v):
    try:
        return "R$ " + f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return "[PREENCHER: valor]"


def num(v, casas=0):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return ""
    return f"{f:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".") if casas else f"{f:,.0f}".replace(",", ".") if f == int(f) else f"{f:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


EXTENSO = {1: "um", 2: "dois", 3: "três", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez", 12: "doze", 15: "quinze",
           20: "vinte", 24: "vinte e quatro", 25: "vinte e cinco", 30: "trinta", 36: "trinta e seis", 45: "quarenta e cinco", 48: "quarenta e oito", 60: "sessenta", 90: "noventa"}


def n_ext(v, padrao=""):
    """'10 (dez)' quando conhece o extenso; senão só o número."""
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return padrao
    return f"{n} ({EXTENSO[n]})" if n in EXTENSO else str(n)


def pct(v):
    try:
        f = float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return "[PREENCHER: %]"
    s = (f"{f:.2f}".rstrip("0").rstrip(".")).replace(".", ",")
    return s + "%"


def faixa(v, a, b):
    v = v or [a, b]
    return pct(v[0]) + " a " + pct(v[1] if len(v) > 1 else v[0])


def de(termo):
    """'assinatura do contrato' -> 'da assinatura do contrato' (o texto da AGU usa 'contados do(a)')."""
    t = (termo or "").strip()
    if re.match(r"^(d[oa]s?|a partir)\b", t, re.I):
        return t
    return ("da " if re.match(r"^(assinatura|data|emiss|publica|ordem|notifica|entrega)", t, re.I) else "do ") + t


def federal(respostas):
    t = (respostas.get("orgao", "") + " " + respostas.get("esfera", "")).lower()
    return bool(re.search(r"federal|minist[ée]rio|uni[ãa]o\b|ag[êe]ncia nacional|comando d|ex[ée]rcito|marinha|aeron[áa]utica|ibama|inss|funai|anvisa", t))


def texto_plano(docj):
    """Texto corrido, para a conferência pelo agente analisador."""
    p = ["TERMO DE REFERÊNCIA – COMPRAS", "Objeto: " + docj.get("objeto", "")]
    for it in docj.get("itens") or []:
        p.append(f"Item {it.get('item')}: {it.get('especificacao')} · {num(it.get('quantidade'))} {it.get('unidade', '')} · {brl(it.get('valor_unitario'))}")
    for k in ("natureza_bem", "vigencia", "sustentabilidade", "marcas", "amostra", "carta_solidariedade", "subcontratacao", "garantia_contratacao", "cota_reservada",
              "entrega", "garantia_bem", "rotinas_fiscalizacao", "multas", "recebimento", "reajuste", "selecao", "forma_fornecimento", "registro_precos",
              "habilitacao", "estimativa", "dotacao", "instrumento"):
        if docj.get(k) not in (None, "", [], {}):
            p.append(f"{k}: {docj.get(k)}")
    return "\n".join(p)


def simulado(respostas):
    obj = respostas.get("objeto") or "notebooks para as escolas municipais"
    return {"objeto": f"Aquisição de {obj}",
            "itens": [{"item": "1", "especificacao": "Notebook com processador de 8 núcleos, 16 GB de memória, SSD de 512 GB, tela de 15,6\", garantia on-site de 36 meses",
                       "catmat": "", "unidade": "unidade", "quantidade": 40, "valor_unitario": 5122.0},
                      {"item": "2", "especificacao": "Mouse óptico USB", "catmat": "", "unidade": "unidade", "quantidade": 40, "valor_unitario": 38.5}],
            "natureza_bem": "comum",
            "vigencia": {"tipo": "unica", "prazo": "12 (doze) meses", "termo_inicial": "da assinatura do contrato"},
            "sustentabilidade": ["Os equipamentos deverão possuir certificação de eficiência energética ou etiqueta equivalente.",
                                 "O fornecedor deverá recolher as embalagens e os resíduos do fornecimento, para destinação ambientalmente adequada (Lei nº 12.305/2010)."],
            "marcas": "", "amostra": {"exigir": False}, "carta_solidariedade": False,
            "subcontratacao": {"permitir": False}, "garantia_contratacao": {"exigir": False, "motivo": "entrega única e garantia do produto suficiente"},
            "cota_reservada": True,
            "entrega": {"parcelada": False, "prazo_dias": 30, "termo_inicial": "do recebimento da nota de empenho", "antecedencia_dias": 5,
                        "endereco": respostas.get("local") or "Almoxarifado Central, Rua Exemplo, 100, Centro"},
            "garantia_bem": {"tipo": "contratual", "meses": 36, "prazo_reparo_dias": 10},
            "rotinas_fiscalizacao": [],
            "multas": {"moratoria_pct": 0.5, "moratoria_dias": 30, "comp_eh": ["20", "30"], "comp_c": ["10", "30"], "comp_b": ["5", "20"], "comp_d": ["5", "15"], "comp_a": ["0,5", "5"], "recolhimento_dias": 20},
            "recebimento": {"substituicao_dias": 10, "definitivo_dias": 10, "definitivo_pequeno_dias": 5},
            "indice_correcao": "IPCA", "reajuste": {"data_orcamento": "", "indice": "IPCA (IBGE)"},
            "selecao": {"tipo": "licitacao", "modalidade": "PREGÃO", "criterio": "MENOR PREÇO"}, "forma_fornecimento": "integral", "registro_precos": False,
            "habilitacao": {"exercicios": "do último exercício social", "capital_tipo": "patrimônio líquido mínimo", "capital_pct": 10, "atestado": True,
                            "caracteristicas": ["Fornecimento de, no mínimo, 20 (vinte) notebooks, correspondente a 50% do quantitativo do item 1."]},
            "estimativa": {"valor_total": 206420.0, "sigiloso": False},
            "dotacao": {"informar": False}, "instrumento": "contrato", "prazo_decisao": "1 (um) mês", "pendencias": []}


# ------------------------------------------------------------------------------------------------- preenchimento do Word
def itens_da_pesquisa(R):
    """Itens que vieram da Pesquisa de preços do site (descrição, unidade, quantidade, preço unitário, CATMAT e lote)."""
    try:
        lista = json.loads(R.get("itens_pp") or "[]")
    except Exception:
        return []
    return [x for x in lista if isinstance(x, dict) and (x.get("desc") or "").strip()]


def mesclar_itens(itens_agente, pp):
    """A tabela do item 1.1 segue a pesquisa de preços: quantidade, unidade, preço e CATMAT nunca vêm do agente.
    A especificação redigida pelo agente é aproveitada quando o número de itens bate."""
    if not pp:
        return itens_agente or []
    ag = itens_agente or []
    mesmo = len(ag) == len(pp)
    out = []
    for i, x in enumerate(pp):
        espec = (ag[i].get("especificacao") if mesmo else "") or x.get("desc")
        lote = (x.get("lote") or "").strip()
        out.append({"item": str(x.get("n") or i + 1), "especificacao": (lote + " – " if lote else "") + espec,
                    "catmat": str(x.get("catmat") or ""), "unidade": x.get("un") or "unidade",
                    "quantidade": x.get("qtd"), "valor_unitario": x.get("vu")})
    return out


def gerar(docj, respostas, saida, logo=None):
    from docx import Document
    from docx.oxml.ns import qn
    from docx.shared import RGBColor, Cm
    from docx.table import Table

    d = Document(str(MODELO))
    P = list(d.paragraphs)
    T = list(d.tables)
    conferir(P)
    apagar = set()
    textos = {}  # índice -> texto novo
    listas = {}  # índice -> lista de textos (o parágrafo vira o primeiro, os demais são clonados depois dele)

    def faixa_ap(a, b):
        apagar.update(range(a, b + 1))

    R = respostas
    fed = federal(R)
    v = docj.get("vigencia") or {}
    ent = docj.get("entrega") or {}
    gb = docj.get("garantia_bem") or {}
    sel = docj.get("selecao") or {}
    hab = docj.get("habilitacao") or {}
    est = dict(docj.get("estimativa") or {})
    pp = itens_da_pesquisa(R)
    itens_tab = mesclar_itens(docj.get("itens"), pp)
    if pp:  # o valor total é o da pesquisa, item a item
        tot = sum(float(x.get("qtd") or 0) * float(x.get("vu") or 0) for x in pp)
        if tot > 0:
            est["valor_total"] = round(tot, 2)
    dot = dict(docj.get("dotacao") or {})
    # dotação informada no formulário vai direto ao item 11 (prevalece sobre o texto do agente)
    resolvidas = []
    for k, rk, chave in (("gestao", "dot_unidade", "unidade"), ("programa", "dot_programa", "programa de trabalho"),
                         ("elemento", "dot_elemento", "elemento de despesa"), ("fonte", "dot_fonte", "fonte de recursos")):
        if (R.get(rk) or "").strip():
            dot[k] = R[rk].strip().rstrip(";.")
            dot["informar"] = True
            resolvidas.append(chave)
    mul = docj.get("multas") or {}
    rec = docj.get("recebimento") or {}
    am = docj.get("amostra") or {}
    sub = docj.get("subcontratacao") or {}
    gc = docj.get("garantia_contratacao") or {}
    inst = docj.get("instrumento") or "contrato"
    srp = bool(docj.get("registro_precos"))
    PRE = lambda o: f"[PREENCHER: {o}]"

    # capa do modelo e identificação
    apagar.update({0, 1})
    textos[2] = (R.get("orgao") or PRE("órgão ou entidade")).upper()
    textos[3] = f"(Processo Administrativo nº {R.get('processo') or PRE('número do processo')})"

    # 1. condições gerais
    obj = (docj.get("objeto") or "Aquisição de " + (R.get("objeto") or PRE("objeto"))).rstrip(". ")
    textos[6] = obj + ", nos termos da tabela abaixo, conforme condições e exigências estabelecidas neste instrumento."
    faixa_ap(7, 9)  # estimativas por órgão participante (registro de preços com participantes)
    apagar_tabelas = {1, 2, 3}
    apagar.update({12} if docj.get("natureza_bem") != "especial" else {10})
    apagar.add(11)
    tipo_v = v.get("tipo") or "unica"
    prazo_v, ini_v = v.get("prazo") or PRE("prazo de vigência"), de(v.get("termo_inicial") or "da assinatura do contrato")
    apagar.update({15, 18})
    if tipo_v == "continuado":
        apagar.update({14, 19})
        textos[16] = f"O prazo de vigência da contratação é de {prazo_v} contados {ini_v}, prorrogável por até 10 anos, na forma dos artigos 106 e 107 da Lei nº 14.133, de 2021."
        textos[17] = "O fornecimento de bens é enquadrado como continuado tendo em vista que " + (v.get("justificativa_continuado") or PRE("motivo da continuidade e da vantagem da vigência plurianual"))
    elif tipo_v == "emergencial":
        apagar.update({14, 16, 17})
        textos[19] = f"O prazo de vigência da contratação é de {prazo_v} contados {ini_v}, improrrogável, na forma do art. 75, inciso VIII, da Lei nº 14.133, de 2021."
    else:
        apagar.update({16, 17, 19})
        textos[14] = f"O prazo de vigência da contratação é de {prazo_v} contados {ini_v}, na forma do artigo 105 da Lei nº 14.133, de 2021."

    # 2. fundamentação e PCA
    ano_pca = R.get("pca_ano") or str(datetime.date.today().year)
    apagar.add(29)
    if R.get("pca_id_item") or R.get("pca_id"):
        apagar.add(30)
        textos[23] = f"O objeto da contratação está previsto no Plano de Contratações Anual {ano_pca}, conforme detalhamento a seguir:"
        for i, (rot, k) in zip(range(24, 29), [("ID PCA no PNCP", "pca_id"), ("Data de publicação no PNCP", "pca_data"), ("Id do item no PCA", "pca_id_item"),
                                               ("Classe/Grupo", "pca_classe"), ("Identificador da Futura Contratação", "pca_futura")]):
            if R.get(k):
                textos[i] = f"{rot}: {R.get(k)};"
            else:
                apagar.add(i)
    elif R.get("pca_item") or (R.get("pca") or "").lower().startswith("sim") or R.get("pca_ano"):
        faixa_ap(23, 28)
        item = (R.get("pca_item") or "").strip().rstrip(".")
        m = re.search(r"20\d\d", item)
        ano_pca = R.get("pca_ano") or (m.group(0) if m else ano_pca)
        item = re.sub(r"^PCA\s+20\d\d\s*[,:–-]\s*", "", item)
        textos[30] = (f"O objeto da contratação está previsto no Plano de Contratações Anual {ano_pca}" + (f", no item {item}." if item else ", conforme consta das informações básicas deste Termo de Referência."))
    else:
        faixa_ap(23, 30)

    # 4. requisitos
    sus = [s for s in docj.get("sustentabilidade") or [] if s.strip()]
    if sus:
        apagar.update({37, 38}); listas[36] = sus
    else:
        faixa_ap(34, 38)
    if (docj.get("marcas") or "").strip():
        textos[40] = "Na presente contratação será admitida a indicação da(s) seguinte(s) marca(s), característica(s) ou modelo(s), de acordo com as justificativas contidas nos Estudos Técnicos Preliminares: " + docj["marcas"].strip().rstrip(".") + "."
    else:
        faixa_ap(39, 40)
    faixa_ap(41, 44)  # vedação de marca: depende de processo próprio de qualificação
    if am.get("exigir") and am.get("itens"):
        apagar.update({49, 50}); listas[48] = [x.rstrip(";.") + ";" for x in am["itens"]]
        textos[51] = f"As amostras poderão ser entregues no endereço {am.get('endereco') or ent.get('endereco') or PRE('endereço')}, no prazo limite de {am.get('prazo') or PRE('prazo')}, sendo que a empresa assume total responsabilidade pelo envio e por eventual atraso na entrega."
        asp = am.get("aspectos") or [PRE("aspectos avaliados e padrões mínimos")]
        apagar.add(56); listas[55] = asp
        textos[60] = "Após a divulgação do resultado final do certame, as amostras entregues deverão ser recolhidas pelos fornecedores no prazo de 30 (trinta) dias, após o qual poderão ser descartadas pela Administração, sem direito a ressarcimento."
    else:
        faixa_ap(45, 61)
    if not docj.get("carta_solidariedade"):
        faixa_ap(62, 63)
    apagar.add(66)
    if sub.get("permitir"):
        apagar.add(65)
        textos[67] = f"É permitida a subcontratação parcial do objeto, até o limite de {pct(sub.get('limite_pct') or 25)} do valor total do contrato, nas seguintes condições:"
        ved = sub.get("vedadas") or []
        if ved:
            apagar.update({70, 71}); listas[69] = ved
        else:
            faixa_ap(68, 71)
        per = sub.get("permitidas") or []
        if per:
            apagar.update({74, 75}); listas[73] = per
        else:
            faixa_ap(72, 75)
    else:
        faixa_ap(67, 79)
    apagar.add(82)
    if gc.get("exigir"):
        apagar.add(81)
        textos[83] = ("Será exigida a garantia da contratação de que tratam os arts. 96 e seguintes da Lei nº 14.133, de 2021, com validade durante a execução do contrato e 90 (noventa) dias "
                      "após término da vigência contratual, podendo o Contratado optar pela caução em dinheiro ou em títulos da dívida pública, seguro-garantia, fiança bancária ou título de "
                      f"capitalização, em valor correspondente a {pct(gc.get('percentual') or 5)} do valor {gc.get('base') or 'total'} da contratação.")
    else:
        faixa_ap(83, 110)
        if gc.get("motivo"):
            textos[81] = "Não haverá exigência da garantia da contratação dos arts. 96 e seguintes da Lei nº 14.133, de 2021, pelas razões constantes do Estudo Técnico Preliminar: " + gc["motivo"].rstrip(".") + "."
    if not docj.get("cota_reservada"):
        faixa_ap(111, 115)
    faixa_ap(116, 117)  # margem de preferência: depende de decreto específico do produto

    # 5. execução
    apagar.add(121)
    apagar_tab4 = False
    if ent.get("parcelada") and ent.get("parcelas"):
        apagar.add(120)
    else:
        apagar.add(122); apagar_tab4 = True
        textos[120] = f"O prazo de entrega dos bens é de {n_ext(ent.get('prazo_dias'), PRE('prazo'))} dias, contados {de(ent.get('termo_inicial') or 'do recebimento da nota de empenho')}, em remessa única."
    textos[123] = (f"Caso não seja possível a entrega na data assinalada, a empresa deverá comunicar as razões respectivas com pelo menos {n_ext(ent.get('antecedencia_dias') or 5)} dias de antecedência "
                   "para que qualquer pleito de prorrogação de prazo seja analisado, ressalvadas situações de caso fortuito e força maior.")
    textos[124] = "Os bens deverão ser entregues no seguinte endereço: " + (ent.get("endereco") or R.get("local") or PRE("endereço de entrega")).rstrip(".") + "."
    if (ent.get("perecivel_validade") or "").strip():
        textos[125] = f"No caso de produtos perecíveis, o prazo de validade na data da entrega não poderá ser inferior a {ent['perecivel_validade'].strip().rstrip('.')}."
    else:
        apagar.add(125)
    apagar.add(128)
    if gb.get("tipo") == "contratual":
        apagar.add(127)
        textos[129] = (f"O prazo de garantia contratual dos bens, complementar à garantia legal, será de, no mínimo, {n_ext(gb.get('meses'), PRE('meses'))} meses, ou pelo prazo fornecido "
                       "pelo fabricante, se superior, contado a partir do primeiro dia útil subsequente à data do recebimento definitivo do objeto.")
        textos[135] = (f"Uma vez notificado, o Contratado realizará a reparação ou substituição dos bens que apresentarem vício ou defeito no prazo de até {n_ext(gb.get('prazo_reparo_dias') or 10)} "
                       "dias úteis, já incluído nesse prazo o tempo necessário para eventual retirada e devolução do bem, a cargo do Contratado.")
    else:
        faixa_ap(129, 139)
        textos[127] = "O prazo de garantia é aquele estabelecido na Lei nº 8.078, de 11 de setembro de 1990 (Código de Defesa do Consumidor)."

    # 6. gestão
    rot = docj.get("rotinas_fiscalizacao") or []
    if rot:
        apagar.update({161, 162}); listas[160] = rot
    else:
        faixa_ap(159, 162)

    # 7. sanções
    textos[188] = (f"Moratória, para as infrações descritas no item “d”, de {pct(mul.get('moratoria_pct') or 0.5)} por dia de atraso injustificado sobre o valor da parcela inadimplida, "
                   f"até o limite de {n_ext(mul.get('moratoria_dias') or 30)} dias;")
    if not gc.get("exigir"):
        apagar.update({189, 190})
    textos[191] = f"Compensatória, para as infrações descritas acima nas alíneas “e” a “h”, de {faixa(mul.get('comp_eh'), 20, 30)} do valor da contratação;"
    textos[192] = f"Compensatória, para a inexecução total do contrato prevista acima na alínea “c”, de {faixa(mul.get('comp_c'), 10, 30)} do valor da contratação;"
    textos[193] = f"Compensatória, para a infração descrita acima na alínea “b”, de {faixa(mul.get('comp_b'), 5, 20)} do valor da contratação;"
    textos[194] = f"Compensatória, em substituição à multa moratória para a infração descrita acima na alínea “d”, de {faixa(mul.get('comp_d'), 5, 15)} do valor da contratação;"
    textos[195] = f"Compensatória, para a infração descrita acima na alínea “a”, de {faixa(mul.get('comp_a'), 0.5, 5)} do valor da contratação."
    apagar.add(196)
    textos[201] = f"A multa poderá ser recolhida administrativamente no prazo máximo de {n_ext(mul.get('recolhimento_dias') or 20)} dias, a contar da data do recebimento da comunicação enviada pela autoridade competente."

    # 8. medição e pagamento
    textos[220] = ("Os bens poderão ser rejeitados, no todo ou em parte, inclusive antes do recebimento provisório, quando em desacordo com as especificações constantes no Termo de Referência e na "
                   f"proposta, devendo ser substituídos no prazo de {n_ext(rec.get('substituicao_dias') or 10)} dias, a contar da notificação da contratada, às suas custas, sem prejuízo da aplicação das penalidades.")
    textos[221] = (f"O recebimento definitivo ocorrerá no prazo de {n_ext(rec.get('definitivo_dias') or 10)} dias úteis, a contar do recebimento da nota fiscal ou instrumento de cobrança equivalente "
                   "pela Administração, após a verificação da qualidade e quantidade do material e consequente aceitação mediante termo detalhado.")
    textos[222] = ("Para as contratações decorrentes de despesas cujos valores não ultrapassem o limite de que trata o inciso II do art. 75 da Lei nº 14.133, de 2021, o prazo máximo para o "
                   f"recebimento definitivo será de até {n_ext(rec.get('definitivo_pequeno_dias') or 5)} dias úteis.")
    textos[249] = ("No caso de atraso pelo Contratante, os valores devidos ao Contratado serão atualizados monetariamente entre o termo final do prazo de pagamento até a data de sua efetiva "
                   f"realização, mediante aplicação do índice {docj.get('indice_correcao') or 'IPCA'} de correção monetária.")
    faixa_ap(256, 271)  # antecipação de pagamento (excepcional, art. 145)
    rj = docj.get("reajuste") or {}
    textos[280] = f"Os preços inicialmente contratados são fixos e irreajustáveis no prazo de um ano contado da data do orçamento estimado, em {rj.get('data_orcamento') or R.get('data_orcamento') or PRE('data do orçamento estimado, dd/mm/aaaa')}."
    textos[281] = (f"Após o interregno de um ano, e independentemente de pedido do Contratado, os preços iniciais serão reajustados, mediante a aplicação, pelo Contratante, do índice "
                   f"{rj.get('indice') or 'IPCA (IBGE)'}, exclusivamente para as obrigações iniciadas e concluídas após a ocorrência da anualidade.")

    # 9. seleção e habilitação
    apagar.add(291)
    if sel.get("tipo") == "direta":
        apagar.add(290)
        textos[292] = (f"O fornecedor será selecionado por meio de contratação direta com fundamento no art. {sel.get('artigo') or '75'}, inciso {sel.get('inciso') or PRE('inciso')}, da "
                       f"Lei nº 14.133, de 1º de abril de 2021, com base no seguinte fundamento: {(sel.get('fundamento') or PRE('fundamento')).rstrip('.')}.")
    else:
        apagar.add(292)
        textos[290] = (f"O fornecedor será selecionado por meio da realização de procedimento de LICITAÇÃO, na modalidade {sel.get('modalidade') or 'PREGÃO'}, sob a forma ELETRÔNICA, "
                       f"com adoção do critério de julgamento pelo {sel.get('criterio') or 'MENOR PREÇO'}.")
    textos[294] = f"O fornecimento do objeto será {docj.get('forma_fornecimento') or 'integral'}."
    if srp:
        textos[297] = "Valores unitários: conforme tabela constante do item 1.1 deste Termo de Referência."
    else:
        faixa_ap(295, 297)
    if (hab.get("autorizacao") or "").strip():
        textos[309] = "Ato de autorização para o exercício da atividade: " + hab["autorizacao"].strip().rstrip(".") + "."
    else:
        apagar.add(309)
    exer = hab.get("exercicios") or "do último exercício social"
    textos[323] = (f"balanço patrimonial, demonstração de resultado de exercício e demais demonstrações contábeis {exer}, já exigíveis e apresentados na forma da lei, comprovando "
                   "índices de Liquidez Geral (LG), Liquidez Corrente (LC) e Solvência Geral (SG) superiores a 1 (um), obtidos por meio da aplicação das seguintes fórmulas:")
    textos[326] = ("Caso a empresa interessada apresente resultado inferior ou igual a 1 (um) em qualquer dos índices de Liquidez Geral (LG), Solvência Geral (SG) e Liquidez Corrente (LC), "
                   f"será exigido para fins de habilitação {hab.get('capital_tipo') or 'patrimônio líquido mínimo'} de {pct(hab.get('capital_pct') or 10)} do valor total estimado da contratação"
                   + (" ou do item pertinente." if len(docj.get("itens") or []) > 1 else "."))
    if exer.startswith("do último"):
        apagar.add(327)
    tem_tec = False
    if (hab.get("registro_entidade") or "").strip():
        tem_tec = True
        textos[333] = f"Registro ou inscrição da empresa na entidade profissional competente ({hab['registro_entidade'].strip().rstrip('.')}), em plena validade;"
    else:
        apagar.update({333, 334})
    if hab.get("atestado"):
        tem_tec = True
        car = hab.get("caracteristicas") or []
        if car:
            apagar.update({338, 339}); listas[337] = car
        else:
            faixa_ap(336, 339)
    else:
        faixa_ap(335, 342)
    if (hab.get("requisitos_lei") or "").strip():
        tem_tec = True
        textos[343] = "Prova de atendimento aos requisitos previstos em lei especial: " + hab["requisitos_lei"].strip().rstrip(".") + "."
    else:
        apagar.add(343)
    if not tem_tec:
        mot = (hab.get("sem_tecnica") or "por se tratar de aquisição de bem comum de pronta entrega, sem complexidade que a justifique (art. 67 da Lei nº 14.133, de 2021)").strip().rstrip(".")
        if len(mot) > 1 and mot[0].isupper() and mot[1].islower():
            mot = mot[0].lower() + mot[1:]
        mot = re.sub(r"^trata-se de ", "por se tratar de ", mot)
        textos[333] = "Não será exigida qualificação técnica, " + mot + "."
        apagar.discard(333)

    # 10. estimativa
    apagar.add(353)
    if est.get("sigiloso"):
        apagar.update({351, 352})
    else:
        faixa_ap(354, 355)
        textos[351] = (f"O custo estimado total da contratação, que corresponde ao valor máximo aceitável, é de {brl(est.get('valor_total')) if est.get('valor_total') else PRE('valor')}, "
                       "conforme custos unitários apostos na tabela contida no item 1.1 acima.")
        if sel.get("criterio") == "MAIOR DESCONTO" and est.get("valor_referencia_desconto"):
            textos[352] = f"O valor de referência para aplicação do maior desconto corresponde a {brl(est.get('valor_referencia_desconto'))}."
        else:
            apagar.add(352)
    apagar.add(356)  # matriz de risco no contrato: só em contratações de grande vulto ou com matriz própria
    if not srp:
        faixa_ap(357, 361)

    # 11. adequação orçamentária
    fora_da_estrutura = []
    apagar.add(371)
    if dot.get("informar"):
        apagar.add(372)
        if not fed:
            textos[363] = f"As despesas decorrentes da presente contratação correrão à conta de recursos específicos consignados no orçamento do(a) {R.get('orgao') or 'Contratante'}."
        for i, (rot, k) in zip(range(365, 370), [("Gestão/unidade" if fed else "Unidade orçamentária", "gestao"), ("Fonte de recursos", "fonte"), ("Programa de trabalho", "programa"),
                                                 ("Elemento de despesa", "elemento"), ("Plano interno", "plano_interno")]):
            # gestão/unidade e plano interno são da estrutura federal: fora dela, só entram se o órgão informou
            if dot.get(k) and not (not fed and k in ("gestao", "plano_interno") and "PREENCHER" in str(dot[k])):
                textos[i] = f"{rot}: {dot[k]};"
            elif dot.get(k):
                fora_da_estrutura.append("gestão" if k == "gestao" else rot.split("/")[0].lower())
            else:
                apagar.add(i)
    else:
        faixa_ap(363, 370)

    # 12. disposições finais e assinatura
    textos[374] = "As informações contidas neste Termo de Referência não são classificadas como sigilosas" + (", exceto o custo estimado da contratação, que possui caráter sigiloso até o julgamento das propostas." if est.get("sigiloso") else ".")
    hoje = datetime.date.today()
    textos[375] = f"{R.get('municipio') or PRE('local')}, {hoje.day} de {MESES[hoje.month - 1]} de {hoje.year}."
    nome = (R.get("elab_nome") or "").strip()
    textos[377] = (nome + (" – " + R.get("elab_cargo") if R.get("elab_cargo") else "") + (" – Matrícula " + R.get("elab_matricula") if R.get("elab_matricula") else "")) if nome else "Identificação e assinatura do servidor (ou equipe) responsável"

    # Anexos I e II: só sem termo de contrato (art. 95)
    if inst == "contrato":
        apagar.update(range(378, len(P)))
    else:
        apagar.update({381, 380 if inst == "substitutivo_entrega_imediata" else 382})
        textos[385] = ("O adjudicatário terá o prazo de 5 (cinco) dias úteis, contado a partir da data de sua convocação, para aceitar o instrumento equivalente ao contrato "
                       "(nota de empenho), sob pena de decair do direito à contratação, sem prejuízo das sanções previstas.")
        textos[389] = ("o Contratado se vincula à sua proposta e às previsões contidas no " + ("Aviso de Contratação Direta" if sel.get("tipo") == "direta" else "Edital")
                       + ", no Termo de Referência e em seus anexos, conforme Termo de Ciência e Concordância (Anexo II).")
        apagar.update({393, 399})
        if tipo_v == "continuado":
            apagar.update({391, 392, 400})
        elif tipo_v == "emergencial":
            apagar.update(range(391, 399))
            textos[400] = f"O prazo de vigência da contratação é de {prazo_v} contados {ini_v}, improrrogável, na forma do art. 75, VIII, da Lei nº 14.133, de 2021."
        else:
            apagar.update(range(394, 399)); apagar.add(400)
        if not fed:
            textos[409] = "Cientificar o órgão de representação judicial do Contratante para adoção das medidas cabíveis quando do descumprimento de obrigações pelo Contratado;"
        prz = docj.get("prazo_decisao") or "1 (um) mês"
        textos[411] = f"A Administração terá o prazo de {prz}, a contar da data do protocolo do requerimento para decidir, admitida a prorrogação motivada, por igual período."
        textos[412] = f"Responder eventuais pedidos de restabelecimento do equilíbrio econômico-financeiro feitos pelo Contratado no prazo máximo de {prz}."
        if not gc.get("exigir"):
            apagar.add(413)
        apagar.update({454, 459})
        if tipo_v == "continuado":
            apagar.update(range(449, 454)); apagar.add(460)
        elif tipo_v == "emergencial":
            apagar.update(range(449, 459))
        else:
            apagar.update(range(455, 459)); apagar.add(460)
        mun, uf = R.get("municipio") or PRE("município"), (R.get("uf") or "").upper()
        textos[480] = ((f"Fica definido o Foro da Justiça Federal em {mun}, Seção Judiciária de {uf or PRE('UF')}" if fed else f"Fica definido o Foro da Comarca de {mun}" + (f"/{uf}" if uf else ""))
                       + " para dirimir os litígios que decorrerem da execução contratual que não puderem ser compostos pela conciliação, conforme art. 92, § 1º, da Lei nº 14.133, de 2021.")
        textos[484] = ("Por meio deste instrumento, ..................... (identificar o Contratado) declara que está ciente e concorda com as disposições e obrigações previstas no "
                       + ("Aviso de Contratação Direta" if sel.get("tipo") == "direta" else "Edital") + ", no Termo de Referência e nos demais anexos, bem como que se responsabiliza, sob as penas "
                       "da Lei, pela veracidade e legitimidade das informações e documentos apresentados durante o processo de contratação.")

    # separadores "OU" que restaram
    for i, p in enumerate(P):
        if p.text.strip().upper() == "OU":
            apagar.add(i)

    # ---- aplica: textos e listas antes de apagar (os índices são do modelo original)
    for i, t in textos.items():
        if i not in apagar:
            escrever(P[i], t)
    for i, itens in listas.items():
        if i in apagar or not itens:
            continue
        escrever(P[i], itens[0])
        ant = P[i]._p
        for t in itens[1:]:
            novo = copy.deepcopy(P[i]._p)
            ant.addnext(novo)
            from docx.text.paragraph import Paragraph
            escrever(Paragraph(novo, P[i]._parent), t)
            ant = novo
    # tabela de itens (1.1)
    preencher_itens(T[0], itens_tab, est.get("sigiloso"))
    if not apagar_tab4 and ent.get("parcelas"):
        preencher_linhas(T[4], [[x.get("parcela", ""), x.get("composicao", ""), x.get("prazo", "")] for x in ent["parcelas"]])
    for k in sorted(apagar_tabelas | ({4} if apagar_tab4 else set()), reverse=True):
        T[k]._tbl.getparent().remove(T[k]._tbl)
    for i in sorted(apagar, reverse=True):
        el = P[i]._p
        if el.getparent() is not None:
            el.getparent().remove(el)

    # ---- aparência: o vermelho, o itálico e os realces do modelo marcam cláusula variável; no documento final, texto normal
    for st in d.styles:
        try:
            f = st.font
            if f is not None:
                if f.color is not None and f.color.rgb is not None and str(f.color.rgb) != "000000":
                    f.color.rgb = RGBColor(0, 0, 0)
                if f.italic:
                    f.italic = False
        except Exception:
            pass
    # as cláusulas opcionais têm recuo próprio no modelo; no documento final, mesmo recuo das cláusulas fixas do mesmo nível
    pares = [("Nível 2-Opcional", "Nível 02"), ("Nivel 2-Opcional", "Nível 02"), ("Nível 3-Opcional", "Nivel 3"), ("Nível 4-R", "Nivel 4")]
    nomes = {st.name: st for st in d.styles}
    for op, fixo in pares:
        if op in nomes and fixo in nomes:
            a_, b_ = nomes[op].paragraph_format, nomes[fixo].paragraph_format
            for k in ("left_indent", "first_line_indent"):
                setattr(a_, k, getattr(b_, k))
            ppr_o, ppr_f = nomes[op].element.pPr, nomes[fixo].element.pPr
            if ppr_o is not None and ppr_f is not None:
                ind_f = ppr_f.find(qn("w:ind")); ind_o = ppr_o.find(qn("w:ind"))
                if ind_o is not None: ppr_o.remove(ind_o)
                if ind_f is not None: ppr_o.append(copy.deepcopy(ind_f))
    for p in d.paragraphs:
        for r in p.runs:
            limpar_run(r, RGBColor)
    for t in d.tables:
        for row in t.rows:
            for c in row.cells:
                for p in c.paragraphs:
                    for r in p.runs:
                        limpar_run(r, RGBColor)
    # rodapé do modelo (identificação da AGU) vira o rodapé do órgão; o número da página fica
    from docx.oxml.ns import qn as _qn
    rod = [(R.get("orgao") or "").strip() or "Termo de Referência", "Termo de Referência" + (f" – Processo nº {R.get('processo')}" if R.get("processo") else "")]
    for sec in d.sections:
        for ft in (sec.footer, sec.even_page_footer, sec.first_page_footer):
            try:
                ps = ft._element.findall(".//" + _qn("w:p"))
            except Exception:
                continue
            k = 0
            for pe in ps:
                txt = "".join(t.text or "" for t in pe.iter(_qn("w:t")))
                if re.search(r"Câmara Nacional|Modelo de Termo|Aprovado pela|Identidade visual|Atualização:", txt):
                    if k < len(rod):
                        ts = list(pe.iter(_qn("w:t")))
                        ts[0].text = rod[k]
                        for t in ts[1:]:
                            t.text = ""
                        k += 1
                    else:
                        pe.getparent().remove(pe)
    # logo do órgão no cabeçalho
    if logo:
        try:
            h = d.sections[0].header
            hp = h.paragraphs[0] if h.paragraphs else h.add_paragraph()
            hp.alignment = 1
            hp.add_run().add_picture(str(logo), height=Cm(1.6))
        except Exception as e:
            print(f"logo não incluída ({type(e).__name__})")
    # pendências: anexo final, para retirar antes de juntar ao processo
    pend = [x for x in docj.get("pendencias") or [] if str(x).strip()
            and not any(f in str(x).lower() for f in fora_da_estrutura)
            and not (resolvidas and str(x).lower().startswith(tuple(resolvidas)))
            and not (len(resolvidas) >= 3 and str(x).lower().startswith("dotação"))]
    if pend:
        from docx.enum.text import WD_BREAK
        p = d.add_paragraph(); p.add_run().add_break(WD_BREAK.PAGE)
        p = d.add_paragraph(); r = p.add_run("INFORMAÇÕES PARA COMPLETAR (retire esta página antes de juntar ao processo)"); r.bold = True
        for t in pend:
            d.add_paragraph("• " + str(t))
    d.save(str(saida))


def conferir(P):
    def n(t):
        return re.sub(r"\s+", " ", t).strip().lower()
    erros = [f"{i}: esperado '{a}', encontrado '{P[i].text[:60]}'" for i, a in ANCORAS.items() if i >= len(P) or not n(P[i].text).startswith(n(a))]
    if erros:
        raise RuntimeError("o modelo de TR da AGU mudou; revise os índices de modelo_tr.py: " + "; ".join(erros[:5]))


def escrever(p, texto):
    """Troca o texto do parágrafo mantendo o estilo (numeração) e a formatação da primeira execução."""
    runs = p.runs
    if not runs:
        p.add_run(texto); return
    primeira = runs[0]
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
    primeira.text = texto
    primeira.bold = None if not (primeira.bold and len(texto) < 80) else primeira.bold


def limpar_run(r, RGBColor):
    try:
        if r.font.color is not None and r.font.color.rgb is not None and str(r.font.color.rgb) != "000000":
            r.font.color.rgb = RGBColor(0, 0, 0)
        if r.font.highlight_color is not None:
            r.font.highlight_color = None
        if r.font.italic and not r.text.strip().startswith("("):
            r.font.italic = None
    except Exception:
        pass


def preencher_linhas(tab, linhas):
    """Mantém o cabeçalho, usa a 2ª linha como molde e escreve uma linha por registro."""
    rows = list(tab.rows)
    molde = rows[1]._tr
    for r in rows[2:]:
        tab._tbl.remove(r._tr)
    for k, valores in enumerate(linhas):
        tr = molde if k == 0 else copy.deepcopy(molde)
        if k:
            tab._tbl.append(tr)
        from docx.table import _Row
        from docx.oxml.ns import qn as _q
        trpr = tr.find(_q("w:trPr"))
        if trpr is not None:
            for h in trpr.findall(_q("w:trHeight")):
                h.set(_q("w:hRule"), "atLeast")
        row = _Row(tr, tab)
        for c, v in zip(row.cells, valores):
            if c.paragraphs:
                escrever(c.paragraphs[0], str(v))
                from docx.shared import Pt as _Pt
                for r in c.paragraphs[0].runs:
                    r.font.size = _Pt(9)
                for extra in c.paragraphs[1:]:
                    extra._p.getparent().remove(extra._p)
            else:
                c.text = str(v)


def preencher_itens(tab, itens, sigiloso):
    linhas = []
    for it in itens:
        q, vu = it.get("quantidade"), it.get("valor_unitario")
        tot = (float(q) * float(vu)) if (q not in (None, "") and vu not in (None, "")) else None
        linhas.append([str(it.get("item") or ""), it.get("especificacao") or "", it.get("catmat") or "", it.get("unidade") or "", num(q),
                       "Sigiloso" if sigiloso else (brl(vu) if vu not in (None, "") else "[PREENCHER]"),
                       "Sigiloso" if sigiloso else (brl(tot) if tot is not None else "[PREENCHER]")])
    preencher_linhas(tab, linhas or [["1", "[PREENCHER: especificação]", "", "", "", "", ""]])
    # coluna da especificação mais larga (o modelo divide a largura em partes quase iguais)
    try:
        from docx.shared import Cm
        from docx.oxml.ns import qn as _q
        larg = [Cm(1.3), Cm(5.4), Cm(1.9), Cm(2.1), Cm(2.1), Cm(2.3), Cm(2.4)]
        grid = tab._tbl.find(_q("w:tblGrid"))
        if grid is not None:
            for gc, w in zip(grid.findall(_q("w:gridCol")), larg):
                gc.set(_q("w:w"), str(int(w.twips if hasattr(w, "twips") else w / 635)))
        for row in tab.rows:
            for c, w in zip(row.cells, larg):
                c.width = w
        hdr = tab.rows[0]._tr.find(_q("w:trPr"))
        if hdr is not None:
            for h in hdr.findall(_q("w:trHeight")):
                h.set(_q("w:hRule"), "atLeast")
        from docx.shared import Pt as _Pt
        for c in tab.rows[0].cells:
            for p_ in c.paragraphs:
                for r in p_.runs:
                    r.font.size = _Pt(8)
    except Exception:
        pass


if __name__ == "__main__":  # teste local, sem custo: python3 scripts/agente/modelo_tr.py saida.docx
    import sys
    resp = {"orgao": "Prefeitura Municipal Exemplo", "processo": "1234/2026", "municipio": "Município Exemplo", "uf": "RJ", "objeto": "notebooks para as escolas municipais",
            "pca": "Sim", "pca_ano": "2026", "elab_nome": "Maria Silva", "elab_cargo": "Agente de contratação"}
    gerar(simulado(resp), resp, sys.argv[1] if len(sys.argv) > 1 else "/tmp/tr-teste.docx")
    print("ok")
