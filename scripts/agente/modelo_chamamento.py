"""Modelos padrão Licitacon da Lei 13.019/2014: edital de chamamento público, justificativa de dispensa ou
inexigibilidade de chamamento e plano de trabalho do termo de colaboração.

Edital de chamamento público.

Estrutura: a do Edital de Chamamento Público nº 1/2026/SNP-MCID (Ministério das Cidades, termo de colaboração),
adaptada a qualquer ente e seguida na ordem: preâmbulo; 1 propósito; 2 objeto; 3 justificativa; 4 participação;
5 requisitos e impedimentos; 6 comissão de seleção; 7 fase de seleção (tabela de etapas, critérios de eliminação e
de julgamento ligados aos itens do plano de trabalho); 8 fase de celebração; 9 programação orçamentária e valor;
10 contrapartida; 11 disposições finais.

O que não se repete daquele edital: as remissões internas erradas (itens 8.2.2, 8.2.4 e 9.6.3, que não existem), as
regras próprias da União (Transferegov, Decreto federal 8.726/2016, CAUC e CADIN; aqui vale o decreto do ente) e a
suspensão ou rescisão pela OSC por atraso no repasse, que não está na Lei 13.019. Também não se repetem falhas comuns
de editais municipais: proposta no valor de referência desclassificada, capacidade instalada prévia exigida,
autenticação de cópias, cessão de direitos autorais da proposta e cobrança pela cópia do edital.

O edital é elaborado a partir do plano de trabalho fornecido pelo assinante: objeto, metas, ações, indicadores, prazos,
valor e cronograma vêm dele. O edital sai sem anexos (plano de trabalho, minuta do termo e declarações são juntados
pelo órgão). O texto é completo mesmo sem a IA; na elaboração real ele é a base que o agente adapta.
"""
import re

LEI = "Lei nº 13.019, de 31 de julho de 2014"


def _v(R, k, desc):
    v = str((R or {}).get(k) or "").strip()
    return v if v else f"[PREENCHER: {desc}]"


def _meio(t):
    """Texto que entra no meio da frase: primeira letra minúscula (salvo sigla ou nome próprio em maiúsculas)."""
    return t[0].lower() + t[1:] if len(t) > 1 and t[0].isupper() and t[1].islower() else t


def esfera(orgao):
    o = (orgao or "").lower()
    if re.search(r"prefeitura|munic[ií]pio|c[aâ]mara municipal", o):
        return "municipal", "1 (um) ano"
    if re.search(r"distrito federal|governo do estado|estado d[eo]|secretaria de estado", o):
        return "estadual", "2 (dois) anos"
    if re.search(r"uni[aã]o|minist[eé]rio|federal", o):
        return "federal", "3 (três) anos"
    return "", "[PREENCHER: tempo mínimo de existência da OSC: 1 ano (município), 2 anos (estado ou DF) ou 3 anos (União), art. 33, V, \"a\"]"


def _solto(t):
    return isinstance(t, str) and (re.match(r"^[a-z]\) ", t) or t.startswith("|") or t.startswith("Tabela "))


def _numerar(itens, n):
    """Numera itens: str → n.k; tupla (texto, [subitens]) → n.k e n.k.j; alíneas "a) ..." e linhas de tabela ficam sem número."""
    out, k = [], 0
    for it in itens:
        if _solto(it):
            out.append(it)
            continue
        k += 1
        if isinstance(it, tuple):
            out.append(f"{n}.{k} {it[0]}")
            j = 0
            for sub in it[1]:
                if _solto(sub):
                    out.append(sub)
                else:
                    j += 1
                    out.append(f"{n}.{k}.{j} {sub}")
        else:
            out.append(f"{n}.{k} {it}")
    return out


NIVEIS = "grau pleno (100% da pontuação do item), grau satisfatório (70%), grau baixo (40%) e não atendimento (zero)"


def tabela_julgamento(R):
    """Tabela 4 (critérios de julgamento ligados aos itens do plano de trabalho) e quais critérios eliminam com nota zero."""
    proprio = str(R.get("criterios_selecao") or "").strip()
    if proprio:
        return (["Tabela 4 – Critérios de julgamento",
                 "| Critérios e pesos | Metodologia de pontuação |",
                 f"| {proprio} | Quatro níveis por critério: {NIVEIS}, com a justificativa de cada nota em ata. |"],
                "no grau de adequação aos objetivos do programa ou na experiência")
    return (["Tabela 4 – Critérios de julgamento",
             "| Critério | Item do plano de trabalho | Metodologia | Pontuação máxima |",
             "| (A) Ações a executar, metas, indicadores de aferição e prazos | Metas, etapas, produtos e indicadores | " + NIVEIS + " | 20 |",
             "| (A) Cronograma coerente com as metas e os resultados | Cronograma de execução | " + NIVEIS + " | 10 |",
             "| (B) Adequação aos objetivos da política, do programa ou da ação (critério obrigatório, art. 27) | Atividades e metodologia | " + NIVEIS + " | 25 |",
             "| (C) Descrição da realidade e nexo com as ações propostas | Realidade objeto da parceria | " + NIVEIS + " | 25 |",
             "| (D) Adequação ao valor de referência, com menção expressa ao valor global | Previsão de receitas e despesas | Valor global igual ou inferior ao de referência, com custos coerentes com as metas (10); custos parcialmente coerentes (5); incoerentes (0) | 10 |",
             "| (E) Experiência e capacidade técnica e operacional no objeto ou em natureza semelhante | Experiência da organização | Duas ou mais experiências comprovadas (10); uma (5); nenhuma (0) | 10 |",
             "| Pontuação máxima global | | | 100 |"],
            "nos critérios (A), (B), (C) ou (E)")


