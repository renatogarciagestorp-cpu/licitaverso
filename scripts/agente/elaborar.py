#!/usr/bin/env python3
"""Elaboração de documentos pelo Agente Licitacon: ETP, TR, Projeto Básico, Edital, Contratação direta e Mapa de riscos (Leis 14.133, 13.303 e 13.019).

Fluxo: questionário do assinante -> redação pelo modelo (com o roteiro de verificação, o texto legal e a jurisprudência
da Biblioteca, priorizando o Tribunal de Contas do estado informado) -> conferência automática do próprio texto pelo
analisar.py -> Word em formato ABNT, com a lista de pendências e os pontos de atenção da conferência.

Uso:
  python3 scripts/agente/elaborar.py --doc etp --respostas respostas.json --pasta saida/            (chama a API)
  python3 scripts/agente/elaborar.py --doc etp --respostas respostas.json --pasta saida/ --simular  (sem custo: monta
      o pedido, mostra o tamanho e gera um Word de exemplo com texto fictício, para testar o fluxo)
Saídas na pasta: documento.json, documento.docx (e documento.pdf se houver LibreOffice), conferencia.json.
"""
import argparse, datetime, importlib.util, json, pathlib, re, shutil, subprocess, sys, time

RAIZ = pathlib.Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("analisar", RAIZ / "scripts" / "agente" / "analisar.py")
an = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(an)
_spec2 = importlib.util.spec_from_file_location("pesquisa_mercado", RAIZ / "scripts" / "agente" / "pesquisa_mercado.py")
pm = importlib.util.module_from_spec(_spec2); _spec2.loader.exec_module(pm)
_spec3 = importlib.util.spec_from_file_location("modelo_etp", RAIZ / "scripts" / "agente" / "modelo_etp.py")
me = importlib.util.module_from_spec(_spec3); _spec3.loader.exec_module(me)
_spec4 = importlib.util.spec_from_file_location("modelo_tr", RAIZ / "scripts" / "agente" / "modelo_tr.py")
mt = importlib.util.module_from_spec(_spec4); _spec4.loader.exec_module(mt)
_spec5 = importlib.util.spec_from_file_location("modelo_chamamento", RAIZ / "scripts" / "agente" / "modelo_chamamento.py")
mc = importlib.util.module_from_spec(_spec5); _spec5.loader.exec_module(mc)
# modelos padrão: ETP (Licitacon) e TR de compras (AGU); o Word do assinante, se enviado, prevalece
MODELOS = {"etp": me, "tr": mt}


def modelo_padrao(doc, respostas, modelo_assinante):
    """'etp' ou 'tr' quando o documento sai num modelo padrão; '' para o formato genérico."""
    if modelo_assinante or regime_de(respostas) != "lei-14133":  # os modelos padrão são da Lei 14.133
        return ""
    if doc == "etp":
        return "etp"
    if doc == "tr" and re.search(r"\bcompra|aquisi", str(respostas.get("natureza", "")), re.I):
        return "tr"
    return ""
rel = an.rel

DOCS = {
    "etp": {"nome": "Estudo Técnico Preliminar", "roteiro": "etp", "objetos": [],
            "base": "art. 18, § 1º, da Lei nº 14.133/2021 (incisos I a XIII; obrigatórios os incisos I, IV, VI, VIII e XIII, conforme o § 2º)",
            "secoes": ["Descrição da necessidade", "Previsão no plano de contratações anual", "Requisitos da contratação",
                       "Estimativa das quantidades", "Levantamento de mercado e justificativa da solução", "Estimativa do valor da contratação",
                       "Descrição da solução como um todo", "Justificativa para o parcelamento ou não", "Resultados pretendidos",
                       "Providências prévias à contratação", "Contratações correlatas e/ou interdependentes",
                       "Impactos ambientais e medidas mitigadoras", "Posicionamento conclusivo sobre a viabilidade"]},
    "tr": {"nome": "Termo de Referência", "roteiro": "tr", "objetos": [],
           "base": "art. 6º, XXIII, da Lei nº 14.133/2021 (alíneas \"a\" a \"j\") e art. 40, § 1º",
           "secoes": ["Definição do objeto", "Fundamentação da contratação", "Descrição da solução como um todo", "Requisitos da contratação",
                      "Modelo de execução do objeto", "Modelo de gestão do contrato", "Critérios de medição e de pagamento",
                      "Forma e critérios de seleção do fornecedor", "Estimativa do valor da contratação", "Adequação orçamentária"]},
    "projeto_basico": {"nome": "Projeto Básico", "roteiro": "tr", "objetos": ["obras"],
                       "base": "art. 6º, XXV, da Lei nº 14.133/2021 (alíneas \"a\" a \"f\"), para obras e serviços de engenharia",
                       "secoes": ["Objeto e justificativa", "Levantamentos, sondagens, ensaios e estudos",
                                  "Soluções técnicas globais e localizadas", "Serviços, materiais e equipamentos e suas especificações",
                                  "Métodos construtivos, instalações provisórias e organização da obra",
                                  "Programação, estratégia de suprimentos e normas de fiscalização", "Orçamento detalhado do custo global"]},
}
# ------------------------------------------------------------------ regimes jurídicos: cada documento segue a lei da contratação
REGIMES_DOC = {"etp": ("lei-14133", "lei-13303"), "tr": ("lei-14133", "lei-13303"), "projeto_basico": ("lei-14133", "lei-13303"),
               "edital": ("lei-14133", "lei-13303", "lei-13019"), "direta": ("lei-14133", "lei-13303", "lei-13019"),
               "riscos": ("lei-14133", "lei-13303"), "plano_trabalho": ("lei-13019",)}
DOC_EXIGE_NORMA = {"plano_trabalho"}  # o decreto do ente que regulamenta a Lei 13.019 é obrigatório
NOME_REGIME = {"lei-14133": "Lei nº 14.133/2021", "lei-13303": "Lei nº 13.303/2016 e o regulamento interno de licitações e contratos (RILC) da estatal",
               "lei-13019": "Lei nº 13.019/2014 (parcerias com organizações da sociedade civil)"}
DOCS.update({
    "edital": {"nome": "Edital de Licitação", "roteiro": "edital", "objetos": [],
               "base": "art. 25 da Lei nº 14.133/2021, com a minuta do contrato (art. 92) e, se houver registro de preços, a minuta da ata (art. 82)",
               "secoes": ["Preâmbulo (órgão, modalidade, critério de julgamento, modo de disputa, regime de execução e base legal)", "Objeto",
                          "Valor estimado e dotação orçamentária (ou sigilo do orçamento, art. 24)", "Condições de participação e vedações (arts. 9º e 14)",
                          "Tratamento diferenciado de ME e EPP (art. 4º e LC 123/2006)", "Envio das propostas e dos documentos",
                          "Abertura da sessão e fase de lances (modo de disputa, arts. 56 e 57)", "Julgamento e aceitabilidade das propostas (art. 59)",
                          "Habilitação (arts. 62 a 70)", "Impugnações e pedidos de esclarecimento (art. 164)", "Recursos (art. 165)",
                          "Infrações e sanções administrativas (arts. 155 a 163)", "Garantia da contratação (arts. 96 a 102) — somente se exigida; se não, uma frase dizendo que não será exigida",
                          "Contratação, prazo para assinatura e condições de pagamento", "Disposições gerais e anexos",
                          "ANEXO: Minuta do contrato (cláusulas necessárias do art. 92)", "ANEXO: Minuta da ata de registro de preços (somente se houver registro de preços)"]},
    "direta": {"nome": "Processo de Contratação Direta", "roteiro": "direta", "objetos": [],
               "base": "arts. 72 a 75 da Lei nº 14.133/2021 (instrução do processo de dispensa ou inexigibilidade)",
               "secoes": ["Objeto e documento de formalização da demanda (art. 72, I)", "Enquadramento legal da hipótese de dispensa ou inexigibilidade",
                          "Justificativa da hipótese e caracterização dos requisitos legais", "Estimativa da despesa (art. 72, II, e art. 23)",
                          "Razão da escolha do contratado (art. 72, VI)", "Justificativa do preço (art. 72, VII)",
                          "Requisitos de habilitação e qualificação mínima (art. 72, V)", "Previsão de recursos orçamentários (art. 72, IV)",
                          "Pareceres técnico e jurídico (art. 72, III)", "Autorização da autoridade competente (art. 72, VIII)",
                          "Divulgação do ato e publicação no PNCP (art. 72, parágrafo único)"]},
    "plano_trabalho": {"nome": "Plano de Trabalho do Termo de Colaboração", "roteiro": "plano_trabalho", "objetos": [],
               "base": "arts. 16 e 22 da Lei nº 13.019/2014 (termo de colaboração: plano proposto pela administração pública) e o decreto do estado, do Distrito Federal ou do município que regulamenta a lei (enviado pelo requisitante)",
               "secoes": ["Identificação da parceria", "Diagnóstico da realidade e justificativa (art. 22, I)", "Objetivos geral e específicos",
                          "Público-alvo, local e prazo", "Metas e resultados esperados (art. 22, II)", "Atividades e forma de execução (art. 22, III)",
                          "Acessibilidade", "Indicadores e meios de verificação (art. 22, IV)", "Equipe de trabalho",
                          "Previsão de receitas e despesas por natureza, com custos diretos e indiretos (art. 22, II-A, e arts. 45 e 46)",
                          "Memória de cálculo das quantidades", "Compatibilidade dos custos com o mercado",
                          "Cronograma físico de execução", "Cronograma de desembolso (art. 48)", "Contrapartida (art. 35, § 1º)",
                          "Bens permanentes (arts. 35, § 5º, e 36)", "Monitoramento, avaliação e prestação de contas (arts. 57 a 72)", "Responsáveis",
                          "Aprovação do ordenador de despesas"]},
    "riscos": {"nome": "Mapa de Riscos", "roteiro": "riscos", "objetos": [],
               "base": "art. 18, X, da Lei nº 14.133/2021 (análise dos riscos da contratação) e, quando cabível, a matriz de riscos do art. 6º, XXVII, e do art. 22",
               "secoes": ["Identificação da contratação e da fase", "Metodologia (probabilidade, impacto e nível de risco)",
                          "Riscos da fase de planejamento", "Riscos da fase de seleção do fornecedor", "Riscos da fase de gestão e execução do contrato",
                          "Para cada risco: descrição, causa, consequência, probabilidade, impacto, nível, ações preventivas, ações de contingência e responsável",
                          "Matriz de alocação de riscos entre contratante e contratado (art. 22 e art. 103), quando cabível",
                          "Acompanhamento e atualização do mapa"]},
})
VARIANTES = {
    ("etp", "lei-13303"): {"base": "Lei nº 13.303/2016 (arts. 31, 32 e 42) e o regulamento interno de licitações e contratos (RILC) da estatal, que disciplina os estudos preliminares (art. 40)"},
    ("tr", "lei-13303"): {"base": "Lei nº 13.303/2016 (arts. 31, 32, 42 e 47) e o regulamento interno de licitações e contratos (RILC) da estatal (art. 40)"},
    ("projeto_basico", "lei-13303"): {"base": "art. 42, VIII, da Lei nº 13.303/2016 (alíneas \"a\" a \"f\"), para obras e serviços de engenharia, e o RILC da estatal (art. 40)"},
    ("edital", "lei-13303"): {"base": "arts. 31 a 41 e 51 a 62 da Lei nº 13.303/2016, com a minuta do contrato (art. 69), e o regulamento interno de licitações e contratos (RILC) da estatal (art. 40)",
        "secoes": ["Preâmbulo (estatal, procedimento ou pregão, critério de julgamento, modo de disputa, regime de execução e base legal)", "Objeto",
                   "Orçamento estimado (sigiloso ou divulgado, art. 34) e recursos", "Condições de participação e impedimentos (art. 38)",
                   "Tratamento diferenciado de ME e EPP (art. 28, § 1º, e LC 123/2006)", "Apresentação das propostas e dos lances (arts. 51 a 53)",
                   "Julgamento e critérios (arts. 54 a 56)", "Negociação (art. 57)", "Habilitação (art. 58)", "Recursos (art. 59)",
                   "Sanções (arts. 82 a 84)", "Garantia (art. 70), se exigida", "Contratação e pagamento", "Disposições gerais e anexos",
                   "ANEXO: Minuta do contrato (cláusulas do art. 69)", "ANEXO: Matriz de riscos (art. 69, X), quando cabível"]},
    ("direta", "lei-13303"): {"base": "arts. 29 e 30 da Lei nº 13.303/2016 (com o § 3º do art. 30) e o regulamento interno de licitações e contratos (RILC) da estatal (art. 40)",
        "secoes": ["Objeto e necessidade", "Enquadramento legal (art. 29: dispensa; art. 30: inexigibilidade) e dispositivo do RILC",
                   "Justificativa da hipótese e caracterização dos requisitos", "Caracterização da emergência (art. 30, § 3º, I) — SOMENTE se a hipótese for de emergência; nos demais casos, omita esta seção",
                   "Razão da escolha do fornecedor (art. 30, § 3º, II)", "Justificativa do preço (art. 30, § 3º, III)",
                   "Habilitação e ausência de impedimentos do contratado (art. 38)", "Recursos para a contratação",
                   "Autorização e publicidade (art. 39 e RILC)"]},
    ("riscos", "lei-13303"): {"nome": "Matriz de Riscos",
        "base": "art. 42, X, e art. 69, X, da Lei nº 13.303/2016 (matriz de riscos) e o regulamento interno de licitações e contratos (RILC) da estatal",
        "secoes": ["Identificação da contratação", "Metodologia (probabilidade, impacto e nível de risco)",
                   "Eventos supervenientes e sua alocação (art. 42, X, \"a\")", "Riscos ligados à liberdade de inovação da contratada (art. 42, X, \"b\" e \"c\")",
                   "Para cada risco: descrição, probabilidade, impacto, parte responsável, medidas de mitigação e efeito no equilíbrio econômico-financeiro",
                   "Eventos não alocados à contratada e reequilíbrio (art. 81)", "Acompanhamento"]},
    ("edital", "lei-13019"): {"nome": "Edital de Chamamento Público",
        "base": "art. 24 da Lei nº 13.019/2014 (edital de chamamento público, sem anexos: o plano de trabalho orientativo, a minuta do termo e as declarações são juntados pelo órgão) e o decreto regulamentador do ente",
        "secoes": ["Preâmbulo (ente, tipo de parceria: termo de colaboração ou de fomento, e base legal)", "Objeto da parceria e programação orçamentária (art. 24, § 1º, I)",
                   "Objetivos, metas e público atendido", "Datas, prazos, condições, local e forma de apresentação das propostas (art. 24, § 1º, III)",
                   "Condições de participação e vedações (arts. 33, 34 e 39)", "Comissão de seleção (art. 27)",
                   "Critérios de seleção e julgamento, metodologia de pontuação e peso de cada critério (art. 24, § 1º, V)",
                   "Valor de referência ou teto e contrapartida (art. 24, § 1º, VI, e art. 35, § 1º)", "Fases: seleção, recursos, homologação e celebração",
                   "Divulgação do resultado e prazo de recurso", "Documentos para a celebração e plano de trabalho (art. 22)",
                   "Condições para interposição de recurso (art. 24, § 1º, VIII)", "Medidas de acessibilidade (art. 24, § 1º, X)", "Disposições finais"]},
    ("direta", "lei-13019"): {"nome": "Justificativa de Dispensa ou Inexigibilidade de Chamamento Público",
        "base": "arts. 30 a 32 da Lei nº 13.019/2014 e o decreto regulamentador do ente",
        "secoes": ["Objeto da parceria e interesse público", "Enquadramento: dispensa (art. 30) ou inexigibilidade (art. 31) do chamamento",
                   "Justificativa da hipótese", "Escolha da organização da sociedade civil e sua capacidade",
                   "Requisitos e documentos da organização (arts. 33, 34 e 39)", "Plano de trabalho, valores e cronograma (art. 22 e art. 35)",
                   "Pareceres técnico e jurídico, gestor e comissão de monitoramento (art. 35)",
                   "Publicação do extrato da justificativa e prazo de impugnação (art. 32, §§ 1º a 3º)", "Autorização do administrador público"]},
}


