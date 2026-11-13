"""Modelo padrão Licitacon do Edital de Chamamento Público (Lei 13.019/2014), com as minutas e os anexos.

Estrutura inspirada em editais municipais reais (ex.: Prefeitura de Maricá, Chamamento 12/2025), com as falhas
encontradas corrigidas:
- datas em um único cronograma (sem datas divergentes entre itens) e remissões internas geradas automaticamente;
- prazo mínimo de 30 dias entre a divulgação e o fim do envio das propostas (art. 26);
- recurso dirigido à comissão de seleção, que pode reconsiderar, e decidido pela autoridade competente;
- sem exigência de capacidade instalada prévia (art. 33, § 5º) e sem pontuar apenas estrutura própria;
- proposta no valor de referência não é desclassificada: o preço avalia a adequação ao valor de referência (art. 27),
  e a nota zero só desclassifica no grau de adequação, critério obrigatório;
- sem autenticação de cópias nem reconhecimento de firma (Lei 13.726/2018, art. 3º);
- sem cessão de direitos autorais da proposta, sem cobrança pela cópia do edital e sem certidão de falência para associação;
- citações do decreto do próprio ente (não do decreto federal 8.726/2016, que só vale para a União).
O texto é completo mesmo sem a IA; na elaboração real ele é a base que o agente adapta ao caso e ao decreto do ente.
"""
import re

LEI = "Lei Federal nº 13.019, de 31 de julho de 2014"


def _v(R, k, desc):
    v = str((R or {}).get(k) or "").strip()
    return v if v else f"[PREENCHER: {desc}]"


def esfera(orgao):
    o = (orgao or "").lower()
    if re.search(r"prefeitura|munic[ií]pio|c[aâ]mara municipal", o):
        return "municipal", "1 (um) ano"
    if re.search(r"distrito federal|governo do estado|estado d[eo]|secretaria de estado", o):
        return "estadual", "2 (dois) anos"
    if re.search(r"uni[aã]o|minist[eé]rio|federal", o):
        return "federal", "3 (três) anos"
    return "", "[PREENCHER: 1 ano (município), 2 anos (estado ou DF) ou 3 anos (União), art. 33, V, \"a\"]"


def _numerar(itens, n):
    """Numera itens: str → n.k; tupla (texto, [subitens]) → n.k e n.k.j; alíneas "a) ..." e anexos (n=None) sem número."""
    if n is None:
        return [it[0] if isinstance(it, tuple) else it for it in itens]
    out, k = [], 0
    for it in itens:
        if isinstance(it, str) and re.match(r"^[a-z]\) ", it):
            out.append(it)
            continue
        k += 1
        if isinstance(it, tuple):
            out.append(f"{n}.{k} {it[0]}")
            for j, sub in enumerate(it[1], 1):
                out.append(f"{n}.{k}.{j} {sub}")
        else:
            out.append(f"{n}.{k} {it}")
    return out


def criterios_padrao(R):
    """Tabela de julgamento: a do requisitante, se informada; senão, a padrão (ajustável ao decreto do ente)."""
    proprio = str(R.get("criterios_selecao") or "").strip()
    if proprio:
        return [f"Critérios e pesos definidos pela Administração: {proprio}",
                "Cada critério será pontuado em três níveis objetivos: atende integralmente (pontuação máxima do critério), atende "
                "parcialmente (metade da pontuação) e não atende (zero), conforme a descrição de cada nível no Anexo III."]
    return ["(A) Grau de adequação da proposta aos objetivos específicos do programa ou ação e às metas do plano de trabalho "
            "orientativo – até 30 pontos (critério obrigatório, art. 27);",
            "(E) Experiência da organização na execução do objeto ou de objeto de natureza semelhante, comprovada por atestados, "
            "relatórios, publicações ou instrumentos de parceria anteriores com qualquer ente ou com a iniciativa privada – até 20 pontos;",
            "(C) Capacidade técnica e operacional: metodologia, organização da equipe a ser alocada (com qualificação e atribuições) "
            "e a infraestrutura que a organização se propõe a disponibilizar, sem exigência de capacidade instalada prévia "
            "(art. 33, § 5º) – até 30 pontos;",
            "(P) Adequação da proposta ao valor de referência, com o detalhamento dos custos e a demonstração de sua compatibilidade "
            "com os preços de mercado – até 20 pontos.",
            "Pontuação máxima: 100 pontos. Os pesos podem ser ajustados para atender aos fatores fixados no decreto do ente."]