def documento(R, decreto="", plano=""):
    """Edital no formato do Elaborador: {titulo, preambulo, secoes[{titulo, paragrafos, fundamento}], pendencias}."""
    R = dict(R or {})
    dec = decreto or "[PREENCHER: decreto que regulamenta a Lei 13.019/2014 no ente]"
    orgao = _v(R, "orgao", "órgão ou entidade")
    unidade = _v(R, "unidade", "secretaria ou unidade responsável")
    tipo = (R.get("tipo_parceria") or "").strip() or "Termo de Colaboração"
    tipo_l = tipo[0].upper() + tipo[1:]
    fomento = "fomento" in tipo.lower()
    _, existencia = esfera(R.get("orgao", ""))
    processo = _v(R, "processo", "nº do processo administrativo")
    objeto = _meio(_v(R, "objeto", "objeto da parceria"))
    valor = _v(R, "valor", "valor de referência da parceria (do plano de trabalho)")
    prazo = (R.get("prazo") or "").strip()
    if prazo == "Outro":
        prazo = (R.get("prazo_outro") or "").strip()
    prazo = prazo or "[PREENCHER: prazo de execução da parceria (do plano de trabalho)]"
    contato = _v(R, "contato", "e-mail ou endereço para esclarecimentos, impugnações e recursos")
    eletronico = "físico" not in str(R.get("envio_propostas", "")).lower()
    contrapartida = (R.get("contrapartida") or "").strip()
    da = "da" if re.match(r"(?i)secretaria|diretoria|coordenadoria|superintend|subsecretaria|funda", unidade) else "de"
    plano_ref = "o plano de trabalho" + (" que integra o processo" if plano else "")
    tab4, zero_elimina = tabela_julgamento(R)
    secoes = []

    def sec(titulo, itens, fundamento):
        secoes.append({"titulo": titulo, "paragrafos": _numerar(itens, len(secoes) + 1), "fundamento": fundamento})

    preambulo = [f"{orgao.upper()}, POR MEIO {da.upper()} {unidade.upper()}, com fundamento na {LEI} e no {dec}, torna público o "
                 f"presente Edital de Chamamento Público visando à seleção de organização da sociedade civil interessada em celebrar "
                 f"{tipo_l} que tenha por objeto {objeto}. Processo administrativo nº {processo}."]

    sec("Propósito do Edital de Chamamento Público", [
        f"A finalidade do presente Edital é a seleção de proposta para a celebração de parceria com {orgao}, por meio da formalização "
        f"de {tipo_l}.",
        f"O Edital se destina a organizações da sociedade civil interessadas em executar o objeto, conforme este Edital e {plano_ref}.",
        "As propostas deverão ser elaboradas e apresentadas com o conteúdo mínimo do item 7.4 e em conformidade com o plano de trabalho.",
        f"O procedimento de seleção reger-se-á pela {LEI}, pelo {dec} e pelos demais normativos aplicáveis, além das condições deste Edital.",
        "Será selecionada 1 (uma) proposta, observadas a ordem de classificação, a pontuação mínima e a disponibilidade orçamentária. "
        "Havendo disponibilidade orçamentária adicional, poderão ser selecionadas mais propostas, respeitada a ordem de classificação, "
        "durante a validade do Edital.",
    ], f"{LEI}, arts. 23 e 24; {dec}")

    sec(f"Objeto do {tipo_l}", [
        f"O {tipo_l} terá por objeto {objeto}, conforme {plano_ref}.",
        ("Objetivos específicos e metas da parceria:", [_v(R, "metas", "objetivos, metas e público atendido (do plano de trabalho)")]
         + ([f"Quantitativos e locais de execução: {R['quantidades'].strip()}"] if str(R.get("quantidades") or "").strip() else [])),
        f"O prazo de execução da parceria é de {prazo}, contado da publicação do extrato do {tipo_l}, prorrogável na forma do {dec}.",
        "A execução observará a legislação de acessibilidade (Lei nº 13.146/2015), garantindo atendimento adequado a pessoas com "
        "deficiência ou mobilidade reduzida e idosos, conforme as características do objeto (art. 24, § 1º, X).",
    ], f"{LEI}, art. 24, § 1º, III e X")

    sec("Justificativa", [
        _v(R, "necessidade", "realidade que motiva a parceria e interesse público envolvido (do plano de trabalho)"),
        ("A parceria por termo de fomento atende a proposta de iniciativa das organizações da sociedade civil (art. 17)." if fomento else
         "A parceria por termo de colaboração decorre de proposta da Administração, que definiu o objeto, as metas e o plano de trabalho (art. 16)."),
        "O Chamamento contribui para o cumprimento das competências da unidade responsável, em acordo com os instrumentos de "
        "planejamento e de orçamento do ente.",
    ], f"{LEI}, arts. 16 e 17")

    sec("Participação no Chamamento Público", [
        ("Poderão participar deste Edital as organizações da sociedade civil (OSCs) definidas no art. 2º, I, da Lei 13.019/2014:", [
            "a) entidade privada sem fins lucrativos (associação ou fundação) que não distribua entre os seus sócios ou associados, "
            "conselheiros, diretores, empregados, doadores ou terceiros eventuais resultados, sobras, excedentes operacionais, "
            "dividendos, isenções ou parcelas do seu patrimônio, e que os aplique integralmente na consecução do seu objeto social;",
            "b) as sociedades cooperativas previstas no art. 2º, I, \"b\", da Lei 13.019/2014; ou",
            "c) as organizações religiosas que se dediquem a atividades ou a projetos de interesse público e de cunho social distintas "
            "das destinadas a fins exclusivamente religiosos."]),
        ("Para participar deste Edital, a OSC deverá:", [
            "a) declarar que está ciente e concorda com as disposições do Edital e que se responsabiliza pela veracidade e "
            "legitimidade das informações e documentos apresentados durante o processo de seleção; e",
            "b) estar cadastrada no órgão competente do ente, quando o regulamento o exigir."]),
        "Cada OSC poderá apresentar apenas uma proposta. Havendo mais de uma dentro do prazo, será considerada a última enviada.",
        ("A execução da parceria poderá se dar por atuação em rede de duas ou mais OSCs (art. 35-A), com:", [
            "a) uma \"OSC celebrante\", que assinará o termo, responderá pelos atos da rede e atuará como sua supervisora, mobilizadora "
            "e orientadora, devendo possuir mais de 5 (cinco) anos de inscrição no CNPJ, mais de 3 (três) anos de experiência de "
            "atuação em rede e capacidade técnica e operacional para supervisionar e orientar a rede; e",
            "b) uma ou mais \"OSCs executantes e não celebrantes\", que executarão ações definidas em comum acordo com a celebrante e "
            "comprovarão regularidade jurídica e fiscal."]),
        "A OSC que propuser atuação em rede informará na proposta as OSCs executantes e não celebrantes e a forma de participação de "
        "cada uma. A relação não poderá ser alterada sem prévio consentimento da Administração.",
    ], f"{LEI}, arts. 2º, I, e 35-A")

    sec(f"Requisitos e impedimentos para a celebração do {tipo_l}", [
        ("A OSC selecionada deverá ter normas de organização interna que prevejam expressamente (art. 33):", [
            "a) objetivos voltados à promoção de atividades e finalidades de relevância pública e social;",
            "b) que, em caso de dissolução, o patrimônio líquido seja transferido a outra pessoa jurídica de igual natureza que preencha "
            "os requisitos da Lei 13.019/2014, preferencialmente com o mesmo objeto social; e",
            "c) escrituração de acordo com os princípios fundamentais de contabilidade e com as Normas Brasileiras de Contabilidade."]),
        f"A OSC deverá possuir, no mínimo, {existencia} de existência com cadastro ativo no CNPJ, experiência prévia na realização do "
        "objeto ou de objeto de natureza semelhante e instalações, condições materiais e capacidade técnica e operacional, admitida a "
        "previsão de contratá-las ou adquiri-las com recursos da parceria, sem exigência de capacidade instalada prévia (art. 33, V, e § 5º).",
        ("Ficará impedida de celebrar o termo a OSC que (art. 39):", [
            "a) não esteja regularmente constituída ou, se estrangeira, não esteja autorizada a funcionar no território nacional;",
            "b) esteja omissa no dever de prestar contas de parceria anteriormente celebrada;",
            "c) tenha, em seu quadro de dirigentes, membro de Poder ou do Ministério Público, ou dirigente de órgão ou entidade da "
            "administração pública da mesma esfera de governo, estendendo-se a vedação aos cônjuges, companheiros e parentes até o "
            "segundo grau, exceto as entidades que, por sua natureza, sejam constituídas por essas autoridades; não são membros de Poder "
            "os integrantes de conselhos de direitos e de políticas públicas;",
            "d) tenha tido as contas rejeitadas pela administração pública nos últimos 5 (cinco) anos, exceto se sanada a irregularidade "
            "e quitados os débitos, se reconsiderada ou revista a decisão, ou se pendente recurso com efeito suspensivo;",
            "e) tenha sido punida, pelo período que durar a penalidade, com suspensão de participação em licitação ou em chamamento "
            "público, impedimento de contratar ou de celebrar parceria, ou declaração de inidoneidade;",
            "f) tenha tido contas de parceria julgadas irregulares ou rejeitadas por Tribunal ou Conselho de Contas, em decisão "
            "irrecorrível, nos últimos 8 (oito) anos; ou",
            "g) tenha entre seus dirigentes pessoa com contas de parceria julgadas irregulares nos últimos 8 (oito) anos, julgada "
            "responsável por falta grave e inabilitada para cargo em comissão ou função de confiança, ou considerada responsável por ato "
            "de improbidade, enquanto durarem os prazos do art. 12 da Lei nº 8.429/1992."]),
        f"Aplicam-se, ainda, os impedimentos previstos no {dec}, desde que pertinentes ao objeto e sem restringir indevidamente a "
        "competição (art. 24, § 2º).",
    ], f"{LEI}, arts. 24, § 2º, 33 e 39; {dec}")

    sec("Comissão de Seleção", [
        "A Comissão de Seleção é o órgão colegiado destinado a processar e julgar o presente Chamamento Público, designada por ato "
        f"publicado previamente à avaliação das propostas ({_v(R, 'agente', 'ato de designação da Comissão de Seleção')}), com ao menos "
        "um servidor ocupante de cargo efetivo ou emprego permanente.",
        ("O membro da Comissão deverá declarar-se impedido quando:", [
            "a) participe ou tenha participado, nos últimos 5 (cinco) anos, como associado, cooperado, dirigente, conselheiro ou "
            "empregado de qualquer OSC participante (art. 27, § 2º);",
            "b) seu cônjuge, companheiro ou parente até o terceiro grau esteja na mesma situação; ou",
            "c) sua atuação configure conflito de interesses, nos termos da Lei nº 12.813/2013."]),
        "A declaração de impedimento não obsta a continuidade do processo. O membro impedido será substituído por outro de qualificação "
        "equivalente, sem necessidade de novo Edital (art. 27, § 3º).",
        "A Comissão poderá solicitar assessoramento técnico de especialista que não seja seu membro.",
        "A Comissão poderá realizar, a qualquer tempo, diligências para verificar a autenticidade das informações e documentos ou para "
        "esclarecer dúvidas e omissões, observados os princípios da isonomia, da impessoalidade e da transparência.",
        "É vedada a participação em rede de OSC executante e não celebrante que tenha mantido relação jurídica com algum membro da "
        "Comissão de Seleção.",
    ], f"{LEI}, arts. 2º, X, e 27")

    envio = ("por meio eletrônico, pelo canal indicado no item 11.2, em arquivo PDF pesquisável assinado pelo representante legal"
             if eletronico else "em envelope lacrado, no endereço indicado no item 11.2, com cópia em mídia digital (PDF pesquisável)")
    sec("Fase de seleção", [
        ("A fase de seleção observará as seguintes etapas:", [
            "Tabela 2 – Etapas da fase de seleção",
            "| Etapa | Descrição | Datas |",
            "| 1 | Publicação do Edital no sítio oficial do ente | [PREENCHER: data de publicação] |",
            "| 2 | Envio das propostas pelas OSCs (mínimo de 30 dias da publicação) | [PREENCHER: período de envio das propostas] |",
            "| 3 | Etapa competitiva de avaliação das propostas pela Comissão de Seleção | [PREENCHER: período de avaliação] |",
            "| 4 | Divulgação do resultado preliminar | [PREENCHER: data do resultado preliminar] |",
            "| 5 | Interposição de recursos contra o resultado preliminar | 5 (cinco) dias corridos da divulgação |",
            "| 6 | Contrarrazões dos recursos | 5 (cinco) dias corridos do fim do prazo recursal |",
            "| 7 | Análise dos recursos e homologação e publicação do resultado definitivo | Após a decisão dos recursos |"]),
        "A verificação do cumprimento dos requisitos para a celebração e da não ocorrência de impedimento é posterior à etapa "
        "competitiva e exigível apenas da OSC selecionada.",
        "Etapa 1 – O Edital será divulgado no sítio oficial do ente na internet, com prazo mínimo de 30 (trinta) dias para a "
        "apresentação das propostas, contado da publicação (art. 26).",
        (f"Etapa 2 – As propostas serão enviadas {envio}, até a data e o horário finais da Etapa 2, e deverão conter, no mínimo:", [
            "a) a descrição da realidade objeto da parceria e o nexo com a atividade ou o projeto proposto;",
            "b) as ações a serem executadas, as metas a serem atingidas e os indicadores que aferirão o cumprimento das metas;",
            "c) os prazos para a execução das ações e para o cumprimento das metas; e",
            "d) o valor global, com a previsão de receitas e despesas."]),
        ("Etapa 3 – Na etapa competitiva, de caráter eliminatório e classificatório, a Comissão verificará primeiro o atendimento às "
         "condições do Edital, conforme a Tabela 3; somente as propostas que atenderem a todos os itens serão pontuadas.", [
            "Tabela 3 – Critérios de eliminação",
            "| Item | Critério | Forma de comprovação |",
            "| 1 | Envio no prazo, pelo meio previsto | Registro do recebimento |",
            "| 2 | Conteúdo mínimo do item 7.4 | Proposta |",
            "| 3 | Coerência com o objeto e as metas do plano de trabalho | Proposta |",
            "| 4 | Declaração de ciência e concordância com o Edital | Declaração do representante legal |"]),
        ("As propostas serão pontuadas pelos critérios da Tabela 4, ligados aos itens do plano de trabalho:", tab4),
        "A OSC descreverá as experiências com as atividades ou projetos desenvolvidos, duração, financiadores, local, beneficiários e "
        "resultados alcançados. A comprovação documental ocorrerá na fase de celebração. A falsidade de informação acarretará a "
        "eliminação da proposta, a aplicação de sanção e a comunicação às autoridades competentes.",
        ("Será eliminada a proposta:", [
            "a) cuja pontuação total for inferior a 60 (sessenta) pontos;",
            f"b) que receber nota zero {zero_elimina};",
            "c) que estiver em desacordo com o Edital ou incorrer em critério de eliminação da Tabela 3; ou",
            "d) com valor global superior ao de referência ou incompatível com o objeto, a ponto de inviabilizar a execução, avaliado "
            "pela Comissão à luz da estimativa e de diligências."]),
        f"Aplica-se o fator de redução da nota previsto no {dec} à OSC com prestação de contas rejeitada ou aprovada com ressalvas nos "
        "últimos 5 (cinco) anos, quando o regulamento o previr.",
        "As propostas não eliminadas serão classificadas em ordem decrescente da pontuação total, calculada pela média aritmética das "
        "notas atribuídas por cada membro da Comissão em cada critério.",
        "No empate, prevalecerá a maior pontuação, sucessivamente, nos critérios (A), (B), (C) e (E); persistindo, a OSC com maior "
        "tempo de constituição; por último, sorteio em sessão pública comunicada com antecedência mínima de 2 (dois) dias úteis, com ata.",
        "O prazo de julgamento poderá ser prorrogado, de forma justificada, por até 30 (trinta) dias.",
        "Será obrigatoriamente justificada a seleção de proposta que não for a mais adequada ao valor de referência, considerando a "
        "pontuação total e a proporção entre metas, resultados e valor (art. 27, § 5º). A proposta com valor igual ao de referência não "
        "é eliminada por esse motivo.",
        "Etapa 4 – O resultado preliminar, com as notas de cada critério, será divulgado no sítio oficial do ente, iniciando-se o prazo "
        "de recurso.",
        "Etapas 5 e 6 – O recurso será apresentado à Comissão de Seleção no prazo de 5 (cinco) dias corridos da divulgação, pelo canal do "
        "item 11.2, sob pena de preclusão. As demais OSCs serão cientificadas para contrarrazões em 5 (cinco) dias corridos, assegurado o "
        "acesso aos elementos dos autos indispensáveis à defesa.",
        "Etapa 7 – A Comissão poderá reconsiderar sua decisão em até 5 (cinco) dias corridos do fim do prazo de contrarrazões ou, no "
        "mesmo prazo, encaminhar o recurso à autoridade competente, que decidirá de forma motivada em até 15 (quinze) dias corridos, "
        f"sem novo recurso, salvo previsão diversa no {dec}. O acolhimento do recurso invalida apenas os atos insuscetíveis de "
        "aproveitamento.",
        "Decididos os recursos, ou sem recurso, o resultado definitivo será homologado e divulgado no sítio oficial, com as decisões "
        "recursais (art. 27, § 4º). A homologação não gera direito à celebração (art. 27, § 6º).",
        "Havendo uma única proposta classificada, a Administração poderá prosseguir e convocá-la para a celebração.",
    ], f"{LEI}, arts. 24, § 1º, IV, V e VIII, 26 e 27; {dec}")

    sec("Fase de celebração", [
        ("A fase de celebração observará as seguintes etapas:", [
            "Tabela 5 – Etapas da fase de celebração",
            "| Etapa | Descrição |",
            "| 1 | Convocação da OSC selecionada para apresentar o plano de trabalho e os documentos dos requisitos |",
            "| 2 | Verificação dos requisitos e impedimentos e análise do plano de trabalho |",
            "| 3 | Regularização de documentação, se necessário |",
            "| 4 | Pareceres técnico e jurídico e assinatura do termo |",
            "| 5 | Publicação do extrato do termo |"]),
        "Etapa 1 – A OSC selecionada será convocada para, em até 15 (quinze) dias corridos, apresentar o plano de trabalho detalhado e "
        "os documentos que comprovam os requisitos para a celebração e a não ocorrência de impedimentos.",
        ("O plano de trabalho detalhará a proposta selecionada e conterá, no mínimo (art. 22):", [
            "a) a descrição da realidade objeto da parceria e o nexo com a atividade ou o projeto e com as metas;",
            "b) a forma de execução das ações, indicando as que demandarão atuação em rede, se houver;",
            "c) as metas quantitativas e mensuráveis;",
            "d) os indicadores, documentos e outros meios de aferição do cumprimento das metas;",
            "e) a previsão de receitas e despesas, com os encargos sociais e trabalhistas e os custos diretos e indiretos;",
            "f) os valores a serem repassados, conforme cronograma de desembolso; e",
            "g) as ações que demandarão pagamento em espécie, quando for o caso (art. 54)."]),
        ("A compatibilidade dos custos com os preços de mercado, exceto encargos sociais e trabalhistas, será demonstrada por um ou "
         "mais destes elementos, entre outros:", [
            "a) contratação similar ou parceria da mesma natureza concluída nos últimos três anos ou em execução;",
            "b) ata de registro de preços vigente de órgão ou entidade pública da região;",
            "c) tabela de preços de associações profissionais ou tabela referencial da política pública setorial;",
            "d) pesquisa publicada em mídia especializada ou sítio eletrônico especializado, com data e hora de acesso;",
            "e) Portal Nacional de Contratações Públicas (PNCP) ou Compras.gov.br;",
            "f) cotação com três fornecedores ou prestadores de serviço, por item ou por agrupamento de despesas; ou",
            "g) pesquisa de remuneração para atividades similares na região e acordos ou convenções coletivas de trabalho."]),
        ("No mesmo prazo, a OSC comprovará os requisitos dos arts. 2º, I, 33 e 34 e a não ocorrência das vedações do art. 39, por meio de:", [
            "a) cópia do estatuto registrado e suas alterações, com as exigências do art. 33;",
            "b) comprovante de inscrição no CNPJ que demonstre o tempo mínimo de existência do item 5.2;",
            "c) comprovantes de experiência prévia, admitidos, entre outros: instrumentos de parceria, inclusive em rede, firmados com "
            "órgãos públicos, organismos internacionais, empresas ou outras OSCs; relatórios de atividades; publicações e pesquisas; "
            "currículos de integrantes; declarações de experiência emitidas por órgãos públicos, instituições de ensino, redes, "
            "conselhos ou empresas; e prêmios recebidos;",
            "d) certidões de regularidade fiscal, previdenciária, tributária e de dívida ativa, CRF/FGTS e CNDT, aceitas as positivas "
            "com efeito de negativas e dispensada a reapresentação das disponíveis eletronicamente;",
            "e) relação nominal atualizada dos dirigentes, com endereço, telefone, e-mail, RG e CPF de cada um;",
            "f) comprovante de funcionamento no endereço declarado, como conta de consumo ou contrato de locação;",
            "g) declaração de que a OSC e seus dirigentes não incorrem nas vedações do art. 39;",
            "h) declaração sobre as instalações e condições materiais ou sobre a previsão de contratá-las ou adquiri-las com recursos da "
            "parceria;",
            "i) declaração de contrapartida em bens e serviços, quando couber; e",
            "j) na atuação em rede, comprovantes de que a celebrante atende ao item 4.4."]),
        "Não será exigido reconhecimento de firma nem autenticação de cópias (Lei nº 13.726/2018, art. 3º).",
        "Etapa 2 – A Administração verificará os requisitos e impedimentos, consultando os cadastros de entidades impedidas e de sanções "
        "(CEPIM, CEIS e CNEP) e os cadastros próprios do ente, e analisará o plano de trabalho, que será ajustado em diálogo técnico, "
        "observados o Edital, a proposta selecionada e as necessidades da política pública.",
        "Se a OSC selecionada não atender aos requisitos, a imediatamente mais bem classificada poderá ser convidada a celebrar a "
        "parceria nos termos da proposta por ela apresentada, repetindo-se o procedimento, se necessário.",
        "Etapa 3 – Constatada irregularidade formal ou evento que impeça a celebração, a OSC será comunicada para regularizar a "
        "situação em até 15 (quinze) dias corridos, sob pena de não celebração.",
        "Etapa 4 – A celebração dependerá da aprovação do plano de trabalho, do parecer técnico, do parecer jurídico, da designação do "
        "gestor e da comissão de monitoramento e avaliação e da prévia dotação orçamentária (art. 35). A aprovação do plano de trabalho "
        "não gera direito à celebração. Até a assinatura, a OSC informará qualquer evento superveniente que possa prejudicá-la.",
        f"Etapa 5 – O {tipo_l} somente produzirá efeitos jurídicos após a publicação do extrato no meio oficial de publicidade do ente (art. 38).",
    ], f"{LEI}, arts. 22, 33 a 35, 38 e 39; Lei nº 13.726/2018")

    sec("Programação orçamentária e valor previsto para a realização do objeto", [
        f"Os créditos orçamentários são provenientes da seguinte dotação: {_v(R, 'fonte', 'programa de trabalho, elemento de despesa e fonte de recursos')}.",
        "Nas parcerias plurianuais ou firmadas em exercício seguinte ao da seleção, os créditos dos exercícios seguintes serão indicados "
        "por certidão de apostilamento.",
        f"O valor de referência para a realização do objeto é de {valor}, conforme o plano de trabalho. O valor exato a ser repassado "
        "será definido no termo, observada a proposta selecionada.",
        ("As liberações de recursos obedecerão ao cronograma de desembolso, em consonância com as metas, e:", [
            "a) os recursos serão depositados em conta corrente específica, isenta de tarifa bancária, em instituição financeira pública (art. 51);",
            "b) enquanto não empregados, serão aplicados em caderneta de poupança, fundo de aplicação financeira de curto prazo ou operação "
            "de mercado aberto lastreada em títulos da dívida pública; e",
            "c) as parcelas ficarão retidas quando houver evidência de irregularidade, desvio de finalidade, inadimplemento da OSC ou falta "
            "de adoção das medidas saneadoras apontadas (art. 48)."]),
        ("Poderão ser pagas com recursos da parceria, se previstas e aprovadas no plano de trabalho (art. 46):", [
            "a) remuneração da equipe encarregada da execução, inclusive de pessoal próprio da OSC, com os encargos sociais e trabalhistas;",
            "b) diárias de deslocamento, hospedagem e alimentação, quando a execução o exigir;",
            "c) custos indiretos necessários à execução do objeto; e",
            "d) equipamentos e materiais permanentes essenciais ao objeto e a adequação de espaço físico necessária à sua instalação."]),
        "É vedado remunerar, com recursos da parceria, servidor ou empregado público do ente celebrante, inclusive em cargo em comissão "
        "ou função de confiança, ou seu cônjuge, companheiro ou parente até o segundo grau, ressalvadas as hipóteses legais (art. 45).",
        "Os saldos financeiros remanescentes, inclusive os rendimentos das aplicações, serão devolvidos na conclusão, denúncia, rescisão "
        "ou extinção da parceria (art. 52).",
        "A seleção não obriga a Administração a celebrar a parceria, que depende da disponibilidade orçamentária e financeira e do "
        "interesse público; as OSCs não têm direito subjetivo ao repasse.",
    ], f"{LEI}, arts. 24, § 1º, I e VI, 45, 46, 48, 51 e 52")

    sec("Contrapartida", [
        ("Será exigida contrapartida em bens e serviços: " + contrapartida + ", com a expressão monetária identificada no termo."
         if contrapartida else "Não será exigida contrapartida da OSC selecionada."),
        "Contrapartida financeira não será requisito para a celebração (art. 35, § 1º). A OSC poderá oferecer contrapartida voluntária "
        "em bens e serviços, mediante declaração.",
    ], f"{LEI}, art. 35, § 1º")

    sec("Disposições finais", [
        "Qualquer pessoa poderá impugnar o Edital ou pedir esclarecimentos com antecedência mínima de 10 (dez) dias da data-limite para "
        "o envio das propostas. As respostas caberão à Comissão de Seleção.",
        f"Canal de atendimento para esclarecimentos, impugnações e recursos: {contato}.",
        "As impugnações e os pedidos de esclarecimento não suspendem os prazos. As respostas serão juntadas aos autos e disponibilizadas "
        "a qualquer interessado. Modificação do Edital será divulgada da mesma forma que o texto original, reabrindo-se o prazo quando "
        "afetar a formulação das propostas ou a isonomia.",
        "A Administração resolverá os casos omissos, observadas as disposições legais e os princípios da Administração Pública.",
        "O Edital poderá ser revogado por interesse público ou anulado, no todo ou em parte, por vício insanável, sem direito a "
        "indenização ou reclamação.",
        "A OSC é responsável pela fidelidade e legitimidade das informações e documentos apresentados. A falsidade poderá acarretar a "
        "eliminação da proposta, a aplicação de sanções e a comunicação às autoridades; descoberta após a celebração, poderá ensejar a "
        "rescisão, a rejeição das contas e as sanções do art. 73.",
        "A Administração não cobrará taxa para participar do Chamamento nem para obter o Edital. Os custos de elaboração das propostas "
        "são de responsabilidade das OSCs.",
        "As OSCs observarão as condutas vedadas em período eleitoral (Lei nº 9.504/1997), sendo vedada qualquer promoção pessoal, "
        "político-partidária ou eleitoral nas ações e na comunicação da parceria.",
        "O Edital terá validade de 12 (doze) meses, contados da homologação do resultado definitivo.",
        f"Integram o processo, juntados pela Administração: o plano de trabalho, a minuta do {tipo_l} (art. 24, § 1º, IX) e os modelos "
        "de declaração.",
    ], f"{LEI}, arts. 24, § 1º, IX, 26 e 73; Lei nº 9.504/1997; {dec}")

    return {"titulo": "EDITAL DE CHAMAMENTO PÚBLICO Nº [PREENCHER: número do edital]", "preambulo": preambulo,
            "secoes": secoes, "pendencias": [], "jurisprudencia_ids": []}