PLANO_TXT = ""  # plano de trabalho enviado pelo assinante (edital de chamamento)
BASES_TXT = []  # [(rótulo, texto)]: ETP, TR ou Projeto Básico e matriz de riscos que baseiam o edital


def modelo_base(doc, respostas):
    """Documento com texto padrão já revisado (Lei 13.019: edital de chamamento, justificativa e plano de trabalho); None se não houver."""
    if doc == "edital" and regime_de(respostas) == "lei-13019":
        dec = an.NORMAS_LOCAIS[0]["nome"] if an.NORMAS_LOCAIS else ""
        return mc.documento(respostas, dec, PLANO_TXT)
    if doc == "direta" and regime_de(respostas) == "lei-13019":
        dec = an.NORMAS_LOCAIS[0]["nome"] if an.NORMAS_LOCAIS else ""
        return mc.justificativa(respostas, dec, PLANO_TXT)
    if doc == "plano_trabalho":
        dec = an.NORMAS_LOCAIS[0]["nome"] if an.NORMAS_LOCAIS else ""
        return mc.plano(respostas, dec)
    return None


def regime_de(respostas):
    r = str((respostas or {}).get("regime") or "lei-14133")
    return r if r in NOME_REGIME else "lei-14133"


def cfg(doc, respostas=None):
    """Nome, base legal e seções do documento conforme a lei da contratação."""
    regime = regime_de(respostas)
    return {**DOCS[doc], **VARIANTES.get((doc, regime), {}), "regime": regime}


def bloco_regime(regime, tem_normas):
    if regime == "lei-13303":
        return ("REGIME JURÍDICO: empresa pública ou sociedade de economia mista. Aplicam-se a Lei nº 13.303/2016 e o regulamento interno de "
                "licitações e contratos (RILC) da estatal (art. 40); NÃO aplique a Lei nº 14.133/2021 (ela exclui as estatais, art. 1º, § 1º) e não "
                "use instruções normativas federais nem SICAF como obrigação. "
                + ("O RILC foi enviado (regulamentação específica abaixo): siga-o em cada seção e cite o dispositivo do RILC junto com o da lei. "
                   if tem_normas else "O RILC NÃO foi enviado: nos pontos que dependem dele (prazos, procedimento, alçadas, limites), escreva "
                   "[PREENCHER: conferir no RILC — o que deve ser conferido] e registre a pendência; não invente regras do RILC. ") + "\n\n")
    if regime == "lei-13019":
        return ("REGIME JURÍDICO: parceria entre a administração pública e organização da sociedade civil (OSC), Lei nº 13.019/2014 (MROSC) e o "
                "decreto regulamentador do ente. NÃO é licitação: não use os termos e institutos da Lei nº 14.133/2021 (licitante, pregão, "
                "proposta de preço, menor preço, habilitação do art. 62); use chamamento público, organização da sociedade civil, proposta, "
                "plano de trabalho, termo de colaboração ou de fomento. "
                + ("O decreto do ente foi enviado (abaixo): siga-o e cite-o (número do decreto e artigo). Se ele trouxer modelo, roteiro ou "
                   "anexo com a estrutura do documento (ex.: itens obrigatórios do plano de trabalho), siga essa estrutura, a ordem e os títulos "
                   "dele, cobrindo também todos os elementos exigidos pela lei e pelo decreto; regras do decreto mais exigentes que a lei "
                   "prevalecem (ex.: vedação de parcela única, prazos de vigência, limites e comprovação de custos). " if tem_normas else
                   "O decreto regulamentador do ente não foi enviado: nos pontos que dependem dele, escreva [PREENCHER: conferir no decreto "
                   "do ente — o que deve ser conferido]. ") + "\n\n")
    return ("REGIME JURÍDICO: Lei nº 14.133/2021. "
            + ("A regulamentação do ente foi enviada (abaixo): siga-a e cite-a quando ela detalhar a lei. " if tem_normas else "") + "\n\n")
CAMPOS_ROTULO = {
    "envio_propostas": "Forma de envio das propostas", "contato": "Canal para esclarecimentos, impugnações e recursos",
    "osc": "Organização da sociedade civil (nome, CNPJ e responsável)", "atividades": "Atividades e forma de execução", "indicadores": "Parâmetros e indicadores de aferição das metas", "publico": "Público-alvo", "despesas": "Previsão de receitas e despesas", "cronograma": "Cronograma de execução e desembolso", "contrapartida": "Contrapartida", "bens": "Bens permanentes a comprar com recursos da parceria", "mao_obra": "Há mão de obra com dedicação exclusiva", "pesquisa_fontes": "Fontes da pesquisa de preços", "pesquisa_metodo": "Método do valor de referência", "memoria": "Memória de cálculo das quantidades", "rateio": "Critério de rateio dos custos indiretos", "implantacao": "Período de implantação", "visitas": "Frequência das visitas técnicas", "acessibilidade": "Medidas de acessibilidade", "relatorio_periodicidade": "Periodicidade do relatório de execução da organização",
    "tipo_parceria": "Tipo de parceria (escolha do requisitante)", "metas": "Objetivos, metas e público atendido", "modo_disputa": "Modo de disputa (escolha do requisitante)", "registro_precos": "Registro de preços (escolha do requisitante)", "me_epp": "Participação de ME e EPP (escolha do requisitante)", "criterios_selecao": "Critérios de seleção e pontuação", "agente": "Agente de contratação, pregoeiro ou comissão", "hipotese": "Hipótese legal da contratação direta (escolha do requisitante)", "hipotese_detalhe": "Por que a situação se enquadra na hipótese", "contratado": "Fornecedor ou organização escolhida", "motivo_escolha": "Razão da escolha do contratado", "justificativa_preco": "Como o preço foi verificado", "fase": "Fases a mapear", "riscos_conhecidos": "Riscos ou problemas já conhecidos", "matriz": "Incluir matriz de alocação de riscos (art. 22)", "equipe": "Equipe de planejamento", "garantia": "Garantia da contratação (escolha do requisitante)",
    "orgao": "Órgão ou entidade", "uf": "UF e município", "unidade": "Unidade requisitante", "natureza": "Natureza do objeto / solução indicada",
    "objeto": "Objeto", "necessidade": "Necessidade", "pca": "Plano de contratações anual", "requisitos": "Requisitos",
    "quantidades": "Quantidades e memória de cálculo", "mercado": "Levantamento de mercado", "valor": "Valor estimado informado pelo requisitante",
    "solucao": "Solução", "parcelamento": "Parcelamento (escolha do requisitante)", "resultados": "Resultados pretendidos", "providencias": "Providências prévias",
    "correlatas": "Contratações correlatas", "ambiental": "Impactos ambientais", "conclusao": "Conclusão do requisitante",
    "definicao": "Definição do objeto", "fundamentacao": "Fundamentação (ETP)", "execucao": "Modelo de execução",
    "gestao": "Modelo de gestão e fiscalização", "medicao": "Medição e pagamento", "selecao": "Forma de seleção do fornecedor (escolha do requisitante)",
    "orcamento": "Orçamento", "levantamentos": "Levantamentos e estudos", "solucoes": "Soluções técnicas", "servicos": "Serviços e materiais",
    "metodos": "Métodos construtivos", "plano_obra": "Plano da obra",
    "prazo": "Prazo", "prazo_outro": "Prazo (detalhe)", "prazo_entrega": "Prazo de entrega", "garantia_bem": "Garantia do produto",
    "garantia_bem_outro": "Garantia do produto (detalhe)", "amostra": "Exigir amostra", "instrumento": "Instrumento da contratação (contrato ou nota de empenho, art. 95)",
    "pca_item": "Item do Plano de Contratações Anual", "itens_pp": "Itens da pesquisa de preços", "dot_unidade": "Unidade orçamentária", "dot_programa": "Programa de trabalho", "dot_elemento": "Elemento de despesa", "dot_fonte": "Fonte de recursos", "normas": "Normas que o órgão segue", "normas_ref": "Regulamento de licitações do órgão", "cadastro": "Cadastro de fornecedores", "cadastro_outro": "Cadastro de fornecedores (qual)", "pca_ano": "Ano do PCA", "data_orcamento": "Data do orçamento estimado", "indice": "Índice de reajuste", "observacoes": "Observações do requisitante",
    "parc_motivo": "Motivo do parcelamento ou não (escolha do requisitante)", "adjudicacao": "Forma de adjudicação (escolha do requisitante)",
    "criterio": "Critério de julgamento (escolha do requisitante)", "regime_exec": "Regime de execução (escolha do requisitante)",
    "local": "Local da obra ou serviço", "municipio": "Município", "autoridade": "Autoridade que aprova o documento",
    "esclarecimentos": "Esclarecimentos dados pelo requisitante (dúvidas resolvidas antes da redação)",
    "sem_info": "Informações que o requisitante declarou não ter (somente aqui use [PREENCHER])",
    "especificacoes": "Especificações e requisitos", "gestor": "Gestor do contrato", "fiscais": "Fiscais do contrato / comissão de fiscalização",
    "fonte": "Fonte orçamentária e dotação",
    "historico": "Situação atual e contratações anteriores (contrato vigente, problemas, valores gastos)", "designacao": "Ato de designação de quem elabora",
}
UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}