def documento(R, decreto=""):
    """Devolve o edital no formato do Elaborador: {titulo, secoes[{titulo, paragrafos, fundamento}], pendencias}."""
    R = dict(R or {})
    dec = decreto or "[PREENCHER: decreto que regulamenta a Lei 13.019/2014 no ente]"
    orgao = _v(R, "orgao", "órgão ou entidade")
    unidade = _v(R, "unidade", "secretaria ou unidade responsável")
    tipo = (R.get("tipo_parceria") or "").strip() or "Termo de Colaboração"
    tipo_l = tipo[0].upper() + tipo[1:] if tipo else tipo
    _, existencia = esfera(R.get("orgao", ""))
    processo = _v(R, "processo", "nº do processo administrativo")
    objeto = _v(R, "objeto", "objeto da parceria")
    valor = _v(R, "valor", "valor de referência da parceria")
    prazo = (R.get("prazo") or "").strip()
    if prazo == "Outro":
        prazo = (R.get("prazo_outro") or "").strip()
    prazo = prazo or "[PREENCHER: prazo de vigência]"
    contato = _v(R, "contato", "endereço físico e e-mail para esclarecimentos, impugnações e recursos")
    eletronico = "físico" not in str(R.get("envio_propostas", "")).lower()
    local_prop = ("pelo e-mail ou pela plataforma eletrônica indicados no item 1.6, em arquivo PDF pesquisável assinado digitalmente "
                  "pelo representante legal" if eletronico else
                  "em envelope lacrado, no endereço indicado no item 1.6, acompanhado de cópia em mídia digital (PDF pesquisável)")
    contrapartida = (R.get("contrapartida") or "").strip()
    secoes = []

    def sec(titulo, itens, fundamento):
        n = None if titulo.startswith("Anexo") else sum(1 for x in secoes if not x["titulo"].startswith("Anexo")) + 1
        secoes.append({"titulo": titulo, "paragrafos": _numerar(itens, n), "fundamento": fundamento})

    sec("Preâmbulo e introdução", [
        f"{orgao.upper()}, por meio {'da' if re.match(r'(?i)secretaria|diretoria|coordenadoria|superintend|subsecretaria|funda', unidade) else 'de'} {unidade}, torna público que realizará CHAMAMENTO PÚBLICO para seleção de organização da "
        f"sociedade civil (OSC) interessada em celebrar {tipo_l} para a execução de {objeto}, nos termos da {LEI}, do {dec} e "
        "das condições deste Edital e de seus anexos, especialmente o Plano de Trabalho orientativo (Anexo II).",
        f"Processo administrativo: {processo}. Critério de seleção: pontuação técnica, nos termos do item 9, com avaliação obrigatória "
        "do grau de adequação da proposta aos objetivos do programa e ao valor de referência (art. 27).",
        "Este Edital e seus anexos estão disponíveis gratuitamente no sítio oficial do ente na internet, desde a data de publicação "
        "indicada no cronograma do item 7, com antecedência mínima de 30 (trinta) dias da data-limite para o envio das propostas (art. 26).",
        "As retificações do Edital serão divulgadas da mesma forma que o texto original. Se a alteração afetar a formulação das "
        "propostas, o prazo de envio será reaberto integralmente.",
        "O Chamamento Público poderá ser adiado ou revogado por razões de interesse público decorrentes de fato superveniente "
        "devidamente comprovado, ou anulado por ilegalidade, mediante decisão fundamentada, assegurado o contraditório.",
        (f"Pedidos de esclarecimento e impugnações poderão ser apresentados por qualquer interessado até 10 (dez) dias antes da "
         f"data-limite para o envio das propostas, pelo canal: {contato}.",
         ["A Comissão de Seleção responderá em até 5 (cinco) dias úteis, sempre antes da data-limite para o envio das propostas, "
          "e as respostas serão publicadas no sítio oficial, sem identificação de quem perguntou.",
          "A impugnação não tem efeito suspensivo, salvo decisão fundamentada da Comissão de Seleção. Acolhida a impugnação que "
          "altere o Edital, aplica-se o item 1.4."]),
    ], f"{LEI}, arts. 24, 26 e 27; {dec}")

    sec("Objeto", [
        f"O objeto deste Edital é a seleção de organização da sociedade civil para a celebração de {tipo_l} com a Administração, "
        f"visando a {objeto}, conforme o Termo de Referência (Anexo I) e o Plano de Trabalho orientativo (Anexo II).",
        f"Necessidade e justificativa: {_v(R, 'necessidade', 'realidade que motiva a parceria e interesse público envolvido')}",
        f"Objetivos, metas e público atendido: {_v(R, 'metas', 'metas e público-alvo')}"
        + (f" Quantitativos e locais de execução: {R['quantidades'].strip()}" if str(R.get("quantidades") or "").strip() else ""),
        "A organização selecionada deverá observar a legislação de acessibilidade (Lei nº 13.146/2015), garantindo atendimento a "
        "pessoas com deficiência ou mobilidade reduzida e idosos, com espaços, equipamentos, materiais e meios de comunicação "
        "acessíveis, conforme as características do objeto (art. 24, § 1º, X).",
        "É vedada a delegação das atividades-fim a terceiros, ressalvada a atuação em rede, quando prevista no plano de trabalho "
        "e atendidos os requisitos do art. 35-A da Lei 13.019/2014.",
    ], f"{LEI}, arts. 24, § 1º, III e X, e 35-A")

    sec("Recursos orçamentários e valor de referência", [
        f"O valor de referência para a execução da parceria é de {valor}, a ser repassado conforme o cronograma de desembolso "
        "aprovado, em parcelas vinculadas ao cumprimento das metas (não se admite parcela única quando vedada pelo decreto do ente).",
        f"As despesas correrão à conta da seguinte dotação orçamentária: {_v(R, 'fonte', 'programa de trabalho, elemento de despesa e fonte de recursos')}. "
        "Nos exercícios seguintes, as despesas correrão à conta das dotações próprias, indicadas por apostilamento.",
        ("Contrapartida da organização: " + contrapartida + ", em bens ou serviços, cuja expressão monetária constará do termo; "
         "não será exigida contrapartida financeira (art. 35, § 1º).") if contrapartida else
        "Não será exigida contrapartida da organização. Contrapartida financeira nunca será requisito para a celebração (art. 35, § 1º).",
        "A proposta com valor global superior ao valor de referência será desclassificada. A seleção de proposta que não seja a "
        "mais adequada ao valor de referência será obrigatoriamente justificada (art. 27, § 5º).",
    ], f"{LEI}, arts. 24, § 1º, I e VI, 27, § 5º, e 35, § 1º")

    sec("Vigência", [
        f"O prazo de vigência da parceria é de {prazo}, contado da publicação do extrato do {tipo_l} no órgão oficial de imprensa.",
        f"A vigência poderá ser prorrogada por termo aditivo, mediante solicitação fundamentada apresentada com no mínimo 30 (trinta) "
        f"dias de antecedência, demonstrados o cumprimento das metas e a vantajosidade, nos limites do {dec}.",
        "A prorrogação de ofício, limitada ao exato período do atraso, é obrigatória quando a Administração der causa ao atraso na "
        "liberação dos recursos.",
        "Na prorrogação, os valores poderão ser atualizados: os custos de pessoal, pela convenção ou acordo coletivo da categoria, "
        "demonstrados em planilha analítica; os demais custos, pela variação do índice oficial fixado no termo, a cada 12 meses.",
    ], f"{LEI}, arts. 42, VI, e 55; {dec}")

    sec("Condições de participação", [
        ("Poderão participar as organizações da sociedade civil, assim definidas no art. 2º, I, da Lei 13.019/2014, cujas normas de "
         "organização interna prevejam expressamente:", [
            "objetivos voltados à promoção de atividades e finalidades de relevância pública e social (art. 33, I);",
            "que, em caso de dissolução, o patrimônio líquido seja transferido a outra pessoa jurídica de igual natureza que preencha "
            "os requisitos da Lei 13.019/2014, preferencialmente com o mesmo objeto social (art. 33, III);",
            "escrituração de acordo com os princípios fundamentais de contabilidade e as Normas Brasileiras de Contabilidade (art. 33, IV)."]),
        f"A organização deverá possuir, no mínimo, {existencia} de existência com cadastro ativo no CNPJ, experiência prévia na "
        "realização do objeto ou de natureza semelhante e capacidade técnica e operacional para executar o plano de trabalho, "
        "sem necessidade de demonstrar capacidade instalada prévia (art. 33, V, e § 5º).",
        "Organizações religiosas e sociedades cooperativas observarão as dispensas dos §§ 2º e 3º do art. 33 da Lei 13.019/2014.",
        ("Estará impedida de participar e de celebrar a parceria a organização que se enquadre em qualquer das hipóteses do art. 39 "
         "da Lei 13.019/2014, entre elas:", [
            "não esteja regularmente constituída ou, se estrangeira, não esteja autorizada a funcionar no território nacional;",
            "esteja omissa no dever de prestar contas de parceria anteriormente celebrada;",
            "tenha como dirigente membro de Poder ou do Ministério Público, ou dirigente de órgão ou entidade da administração pública "
            "da mesma esfera de governo, estendendo-se a vedação aos cônjuges, companheiros e parentes até o segundo grau;",
            "tenha tido contas rejeitadas pela administração pública nos últimos 5 (cinco) anos, salvo nas exceções do art. 39, IV;",
            "esteja cumprindo sanção de suspensão, impedimento ou declaração de inidoneidade (art. 39, V);",
            "tenha tido contas de parceria julgadas irregulares ou rejeitadas por Tribunal ou Conselho de Contas, em decisão "
            "irrecorrível, nos últimos 8 (oito) anos, ou tenha entre seus dirigentes pessoa nas situações do art. 39, VII."]),
        f"Aplicam-se, ainda, os demais impedimentos expressamente previstos no {dec}, desde que pertinentes ao objeto e sem restringir "
        "indevidamente a competição (art. 24, § 2º).",
        "Não poderá participar mais de uma organização sob o controle de um mesmo grupo de pessoas físicas ou jurídicas.",
    ], f"{LEI}, arts. 2º, I, 24, § 2º, 33 e 39; {dec}")

    sec("Comissão de Seleção", [
        f"As propostas serão julgadas por Comissão de Seleção previamente designada por ato publicado ({_v(R, 'agente', 'ato de designação da Comissão de Seleção')}), "
        "composta por, no mínimo, um servidor ocupante de cargo efetivo ou emprego permanente.",
        "Ficará impedido de compor a Comissão quem, nos últimos 5 (cinco) anos, tenha mantido relação jurídica com ao menos uma "
        "das organizações participantes; configurado o impedimento, será designado substituto de qualificação equivalente (art. 27, §§ 2º e 3º).",
        "A Comissão poderá, em qualquer fase, promover diligências para esclarecer ou complementar a instrução, vedada a inclusão "
        "posterior de documento ou informação que deveria constar originalmente da proposta, e poderá solicitar apoio técnico.",
    ], f"{LEI}, arts. 2º, X, e 27")

    sec("Cronograma", [
        "As etapas do Chamamento Público obedecerão ao seguinte cronograma, que prevalece sobre qualquer outra data mencionada:",
        "Publicação do Edital no sítio oficial: [PREENCHER: data];",
        "Pedidos de esclarecimento e impugnações: até 10 (dez) dias antes da data-limite para envio das propostas;",
        "Data-limite para envio das propostas: [PREENCHER: data e horário, no mínimo 30 dias após a publicação];",
        "Sessão pública de abertura das propostas: [PREENCHER: data, horário e local ou endereço da transmissão];",
        "Divulgação do resultado preliminar: em até [PREENCHER: nº] dias após a sessão;",
        "Recursos: 5 (cinco) dias corridos da divulgação do resultado preliminar; contrarrazões: 5 (cinco) dias corridos do fim do prazo de recurso;",
        "Decisão dos recursos e homologação do resultado definitivo: após o julgamento dos recursos, com publicação no sítio oficial;",
        "Fase de celebração: apresentação do plano de trabalho e dos documentos em até 15 (quinze) dias da convocação, análise, "
        "pareceres técnico e jurídico e assinatura do termo.",
        "Na contagem dos prazos, exclui-se o dia do início e inclui-se o do vencimento; os prazos só se iniciam e vencem em dias de "
        "expediente. Se não houver expediente na data da sessão, ela ocorrerá no primeiro dia útil seguinte, no mesmo horário e local.",
    ], f"{LEI}, arts. 24, § 1º, IV e V, e 26")

    sec("Apresentação das propostas", [
        f"A proposta será enviada até a data-limite do cronograma, {local_prop}. Não serão aceitas propostas fora do prazo.",
        "A proposta será apresentada em papel timbrado ou documento identificado da organização, com índice, páginas numeradas e "
        "assinatura do representante legal, contendo, no mínimo:",
        "a) apresentação da organização: histórico e experiência na área do objeto e com o público-alvo, premiações e participação em redes;",
        "b) conhecimento do problema: diagnóstico da realidade e das políticas setoriais relacionadas, com dificuldades e soluções propostas;",
        "c) descrição das atividades e da metodologia, vinculadas às metas e aos indicadores do Plano de Trabalho orientativo, com as "
        "medidas de acessibilidade e inclusão;",
        "d) equipe a ser alocada, com qualificação e atribuições, e a infraestrutura que a organização se propõe a disponibilizar;",
        "e) valor global da proposta, com a previsão de receitas e despesas por natureza, inclusive custos indiretos vinculados ao "
        "objeto (art. 46, III), e a demonstração da compatibilidade dos custos com o mercado.",
        "As assinaturas poderão ser digitais. Não será exigido reconhecimento de firma nem autenticação de cópias (Lei nº 13.726/2018, "
        "art. 3º); a Comissão poderá pedir o original para conferência em caso de dúvida fundada.",
        "A organização poderá ser representada por seu representante legal ou por procurador com poderes para os atos do chamamento "
        "(modelo de carta de credenciamento no Anexo V).",
        "Após o prazo de envio, não serão admitidas alterações nas propostas, ressalvadas as diligências do item 6.3. Os custos de "
        "elaboração das propostas correm por conta das organizações.",
        "As informações das propostas serão usadas apenas para o julgamento e a execução da parceria, respeitados os direitos autorais "
        "e a proteção de dados pessoais (Lei nº 13.709/2018).",
    ], f"{LEI}, art. 24, § 1º, IV; Lei nº 13.726/2018")

    crit = criterios_padrao(R)
    sec("Critérios de julgamento e classificação", [
        "As propostas serão avaliadas pela Comissão de Seleção conforme os critérios abaixo, detalhados no Anexo III com a descrição "
        "objetiva dos níveis de atendimento de cada um:",
        *crit,
        "Fator de redução: a nota final da organização que tiver tido prestação de contas rejeitada ou aprovada com ressalvas nos "
        f"últimos 5 (cinco) anos será reduzida na forma do {dec}, quando o regulamento a previr.",
        "Será desclassificada a proposta que: obtiver nota zero no grau de adequação (critério obrigatório, art. 27); obtiver menos de "
        "50% da pontuação máxima; tiver valor global superior ao valor de referência; ou estiver em desacordo com o Edital.",
        "A proposta com valor igual ao de referência não é desclassificada por esse motivo: o critério de preço avalia a adequação e a "
        "consistência dos custos, e não apenas o desconto.",
        "Em caso de empate, prevalecerá a maior nota, sucessivamente, no grau de adequação, na capacidade técnica e operacional e na "
        "experiência; persistindo o empate, haverá sorteio em sessão pública.",
        "O resultado preliminar, com a nota de cada critério, será publicado no sítio oficial.",
    ], f"{LEI}, arts. 24, § 1º, V, e 27; {dec}")

    sec("Recursos", [
        "Do resultado preliminar caberá recurso, no prazo de 5 (cinco) dias corridos de sua publicação, dirigido à Comissão de Seleção, "
        "pelo canal do item 1.6. As demais organizações poderão apresentar contrarrazões em igual prazo, contado do término do prazo "
        "recursal, assegurada vista dos autos.",
        "A Comissão de Seleção poderá reconsiderar sua decisão em até 5 (cinco) dias úteis; se não o fizer, encaminhará o recurso, "
        "devidamente informado, à autoridade competente, que decidirá em até 5 (cinco) dias úteis.",
        "O acolhimento do recurso invalida apenas os atos insuscetíveis de aproveitamento. Os recursos e as decisões serão publicados "
        f"no sítio oficial. Não caberá novo recurso da decisão, salvo previsão diversa no {dec}.",
    ], f"{LEI}, art. 24, § 1º, VIII; {dec}")

    sec("Homologação e fase de celebração", [
        "Decididos os recursos, o resultado definitivo será homologado e divulgado no sítio oficial (art. 27, § 4º). A homologação "
        "não gera direito à celebração da parceria (art. 27, § 6º).",
        "A organização selecionada será convocada para apresentar, em até 15 (quinze) dias, o plano de trabalho detalhado (com base no "
        "Anexo II e na proposta) e os documentos do item 12. A Administração poderá solicitar ajustes no plano, mantidos o objeto, as "
        "metas e o valor global.",
        "Se a organização selecionada não atender aos requisitos, ou não assinar o termo em até 5 (cinco) dias úteis da convocação, "
        "prorrogáveis uma vez por motivo justificado, será convidada a seguinte na ordem de classificação, nas condições da sua proposta.",
        "A celebração depende do parecer técnico, que se pronunciará sobre o mérito, a viabilidade, o cronograma de desembolso, a "
        "fiscalização e a designação do gestor e da comissão de monitoramento e avaliação, e do parecer jurídico (art. 35, V e VI).",
        "Antes da celebração, a organização deverá estar cadastrada no órgão competente do ente, quando o regulamento o exigir.",
    ], f"{LEI}, arts. 27, 28 e 35")

    sec("Documentos para a celebração", [
        "Cópia do estatuto registrado e de suas alterações, com as cláusulas exigidas no art. 33;",
        "Comprovante de inscrição e situação cadastral no CNPJ, com o tempo mínimo de existência do item 5.2;",
        "Ata de eleição da diretoria em exercício e relação nominal dos dirigentes, com endereço, RG e CPF de cada um (art. 34, V);",
        "Comprovação de que funciona no endereço declarado (art. 34, VII);",
        "Comprovantes de experiência prévia (instrumentos de parceria, relatórios, atestados, publicações) e de capacidade técnica e operacional;",
        "Certidões de regularidade fiscal, previdenciária, tributária, de contribuições e de dívida ativa (federal, estadual e municipal), "
        "FGTS (CRF) e trabalhista (CNDT) (art. 34, II);",
        "Declarações conforme os modelos do Anexo V: inexistência dos impedimentos do art. 39; de que não emprega menor em trabalho "
        "noturno, perigoso ou insalubre (art. 7º, XXXIII, da Constituição); de ciência e concordância com o Edital; e sobre as "
        "instalações e condições materiais, que poderão ser adquiridas com recursos da parceria (art. 33, § 5º);",
        "Regulamento de compras e contratações da organização, quando exigido, para aprovação no parecer técnico (art. 35, V, \"i\");",
        "Os documentos sem prazo de validade expresso deverão ter sido emitidos há no máximo 90 (noventa) dias. A organização deverá "
        "manter as condições de habilitação durante toda a vigência da parceria.",
    ], f"{LEI}, arts. 33, 34 e 39")

    sec("Liberação dos recursos, monitoramento e prestação de contas", [
        "Os recursos serão liberados conforme o cronograma de desembolso, em conta bancária específica da parceria, em instituição "
        "financeira pública, isenta de tarifas, e movimentados por transferência eletrônica identificada (arts. 51 e 53).",
        "Excepcionalmente, admite-se pagamento em espécie quando demonstrada a impossibilidade física de transferência, nos limites do "
        "regulamento (art. 54).",
        "A liberação das parcelas ficará retida nas hipóteses do art. 48: evidências de irregularidade, desvio de finalidade, "
        "inadimplemento de obrigações ou falta de medidas saneadoras.",
        f"A parceria será acompanhada pelo gestor ({_v(R, 'gestor', 'gestor da parceria')}) e pela comissão de monitoramento e avaliação, "
        "que homologará os relatórios técnicos; poderá haver pesquisa de satisfação com os beneficiários (arts. 58 e 59).",
        f"A organização prestará contas parciais e finais na forma, nos prazos e com os relatórios definidos no termo e no {dec}; a "
        "prestação de contas final será apresentada em até 90 (noventa) dias do término da vigência, prorrogáveis por 30 dias (art. 69).",
    ], f"{LEI}, arts. 48, 51 a 54, 58, 59, 63 a 69; {dec}")

    sec("Sanções", [
        "Pela execução da parceria em desacordo com o plano de trabalho, com o termo ou com a legislação, a Administração poderá, "
        "garantida a prévia defesa no prazo de 10 (dez) dias, aplicar: I – advertência; II – suspensão temporária da participação em "
        "chamamento público e impedimento de celebrar parceria ou contrato com órgãos e entidades da esfera de governo sancionadora, "
        "por até 2 (dois) anos; III – declaração de inidoneidade (art. 73).",
        "As sanções dos incisos II e III são de competência exclusiva do Secretário (estadual, distrital ou municipal) ou do Ministro, "
        "conforme o caso. A aplicação de penalidade prescreve em 5 (cinco) anos da apresentação da prestação de contas (art. 73, § 2º).",
    ], f"{LEI}, art. 73")

    sec("Disposições finais", [
        f"A parceria poderá ser alterada por termo aditivo ou por apostilamento, nas hipóteses e nos limites do {dec}, vedada a "
        "alteração do objeto.",
        "Os casos omissos serão resolvidos pela Comissão de Seleção, com base na Lei 13.019/2014, no regulamento do ente e nos "
        "princípios da administração pública.",
        f"Fica eleito o foro da comarca de {_v(R, 'municipio', 'município sede do ente')} para dirimir questões decorrentes deste "
        "Edital, após tentativa prévia de solução administrativa (art. 42, XVII).",
        "Integram este Edital: Anexo I – Termo de Referência; Anexo II – Plano de Trabalho orientativo; Anexo III – Critérios de "
        f"julgamento detalhados; Anexo IV – Minuta do {tipo_l}; Anexo V – Modelos de carta de credenciamento e de declarações.",
    ], f"{LEI}, art. 42, XVII; {dec}")

    sec("Anexo I – Termo de Referência", [
        f"Objeto: {objeto}.",
        f"Justificativa: {_v(R, 'necessidade', 'justificativa')}",
        f"Metas e resultados esperados: {_v(R, 'metas', 'metas')}",
        "Detalhamento da execução, obrigações das partes, monitoramento e avaliação: conforme o Plano de Trabalho orientativo e a "
        "minuta do termo.",
        f"Estimativa de custos: valor de referência de {valor}.",
    ], f"{LEI}, art. 24, § 1º, III")

    sec("Anexo II – Plano de Trabalho orientativo", [
        "O Plano de Trabalho orientativo, com a realidade a enfrentar, as metas, as atividades, os indicadores, a previsão de receitas e "
        f"despesas e o cronograma de desembolso, segue anexo (art. 22 e {dec}). Pode ser elaborado no Elaborador do Licitacon "
        "(Plano de trabalho – termo de colaboração).",
    ], f"{LEI}, art. 22")

    sec("Anexo III – Critérios de julgamento detalhados", [
        "Para cada critério do item 9, a Comissão atribuirá: atende integralmente (pontuação máxima), atende parcialmente (metade) "
        "ou não atende (zero), registrando em ata a justificativa de cada nota.",
        "Grau de adequação: proposta coerente com os objetivos, as metas e o público do programa, com atividades vinculadas a cada meta.",
        "Experiência: tempo e quantidade de projetos semelhantes executados, comprovados por documentos idôneos de qualquer origem.",
        "Capacidade técnica e operacional: metodologia, equipe proposta com qualificação e atribuições e infraestrutura a ser "
        "disponibilizada (própria ou a adquirir com a parceria).",
        "Adequação ao valor de referência: custos detalhados, coerentes com as metas e compatíveis com o mercado; não se pontua "
        "apenas o desconto.",
    ], f"{LEI}, art. 27")

    sec(f"Anexo IV – Minuta do {tipo_l}", [
        f"{tipo_l.upper()} Nº [PREENCHER] que entre si celebram {orgao} e [ORGANIZAÇÃO DA SOCIEDADE CIVIL], nos termos da {LEI} e do {dec}.",
        "CLÁUSULA PRIMEIRA – DO OBJETO: execução de " + objeto + ", conforme o Plano de Trabalho, que integra este termo (art. 42, I e parágrafo único).",
        "CLÁUSULA SEGUNDA – DAS OBRIGAÇÕES DAS PARTES: da Administração (repasse conforme o cronograma, monitoramento, análise das "
        "prestações de contas) e da organização (executar o plano, manter a conta específica, prestar contas, manter a habilitação) (art. 42, II).",
        f"CLÁUSULA TERCEIRA – DO VALOR E DO CRONOGRAMA DE DESEMBOLSO: valor total de {valor}, liberado em parcelas conforme o cronograma "
        "do plano de trabalho (art. 42, III).",
        "CLÁUSULA QUARTA – DA CONTRAPARTIDA: " + (contrapartida + ", com a expressão monetária identificada (art. 35, § 1º)." if contrapartida else "não há contrapartida."),
        f"CLÁUSULA QUINTA – DA VIGÊNCIA: {prazo}, a contar da publicação do extrato, prorrogável na forma do Edital (art. 42, VI).",
        "CLÁUSULA SEXTA – DA PRESTAÇÃO DE CONTAS: forma, metodologia e prazos, inclusive a final em até 90 dias (art. 42, VII, e art. 69).",
        "CLÁUSULA SÉTIMA – DO MONITORAMENTO E AVALIAÇÃO: gestor, comissão de monitoramento e avaliação e recursos empregados (art. 42, VIII).",
        "CLÁUSULA OITAVA – DA RESTITUIÇÃO DE RECURSOS: saldos, rendimentos e valores glosados, nos casos previstos em lei (art. 42, IX, e art. 52).",
        "CLÁUSULA NONA – DOS BENS REMANESCENTES: titularidade e destinação, com cláusula de inalienabilidade dos bens adquiridos (art. 35, § 5º, e art. 42, X).",
        "CLÁUSULA DÉCIMA – DA ASSUNÇÃO DO OBJETO: prerrogativa de a Administração assumir ou transferir a execução em caso de "
        "paralisação, para evitar a descontinuidade (art. 42, XII).",
        "CLÁUSULA DÉCIMA PRIMEIRA – DA CONTA BANCÁRIA ESPECÍFICA e do LIVRE ACESSO dos agentes da Administração, do controle interno e "
        "do Tribunal de Contas aos documentos e locais de execução (art. 42, XIV e XV).",
        "CLÁUSULA DÉCIMA SEGUNDA – DA DENÚNCIA E DA RESCISÃO: a qualquer tempo, com antecedência mínima de 60 (sessenta) dias, e nas "
        "hipóteses de descumprimento (art. 42, XVI).",
        "CLÁUSULA DÉCIMA TERCEIRA – DAS RESPONSABILIDADES: gerenciamento administrativo e financeiro e encargos trabalhistas, "
        "previdenciários, fiscais e comerciais exclusivamente da organização, sem responsabilidade solidária ou subsidiária da "
        "Administração (art. 42, XIX e XX).",
        "CLÁUSULA DÉCIMA QUARTA – DAS SANÇÕES: as do art. 73 da Lei 13.019/2014.",
        "CLÁUSULA DÉCIMA QUINTA – DAS ALTERAÇÕES: por termo aditivo ou apostilamento, nos limites do regulamento do ente.",
        f"CLÁUSULA DÉCIMA SEXTA – DO FORO: comarca de {_v(R, 'municipio', 'município')}, após tentativa de solução administrativa (art. 42, XVII).",
    ], f"{LEI}, art. 42")

    sec("Anexo V – Modelos de carta de credenciamento e de declarações", [
        "Carta de credenciamento: a [OSC], CNPJ [nº], por seu representante legal, credencia [nome, RG e CPF] para representá-la no "
        "Chamamento Público nº [nº], com poderes para apresentar documentos, assinar atas, interpor e desistir de recursos.",
        "Declaração de inexistência de impedimento: a [OSC] declara que não incorre em nenhuma das vedações do art. 39 da Lei "
        "13.019/2014 nem nas previstas no regulamento do ente, e apresenta a relação nominal dos seus dirigentes.",
        "Declaração de ciência e concordância: a [OSC] declara que conhece e aceita as condições do Edital e de seus anexos e que se "
        "responsabiliza pela veracidade das informações e documentos apresentados.",
        "Declaração sobre trabalho de menores: a [OSC] declara que não emprega menor de 18 anos em trabalho noturno, perigoso ou "
        "insalubre, nem menor de 16 anos, salvo na condição de aprendiz, a partir de 14 anos (art. 7º, XXXIII, da Constituição).",
        "Declaração sobre instalações e condições materiais: a [OSC] declara que dispõe, ou que adquirirá com recursos da parceria, das "
        "instalações e condições materiais necessárias à execução do objeto (art. 33, V, \"c\", e § 5º).",
    ], f"{LEI}, arts. 33, 34 e 39")

    pend = [t for t in ([f"Decreto do ente que regulamenta a Lei 13.019/2014 (citado como \"{dec}\")"] if not decreto else []) +
            ["Datas do cronograma (publicação, data-limite das propostas com no mínimo 30 dias, sessão e resultado)"]]
    return {"titulo": "EDITAL DE CHAMAMENTO PÚBLICO Nº [PREENCHER]/[ANO]", "secoes": secoes, "pendencias": pend, "jurisprudencia_ids": []}


def texto_plano(docj):
    partes = [docj.get("titulo", "")]
    for s in docj.get("secoes", []):
        partes.append(f"\n{s.get('titulo','').upper()}")
        partes += s.get("paragrafos", [])
    return "\n".join(partes)