def texto_plano(docj):
    partes = [docj.get("titulo", "")] + list(docj.get("preambulo") or [])
    for i, s in enumerate(docj.get("secoes", []), 1):
        partes.append(f"\n{i}. {s.get('titulo','').upper()}")
        partes += s.get("paragrafos", [])
    return "\n".join(partes)


# ---------------------------------------------------------------- justificativa de dispensa ou inexigibilidade (art. 32)
HIPOTESES = [  # (trecho que identifica a escolha do assinante, enquadramento, requisitos a demonstrar)
    ("art. 30, I", "dispensa de chamamento público por urgência decorrente de paralisação ou iminência de paralisação de atividades de "
     "relevante interesse público, pelo prazo de até 180 (cento e oitenta) dias (art. 30, I)",
     ["a atividade paralisada ou em risco de paralisação e o seu relevante interesse público;",
      "a urgência concreta, que não permite aguardar o prazo do chamamento público (no mínimo 30 dias de divulgação, art. 26);",
      "que a parceria se limita a 180 (cento e oitenta) dias, sem prorrogação que ultrapasse esse prazo, e que o chamamento público "
      "será iniciado para a continuidade, se a necessidade persistir."]),
    ("art. 30, II", "dispensa de chamamento público em caso de guerra, calamidade pública, grave perturbação da ordem pública ou "
     "ameaça à paz social (art. 30, II)",
     ["a situação excepcional, com o ato que a reconhece (decreto de calamidade, se houver);",
      "o nexo entre a situação e o objeto da parceria; e",
      "que a duração e o escopo da parceria se limitam ao necessário para enfrentar a situação."]),
    ("art. 30, III", "dispensa de chamamento público para a realização de programa de proteção a pessoas ameaçadas ou em situação "
     "que possa comprometer a sua segurança (art. 30, III)",
     ["o programa de proteção e o público atendido;",
      "por que a publicidade de um chamamento comprometeria a segurança das pessoas protegidas; e",
      "as medidas de sigilo adotadas na execução e na prestação de contas, nos limites da lei."]),
    ("art. 30, VI", "dispensa de chamamento público para atividades voltadas ou vinculadas a serviços de educação, saúde ou "
     "assistência social, executadas por organização da sociedade civil previamente credenciada pelo órgão gestor da política (art. 30, VI)",
     ["que a atividade é de educação, saúde ou assistência social;",
      "o credenciamento prévio da organização pelo órgão gestor da política (ato, data e vigência); e",
      "que o credenciamento foi aberto a todas as organizações que atendessem aos requisitos."]),
    ("art. 31, I", "inexigibilidade de chamamento público porque o objeto constitui incumbência prevista em acordo, ato ou "
     "compromisso internacional que indica as instituições que utilizarão os recursos (art. 31, I)",
     ["o acordo, ato ou compromisso internacional e o dispositivo que indica a organização; e",
      "a correspondência entre o objeto da parceria e a incumbência prevista."]),
    ("art. 31, II", "inexigibilidade de chamamento público porque a parceria decorre de transferência autorizada em lei que "
     "identifica expressamente a organização beneficiária, inclusive subvenção (art. 31, II)",
     ["a lei (número, data e dispositivo) que identifica expressamente a organização beneficiária;",
      "que a lei orçamentária ou de diretrizes autoriza a transferência, quando se tratar de subvenção; e",
      "a correspondência entre o objeto autorizado na lei e o da parceria."]),
    ("art. 31", "inexigibilidade de chamamento público por inviabilidade de competição entre organizações da sociedade civil, em "
     "razão da natureza singular do objeto ou porque as metas somente podem ser atingidas por uma entidade específica (art. 31, caput)",
     ["a natureza singular do objeto ou por que as metas só podem ser atingidas pela organização escolhida;",
      "a inexistência de outras organizações aptas, com a pesquisa ou o levantamento feito; e",
      "a experiência e a capacidade técnica e operacional da organização, comprovadas."]),
    ("art. 29", "celebração sem chamamento público de termo que envolve recursos decorrentes de emenda parlamentar à lei "
     "orçamentária anual (art. 29)",
     ["a emenda parlamentar (número, autor, exercício e valor) e a organização nela indicada; e",
      "a compatibilidade do objeto com a finalidade da emenda e com a política pública."]),
]