FERRAMENTA = {
    "name": "entregar_documento",
    "description": "Entrega o documento redigido, seção por seção, com as pendências que o requisitante precisa completar.",
    "input_schema": {"type": "object", "properties": {
        "titulo": {"type": "string"},
        "preambulo": {"type": "array", "items": {"type": "string"}, "description": "parágrafos sem número antes da seção 1 (ex.: preâmbulo do edital)"},
        "secoes": {"type": "array", "items": {"type": "object", "properties": {
            "titulo": {"type": "string"},
            "paragrafos": {"type": "array", "items": {"type": "string"}},
            "fundamento": {"type": "string", "description": "dispositivo legal principal da seção, ex.: Lei 14.133/2021, art. 18, § 1º, IV"}},
            "required": ["titulo", "paragrafos"]}},
        "pendencias": {"type": "array", "items": {"type": "string"}, "description": "o que o requisitante precisa completar ou confirmar"},
        "jurisprudencia_ids": {"type": "array", "items": {"type": "string"}, "description": "ids da jurisprudência fornecida que foram usados"}},
        "required": ["titulo", "secoes", "pendencias"]},
}


def uf_de(texto):
    m = re.search(r"\b([A-Z]{2})\b", (texto or "").upper())
    return m.group(1) if m and m.group(1) in UFS else ""


def jurisprudencia_do_estado(uf, consulta, n=6):
    """Decisões da Biblioteca: primeiro o Tribunal de Contas do estado, depois TCU; por coincidência de palavras com o objeto."""
    try:
        itens = json.loads((RAIZ / "acervo.json").read_text(encoding="utf-8")).get("itens", [])
    except Exception:
        return []
    palavras = {w for w in re.findall(r"[a-zà-ú]{5,}", consulta.lower())}
    def nota(it):
        txt = " ".join([it.get("titulo") or "", it.get("tese") or "", " ".join(it.get("tags") or [])]).lower()
        return sum(1 for w in palavras if w in txt)
    estado = [it for it in itens if uf and it.get("uf") == uf and it.get("grupo") in ("TCE", "TCM")]
    tcu = [it for it in itens if it.get("orgao") == "TCU"]
    escolha = sorted(estado, key=nota, reverse=True)[: n // 2] + sorted(tcu, key=nota, reverse=True)[: n]
    vistos, saida = set(), []
    for it in escolha:
        if it["id"] in vistos or nota(it) == 0:
            continue
        vistos.add(it["id"]); saida.append(it)
    return saida[:n]


CHAVES_INTERNAS = {"entrega", "modelo_arquivo", "modelo_nome", "logo_arquivo", "logo_nome", "precos_pdfs", "precos_links", "precos_manual", "precos_sem",
                   "rodape", "rodape_incluir", "elab_nome", "elab_cargo", "elab_matricula", "resp_nome", "resp_cargo", "resp_matricula", "pca_ref", "pesquisa_precos_id", "regime", "plano", "plano_nome", "base_tr", "base_tr_nome", "base_etp", "base_etp_nome", "base_riscos", "base_riscos_nome", "base_tr_motivo", "base_etp_motivo", "base_riscos_motivo", "base_planilha", "base_planilha_nome", "base_planilha_mo", "base_planilha_mo_nome"}


def texto_de_link(url):
    """Lê um link de preço informado pelo assinante. Contratações do PNCP viram itens com preço (dados abertos);
    outras páginas e PDFs públicos viram texto (limitado). Falha devolve aviso, nunca interrompe."""
    m = re.search(r"pncp\.gov\.br/app/editais/(\d{14})/(\d{4})/(\d+)", url)
    try:
        if m:
            ctrl = f"{m.group(1)}-1-{int(m.group(3)):06d}/{m.group(2)}"
            q = {"tipo": "numeroControlePNCPCompra", "codigo": ctrl}
            its = (pm._get("/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id", q, base=pm.COMPRAS) or {}).get("resultado") or []
            cab_ = pm._get(f"/api/consulta/v1/orgaos/{m.group(1)}/compras/{m.group(2)}/{m.group(3)}") or {}
            linhas = [f"Contratação PNCP {ctrl}: {(cab_.get('orgaoEntidade') or {}).get('razaoSocial','')} · {cab_.get('objetoCompra','')[:300]} · "
                      f"valor total estimado {pm.brl(pm._num(cab_.get('valorTotalEstimado')))} · homologado {pm.brl(pm._num(cab_.get('valorTotalHomologado')))}"]
            for it in its[:40]:
                linhas.append(f"  - {str(it.get('descricaoResumida') or '')[:160]} | {it.get('unidadeMedida') or '—'} | qtd {it.get('quantidade')} | "
                              f"estimado {pm.brl(pm._num(it.get('valorUnitarioEstimado')))}")
            return "\n".join(linhas)
        r = subprocess.run(["curl", "-sSL", "-m", "25", "--max-filesize", "15000000", "-A", pm.UA["User-Agent"], "-o", "/tmp/_link", "-w", "%{content_type}", url],
                           capture_output=True, text=True, timeout=35)
        tipo = r.stdout.lower()
        if r.returncode != 0:
            return f"(link não pôde ser lido: {url})"
        if "pdf" in tipo:
            t = subprocess.run(["pdftotext", "-layout", "-l", "15", "/tmp/_link", "-"], capture_output=True, text=True, timeout=60).stdout
        else:
            t = re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(script|style).*?</\1>", " ", pathlib.Path("/tmp/_link").read_text(encoding="utf-8", errors="ignore")))
        t = re.sub(r"\s+", " ", t).strip()
        return f"Conteúdo de {url}:\n{t[:6000]}" if t else f"(link sem texto legível: {url})"
    except Exception as e:
        return f"(link não pôde ser lido: {url} · {type(e).__name__})"


def bloco_precos_assinante(respostas, pdfs_locais):
    partes = []
    if respostas.get("precos_manual", "").strip():
        partes.append("Valores digitados pelo requisitante:\n" + respostas["precos_manual"].strip()[:4000])
    for url in [u.strip() for u in respostas.get("precos_links", "").splitlines() if u.strip().startswith(("http://", "https://"))][:5]:
        partes.append(texto_de_link(url))
    for nome, arq in pdfs_locais[:5]:
        try:
            t = subprocess.run(["pdftotext", "-layout", "-l", "20", str(arq), "-"], capture_output=True, text=True, timeout=90).stdout
        except Exception:
            t = ""
        t = re.sub(r"[ \t]+", " ", t).strip()
        partes.append(f"PDF enviado pelo requisitante ({nome}):\n{t[:8000]}" if t else f"PDF enviado pelo requisitante ({nome}): sem texto legível (digitalizado); "
                      "registre como pendência a conferência manual dos valores.")
    if not partes:
        return ""
    return ("REFERÊNCIAS DE PREÇO FORNECIDAS PELO REQUISITANTE (use-as na pesquisa de mercado e na estimativa, citando a fonte; extraia apenas "
            "valores que estejam escritos nelas; não invente):\n" + "\n\n".join(partes))[:30000]


def montar_pedido(doc, respostas, pesquisa=None, precos_assinante="", padrao=False):
    d = cfg(doc, respostas)
    roteiro = an.carregar_roteiro(d["regime"])
    itens, _ = an.montar_itens(roteiro, d["roteiro"], d["regime"], d["objetos"])
    def valor_legivel(k, v):
        if k == "itens_pp":
            try:
                lista = json.loads(v)
                return ("itens e preços FECHADOS pela pesquisa de preços (não altere quantidade, unidade, preço nem a ordem; redija em itens[] uma "
                        "especificação objetiva para cada um, na mesma ordem e com o mesmo número de itens):" +
                        "".join(f"\n    {x.get('n')}) {(x.get('lote') + ' · ') if x.get('lote') else ''}{x.get('desc')} · {x.get('qtd')} {x.get('un')} · "
                                f"R$ {float(x.get('vu') or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") +
                                (f" · CATMAT {x.get('catmat')}" if x.get('catmat') else "") for x in lista))
            except Exception:
                return v
        if k == "esclarecimentos":
            try:
                return "".join(f"\n    · {x.get('tema','')}: {x.get('pergunta','')} → {x.get('resposta','')}" for x in json.loads(v))
            except Exception:
                return v
        return v
    texto_resp = "\n".join(f"- {CAMPOS_ROTULO.get(k, k)}: {valor_legivel(k, str(v).strip())}" for k, v in respostas.items() if str(v).strip() and k not in CHAVES_INTERNAS)
    if respostas.get("precos_sem") == "sim":
        texto_resp += "\n- Pesquisa de preços: o requisitante optou por completar os valores depois (use [PREENCHER] nos valores e registre a pendência)"
    uf = uf_de(respostas.get("uf", ""))
    juris = jurisprudencia_do_estado(uf, " ".join([respostas.get("objeto", ""), respostas.get("necessidade", "")]))
    refs = an.selecionar_referencias(itens, texto_resp, limite=10)
    bloco_juris = "\n".join(f"- [{j['id']}] {j.get('orgao','')} {j.get('numero','')} ({j.get('data','')[:4]}): {(j.get('tese') or j.get('titulo') or '')[:500]}" for j in juris) or "(nenhuma)"
    system = (
        bloco_regime(d["regime"], bool(an.NORMAS_LOCAIS)) +
        f"Você é especialista em planejamento de contratações públicas e redige o {d['nome']} conforme o {d['base']}. "
        "Escreva em linguagem técnica de documento oficial, com rigor jurídico, na voz da própria unidade que assina o documento: "
        "use preferencialmente a forma impessoal (voz passiva sintética: \"informa-se\", \"verifica-se\", \"constatou-se\", "
        "\"propõe-se\", \"recomenda-se\", \"identificaram-se\", \"declara-se\") e, quando natural, a primeira pessoa do plural "
        "(\"informamos\", \"esta unidade necessita\"); NUNCA use a primeira pessoa do singular (\"verifiquei\", \"proponho\"); "
        "nunca se refira ao \"requisitante\" em terceira pessoa (não escreva \"o requisitante informou que não há contratações "
        "correlatas\"; escreva \"Informa-se que não há contratações correlatas\") e nunca mencione inteligência artificial, agente ou "
        "questionário. Quem ler deve entender que o texto é da unidade que assina. "
        "Regras: (1) use exclusivamente as informações do requisitante; nunca invente números, valores, datas, nomes, quantitativos, "
        "marcas ou fontes de pesquisa de preços; (2) as dúvidas foram resolvidas com o requisitante antes desta redação (veja os "
        "esclarecimentos): preencha TODOS os campos; use [PREENCHER: o que falta — por que é necessário] (se, ainda assim, a lacuna for de preço ou valor em dinheiro, escreva "
        "[PREENCHER: preço: o que falta]) SOMENTE para dados que só o órgão "
        "tem (nomes, números, datas internas) e que estejam listados como \"declarou não ter\"; NUNCA deixe em branco preço, custo ou valor: "
        "encontrar e calcular valores é seu trabalho (use a pesquisa de mercado; se não houver referência do mesmo estado, use a nacional; "
        "se não houver nenhuma, diga isso no texto e indique o valor de referência mais próximo encontrado); os valores citados no texto do "
        "levantamento de mercado DEVEM estar também nos quadros (tco e itens) com o mesmo valor unitário e a fonte [C#]/[P#]; registre em "
        "pendencias só os dados do órgão que ficaram em branco; não deixe dúvidas, ressalvas ou "
        "pedidos de confirmação no texto nem nas pendências; (3) cite os dispositivos legais corretos e vigentes, "
        "usando o texto oficial fornecido; (4) siga o roteiro de verificação fornecido para que o documento atenda a cada item; "
        "antes de usar [PREENCHER], procure a informação nas respostas, no plano de trabalho, nas normas enviadas e na pesquisa: "
        "só deixe em branco o que nenhuma fonte informa (o requisitante será perguntado antes de o documento ser liberado); "
        "(5) jurisprudência: só a fornecida, citando órgão, número e ano, e só quando pertinente; informe os ids usados; "
        "(6) não use marca ou especificação que restrinja a competição sem justificativa técnica; "
        "(7) nunca decida nem presuma pelo requisitante: as escolhas dele (parcelamento e motivo, forma de adjudicação, modalidade, "
        "critério de julgamento, regime de execução, solução indicada no TR ou no Projeto Básico, prazo) devem ser seguidas exatamente "
        "como informadas, apenas fundamentadas (exceção: se o parcelamento vier como \"Analisar no ETP e recomendar\", analise as "
        "opções à luz da pesquisa de mercado, recomende a mais adequada com justificativa e escreva [PREENCHER: confirmar a decisão "
        "sobre o parcelamento], registrando a pendência; no ETP, se a modalidade ou o critério de julgamento vierem como \"Analisar no ETP e "
        "recomendar\", recomende os adequados à solução escolhida, com fundamento legal, sem [PREENCHER]); (8) o requisitante informa de propósito só o essencial (criação rápida): redija com texto técnico adequado ao "
        "objeto apenas a parte descritiva que não depende de decisão nem de dado do órgão (requisitos usuais de qualidade, rotinas de "
        "fiscalização, sustentabilidade, riscos, providências), deixando [PREENCHER] para dados factuais (valores oficiais, datas, "
        "nomes, números de processo, dotação); (9) pesquisa de mercado: use apenas os dados do PNCP e do Compras.gov.br fornecidos e as "
        "referências de preço enviadas pelo requisitante, citando órgão (ou fonte), "
        "município/UF, data e link de cada contratação usada; nunca invente preço, fornecedor ou fonte; separe os resultados por "
        "solução, informe faixa e mediana dos valores unitários comparáveis (prefira os preços praticados do Compras.gov.br, que são "
        "preços unitários reais, e depois o homologado ao estimado, e as contratações do "
        "mesmo estado) e alerte quando unidades ou especificações não forem comparáveis; "
        + ("no ETP, o levantamento de mercado deve considerar todas as soluções possíveis (aquisição, locação, serviço com "
           "fornecimento do bem, adesão a ata ou execução direta, conforme o objeto) e a escolha da melhor solução é um ESTUDO DE CUSTO TOTAL "
           "no mesmo horizonte de tempo e para a mesma quantidade e especificação: para cada solução, some todos os custos que a "
           "administração terá (aquisição: preço unitário × quantidade + manutenção e assistência fora da garantia + outros custos; "
           "locação: valor mensal unitário × meses × quantidade, verificando se a manutenção está incluída; se não estiver, some a "
           "manutenção à parte), usando os preços unitários encontrados na pesquisa (preços praticados e itens de contratações "
           "semelhantes, com especificação igual ou parecida); exemplo: se a aquisição custa R$ 3.000 por unidade e a locação R$ 2.800 "
           "no período com manutenção incluída, a locação é mais vantajosa; se a locação custa R$ 2.800 mas a manutenção custa R$ 400 à "
           "parte, a aquisição é mais vantajosa; mostre esse cálculo nos quadros de custos, com unidade, quantidade, valor unitário e "
           "fonte de cada componente, e indique a solução de menor custo total que atenda aos requisitos, justificando também os aspectos "
           "qualitativos; a estimativa do valor é preliminar (art. 18, § 1º, VI), dependente da pesquisa de preços do art. 23; " if doc == "etp" else
           "se o requisitante não informou o valor, apresente os dados do PNCP como referência preliminar, em mapa resumido, registrando "
           "que o valor estimado deve vir da pesquisa de preços formal " + ("do art. 23 da Lei 14.133/2021" if d["regime"] == "lei-14133" else "prevista no RILC" if d["regime"] == "lei-13303" else "da parceria") + " ([PREENCHER] no valor final); ")
        + (f"(10) siga o modelo padrão descrito a seguir e entregue com a ferramenta entregar_documento.\n{MODELOS[padrao].INSTRUCOES}" if padrao else
           "(10) use como base o MODELO-BASE enviado, já revisado juridicamente: mantenha a estrutura, a numeração, as seções e as cláusulas, sem "
           "acrescentar anexos; adapte ao caso e ao decreto do ente (prazos, fatores e pesos de julgamento, impedimentos, limites de aditivo, vigência, "
           "prestação de contas), sempre citando o dispositivo do decreto; detalhe o objeto, as metas e os critérios de pontuação com níveis "
           "objetivos; não reintroduza o que o modelo corrigiu (desclassificar proposta igual ao valor de referência, exigir capacidade "
           "instalada prévia, autenticação de cópias ou reconhecimento de firma, cessão de direitos autorais da proposta, cobrança pelo "
           "edital, certidão de falência de associação, citar o decreto federal 8.726/2016 em vez do decreto do ente, datas divergentes "
           "entre itens)"
           + ("; no plano de trabalho: mantenha os números coerentes entre si (soma das despesas = valor total = soma das parcelas, "
              "metas da Tabela 2 = metas dos indicadores e do cronograma físico), traga para cada seção os elementos e formulários que o "
              "decreto do ente exigir, e não reintroduza falhas comuns: critérios de julgamento do chamamento dentro do plano (são do "
              "edital), objetivo de \"realizar o chamamento\", metas sem quantidade (\"de acordo com a demanda\"), atendimentos tratados "
              "como percentual da população, custos indiretos como percentual fixo do total (art. 45, I), parcelas que não somam o "
              "total, aplicação em poupança no lugar da conta específica do art. 51, texto ou tabelas repetidos; tire da planilha de custos "
              "o resumo das despesas por natureza, a memória de cálculo das quantidades (ligada às metas), o critério de rateio dos custos "
              "indiretos e as fontes e o método da pesquisa de preços; não copie para o plano a remuneração, o CBO e os encargos de cada "
              "profissional (ficam nas planilhas da IN 05/2017, às quais o plano remete); havendo período de implantação, ajuste as "
              "parcelas do desembolso aos custos de cada período conforme a planilha, mantendo a soma igual ao total" if doc == "plano_trabalho" else "")
           + ". Entregue com a ferramenta entregar_documento." if modelo_base(doc, respostas) else
           f"(10) produza as seções na ordem: {'; '.join(d['secoes'])}. Entregue com a ferramenta entregar_documento.")
    )
    usuario = (
        f"RESPOSTAS DO REQUISITANTE ({d['nome']}):\n{texto_resp}\n\n"
        f"ROTEIRO DE VERIFICAÇÃO (o documento deve atender a estes itens):\n{an.bloco_roteiro(itens)}\n\n"
        f"{an.bloco_normas_locais(itens)}"
        f"{an.bloco_referencias(refs)}\n\n"
        f"JURISPRUDÊNCIA DA BIBLIOTECA (priorize o Tribunal de Contas do estado{(' ' + uf) if uf else ''}):\n{bloco_juris}\n"
        + (f"\n{pm.bloco_prompt(pesquisa)}\n" if pesquisa is not None else "")
        + (f"\n{precos_assinante}\n" if precos_assinante else "")
        + "".join(f"\nDOCUMENTO QUE BASEIA O {'PLANO DE TRABALHO' if doc == 'plano_trabalho' else 'EDITAL'} – {rot.upper()} (use os dados dele"
                  + (" no plano: despesas por natureza, quantidades, memória de cálculo, fontes e rateio; remuneração, CBO, encargos e benefícios "
                     "ficam nas planilhas, e o plano remete a elas" if doc == "plano_trabalho" else " no edital e na minuta")
                  + f"; não deixe [PREENCHER] para o que ele informa):\n{txt}\n"
                  for rot, txt in BASES_TXT)
        + "".join(f"\n{n} DISPENSADO pelo requisitante. Motivo: {respostas.get(k + '_motivo', '')}\n"
                  for k, n in (("base_etp", "ETP"), ("base_riscos", "MATRIZ DE RISCOS")) if respostas.get(k) == "dispensado")
        + (f"\nPLANO DE TRABALHO DA PARCERIA (fonte do objeto, da realidade, das metas, das ações, dos indicadores, dos prazos, do valor e do "
           f"cronograma do edital; use os dados dele e não deixe [PREENCHER] para o que ele informa):\n{PLANO_TXT}\n" if PLANO_TXT else "")
        + (f"\nMODELO-BASE (texto padrão revisado; adapte e complete):\n{mc.texto_plano(modelo_base(doc, respostas))}\n" if modelo_base(doc, respostas) else "")
    )
    return system, usuario, juris