def hipotese(R):
    h = str(R.get("hipotese") or "")
    for chave, enq, req in HIPOTESES:
        if f"({chave})" in h:  # o assinante escolhe uma opção que termina com "(art. 30, I)", "(art. 31)" etc.
            return enq, req
    return "[PREENCHER: hipótese de dispensa (art. 30) ou inexigibilidade (art. 31) de chamamento público]", []


def justificativa(R, decreto="", plano=""):
    """Justificativa de dispensa ou inexigibilidade de chamamento público (art. 32), no formato do Elaborador."""
    R = dict(R or {})
    dec = decreto or "[PREENCHER: decreto que regulamenta a Lei 13.019/2014 no ente]"
    orgao = _v(R, "orgao", "órgão ou entidade")
    tipo = (R.get("tipo_parceria") or "").strip() or "Termo de Colaboração"
    tipo_l = tipo[0].upper() + tipo[1:]
    objeto = _meio(_v(R, "objeto", "objeto da parceria"))
    osc = _v(R, "contratado", "organização da sociedade civil (nome e CNPJ)")
    valor = _v(R, "valor", "valor global da parceria (do plano de trabalho)")
    prazo = (R.get("prazo") or "").strip()
    prazo = (R.get("prazo_outro") or "").strip() if prazo == "Outro" else prazo
    prazo = prazo or "[PREENCHER: prazo de execução (do plano de trabalho)]"
    enq, req = hipotese(R)
    art29 = "(art. 29)" in str(R.get("hipotese") or "")
    _, existencia = esfera(R.get("orgao", ""))
    secoes = []

    def sec(titulo, itens, fundamento):
        secoes.append({"titulo": titulo, "paragrafos": _numerar(itens, len(secoes) + 1), "fundamento": fundamento})

    preambulo = [f"{orgao.upper()}, por seu administrador público, com fundamento na {LEI} e no {dec}, apresenta a justificativa "
                 f"para a celebração de {tipo_l} com {osc}, sem chamamento público, tendo por objeto {objeto}. "
                 f"Processo administrativo nº {_v(R, 'processo', 'nº do processo administrativo')}."]

    sec("Objeto e interesse público", [
        f"A parceria tem por objeto {objeto}, conforme o plano de trabalho" + (" que integra o processo." if plano else "."),
        _v(R, "necessidade", "realidade que motiva a parceria e interesse público envolvido (do plano de trabalho)"),
        f"O prazo de execução é de {prazo} e o valor global, de {valor}, conforme o plano de trabalho e o cronograma de desembolso.",
    ], f"{LEI}, arts. 2º, VII e VIII, e 22")

    sec("Enquadramento legal", [
        f"A celebração se enquadra na hipótese de {enq}.",
        "A ausência de chamamento público não afasta a aplicação dos demais dispositivos da Lei 13.019/2014, inclusive o plano de "
        "trabalho, os requisitos da organização, os pareceres e a prestação de contas (art. 32, § 4º).",
    ], f"{LEI}, arts. 29 a 32; {dec}")

    sec("Justificativa da hipótese", [
        _v(R, "hipotese_detalhe", "fatos que demonstram o enquadramento na hipótese"),
        ("Ficam demonstrados, com os documentos juntados ao processo:", req or ["[PREENCHER: requisitos da hipótese escolhida]"]),
    ], f"{LEI}, arts. 30 a 32")

    sec("Escolha da organização da sociedade civil", [
        f"A organização escolhida é {osc}.",
        f"Razão da escolha: {_v(R, 'motivo_escolha', 'razão da escolha da organização')}",
        "A organização demonstra experiência prévia na realização do objeto ou de objeto de natureza semelhante e capacidade técnica e "
        "operacional para executá-lo, admitida a previsão de contratar ou adquirir com recursos da parceria as instalações e "
        "condições materiais necessárias (art. 33, V, e § 5º).",
    ], f"{LEI}, arts. 33 e 35, III")

    sec("Requisitos e impedimentos da organização", [
        ("A organização comprovou, com os documentos juntados ao processo:", [
            "a) estatuto com objetivos de relevância pública e social, destinação do patrimônio em caso de dissolução e escrituração "
            "contábil regular (art. 33, I, III e IV);",
            f"b) no mínimo {existencia} de existência com cadastro ativo no CNPJ (art. 33, V, \"a\");",
            "c) certidões de regularidade fiscal, previdenciária, tributária, de contribuições e de dívida ativa, CRF/FGTS e CNDT (art. 34, II);",
            "d) ata de eleição da diretoria e relação nominal dos dirigentes, com endereço, RG e CPF (art. 34, V e VI);",
            "e) funcionamento no endereço declarado (art. 34, VII); e",
            "f) declaração de que não incorre nas vedações do art. 39, confirmada por consulta aos cadastros de entidades impedidas e de "
            "sanções (CEPIM, CEIS e CNEP) e aos cadastros do ente."]),
        f"Aplicam-se, ainda, os requisitos e impedimentos previstos no {dec}.",
    ], f"{LEI}, arts. 33, 34 e 39; {dec}")

    sec("Plano de trabalho e recursos", [
        "O plano de trabalho contém a descrição da realidade e o nexo com as metas, as ações, as metas quantitativas e os indicadores, "
        "a previsão de receitas e despesas com a demonstração da compatibilidade dos custos com o mercado e o cronograma de desembolso (art. 22).",
        f"As despesas correrão à conta da dotação {_v(R, 'fonte', 'programa de trabalho, elemento de despesa e fonte de recursos')} "
        "(art. 35, II).",
        "Não será exigida contrapartida financeira; eventual contrapartida em bens e serviços terá a expressão monetária identificada "
        "no termo (art. 35, § 1º).",
    ], f"{LEI}, arts. 22 e 35")

    sec("Providências para a celebração", [
        "A celebração dependerá: da aprovação do plano de trabalho; do parecer do órgão técnico sobre o mérito, a reciprocidade de "
        "interesses, a viabilidade, o cronograma de desembolso e os meios de fiscalização; da designação do gestor da parceria e da "
        "comissão de monitoramento e avaliação; e do parecer jurídico (art. 35, IV a VI).",
        f"Gestor da parceria: {_v(R, 'gestor', 'gestor da parceria (nome, cargo e matrícula)')}.",
        f"O {tipo_l} somente produzirá efeitos após a publicação do respectivo extrato no meio oficial de publicidade (art. 38).",
    ], f"{LEI}, arts. 35 e 38")

    sec("Publicidade e impugnação", [
        ("Esta justificativa não dispensa a publicidade: " if art29 else "") +
        "O extrato desta justificativa será publicado, na mesma data em que for efetivado, no sítio oficial do ente e, a critério do "
        "administrador, em outros meios, sob pena de nulidade do ato de formalização da parceria (art. 32, § 1º).",
        "Qualquer interessado poderá impugnar a justificativa no prazo de 5 (cinco) dias da publicação; a impugnação será analisada pelo "
        "administrador público em até 5 (cinco) dias do protocolo (art. 32, § 2º).",
        "Havendo fundamento na impugnação, será revogado o ato que declarou a dispensa ou a inexigibilidade e iniciado imediatamente o "
        "chamamento público (art. 32, § 3º).",
    ] if not art29 else [
        "A celebração sem chamamento público decorre diretamente do art. 29 da Lei 13.019/2014; o extrato do termo será publicado no "
        "meio oficial de publicidade do ente (art. 38), observada a transparência ativa da parceria (art. 10).",
    ], f"{LEI}, arts. 10, 29, 32 e 38")

    sec("Decisão", [
        f"Diante do exposto, com fundamento na hipótese indicada no item 2.1, justifica-se a celebração do {tipo_l} com {osc}, sem "
        f"chamamento público, condicionada ao cumprimento das providências do item 7.1.",
    ], f"{LEI}, art. 32")

    return {"titulo": "JUSTIFICATIVA DE " + ("CELEBRAÇÃO SEM CHAMAMENTO PÚBLICO" if art29 else "DISPENSA OU INEXIGIBILIDADE DE CHAMAMENTO PÚBLICO"),
            "preambulo": preambulo, "secoes": secoes, "pendencias": [], "jurisprudencia_ids": []}