def chamar(system, usuario, ferramenta=None):
    """Usa a mesma conexão do analisar.py, com a ferramenta de entrega do documento."""
    original = an.FERRAMENTA
    an.FERRAMENTA = ferramenta or FERRAMENTA
    try:
        # o limite cobre o raciocínio e o documento juntos; o ETP completo não cabia em 32 mil (só se paga o que for usado)
        return an.chamar(system, usuario, max_tokens=64000, esforco="medium")
    finally:
        an.FERRAMENTA = original


def texto_plano(docj):
    partes = [docj.get("titulo", "")]
    for i, s in enumerate(docj.get("secoes", []), 1):
        partes.append(f"\n{i}. {s.get('titulo','')}")
        partes += s.get("paragrafos", [])
    return "\n".join(partes)


def simulado(doc, respostas):
    base = modelo_base(doc, respostas)
    if base:  # modelo com texto padrão: sai completo mesmo sem a IA
        return base
    d = cfg(doc, respostas)
    return {"titulo": f"{d['nome'].upper()}", "secoes": [{"titulo": t, "paragrafos": [
        f"[Texto de exemplo da seção \"{t}\". Na elaboração real, o agente redige esta seção a partir das respostas: "
        f"{respostas.get('objeto', '[PREENCHER: objeto]')}.]"], "fundamento": NOME_REGIME[d["regime"]]} for t in d["secoes"]],
        "pendencias": ["[Exemplo] Confirmar o valor estimado com a pesquisa de preços anexada ao processo."], "jurisprudencia_ids": []}


# ------------------------------------------------------------------ Word (ABNT)
LACUNA = re.compile(r"\[PREENCHER:?\s*([^\]]*)\]")


def textos(obj):
    """Percorre todas as strings do documento (para achar e preencher lacunas)."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from textos(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from textos(v)


IMPESSOAL = [  # rede de segurança: frases em terceira pessoa ou no singular que escapem da redação
    (r"\b[Oo] requisitante (?:informou|declarou|esclareceu|indicou|relatou|afirmou|confirmou) que\b", "Informa-se que"),
    (r"\b[Ss]egundo (?:informado pel)?o requisitante,?\s*", "Segundo a área requisitante, "),
    (r"\b(?:conforme|como) (?:informado|indicado|declarado) pelo requisitante\b", "conforme informado pela área requisitante"),
    (r"\bpelo requisitante\b", "pela área requisitante"), (r"\bdo requisitante\b", "da área requisitante"),
    (r"\bao requisitante\b", "à área requisitante"), (r"\bo requisitante\b", "a área requisitante"), (r"\bO requisitante\b", "A área requisitante"),
    (r"\bInformo que\b", "Informa-se que"), (r"\binformo que\b", "informa-se que"), (r"\bDeclaro que\b", "Declara-se que"),
    (r"\bdeclaro que\b", "declara-se que"), (r"\bVerifiquei que\b", "Verificou-se que"), (r"\bverifiquei que\b", "verificou-se que"),
    (r"\bConstatei que\b", "Constatou-se que"), (r"\bconstatei que\b", "constatou-se que"), (r"\bRecomendo\b", "Recomenda-se"),
    (r"\bProponho\b", "Propõe-se"), (r"\bConsiderei\b", "Considerou-se"), (r"\bAdotei\b", "Adotou-se"),
]


def impessoal(t):
    for a, b in IMPESSOAL:
        t = re.sub(a, b, t)
    # "Informa-se que" no meio da frase fica com minúscula
    return re.sub(r"(?<=[a-zà-ú,;:] )Informa-se que", "informa-se que", t)


def trocar_textos(obj, f):
    if isinstance(obj, str):
        return f(obj)
    if isinstance(obj, dict):
        return {k: trocar_textos(v, f) for k, v in obj.items()}
    if isinstance(obj, list):
        return [trocar_textos(v, f) for v in obj]
    return obj


NOMES_SECAO = {"informacoes": "Previsão no PCA e alinhamento", "necessidade": "Descrição da necessidade", "motivacao": "Motivação",
               "area": "Área requisitante", "negocio": "Necessidades de negócio", "tecnologicas": "Requisitos técnicos", "requisitos": "Requisitos",
               "demanda": "Estimativa das quantidades", "levantamento": "Levantamento de mercado", "comparativa": "Análise das alternativas",
               "inviaveis": "Soluções inviáveis", "custos": "Análise de custos", "solucao": "Descrição da solução", "estimativa": "Estimativa do valor",
               "just_tecnica": "Justificativa técnica", "parcelamento_tecnico": "Parcelamento", "just_economica": "Justificativa econômica",
               "parcelamento_economico": "Parcelamento", "beneficios": "Resultados pretendidos", "providencias": "Providências prévias",
               "correlatas": "Contratações correlatas", "ambientais": "Impactos ambientais", "viabilidade_justificativa": "Posicionamento conclusivo",
               "forma_contratacao": "Forma de contratação", "medicao": "Medição e pagamento", "particularidades": "Aspectos específicos",
               "riscos_texto": "Análise de riscos", "sustentabilidade": "Critérios de sustentabilidade", "situacao_atual": "Situação atual", "competitividade": "Competitividade", "diretrizes_tr": "Diretrizes para o TR",
               "natureza": "Natureza do objeto", "parcelamento_analise": "Análise do parcelamento", "plano_acao": "Plano de providências", "riscos": "Matriz de riscos", "contratacao": "Forma de contratação",
               "solucoes": "Alternativas do mercado", "itens": "Estimativa de custo", "tco": "Custos das soluções", "resumo": "Síntese do estudo"}
# só lacunas de dinheiro (não "valor numérico" de desempenho, pontuação, índice etc.)
VALOR = re.compile(r"\bvalor(es)?\s+(unit|total|global|estimad|mensal|anual|m[eé]di|de refer|do item|do contrato|da contrata)|pre[cç]o|custo|r\$|mediana|or[cç]amento estimado|cota[cç]", re.I)
TEXTO_VALOR = "conforme a pesquisa de preços a ser juntada aos autos (art. 23 da Lei nº 14.133/2021)"


def completar_valores(docj, pesquisa):
    """Quadros de custo sem valor unitário: usa a mediana do preço praticado citado na fonte ([C#]) e calcula os totais.
    Assim o valor que aparece no levantamento de mercado também aparece nos quadros."""
    pp = (pesquisa or {}).get("precos_praticados") or []
    def mediana_da_fonte(fonte):
        m = re.search(r"\[?C(\d+)\]?", str(fonte or ""))
        if m and 0 < int(m.group(1)) <= len(pp):
            return pp[int(m.group(1)) - 1].get("mediana")
        return None
    tco = docj.get("tco") or {}
    anos = max(1, int(tco.get("anos") or (docj.get("vida_util") or {}).get("anos") or 1))
    for s_ in tco.get("solucoes") or []:
        for cp in s_.get("componentes") or []:
            if cp.get("valor_unitario") is None:
                cp["valor_unitario"] = mediana_da_fonte(cp.get("fonte"))
            q, vu = cp.get("quantidade"), cp.get("valor_unitario")
            vals = list(cp.get("valores") or [])
            if q is not None and vu is not None and (not vals or all(v is None for v in vals)):
                un = sem_acento_simples(cp.get("unidade"))
                if "mes" in un:
                    cp["valores"] = [round(float(q) * float(vu) * 12, 2)] * anos
                elif "ano" in un:
                    cp["valores"] = [round(float(q) * float(vu), 2)] * anos
                else:
                    cp["valores"] = [round(float(q) * float(vu), 2)] + [0] * (anos - 1)
    for it in docj.get("itens") or []:
        if it.get("valor_unitario") is None:
            it["valor_unitario"] = mediana_da_fonte(it.get("fonte"))
    return docj


def sem_acento_simples(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


def com_caminho(obj, caminho=()):
    if isinstance(obj, str):
        yield caminho, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from com_caminho(v, caminho + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from com_caminho(v, caminho + (i,))


def numerar_lacunas(docj):
    """Cada lacuna ganha um número próprio ([PREENCHER#3: ...]), para que respostas iguais não preencham lugares diferentes."""
    n = [0]
    def f(t):
        def troca(m):
            if re.match(r"\[PREENCHER#\d+", m.group(0)):
                return m.group(0)
            n[0] += 1
            return f"[PREENCHER#{n[0]}: {m.group(1).strip()}]"
        return LACUNA.sub(troca, t)
    corpo = {k: v for k, v in docj.items() if k not in ("pendencias", "jurisprudencia_ids")}
    corpo = trocar_textos(corpo, f)
    return {**docj, **corpo}


def lacunas_do_documento(docj, sem_info=""):
    """Lacunas que precisam ser perguntadas ao assinante, com o trecho do documento em que aparecem.
    Valores e preços nunca são perguntados: são trabalho da pesquisa de mercado do agente."""
    base = set(re.findall(r"[a-zà-ú]{4,}", (sem_info or "").lower()))
    saida, auto = [], {}
    corpo = {k: v for k, v in docj.items() if k not in ("pendencias", "jurisprudencia_ids")}
    for caminho, t in com_caminho(corpo):
        for m in re.finditer(r"\[PREENCHER#\d+:?\s*([^\]]*)\]", t):
            alvo, desc = m.group(0), m.group(1).strip()
            antes, depois = t[max(0, m.start() - 200):m.start()], t[m.end():m.end() + 140]
            antes = re.sub(r"\[PREENCHER[^\]]*\]", "___", antes); depois = re.sub(r"\[PREENCHER[^\]]*\]", "___", depois)
            # o agente marca as lacunas de dinheiro com "preço:"; sem a marca, só se a descrição for claramente de valor monetário
            if re.match(r"pre[cç]o\s*:", desc, re.I) or VALOR.search(desc) or (not desc and (VALOR.search(antes[-60:]) or VALOR.search(depois[:40]))):
                auto[alvo] = TEXTO_VALOR
                continue
            palavras = set(re.findall(r"[a-zà-ú]{4,}", desc.lower()))
            if palavras and base and len(palavras & base) / len(palavras) >= 0.5:
                continue
            o_que, _, motivo = desc.partition("—")
            secao = next((NOMES_SECAO[c] for c in caminho if isinstance(c, str) and c in NOMES_SECAO), "Documento")
            trecho = ("…" if m.start() > 200 else "") + antes.lstrip() + " ____ " + depois.rstrip() + ("…" if len(t) - m.end() > 140 else "")
            saida.append({"lacuna": alvo, "tema": (o_que.strip() or secao)[:80], "secao": secao,
                          "pergunta": ("Preciso que você informe: " + o_que.strip().rstrip(".") + ".") if o_que.strip() else "Que informação completa o trecho abaixo?",
                          "por_que": motivo.strip() or f"Esse dado entra na seção “{secao}” e, sem ele, o trecho fica incompleto no documento oficial.",
                          "trecho": re.sub(r"\s+", " ", trecho)[:420]})
    return saida, auto


def aplicar_lacunas(docj, respostas_lacunas):
    """Preenche as lacunas com as respostas do assinante (sem custo de API) e refaz a lista de pendências."""
    preenchidas = {k: v.strip() for k, v in (respostas_lacunas or {}).items() if str(v or "").strip()}
    def f(t):
        for k, v in preenchidas.items():
            t = t.replace(k, v)
        return t
    docj = trocar_textos(docj, f)
    docj = trocar_textos(docj, lambda t: re.sub(r"\[PREENCHER#\d+:?\s*", "[PREENCHER: ", t))
    docj = trocar_textos(docj, lambda t: t.replace("[PREENCHER: ]", "[PREENCHER]"))
    restantes = []
    for t in textos({k: v for k, v in docj.items() if k not in ("pendencias", "jurisprudencia_ids")}):
        for m in LACUNA.finditer(t):
            if m.group(1).strip() and m.group(1).strip() not in restantes:
                restantes.append(m.group(1).strip())
    docj["pendencias"] = restantes
    return docj


FERRAMENTA_DUVIDAS = {
    "name": "registrar_duvidas",
    "description": "Registra as informações que o requisitante precisa fornecer antes da redação.",
    "input_schema": {"type": "object", "properties": {"perguntas": {"type": "array", "maxItems": 8, "items": {"type": "object", "properties": {
        "tema": {"type": "string"}, "pergunta": {"type": "string", "description": "pergunta direta, em segunda pessoa"},
        "por_que": {"type": "string"}, "opcoes": {"type": "array", "items": {"type": "string"}, "maxItems": 4}},
        "required": ["tema", "pergunta", "por_que"]}}}, "required": ["perguntas"]},
}


def pre_analise(doc, respostas, pesquisa, usuario_pedido):
    """Antes de redigir (a parte cara), confere com os dados da pesquisa se falta alguma informação que só o requisitante tem."""
    d = cfg(doc, respostas)
    system = (f"Você vai redigir o {d['nome']} ({NOME_REGIME[d['regime']]}) e precisa que ele saia COMPLETO, sem lacunas. Leia as respostas, os "
              "esclarecimentos e a pesquisa de mercado e liste somente as informações que só o requisitante pode dar e que faltam para "
              "preencher todos os campos e fazer o estudo de custo das soluções (ex.: vida útil esperada do bem quando depender do uso no "
              "órgão, garantia exigida, se há equipe própria de manutenção, ata de registro de preços específica que pretende aderir, "
              "dados de consumo, quantidades por local). Não pergunte o que você pode obter da pesquisa, da lei, de referências técnicas "
              "usuais ou redigir com texto padrão. Não repita perguntas já respondidas nem o que ele disse não ter. Máximo 8 perguntas; "
              "se nada faltar, devolva a lista vazia.")
    original = an.FERRAMENTA
    an.FERRAMENTA = FERRAMENTA_DUVIDAS
    try:
        r = an.chamar(system, usuario_pedido[:90000], max_tokens=2000)
    finally:
        an.FERRAMENTA = original
    b = next((c for c in r.get("content", []) if c.get("type") == "tool_use"), None)
    ps = ((b or {}).get("input") or {}).get("perguntas") or []
    return [{"id": f"p{i + 1}", "tema": str(x.get("tema", ""))[:80], "pergunta": str(x.get("pergunta", ""))[:600],
             "por_que": str(x.get("por_que", ""))[:400], "opcoes": [str(o)[:120] for o in (x.get("opcoes") or [])][:4]} for i, x in enumerate(ps)
            if x.get("pergunta")], an.custo(r.get("usage") or {})


def aguardar(pasta, perguntas, fase, custo, docj=None):
    """Pausa a elaboração: grava as perguntas para o site mostrar ao assinante."""
    (pasta / "perguntas.json").write_text(json.dumps(perguntas, ensure_ascii=False), encoding="utf-8")
    if docj is not None:
        (pasta / "documento.json").write_text(json.dumps(docj, ensure_ascii=False, indent=1), encoding="utf-8")
    (pasta / "execucao.json").write_text(json.dumps({"aguardando": True, "fase": fase, "custo_usd": round(custo, 4), "perguntas": len(perguntas)}), encoding="utf-8")
    print(f"aguardando informações do requisitante ({len(perguntas)}; fase {fase}) · custo US$ {round(custo, 4)}")


def refs_usadas(docj, juris):
    usados = list(dict.fromkeys(docj.get("jurisprudencia_ids") or []))
    try:
        por_id = {it["id"]: it for it in json.loads((RAIZ / "acervo.json").read_text(encoding="utf-8")).get("itens", [])}
    except Exception:
        por_id = {}
    por_id.update({j["id"]: j for j in juris})
    return [por_id[i] for i in usados if i in por_id]


def abrir_modelo(modelo):
    """Abre o Word do assinante e esvazia o corpo, mantendo cabeçalho, rodapé, margens e estilos. None se não der."""
    from docx import Document
    try:
        w = Document(str(modelo))
        corpo = w.element.body
        for el in list(corpo):
            if not el.tag.endswith("}sectPr"):
                corpo.remove(el)
        return w
    except Exception as e:
        print(f"modelo do assinante não pôde ser usado ({type(e).__name__}); usando o modelo Licitacon")
        return None


def gerar_docx(doc, docj, respostas, juris, conferencia, saida, pesquisa=None, modelo=None, logo=None):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Cm, Pt, RGBColor
    from docx.oxml import OxmlElement
    d = cfg(doc, respostas)
    w = abrir_modelo(modelo) if modelo else None
    do_assinante = w is not None
    if not do_assinante:
        w = Document()
        sec = w.sections[0]
        sec.page_height, sec.page_width = Cm(29.7), Cm(21)
        sec.top_margin, sec.left_margin, sec.bottom_margin, sec.right_margin = Cm(3), Cm(3), Cm(2), Cm(2)
        est = w.styles["Normal"]; est.font.name = "Arial"; est.font.size = Pt(12)
        est.paragraph_format.line_spacing = 1.5; est.paragraph_format.space_after = Pt(6)
    sec = w.sections[0]
    # logo: centralizada no topo do cabeçalho (antes do que o modelo já tiver)
    if logo:
        try:
            cab_ = sec.header; cab_.is_linked_to_previous = False
            if not cab_.paragraphs:
                p0 = cab_.add_paragraph()
            elif not cab_.paragraphs[0].text.strip() and "graphic" not in cab_.paragraphs[0]._p.xml:
                p0 = cab_.paragraphs[0]   # primeiro parágrafo vazio: usa
            else:
                p0 = cab_.paragraphs[0].insert_paragraph_before()  # modelo já tem cabeçalho: a logo vai acima
            p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p0.add_run().add_picture(str(logo), height=Cm(2))
        except Exception as e:
            print(f"logo não pôde ser incluída ({type(e).__name__})")
    # rodapé com os dados do órgão (texto informado pelo assinante)
    if respostas.get("rodape_incluir") == "Sim" and respostas.get("rodape", "").strip():
        rod = sec.footer; rod.is_linked_to_previous = False
        pr = rod.add_paragraph() if (do_assinante or (rod.paragraphs and rod.paragraphs[0].text.strip())) else rod.paragraphs[0]
        pr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = pr.add_run(re.sub(r"\s+", " ", respostas["rodape"].strip())[:500]); r.font.size = Pt(9)

    def par(texto, negrito=False, centro=False, tam=None, recuo=True, cor=None):
        p = w.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if centro else WD_ALIGN_PARAGRAPH.JUSTIFY
        if recuo and not centro:
            p.paragraph_format.first_line_indent = Cm(1.25)
        # destaca as lacunas [PREENCHER: ...]
        for i, trecho in enumerate(re.split(r"(\[PREENCHER:[^\]]*\])", texto)):
            if not trecho:
                continue
            r = p.add_run(trecho); r.bold = negrito
            if tam: r.font.size = Pt(tam)
            if cor: r.font.color.rgb = RGBColor.from_string(cor)
            if trecho.startswith("[PREENCHER"):
                r.font.highlight_color = 7  # amarelo
        return p

    par((respostas.get("orgao") or "[PREENCHER: órgão ou entidade]").upper(), negrito=True, centro=True)
    if respostas.get("unidade"):
        par(respostas["unidade"], centro=True)
    w.add_paragraph()
    tit_doc = str(docj.get("titulo") or "").strip()
    par((tit_doc if tit_doc.upper().startswith(d["nome"].upper()[:12]) else d["nome"]).upper(), negrito=True, centro=True, tam=14)
    par(respostas.get("objeto", ""), centro=True)
    w.add_paragraph()
    def linhas(lista):
        """Normaliza o texto da IA: um parágrafo com quebras de linha vira vários; a linha separadora de tabela em
        Markdown (|---|---|) sai; "3.5 Tabela 2 – Metas" vira a legenda "Tabela 2 – Metas"."""
        out = []
        for t in ([lista] if isinstance(lista, str) else lista or []):  # o preâmbulo pode vir como texto único
            for l in str(t).split("\n"):
                l = l.strip()
                if not l or re.fullmatch(r"\|?[\s\-:|]*-[\s\-:|]*\|?", l):
                    continue
                m = re.match(r"^\d+(?:\.\d+)*\.?\s+(Tabela\b.*)$", l)
                out.append(m.group(1) if m else l)
        return out

    def tabela(linhas):  # linhas "| a | b |": a primeira é o cabeçalho
        rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in linhas]
        n = max(len(r) for r in rows)
        tb = w.add_table(rows=len(rows), cols=n)
        tb.style = "Table Grid"
        for i, r in enumerate(rows):
            for j in range(n):
                cel = tb.cell(i, j)
                cel.text = ""
                run = cel.paragraphs[0].add_run(r[j] if j < len(r) else "")
                run.font.size = Pt(9.5); run.bold = (i == 0)
                if i < len(rows) - 1:
                    cel.paragraphs[0].paragraph_format.keep_with_next = (i == 0)
            trPr = tb.rows[i]._tr.get_or_add_trPr()  # linha não se divide entre páginas; o cabeçalho se repete
            trPr.append(OxmlElement("w:cantSplit"))
            if i == 0:
                trPr.append(OxmlElement("w:tblHeader"))
        w.add_paragraph()
    eh_anexo = lambda x: str(x.get("titulo", "")).strip().upper().startswith("ANEXO")
    anexos = [x for x in docj.get("secoes", []) if eh_anexo(x)]  # vão depois das assinaturas
    def secao(s, n_sec):
        tit = re.sub(r"^\s*(\d+(\.\d+)*\.?|[IVXLC]+\s*[-–.])\s+", "", s.get("titulo", ""))  # a IA às vezes já numera o título
        if n_sec is None:  # anexo: nova página, sem número de seção
            w.add_page_break()
            par(tit.upper(), negrito=True, centro=True)
        else:
            tp = par(f"{n_sec} {tit.upper()}", negrito=True, recuo=False)
            if tp is not None:
                tp.alignment = WD_ALIGN_PARAGRAPH.LEFT  # título justificado espalha as palavras
        blocos(s.get("paragrafos", []))
        if s.get("fundamento"):
            par("Fundamento: " + s["fundamento"], recuo=False, tam=10, cor="66757F")

    def blocos(lista, recuo_padrao=True):
        bloco = []
        for t in linhas(lista) + [""]:
            if t.startswith("|"):
                bloco.append(t); continue
            if bloco:
                tabela(bloco); bloco = []
            if not t:
                continue
            if t.startswith("Tabela "):
                lg = par(t, negrito=True, recuo=False, tam=10)
                if lg is not None:
                    lg.paragraph_format.keep_with_next = True  # a legenda não fica separada da tabela
                continue
            par(t, recuo=recuo_padrao and not re.match(r"^\d+(\.\d+)+ |^[a-z]\) ", t))

    blocos(docj.get("preambulo"))  # preâmbulo sem número (ex.: edital de chamamento)
    for n_sec, s_ in enumerate([x for x in docj.get("secoes", []) if not eh_anexo(x)], 1):
        secao(s_, n_sec)
    usados = list(dict.fromkeys(docj.get("jurisprudencia_ids") or []))
    try:  # as decisões citadas podem vir do roteiro (candidatas de cada item) ou da seleção do estado: busca todas na Biblioteca
        por_id = {it["id"]: it for it in json.loads((RAIZ / "acervo.json").read_text(encoding="utf-8")).get("itens", [])}
    except Exception:
        por_id = {}
    por_id.update({j["id"]: j for j in juris})
    refs = [por_id[i] for i in usados if i in por_id]
    if refs:
        par("REFERÊNCIAS", negrito=True, recuo=False)
        for j in refs:
            par((j.get("citacao_abnt") or f"{j.get('orgao','')} {j.get('numero','')}") + (f" Disponível em: {j['fonte_url']}." if j.get("fonte_url") else ""), recuo=False, tam=10)
    if pesquisa and pesquisa.get("referencias"):
        par("FONTES DA PESQUISA DE MERCADO (PNCP E COMPRAS.GOV.BR)", negrito=True, recuo=False)
        for n, r in enumerate(pesquisa["referencias"], 1):
            par(f"[P{n}] {r['orgao']} ({r['municipio']}/{r['uf']}). {r.get('modalidade') or r.get('tipo','')}, publicada em {r['data']}. Solução: {r['solucao']}. "
                f"Disponível em: {r['link']}.", recuo=False, tam=10)
    if pesquisa and pesquisa.get("precos_praticados"):
        par("PREÇOS PRATICADOS CONSULTADOS (COMPRAS.GOV.BR — MÓDULO DE PESQUISA DE PREÇOS)", negrito=True, recuo=False)
        for n, x in enumerate(pesquisa["precos_praticados"], 1):
            ids = ", ".join(str(e.get("id_compra")) for e in x.get("exemplos", []) if e.get("id_compra"))
            par(f"[C{n}] {x['catalogo']} · unidade {x['unidade']} · {x['n']} compras dos últimos 12 meses · mediana {pm.brl(x['mediana'])}"
                + (f" · {x['excluidos']} valores discrepantes excluídos" if x.get("excluidos") else "")
                + (f" · compras de exemplo: {ids}" if ids else "") + ". Disponível em: https://dadosabertos.compras.gov.br.", recuo=False, tam=10)
    w.add_paragraph()
    par(f"{respostas.get('municipio', '').strip() or '[PREENCHER: local]'}, {datetime.date.today().strftime('%d/%m/%Y')}.", recuo=False)

    def assinatura(titulo, nome, cargo, mat):  # bloco inteiro na mesma página
        ps = [w.add_paragraph(), par("_______________________________________________", centro=True),
              par(nome.strip() or "[PREENCHER: nome]", negrito=True, centro=True),
              par((cargo.strip() or "[PREENCHER: cargo]") + (f" · Matrícula {mat.strip()}" if mat.strip() else ""), centro=True, tam=11),
              par(titulo, centro=True, tam=10, cor="66757F")]
        for x in ps[:-1]:
            x.paragraph_format.keep_with_next = True
    assinatura("Responsável pela elaboração", respostas.get("elab_nome", ""), respostas.get("elab_cargo", ""), respostas.get("elab_matricula", ""))
    assinatura("Responsável pelo setor", respostas.get("resp_nome", ""), respostas.get("resp_cargo", ""), respostas.get("resp_matricula", ""))
    for s_ in anexos:
        secao(s_, None)
    # anexo: só o que o requisitante optou por completar depois (as dúvidas foram resolvidas antes da redação)
    if docj.get("pendencias"):
        w.add_page_break()
        par("PENDÊNCIAS PARA COMPLETAR (retire esta página antes de juntar ao processo)", negrito=True, centro=True)
        par("Estes são os pontos que você informou não ter no momento da elaboração. Eles estão destacados em amarelo no texto.", tam=10)
        for t in docj["pendencias"]:
            par("• " + t, recuo=False, tam=11)
    w.save(str(saida))


def para_tr(docj, respostas):
    """O essencial do ETP concluído para o Termo de Referência (vai no resumo da análise; o site oferece para aproveitar)."""
    r = docj.get("resumo") or {}
    nat = docj.get("natureza") or {}
    tipo, exe, mo = nat.get("tipo") or "", nat.get("execucao") or "", nat.get("mao_de_obra") or ""
    if tipo.startswith("Bem"):
        natureza = "Compra"
    elif mo.startswith("Com dedica"):
        natureza = "Serviço com mão de obra exclusiva"
    elif exe == "Serviço contínuo":
        natureza = "Serviço contínuo"
    elif tipo.startswith("Serviço"):
        natureza = "Serviço comum"
    else:
        natureza = ""
    def fmt(n):
        try:
            return (f"{float(n):,.2f}".rstrip("0").rstrip(".") if float(n) != int(float(n)) else f"{int(float(n)):,}").replace(",", ".")
        except (TypeError, ValueError):
            return ""
    linhas, fora = [], []
    servico = re.compile(r"manuten|instala|treinament|capacita|suporte|assist[eê]ncia|servi[cç]o|frete|transporte|loca[cç][aã]o|garantia estendida|mão de obra", re.I)
    for it in (docj.get("itens") or [])[:30]:
        q = fmt(it.get("quantidade"))
        un = (it.get("unidade") or "").strip()
        desc = (it.get("descricao") or it.get("item") or "").strip()
        if not desc:
            continue
        # no TR de compra entram só os bens: serviços e custos recorrentes do ciclo de vida ficam fora (outro TR ou contrato)
        if natureza == "Compra" and (servico.search(f"{it.get('item') or ''} {desc}") or re.search(r"/\s*(ano|m[eê]s)", un, re.I)):
            fora.append(desc[:80])
            continue
        linhas.append((f"{q} {un} – " if q else "") + desc)
    parc = str(respostas.get("parcelamento") or "")
    adj = {"Parcelar por itens": "Por item", "Parcelar por lotes": "Por lote", "Não parcelar": "Global (lote único)"}.get(parc, "")
    ct = docj.get("contratacao") or {}
    out = {"objeto": str(respostas.get("objeto") or "")[:600],
           "necessidade": str(r.get("necessidade") or respostas.get("necessidade") or "")[:600],
           "solucao": str(r.get("solucao") or "")[:400],
           "quantidades": ("\n".join(linhas) or str(respostas.get("quantidades") or ""))[:1500],
           "fora_da_compra": "; ".join(fora)[:400],
           "especificacoes": str(respostas.get("especificacoes") or "")[:1500],
           "natureza": natureza, "prazo": str(respostas.get("prazo") or ""), "prazo_outro": str(respostas.get("prazo_outro") or ""),
           "adjudicacao": adj, "custo_total": r.get("custo_total"),
           "registro_precos": ct.get("registro_precos"), "processo": str(respostas.get("processo") or "")[:120]}
    return {k: v for k, v in out.items() if v not in ("", None)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", required=True, choices=sorted(DOCS))
    ap.add_argument("--respostas", required=True)
    ap.add_argument("--pasta", required=True)
    ap.add_argument("--simular", action="store_true", help="não chama a API: monta o pedido e gera um Word de exemplo")
    ap.add_argument("--sem-conferencia", action="store_true")
    ap.add_argument("--modelo", help="Word do assinante para servir de modelo")
    ap.add_argument("--logo", help="imagem da logo do órgão")
    ap.add_argument("--preco-pdf", action="append", default=[], help="PDF de referência de preço (nome=caminho)")
    ap.add_argument("--regime", choices=sorted(NOME_REGIME), help="lei da contratação (padrão: a das respostas ou a Lei 14.133)")
    ap.add_argument("--norma-local", action="append", default=[], help='regulamentação do ente ou RILC: "Nome::caminho.txt"')
    ap.add_argument("--plano", help="texto do plano de trabalho (base do edital de chamamento)")
    ap.add_argument("--base", action="append", default=[], help='documento que baseia o edital: "ETP::caminho.txt" (repetível)')
    ap.add_argument("--docj", help="completar: documento já redigido (JSON); só preenche as lacunas, sem chamar a API")
    a = ap.parse_args()
    pasta = pathlib.Path(a.pasta); pasta.mkdir(parents=True, exist_ok=True)
    respostas = {k: str(v) for k, v in json.loads(pathlib.Path(a.respostas).read_text(encoding="utf-8")).items()}
    if a.regime:
        respostas["regime"] = a.regime
    regime = regime_de(respostas)
    if regime not in REGIMES_DOC[a.doc]:
        sys.exit(f"O documento {a.doc} não se aplica ao regime {regime}.")
    an.carregar_normas_locais(a.norma_local)
    if a.doc == "plano_trabalho" and "fomento" in respostas.get("tipo_parceria", "").lower():
        sys.exit("No termo de fomento, o plano de trabalho é elaborado pela organização da sociedade civil (Lei 13.019, art. 17), não pela administração.")
    if a.doc == "plano_trabalho":
        respostas["tipo_parceria"] = "Termo de colaboração"
    global PLANO_TXT
    if a.plano and pathlib.Path(a.plano).exists():
        PLANO_TXT = pathlib.Path(a.plano).read_text(encoding="utf-8", errors="replace")[:60000]
    if a.doc in ("edital", "direta") and regime == "lei-13019" and not PLANO_TXT and not a.docj:
        sys.exit("O edital de chamamento e a dispensa ou inexigibilidade de chamamento exigem o plano de trabalho da parceria.")
    for spec in a.base:
        rot, _, cam = spec.partition("::")
        if pathlib.Path(cam).exists():
            BASES_TXT.append((rot.strip(), pathlib.Path(cam).read_text(encoding="utf-8", errors="replace")[:45000]))
    if a.doc == "edital" and regime != "lei-13019" and not a.docj:
        falta = [n for k, n in (("base_tr", "Termo de Referência ou Projeto Básico"), ("base_etp", "ETP"), ("base_riscos", "matriz de riscos"))
                 if not respostas.get(k)]
        if falta or not any(r.startswith("Termo") for r, _ in BASES_TXT):
            sys.exit("O edital exige o ETP, o TR ou Projeto Básico e a matriz de riscos (ou a dispensa justificada do ETP ou da matriz). Falta: "
                     + (", ".join(falta) or "Termo de Referência ou Projeto Básico"))
    if a.doc == "plano_trabalho" and not a.docj and not any(r.startswith("Planilha de custos") for r, _ in BASES_TXT):
        sys.exit("O plano de trabalho é elaborado a partir da planilha de custos da parceria: envie-a.")
    if (a.doc == "plano_trabalho" and not a.docj and respostas.get("mao_obra") == "Sim"
            and not any(r.startswith("Planilhas de custos e formação") for r, _ in BASES_TXT)):
        sys.exit("Há mão de obra com dedicação exclusiva: envie as planilhas de custos e formação de preços (IN 05/2017).")
    if (a.doc in DOC_EXIGE_NORMA or (a.doc == "direta" and regime == "lei-13019")) and not an.NORMAS_LOCAIS and not a.docj:
        sys.exit("Este documento exige o decreto do ente que regulamenta a Lei 13.019/2014.")
    global TEXTO_VALOR
    if regime != "lei-14133":
        TEXTO_VALOR = ("conforme a pesquisa de preços a ser juntada aos autos (Lei nº 13.303/2016, art. 31, e RILC)" if regime == "lei-13303"
                       else "conforme o plano de trabalho e a planilha de custos da parceria")
    padrao = modelo_padrao(a.doc, respostas, a.modelo)
    M = MODELOS.get(padrao)
    if a.docj:  # fase "completar": o assinante respondeu às lacunas; nenhum custo de API
        docj = json.loads(pathlib.Path(a.docj).read_text(encoding="utf-8"))
        try:
            lac = json.loads(respostas.get("lacunas") or "{}")
        except Exception:
            lac = {}
        docj = aplicar_lacunas(docj, lac)
        pesquisa = json.loads((pathlib.Path(a.docj).parent / "pesquisa.json").read_text(encoding="utf-8")) if (pathlib.Path(a.docj).parent / "pesquisa.json").exists() else None
        print("ETAPA: word", flush=True)
        if padrao == "etp":
            me.gerar(docj, respostas, pasta / "documento.docx", a.logo, pesquisa, refs_usadas(docj, []), None)
        elif padrao == "tr":
            mt.gerar(docj, respostas, pasta / "documento.docx", a.logo)
        else:
            gerar_docx(a.doc, docj, respostas, [], None, pasta / "documento.docx", pesquisa, a.modelo, a.logo)
        (pasta / "documento.json").write_text(json.dumps(docj, ensure_ascii=False, indent=1), encoding="utf-8")
        if shutil.which("soffice"):
            subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(pasta), str(pasta / "documento.docx")], capture_output=True, timeout=300)
        (pasta / "execucao.json").write_text(json.dumps({"custo_usd": 0, "segundos": 0, "uso": {}, "pendencias": len(docj.get("pendencias") or []), "alta": 0, "media": 0}), encoding="utf-8")
        print("lacunas preenchidas · custo US$ 0")
        return
    print("ETAPA: pesquisa", flush=True)
    pesquisa = None
    if (a.doc in ("etp", "tr", "direta") and regime != "lei-13019"
            and not (a.doc in ("tr", "direta") and respostas.get("valor", "").strip())):
        pesquisa = pm.pesquisar(respostas.get("objeto", ""),
                                uf_de(respostas.get("uf", "")), respostas.get("natureza", ""))
        (pasta / "pesquisa.json").write_text(json.dumps(pesquisa, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"pesquisa de mercado: {len(pesquisa['referencias'])} referências no PNCP ({pesquisa.get('segundos')} s) {pesquisa.get('erro') or ''}")
    pdfs = [(x.split("=", 1)[0], pathlib.Path(x.split("=", 1)[-1])) for x in a.preco_pdf]
    precos = bloco_precos_assinante(respostas, pdfs)
    if precos:
        print(f"referências de preço do requisitante: {len(precos)} caracteres")
    # modelo padrão Licitacon do ETP (o Word do assinante, se enviado, prevalece)
    system, usuario, juris = montar_pedido(a.doc, respostas, pesquisa, precos, padrao)
    print(f"pedido: {len(system) + len(usuario)} caracteres (~{(len(system) + len(usuario)) // 4} tokens de entrada); jurisprudência: {len(juris)}")
    t0, custo_usd, uso = time.time(), 0.0, {}
    if not a.simular and int(respostas.get("pre_rodadas") or 0) < 2:
        print("ETAPA: preanalise", flush=True)
        try:
            perguntas, c = pre_analise(a.doc, respostas, pesquisa, usuario)
            custo_usd += c
            if perguntas:
                aguardar(pasta, perguntas, "pre", custo_usd)
                return
        except Exception as e:
            print(f"pré-análise não concluída ({type(e).__name__}); seguindo para a redação")
    print("ETAPA: redacao", flush=True)
    if a.simular:
        docj = M.simulado(respostas) if M else simulado(a.doc, respostas)
    else:
        resp = chamar(system, usuario, M.FERRAMENTA if M else None)
        uso = resp.get("usage") or {}
        custo_usd += an.custo(uso)
        bloco = next((c for c in resp.get("content", []) if c.get("type") == "tool_use"), None)
        if not bloco or not bloco.get("input"):
            tipos = [c.get("type") for c in resp.get("content", [])]
            print(f"redação sem documento: stop_reason={resp.get('stop_reason')} truncado={resp.get('truncado')} blocos={tipos} uso={uso} custo US$ {custo_usd:.3f}")
            sys.exit("O modelo não entregou o documento (resposta incompleta).")
        docj = bloco["input"]
    (pasta / "documento.json").write_text(json.dumps(docj, ensure_ascii=False, indent=1), encoding="utf-8")
    conferencia = None
    if not a.simular and not a.sem_conferencia:
        print("ETAPA: conferencia", flush=True)
        txt = pasta / "documento.txt"; txt.write_text(M.texto_plano(docj) if M else texto_plano(docj), encoding="utf-8")
        conf = pasta / "conferencia.json"
        dc = cfg(a.doc, respostas)
        args = [sys.executable, str(RAIZ / "scripts/agente/analisar.py"), "--doc", dc["roteiro"], "--texto", str(txt),
                "--saida", str(conf), "--fonte", "minuta elaborada pelo agente", "--regime", regime]
        for nl in a.norma_local:
            args += ["--norma-local", nl]
        for o in dc["objetos"]:
            args += ["--objeto", o]
        regras = getattr(M, "conferir_regras", None) if M else None
        if regras:  # modelo com texto fixo (AGU): conferência por regras, sem custo; só os achados vão à correção paga
            conf.write_text(json.dumps({"resultados": regras(docj, respostas), "_execucao": {"custo_usd": 0, "metodo": "regras"}}, ensure_ascii=False, indent=1), encoding="utf-8")
            r = subprocess.CompletedProcess(args, 0)
            print(f"conferência por regras: {len(json.loads(conf.read_text(encoding='utf-8'))['resultados'])} apontamento(s)")
        else:
            r = subprocess.run(args, capture_output=True, text=True, timeout=2700)
        if r.returncode == 0 and conf.exists():
            conferencia = json.loads(conf.read_text(encoding="utf-8"))
            custo_usd += float((conferencia.get("_execucao") or {}).get("custo_usd") or 0)
            achados = [x for x in conferencia.get("resultados", []) if x.get("resultado") in ("nao_conforme", "parcial") and x.get("gravidade") in ("alta", "media")]
            if achados:  # o agente corrige o próprio texto em vez de deixar a lista para o assinante
                print("ETAPA: correcao", flush=True)
                lista = "\n".join(f"- [{x.get('gravidade')}] {x.get('titulo') or x.get('item')}: {x.get('constatacao','')} Correção: {x.get('correcao','')}" for x in achados)
                pedido = (f"DOCUMENTO JÁ REDIGIDO (JSON):\n{json.dumps(docj, ensure_ascii=False)}\n\nAPONTAMENTOS DA CONFERÊNCIA (corrija todos no "
                          f"próprio texto; não acrescente ressalvas nem pendências por causa deles):\n{lista}\n\nDADOS ORIGINAIS:\n{usuario[:60000]}")
                try:
                    r2 = chamar(system + " Agora você revisa o documento que redigiu: devolva o documento completo, corrigido, pela mesma ferramenta.",
                                pedido, M.FERRAMENTA if M else None)
                    custo_usd += an.custo(r2.get("usage") or {})
                    b2 = next((c for c in r2.get("content", []) if c.get("type") == "tool_use"), None)
                    if b2 and b2.get("input"):
                        docj = b2["input"]
                        conferencia["corrigidos"] = len(achados)
                        conferencia["resultados"] = [x for x in conferencia.get("resultados", []) if x not in achados]
                        (pasta / "documento.json").write_text(json.dumps(docj, ensure_ascii=False, indent=1), encoding="utf-8")
                except Exception as e:
                    print(f"correção automática não concluída ({type(e).__name__})")
        else:
            print("conferência não concluída (o documento é entregue sem os pontos de atenção)")
    docj = completar_valores(docj, pesquisa)
    if M and hasattr(M, "aplicar_padroes"):  # padrões do modelo (ex.: vigência da compra) não viram pergunta
        docj = M.aplicar_padroes(docj, respostas)
    if not a.simular:
        docj = numerar_lacunas(docj)
        lac, auto = lacunas_do_documento(docj, respostas.get("sem_info", ""))
        if auto:  # valores: nunca perguntados ao assinante
            def trocar_auto(t):
                for k, v in auto.items():
                    t = t.replace(k, v)
                return t
            docj = trocar_textos(docj, trocar_auto)
        if lac:  # o texto já está pago; as lacunas são preenchidas com as respostas do assinante, sem novo custo
            perguntas = [{"id": f"l{i + 1}", "opcoes": [], **x} for i, x in enumerate(lac[:60])]
            aguardar(pasta, perguntas, "completar", custo_usd, docj)
            return
    docj = aplicar_lacunas(docj, {})
    docj = {**docj, **{k: trocar_textos(v, impessoal) for k, v in docj.items() if k not in ("jurisprudencia_ids", "contratacao")}}
    print("ETAPA: word", flush=True)
    if padrao:
        try:
            if padrao == "etp":
                me.gerar(docj, respostas, pasta / "documento.docx", a.logo, pesquisa, refs_usadas(docj, juris), conferencia)
            else:
                mt.gerar(docj, respostas, pasta / "documento.docx", a.logo)
        except Exception as e:  # nunca perde o texto já pago: cai para o Word genérico
            print(f"modelo padrão ({padrao}) falhou ({type(e).__name__}: {e}); gerando no formato genérico")
            secs = ([{"titulo": k, "paragrafos": v} for k, v in (docj.get("secoes") or {}).items() if v] if padrao == "etp"
                    else [{"titulo": "Termo de Referência", "paragrafos": mt.texto_plano(docj).split("\n")}])
            gerar_docx(a.doc, {**docj, "secoes": secs}, respostas, juris, conferencia, pasta / "documento.docx", pesquisa, None, a.logo)
    else:
        gerar_docx(a.doc, docj, respostas, juris, conferencia, pasta / "documento.docx", pesquisa, a.modelo, a.logo)
    if shutil.which("soffice"):
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(pasta), str(pasta / "documento.docx")],
                       capture_output=True, timeout=300)
    ct = docj.get("contratacao") or {}
    resumo = {"custo_usd": round(custo_usd, 4), "segundos": round(time.time() - t0), "uso": uso,
              "recomendacao": {k: ct.get(k) for k in ("modalidade", "criterio", "modo_disputa", "regime_execucao", "registro_precos", "me_epp") if ct.get(k) is not None} or None,
              **({"para_tr": para_tr(docj, respostas)} if a.doc == "etp" else {}),
              "pendencias": len(docj.get("pendencias") or []),
              "alta": sum(1 for r in (conferencia or {}).get("resultados", []) if r.get("gravidade") == "alta" and r.get("resultado") in ("nao_conforme", "parcial")),
              "media": sum(1 for r in (conferencia or {}).get("resultados", []) if r.get("gravidade") == "media" and r.get("resultado") in ("nao_conforme", "parcial"))}
    (pasta / "execucao.json").write_text(json.dumps(resumo, ensure_ascii=False), encoding="utf-8")
    print(f"documento gerado · custo US$ {resumo['custo_usd']} · {resumo['segundos']} s")


if __name__ == "__main__":
    main()