# ---------------------------------------------------------------- plano de trabalho do termo de colaboração (art. 22)
# Estrutura inspirada no plano de trabalho do Hospital Veterinário de Maricá (proc. 11931/2025) e na minuta de termo de
# colaboração/fomento do Espírito Santo, sem repetir as falhas encontradas nos dois:
# - critérios de julgamento do chamamento dentro do plano (pertencem ao edital);
# - "objetivo geral" de realizar o chamamento (o objetivo é o da parceria);
# - diagnóstico e tabelas repetidos; atendimentos tratados como se fossem animais (percentual da população);
# - metas sem quantidade ("de acordo com a demanda") e metas repetidas entre unidades;
# - custos indiretos como percentual fixo sobre o total (art. 45, I, veda taxa de administração; art. 46, III, exige
#   custos indiretos demonstrados e proporcionais);
# - parcelas do desembolso que não somam o total por arredondamento e sem ligação com as metas;
# - aplicação em caderneta de poupança "se o uso for igual ou superior a um mês" (regra de convênios; na Lei 13.019 os
#   recursos ficam em conta específica isenta de tarifa e os rendimentos vão para o objeto, art. 51);
# - equipe paga sem quantidade, função e carga horária; dois decretos diferentes citados para a mesma regra.

NATUREZAS = [  # (natureza, palavras que a identificam), na ordem da tabela de despesas
    ("Pessoal", r"coordenad|educador|t[eé]cnic|auxiliar|monitor|professor|instrutor|assistente|psic[oó]log|veterin|m[eé]dic|"
                r"enfermeir|cozinheir|merendeir|motorista|vigia|porteir|recepcion|profissional|sal[aá]rio|equipe|oficineir"),
    ("Encargos sociais e trabalhistas", r"encargo|inss|fgts|f[eé]rias|13[ºo°]|d[eé]cimo|rescis"),
    ("Custos indiretos", r"indiret|contad|contabil|energia|[aá]gua|internet|telefon|aluguel|limpeza do|seguran[cç]a patrimonial"),
    ("Equipamentos e material permanente", r"equipamento|mobili|computador|notebook|ve[ií]culo|ambul[aâ]ncia|permanente|eletrodom"),
    ("Material de consumo", r"material|insumo|lanche|aliment|g[eê]nero|uniform|medicament|limpeza|expediente|combust"),
    ("Serviços de terceiros", r"servi[cç]o|transporte|loca[cç][aã]o|manuten|consultori|capacita"),
]


def _natureza(t):
    for nome, rx in NATUREZAS:
        if re.search(rx, t, re.I):
            return nome
    return "Outras despesas"


def _brl(v):
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _valor(t):
    m = re.search(r"R\$\s*([\d.]+(?:,\d{1,2})?)", t or "")
    if not m:
        return None
    return float(m.group(1).replace(".", "").replace(",", "."))


def _itens(t):
    return [x.strip(" .;") for x in re.split(r"\s*;\s*|\n+", str(t or "")) if x.strip(" .;")]


def meses(R):
    p = str(R.get("prazo") or "")
    p = str(R.get("prazo_outro") or "") if p == "Outro" else p
    m = re.search(r"(\d+)\s*(mes|m[eê]s)", p, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*ano", p, re.I)
    return int(m.group(1)) * 12 if m else None


def despesas(R, n):
    """Linhas da previsão de despesas: (natureza, item, qtd, unitário mensal ou None, meses ou None, total ou None)."""
    out = []
    for it in _itens(R.get("despesas")):
        v = _valor(it)
        mensal = bool(re.search(r"/\s*m[eê]s|mensa", it, re.I))
        q = re.match(r"(\d+)\s+(?!R\$)", it)
        qtd = int(q.group(1)) if q and mensal else 1
        nome = re.sub(r"\s*R\$\s*[\d.,]+\s*(/\s*m[eê]s)?", "", it).strip(" ,:–-") or it
        if q and mensal:
            nome = nome[len(q.group(0)):].strip() or nome
        nome = nome[0].upper() + nome[1:]
        if v is None:
            out.append((_natureza(it), nome, qtd, None, n if mensal or n else None, None))
        elif mensal:
            out.append((_natureza(it), nome, qtd, v, n, round(qtd * v * n, 2) if n else None))
        else:
            out.append((_natureza(it), nome, qtd, None, None, round(v, 2)))
    ordem = [x[0] for x in NATUREZAS] + ["Outras despesas"]
    return sorted(out, key=lambda x: ordem.index(x[0]))


def equipe(R):
    out = []
    for it in _itens(R.get("equipe")):
        q = re.match(r"(\d+)\s+", it)
        h = re.search(r"(\d+)\s*h", it)
        funcao = re.sub(r"^\d+\s+", "", it)
        funcao = re.sub(r",?\s*\d+\s*h(oras)?(\s*semanais)?", "", funcao).strip(" ,")
        out.append((funcao[0].upper() + funcao[1:] if funcao else it, q.group(1) if q else "1", f"{h.group(1)} h semanais" if h else "conforme a escala"))
    return out


def parcelas(R, total, n):
    """Cronograma de desembolso: parcelas iguais, a diferença de centavos na última, para a soma bater com o total."""
    c = str(R.get("cronograma") or "")
    if not total or not n:
        return None
    passo = 3 if "trimestr" in c.lower() else 1 if "mensa" in c.lower() else None
    if not passo:
        return None
    k = max(1, -(-n // passo))
    base = round(total / k, 2)
    vals = [base] * (k - 1) + [round(total - base * (k - 1), 2)]
    return [(i + 1, 1 + i * passo, v) for i, v in enumerate(vals)]


def plano(R, decreto=""):
    """Plano de trabalho do termo de colaboração (proposto pela administração, art. 16), no formato do Elaborador."""
    R = dict(R or {})
    dec = decreto or "[PREENCHER: decreto que regulamenta a Lei 13.019/2014 no ente]"
    orgao = _v(R, "orgao", "órgão ou entidade")
    unidade = (R.get("unidade") or "").strip()
    objeto = _v(R, "objeto", "objeto da parceria")
    obj_m = _meio(objeto)
    osc = (R.get("osc") or "").strip() or "a ser selecionada por chamamento público"
    sem_osc = not (R.get("osc") or "").strip()
    n = meses(R)
    prazo = f"{n} meses" if n else _v(R, "prazo", "prazo de execução da parceria")
    valor_txt = _v(R, "valor", "valor total da parceria")
    valor = _valor(R.get("valor"))
    metas = _itens(R.get("metas")) or ["[PREENCHER: metas quantitativas da parceria]"]
    inds = _itens(R.get("indicadores"))
    rel = (R.get("relatorio_periodicidade") or "mensal").strip().lower()
    secoes = []

    def sec(titulo, itens, fundamento):
        secoes.append({"titulo": titulo, "paragrafos": _numerar(itens, len(secoes) + 1), "fundamento": fundamento})

    preambulo = [f"Plano de trabalho do termo de colaboração a ser celebrado entre {orgao}"
                 + (f", por intermédio da {unidade}," if unidade else "")
                 + (" e a organização da sociedade civil selecionada por chamamento público" if sem_osc else f" e {osc}")
                 + f", tendo por objeto {obj_m}, elaborado pela administração pública nos termos dos arts. 16 e 22 da {LEI} "
                 f"e do {dec}. Processo administrativo nº {_v(R, 'processo', 'nº do processo administrativo')}."]

    sec("Identificação da parceria", [
        "Tabela 1 – Dados da parceria",
        "| Campo | Informação |",
        f"| Órgão ou entidade | {orgao} |",
        f"| Unidade responsável | {unidade or '[PREENCHER: unidade requisitante]'} |",
        f"| Organização da sociedade civil | {osc[0].upper() + osc[1:]} |",
        "| Instrumento | Termo de colaboração (proposta da administração pública, art. 16) |",
        f"| Objeto | {objeto} |",
        f"| Público-alvo e local | {_v(R, 'publico', 'público-alvo e local de execução')} |",
        f"| Valor total | {valor_txt} |",
        f"| Prazo de execução | {prazo}, contados do primeiro dia após a publicação do extrato do termo (art. 38) |",
        f"| Gestor da parceria | {_v(R, 'gestor', 'gestor da parceria (nome, cargo e matrícula)')} |",
        f"| Dotação orçamentária | {_v(R, 'fonte', 'programa de trabalho, elemento de despesa e fonte de recursos')} |",
    ] + (["Os dados da organização (endereço, CNPJ, responsável legal e técnico) serão incluídos após o resultado do chamamento "
          "público, sem alteração das metas, do valor e do cronograma deste plano."] if sem_osc else []),
        f"{LEI}, arts. 16 e 22; {dec}")

    sec("Diagnóstico da realidade e justificativa", [
        _v(R, "necessidade", "realidade que a parceria vai enfrentar, com dados e fontes"),
        "As atividades descritas no item 6 respondem diretamente a essa realidade, e as metas do item 5 medem a mudança esperada, "
        "aferida pelos indicadores do item 7.",
        "A parceria é proposta pela administração pública por meio de termo de colaboração porque a política pública e seus "
        "parâmetros (objeto, metas, valor e forma de execução) são definidos pelo próprio ente, cabendo à organização executá-la "
        "em regime de mútua cooperação, sem transferência de funções exclusivas do Estado (art. 40).",
    ], f"{LEI}, arts. 2º, VII, 16, 22, I, e 40")

    sec("Objetivos", [
        f"Objetivo geral: realizar {obj_m}, para enfrentar a realidade descrita no item 2.",
        ("Objetivos específicos, cada um ligado a uma meta do item 5:",
         [f"{chr(97 + i)}) {_meio(m)} (meta {i + 1});" if i < len(metas) - 1 else f"{chr(97 + i)}) {_meio(m)} (meta {i + 1})."
          for i, m in enumerate(metas[:26])]),
    ], f"{LEI}, art. 22, II")

    sec("Público-alvo, local e prazo", [
        f"Público-alvo e local de execução: {_meio(_v(R, 'publico', 'público-alvo e local de execução'))}.",
        f"O prazo de execução é de {prazo}, contados do primeiro dia após a publicação do extrato do termo de colaboração (art. 38), "
        "prorrogável na forma do art. 55, mediante solicitação justificada com antecedência mínima de 30 (trinta) dias do término.",
        "O atraso na liberação de recursos pela administração ensejará a prorrogação de ofício da vigência pelo período exato do "
        "atraso (art. 55, parágrafo único).",
    ], f"{LEI}, arts. 38 e 55")

    linhas_metas = []
    for i, m in enumerate(metas, 1):
        quando = re.search(r"em\s+(\d+)\s*mes", m, re.I)
        afer = f"{quando.group(1)}º mês" if quando else (f"mensal, até o {n}º mês" if n else "mensal")
        linhas_metas.append(f"| Meta {i} | {m[0].upper() + m[1:]} | {afer} |")
    sec("Metas e resultados esperados", [
        "As metas são quantitativas e mensuráveis e serão aferidas pelos indicadores do item 7.",
        "Tabela 2 – Metas",
        "| Meta | Descrição e quantidade | Aferição |",
        *linhas_metas,
        "Resultado esperado: a redução da situação descrita no item 2, demonstrada pela comparação entre a linha de base do "
        "diagnóstico e os resultados medidos ao fim da parceria.",
        "Metas descumpridas sem justificativa suficiente ensejam a glosa dos valores correspondentes na prestação de contas.",
    ], f"{LEI}, arts. 22, II, e 64")

    sec("Atividades e forma de execução", [
        _v(R, "atividades", "atividades e forma de execução"),
        "A organização executará as atividades diretamente, com a equipe do item 8, admitida a atuação em rede somente se prevista no edital (art. 35-A); as "
        "contratações de bens e serviços com recursos da parceria observarão a compatibilidade com os preços de mercado e as regras "
        f"de compras do {dec}.",
        "Não se incluem atividades de regulação, fiscalização, poder de polícia ou outras exclusivas do Estado, nem serviços cujo "
        "destinatário seja o aparelho administrativo do ente (art. 40).",
    ], f"{LEI}, arts. 22, III, 35-A e 40; {dec}")

    linhas_ind = []
    for i, m in enumerate(metas, 1):
        ind = inds[i - 1] if len(inds) == len(metas) else None
        pct = re.search(r"\d+\s*%", m)
        formula = ("percentual apurado no período" if pct else "quantidade realizada ÷ quantidade prevista × 100")
        meio = ind or (inds[0] if len(inds) == 1 else "registros de atendimento, listas de presença e relatório fotográfico")
        linhas_ind.append(f"| Meta {i} | {formula} | {meio} | {rel} |")
    sec("Indicadores e meios de verificação", [
        "Cada meta tem indicador objetivo, fórmula de cálculo e meio de verificação, que serão usados no relatório técnico de "
        "monitoramento e avaliação (art. 59) e na prestação de contas (art. 64).",
        "Tabela 3 – Indicadores",
        "| Meta | Indicador (fórmula) | Meio de verificação | Periodicidade |",
        *linhas_ind,
    ] + ([f"Parâmetros informados pela administração: {'; '.join(inds)}."] if inds and len(inds) != len(metas) else []),
        f"{LEI}, arts. 22, IV, 59 e 64")

    eq = equipe(R)
    sec("Equipe de trabalho", ([
        "Tabela 4 – Equipe",
        "| Função | Quantidade | Carga horária |",
        *[f"| {f} | {q} | {h} |" for f, q, h in eq],
    ] if eq else ["[PREENCHER: equipe de trabalho (função, quantidade e carga horária)]"]) + [
        "A remuneração da equipe paga com recursos da parceria será proporcional ao tempo dedicado ao objeto, compatível com o "
        "mercado e com o piso da categoria, e poderá incluir impostos, contribuições sociais, FGTS, férias, décimo terceiro, "
        "verbas rescisórias e demais encargos (art. 46, I).",
        "É vedado pagar, com recursos da parceria, servidor ou empregado público, salvo nas hipóteses de lei específica e da lei de "
        "diretrizes orçamentárias (art. 45, II). A organização responde exclusivamente pelos encargos trabalhistas, previdenciários "
        "e fiscais, sem responsabilidade solidária ou subsidiária da administração (art. 42, XX).",
    ], f"{LEI}, arts. 42, XX, 45, II, e 46")

    ds = despesas(R, n)
    linhas_d, soma, faltam = [], 0.0, []
    for nat, item, q, unit, mm, tot in ds:
        if tot is None:
            faltam.append(item)
        else:
            soma += tot
    dif = round(valor - soma, 2) if valor is not None else None
    for nat, item, q, unit, mm, tot in ds:
        if tot is None:
            dica = f"; a diferença entre o valor total e os demais itens é {_brl(dif)}" if dif and len(faltam) == 1 and dif > 0 else ""
            tot_t = f"[PREENCHER: valor total de {_meio(item)} em {n or 'todo o'} {'meses' if n else 'prazo'}{dica}]"
        else:
            tot_t = _brl(tot)
        linhas_d.append(f"| {nat} | {item} | {q} | {_brl(unit) if unit else '—'} | {mm or '—'} | {tot_t} |")
    fecha = []
    if ds and not faltam and valor is not None and abs(dif) >= 0.01:
        fecha.append(f"[PREENCHER: a soma das despesas ({_brl(soma)}) difere do valor total da parceria ({valor_txt}) em "
                     f"{_brl(abs(dif))}; ajuste as despesas ou o valor]")
    sec("Previsão de receitas e despesas", [
        f"Receita: repasse da administração pública no valor de {valor_txt}, conforme o cronograma do item 12. Os rendimentos de "
        "aplicação financeira serão aplicados no objeto, sujeitos às mesmas condições de prestação de contas (art. 51, parágrafo único).",
        "Tabela 5 – Despesas por natureza",
        "| Natureza | Item | Qtd. | Valor mensal unitário | Meses | Valor total |",
        *(linhas_d or ["| [PREENCHER: despesas por natureza] | | | | | |"]),
        (f"| Total | | | | | {_brl(soma)} |" if not faltam and ds else f"| Total (valor da parceria) | | | | | {valor_txt} |"),
        *fecha,
        "Os custos indiretos (contabilidade, energia, água, internet, aluguel e semelhantes) serão pagos na proporção do uso para o "
        "objeto, demonstrada na prestação de contas; não se admite percentual fixo a título de taxa de administração, de gerência "
        "ou similar (arts. 45, I, e 46, III).",
        ("É vedado usar os recursos para:", [
            "a) taxa de administração, de gerência ou similar;",
            "b) finalidade diversa da pactuada, ainda que em caráter de emergência;",
            "c) despesas anteriores ou posteriores à vigência;",
            "d) multas, juros ou correção monetária por atraso de responsabilidade da organização; e",
            "e) publicidade que caracterize promoção pessoal de autoridades ou servidores."]),
    ], f"{LEI}, arts. 22, II-A, 45, 46 e 51")

    sec("Compatibilidade dos custos com o mercado", [
        f"Fontes dos valores: {_v(R, 'justificativa_preco', 'fonte de cada valor (cotações, convenção coletiva, tabelas oficiais, parcerias semelhantes)')}",
        "Cada valor da Tabela 5 tem fonte identificada no processo (cotação, tabela oficial, convenção ou acordo coletivo, ata ou "
        f"parceria semelhante), na forma exigida pelo {dec}.",
    ], f"{LEI}, art. 22, II-A; {dec}")

    linhas_f = []
    for i, m in enumerate(metas, 1):
        quando = re.search(r"em\s+(\d+)\s*mes", m, re.I)
        periodo = f"1º ao {n}º mês" if n else "[PREENCHER: período]"
        marco = (f"resultado medido no {quando.group(1)}º mês" if quando else f"relatório {rel} de execução")
        linhas_f.append(f"| Meta {i} | {periodo} | {marco} |")
    sec("Cronograma físico de execução", [
        "Tabela 6 – Cronograma físico",
        "| Meta | Período de execução | Marco de verificação |",
        *linhas_f,
    ], f"{LEI}, art. 22, II e III")

    pc = parcelas(R, valor, n)
    crono = str(R.get("cronograma") or "")
    crono = str(R.get("cronograma_outro") or "") if crono == "Outro" else crono
    sec("Cronograma de desembolso", ([
        "Tabela 7 – Cronograma de desembolso",
        "| Parcela | Mês de liberação | Valor | Condição |",
        *[f"| {i} | {m}º mês | {_brl(v)} | " + ("após a publicação do extrato e a abertura da conta específica" if i == 1 else
                                              "regular aplicação da parcela anterior e cumprimento das metas do período") + " |"
          for i, m, v in pc],
        f"| Total | | {_brl(sum(v for _, _, v in pc))} | |",
    ] if pc else [f"Desembolso: {crono or '[PREENCHER: cronograma de desembolso (número de parcelas, meses e valores)]'}."]) + [
        "As parcelas guardam consonância com as metas e etapas do cronograma físico (item 11) e ficarão retidas: quando houver "
        "evidências de irregularidade na aplicação de parcela anterior; quando constatado desvio de finalidade ou inadimplemento "
        "da organização; ou quando a organização deixar de adotar, sem justificativa suficiente, as medidas saneadoras apontadas "
        "pela administração ou pelos órgãos de controle (art. 48).",
        "Os recursos serão depositados e geridos em conta corrente específica, isenta de tarifa bancária, em instituição financeira "
        "pública indicada pela administração, e os pagamentos serão feitos por transferência eletrônica identificada ao "
        "beneficiário final (arts. 51 e 53).",
    ], f"{LEI}, arts. 48, 51 e 53; {dec}")

    cp = (R.get("contrapartida") or "").strip()
    sec("Contrapartida", [
        (f"A organização oferece, como contrapartida em bens e serviços: {_meio(cp)}. A contrapartida terá sua expressão monetária "
         "identificada no termo, com inventário dos bens e serviços avaliados individualmente." if cp and not re.match(r"(n[aã]o|sem|nenhum)", cp, re.I)
         else "Não há contrapartida."),
        "Não é exigida contrapartida financeira como requisito para a celebração (art. 35, § 1º).",
    ], f"{LEI}, art. 35, § 1º")

    bens = (R.get("bens") or "").strip()
    perm = [d for d in ds if d[0] == "Equipamentos e material permanente"]
    sec("Bens permanentes", [
        (f"Bens permanentes a adquirir com recursos da parceria: {_meio(bens or '; '.join(d[1] for d in perm))}." if bens or perm
         else "Não há previsão de aquisição de bens permanentes com recursos da parceria."),
        "Os bens permanentes adquiridos, produzidos ou transformados com recursos da parceria serão gravados com cláusula de "
        "inalienabilidade e, ao fim da parceria, terão a destinação prevista no termo de colaboração, observado o "
        f"{dec} (arts. 35, § 5º, e 36).",
    ], f"{LEI}, arts. 35, § 5º, e 36; {dec}")

    sec("Monitoramento, avaliação e prestação de contas", [
        f"A execução será acompanhada pelo gestor da parceria, {_v(R, 'gestor', 'gestor da parceria')}, e pela comissão de "
        "monitoramento e avaliação, com visitas técnicas in loco e relatório técnico de monitoramento e avaliação homologado pela "
        "comissão (arts. 58, 59 e 61).",
        f"A organização apresentará relatório {rel} de execução do objeto, com as atividades realizadas e o comparativo entre as metas "
        "propostas e os resultados alcançados, acompanhado dos meios de verificação da Tabela 3; o relatório de execução financeira "
        "será exigido quando não comprovado o alcance das metas (art. 66).",
        "Prestação de contas final em até 90 (noventa) dias do término da vigência" + (", com prestação de contas anual por durar "
        "mais de um ano" if n and n > 12 else "") + "; a administração terá até 150 (cento e cinquenta) dias para apreciá-la "
        "(arts. 69 e 71).",
        *(["Como a vigência é superior a um ano, a administração realizará pesquisa de satisfação com os beneficiários (art. 58, § 2º)."]
          if n and n > 12 else []),
        "A organização manterá os documentos originais da prestação de contas por 10 (dez) anos (art. 68, parágrafo único).",
        "Alterações de valores ou de metas exigem termo aditivo ou apostila ao plano de trabalho, conforme o caso, sem alteração do "
        "objeto (art. 57).",
    ], f"{LEI}, arts. 57 a 72; {dec}")

    sec("Responsáveis", [
        "Tabela 8 – Responsáveis",
        "| Papel | Responsável |",
        f"| Unidade da administração | {unidade or orgao} |",
        f"| Gestor da parceria | {_v(R, 'gestor', 'gestor da parceria')} |",
        "| Responsável legal da organização | " + ("a definir após o chamamento público" if sem_osc else osc) + " |",
    ], f"{LEI}, arts. 35, V, \"g\", e 61")

    return {"titulo": "PLANO DE TRABALHO", "preambulo": preambulo, "secoes": secoes, "pendencias": [], "jurisprudencia_ids": []}
