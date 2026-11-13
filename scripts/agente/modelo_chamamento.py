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
Também aproveita boas práticas do Edital de Chamamento Público nº 1/2026/SNP-MCID (Ministério das Cidades): fases de
seleção e de celebração separadas, requisitos exigidos só da selecionada, critérios de eliminação antes da pontuação,
níveis de atendimento por critério, nota pela média dos membros da comissão, desempate detalhado, conteúdo mínimo da
proposta e do plano de trabalho, fontes admitidas para demonstrar a compatibilidade dos custos e comprovantes de
experiência aceitos. As remissões internas erradas daquele edital (itens 8.2.2, 8.2.4, 9.6.3) não se repetem aqui.
O edital sai sem anexos: a Administração junta o plano de trabalho orientativo, a minuta do termo e os modelos de
declaração. O texto é completo mesmo sem a IA; na elaboração real ele é a base que o agente adapta ao caso e ao
decreto do ente.
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


NIVEIS = "grau pleno (100% da pontuação do critério), grau satisfatório (70%), grau baixo (40%) e não atendimento (zero)"


def criterios_padrao(R):
    """Critérios de julgamento: os do requisitante, se informados; senão, os padrão (ajustáveis ao decreto do ente)."""
    proprio = str(R.get("criterios_selecao") or "").strip()
    if proprio:
        return ([f"Critérios e pesos: {proprio}.",
                 f"Cada critério será avaliado em quatro níveis: {NIVEIS}, com a descrição objetiva de cada nível registrada na ata de julgamento."],
                "no grau de adequação da proposta aos objetivos do programa e na experiência")
    return (["(A) Ações a executar, metas, indicadores de aferição e prazos, coerentes entre si e com o cronograma – até 30 pontos;",
             "(B) Grau de adequação da proposta aos objetivos específicos do programa ou da ação em que se insere a parceria – até 25 "
             "pontos (critério obrigatório, art. 27);",
             "(C) Descrição da realidade objeto da parceria e do nexo entre essa realidade e as ações propostas – até 15 pontos;",
             "(D) Adequação ao valor de referência, com menção expressa ao valor global e custos coerentes com as metas – até 10 pontos;",
             "(E) Experiência e capacidade técnica e operacional da organização no objeto ou em objeto de natureza semelhante – até 20 "
             "pontos (requisito do art. 33, V, \"b\" e \"c\", sem exigência de capacidade instalada prévia, § 5º).",
             f"Cada critério será avaliado em quatro níveis: {NIVEIS}. Pontuação máxima: 100 pontos. Os pesos podem ser ajustados aos "
             "fatores fixados no decreto do ente."],
            "nos critérios (B) e (E)")


def documento(R, decreto=""):
    """Devolve o edital no formato do Elaborador: {titulo, secoes[{titulo, paragrafos, fundamento}], pendencias}."""
    R = dict(R or {})
    dec = decreto or "[PREENCHER: decreto que regulamenta a Lei 13.019/2014 no ente]"
    orgao = _v(R, "orgao", "órgão ou entidade")
    unidade = _v(R, "unidade", "secretaria ou unidade responsável")
    tipo = (R.get("tipo_parceria") or "").strip() or "Termo de Colaboração"
    tipo_l = tipo[0].upper() + tipo[1:] if tipo else tipo
    fomento = "fomento" in tipo.lower()
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
    contrapartida = (R.get("contrapartida") or "").strip()
    da = "da" if re.match(r"(?i)secretaria|diretoria|coordenadoria|superintend|subsecretaria|funda", unidade) else "de"
    criterios, zero_elimina = criterios_padrao(R)
    secoes = []

    def sec(titulo, itens, fundamento):
        n = len(secoes) + 1
        secoes.append({"titulo": titulo, "paragrafos": _numerar(itens, n), "fundamento": fundamento})

    sec("Preâmbulo e finalidade", [
        f"{orgao.upper()}, por meio {da} {unidade}, com fundamento na {LEI} e no {dec}, torna público o presente Edital de "
        f"Chamamento Público para a seleção de organização da sociedade civil (OSC) interessada em celebrar {tipo_l} que tenha por "
        f"objeto {objeto}. Processo administrativo nº {processo}.",
        "O procedimento de seleção reger-se-á pela Lei 13.019/2014, pelo decreto regulamentador do ente, pelos demais normativos "
        "aplicáveis e pelas condições deste Edital.",
        "Será selecionada 1 (uma) proposta, observada a ordem de classificação e a pontuação mínima. Havendo disponibilidade "
        "orçamentária adicional, poderão ser selecionadas outras propostas, respeitada a ordem de classificação, durante a validade do Edital.",
    ], f"{LEI}, arts. 2º, XII, e 24; {dec}")

    sec("Objeto e objetivos da parceria", [
        f"O {tipo_l} terá por objeto {objeto}.",
        f"Objetivos e metas esperados: {_v(R, 'metas', 'objetivos, metas e público atendido')}"
        + (f" Quantitativos e locais de execução: {R['quantidades'].strip()}" if str(R.get("quantidades") or "").strip() else ""),
        "A execução observará a legislação de acessibilidade (Lei nº 13.146/2015), garantindo atendimento a pessoas com deficiência "
        "ou mobilidade reduzida e idosos, conforme as características do objeto (art. 24, § 1º, X).",
    ], f"{LEI}, art. 24, § 1º, III e X")

    sec("Justificativa", [
        _v(R, "necessidade", "realidade que motiva a parceria, dados do problema e interesse público envolvido"),
        ("A parceria por " + ("termo de fomento atende a proposta de iniciativa das organizações da sociedade civil (art. 17)."
         if fomento else "termo de colaboração decorre de proposta da Administração, que definiu o objeto, as metas e o plano de "
         "trabalho orientativo (art. 16)."),
         ["A parceria está alinhada aos instrumentos de planejamento e de orçamento do ente e às competências da unidade responsável."]),
    ], f"{LEI}, arts. 16 e 17")

    sec("Participação no Chamamento Público", [
        ("Poderão participar as organizações da sociedade civil definidas no art. 2º, I, da Lei 13.019/2014:", [
            "entidade privada sem fins lucrativos (associação ou fundação) que não distribua resultados, sobras, excedentes, "
            "dividendos ou parcelas do patrimônio e os aplique integralmente no seu objeto social;",
            "sociedades cooperativas previstas no art. 2º, I, \"b\", da Lei 13.019/2014;",
            "organizações religiosas que se dediquem a atividades ou projetos de interesse público e de cunho social distintos dos "
            "destinados a fins exclusivamente religiosos."]),
        "Para participar, a OSC deverá declarar que conhece e concorda com o Edital e que se responsabiliza pela veracidade e "
        "legitimidade das informações e documentos apresentados em todas as fases.",
        "Cada OSC poderá apresentar apenas uma proposta. Havendo mais de uma dentro do prazo, será considerada a última enviada.",
        "Não poderá participar mais de uma OSC sob o controle de um mesmo grupo de pessoas físicas ou jurídicas.",
        ("A execução poderá se dar por atuação em rede, se prevista na proposta, com a indicação das OSCs executantes e não "
         "celebrantes e da forma de participação de cada uma (art. 35-A):", [
            "a OSC celebrante responde pelos atos da rede e deve possuir mais de 5 (cinco) anos de inscrição no CNPJ, mais de 3 (três) "
            "anos de experiência de atuação em rede e capacidade técnica e operacional para supervisionar e orientar a rede;",
            "a OSC executante e não celebrante deverá comprovar regularidade jurídica e fiscal, e a relação das executantes não poderá "
            "ser alterada sem prévio consentimento da Administração."]),
    ], f"{LEI}, arts. 2º, I, e 35-A")

    sec("Requisitos e impedimentos para a celebração", [
        ("A OSC selecionada deverá ter normas de organização interna que prevejam expressamente:", [
            "objetivos voltados à promoção de atividades e finalidades de relevância pública e social (art. 33, I);",
            "a transferência do patrimônio líquido, em caso de dissolução, a outra pessoa jurídica de igual natureza que preencha os "
            "requisitos da Lei, preferencialmente com o mesmo objeto social (art. 33, III);",
            "escrituração de acordo com os princípios fundamentais de contabilidade e as Normas Brasileiras de Contabilidade (art. 33, IV)."]),
        f"A OSC deverá possuir, no mínimo, {existencia} de existência com cadastro ativo no CNPJ, experiência prévia na realização do "
        "objeto ou de objeto de natureza semelhante e instalações, condições materiais e capacidade técnica e operacional, admitida a "
        "previsão de contratá-las ou adquiri-las com recursos da parceria (art. 33, V, e § 5º).",
        "Organizações religiosas e sociedades cooperativas observarão as dispensas dos §§ 2º e 3º do art. 33.",
        ("Ficará impedida de celebrar a parceria a OSC que (art. 39):", [
            "não esteja regularmente constituída ou, se estrangeira, não esteja autorizada a funcionar no território nacional;",
            "esteja omissa no dever de prestar contas de parceria anteriormente celebrada;",
            "tenha como dirigente membro de Poder ou do Ministério Público, ou dirigente de órgão ou entidade da administração pública "
            "da mesma esfera de governo, estendendo-se a vedação a cônjuges, companheiros e parentes até o segundo grau, salvo as "
            "entidades que, por sua natureza, sejam constituídas por essas autoridades (§ 5º); não são membros de Poder os integrantes "
            "de conselhos de direitos e de políticas públicas (§ 6º);",
            "tenha tido contas rejeitadas pela administração pública nos últimos 5 (cinco) anos, salvo se sanada a irregularidade e "
            "quitados os débitos, se reconsiderada ou revista a decisão, ou se pendente recurso com efeito suspensivo;",
            "esteja cumprindo sanção de suspensão de participação em licitação ou de chamamento público, impedimento de contratar ou "
            "celebrar parceria, ou declaração de inidoneidade;",
            "tenha tido contas de parceria julgadas irregulares ou rejeitadas por Tribunal ou Conselho de Contas, em decisão "
            "irrecorrível, nos últimos 8 (oito) anos;",
            "tenha entre seus dirigentes pessoa com contas de parceria julgadas irregulares nos últimos 8 anos, julgada responsável "
            "por falta grave e inabilitada para cargo em comissão ou função de confiança, ou considerada responsável por ato de "
            "improbidade, enquanto durarem os prazos do art. 12 da Lei nº 8.429/1992."]),
        f"Aplicam-se, ainda, os impedimentos previstos no {dec}, desde que pertinentes ao objeto e sem restringir indevidamente a "
        "competição (art. 24, § 2º).",
    ], f"{LEI}, arts. 24, § 2º, 33 e 39; {dec}")

    sec("Comissão de Seleção", [
        f"A Comissão de Seleção é o órgão colegiado que processa e julga o Chamamento Público, designada por ato publicado antes da "
        f"avaliação das propostas ({_v(R, 'agente', 'ato de designação da Comissão de Seleção')}), com ao menos um servidor ocupante "
        "de cargo efetivo ou emprego permanente.",
        ("O membro da Comissão deverá declarar-se impedido quando:", [
            "nos últimos 5 (cinco) anos, tenha mantido relação jurídica com ao menos uma das OSCs participantes, inclusive como "
            "associado, cooperado, dirigente, conselheiro ou empregado (art. 27, § 2º);",
            "seu cônjuge, companheiro ou parente até o terceiro grau esteja na mesma situação; ou",
            "sua atuação configure conflito de interesses, nos termos da Lei nº 12.813/2013."]),
        "Configurado o impedimento, o membro será substituído por outro de qualificação equivalente, sem necessidade de novo Edital "
        "(art. 27, § 3º).",
        "A Comissão poderá solicitar assessoramento técnico de especialista que não seja seu membro e realizar diligências, a qualquer "
        "tempo, para verificar a autenticidade das informações ou esclarecer dúvidas, vedada a inclusão posterior de informação ou "
        "documento que deveria constar originalmente da proposta.",
    ], f"{LEI}, arts. 2º, X, e 27")

    envio = ("por meio eletrônico, pelo canal indicado no item 14.2, em arquivo PDF pesquisável assinado pelo representante legal"
             if eletronico else "em envelope lacrado, no endereço indicado no item 14.2, acompanhado de cópia em mídia digital (PDF pesquisável)")
    sec("Fase de seleção", [
        ("A fase de seleção observará as seguintes etapas:", [
            "Etapa 1 – Publicação do Edital no sítio oficial do ente: [PREENCHER: data];",
            "Etapa 2 – Envio das propostas: de [PREENCHER: data] a [PREENCHER: data e horário], com prazo mínimo de 30 (trinta) dias "
            "contado da publicação (art. 26);",
            "Etapa 3 – Avaliação das propostas pela Comissão de Seleção: [PREENCHER: período];",
            "Etapa 4 – Divulgação do resultado preliminar: [PREENCHER: data];",
            "Etapa 5 – Recursos contra o resultado preliminar: 5 (cinco) dias corridos da divulgação; contrarrazões: 5 (cinco) dias "
            "corridos do fim do prazo recursal;",
            "Etapa 6 – Análise dos recursos pela Comissão de Seleção e decisão;",
            "Etapa 7 – Homologação e publicação do resultado definitivo, com as decisões recursais."]),
        "A verificação dos requisitos para a celebração e da ausência de impedimentos é posterior ao julgamento e só será exigida da "
        "OSC selecionada.",
        f"As propostas serão enviadas {envio}, até a data e o horário finais da Etapa 2. Propostas fora do prazo não serão avaliadas.",
        ("A proposta deverá conter, no mínimo:", [
            "a descrição da realidade objeto da parceria e o nexo com as ações propostas;",
            "as ações a executar, as metas a atingir e os indicadores que aferirão o cumprimento das metas;",
            "os prazos para a execução das ações e para o cumprimento das metas;",
            "a equipe e a metodologia, com as medidas de acessibilidade; e",
            "o valor global proposto, com a previsão de receitas e despesas."]),
        "Na Etapa 3, de caráter eliminatório e classificatório, a Comissão verificará primeiro o atendimento às condições do Edital "
        "(conteúdo mínimo da proposta e envio no prazo); somente as propostas que atenderem a todas serão pontuadas.",
        ("As propostas serão pontuadas pelos seguintes critérios de julgamento:", criterios),
        "A experiência informada na proposta será descrita com as atividades ou projetos, duração, financiador, local, beneficiários e "
        "resultados, e comprovada na fase de celebração. A falsidade de informação acarretará a eliminação da proposta, a aplicação de "
        "sanção e a comunicação às autoridades competentes.",
        ("Será eliminada a proposta:", [
            "cuja pontuação total for inferior a 60 (sessenta) pontos;",
            f"que receber nota zero {zero_elimina}, ou que não contenha o conteúdo mínimo do item 7.4;",
            "que estiver em desacordo com o Edital;",
            "com valor global superior ao valor de referência ou incompatível com o objeto, a ponto de inviabilizar a execução, avaliado "
            "pela Comissão à luz da estimativa e de diligências."]),
        f"Será aplicado o fator de redução da nota previsto no {dec} à OSC que tiver tido prestação de contas rejeitada ou aprovada com "
        "ressalvas nos últimos 5 (cinco) anos, quando o regulamento o previr.",
        "As propostas não eliminadas serão classificadas em ordem decrescente da pontuação total, calculada pela média aritmética das "
        "notas atribuídas por cada membro da Comissão em cada critério.",
        "Em caso de empate, prevalecerá a maior pontuação, sucessivamente, nos critérios (A), (B), (C) e (E); persistindo, a OSC com "
        "maior tempo de constituição; e, por último, sorteio em sessão pública comunicada com antecedência mínima de 2 (dois) dias "
        "úteis, com ata circunstanciada.",
        "A proposta com valor igual ao de referência não é eliminada por esse motivo. Será obrigatoriamente justificada a seleção de "
        "proposta que não for a mais adequada ao valor de referência, considerando a pontuação total e a proporção entre metas, "
        "resultados e valor (art. 27, § 5º).",
        "O prazo de julgamento poderá ser prorrogado uma vez, por até 30 (trinta) dias, de forma justificada.",
        "O resultado preliminar, com as notas de cada critério, será publicado no sítio oficial do ente, iniciando-se o prazo de recurso.",
        "O recurso será dirigido à Comissão de Seleção, pelo canal do item 14.2, sob pena de preclusão; as demais participantes serão "
        "cientificadas para contrarrazões, assegurado o acesso aos elementos dos autos indispensáveis à defesa.",
        "A Comissão poderá reconsiderar sua decisão em até 5 (cinco) dias corridos do fim do prazo de contrarrazões ou, no mesmo prazo, "
        "encaminhar o recurso à autoridade competente, que decidirá de forma motivada em até 15 (quinze) dias corridos. Não caberá novo "
        f"recurso, salvo previsão diversa no {dec}. O acolhimento do recurso invalida apenas os atos insuscetíveis de aproveitamento.",
        "Decididos os recursos, ou transcorrido o prazo sem recurso, a autoridade homologará e divulgará no sítio oficial o resultado "
        "definitivo (art. 27, § 4º). A homologação não gera direito à celebração (art. 27, § 6º).",
        "Havendo uma única proposta classificada, a Administração poderá prosseguir e convocar a OSC para a celebração.",
    ], f"{LEI}, arts. 24, § 1º, IV, V e VIII, 26 e 27; {dec}")

    sec("Fase de celebração", [
        "A OSC selecionada será convocada para, em até 15 (quinze) dias corridos, apresentar o plano de trabalho e os documentos que "
        "comprovam os requisitos para a celebração e a ausência de impedimentos.",
        ("O plano de trabalho detalhará a proposta, com base no plano de trabalho orientativo, e conterá no mínimo (art. 22):", [
            "a descrição da realidade objeto da parceria e o nexo com as ações e as metas;",
            "a forma de execução das ações, indicando as que demandarão atuação em rede, se houver;",
            "as metas quantitativas e mensuráveis e os indicadores, documentos e meios de aferição;",
            "a previsão de receitas e despesas, com os encargos sociais e trabalhistas e os custos diretos e indiretos;",
            "os valores a repassar, conforme cronograma de desembolso; e",
            "as ações que demandarão pagamento em espécie, quando for o caso (art. 54)."]),
        ("A compatibilidade dos custos com os preços de mercado será demonstrada por um ou mais destes elementos, entre outros:", [
            "contratação similar ou parceria da mesma natureza concluída nos últimos 3 (três) anos ou em execução;",
            "ata de registro de preços vigente de órgão público da região;",
            "tabelas de preços de associações profissionais ou tabelas referenciais da política pública setorial;",
            "pesquisa publicada em mídia especializada ou sítio eletrônico especializado, com data e hora de acesso;",
            "Portal Nacional de Contratações Públicas (PNCP) ou Compras.gov.br;",
            "cotação com três fornecedores ou prestadores de serviço, por item ou por grupo de despesas;",
            "pesquisa de remuneração para atividades similares na região e acordos ou convenções coletivas de trabalho."]),
        "O plano de trabalho será ajustado em diálogo técnico com a Administração, observados o Edital, a proposta selecionada e as "
        "necessidades da política pública, mantidos o objeto, as metas e o valor global.",
        ("Os requisitos serão comprovados pelos seguintes documentos (arts. 33 e 34):", [
            "estatuto registrado e suas alterações, com as cláusulas do art. 33;",
            "comprovante de inscrição no CNPJ que demonstre o tempo mínimo de existência do item 5.2;",
            "comprovantes de experiência prévia, admitidos, entre outros: instrumentos de parceria com órgãos públicos, empresas, "
            "organismos internacionais ou outras OSCs; relatórios de atividades; publicações e pesquisas; currículos de integrantes; "
            "declarações de experiência emitidas por órgãos públicos, instituições de ensino, redes, conselhos ou empresas; e prêmios;",
            "certidões de regularidade fiscal, previdenciária, tributária, de contribuições e de dívida ativa, CRF/FGTS e CNDT, aceitas "
            "as positivas com efeito de negativas e dispensada a reapresentação das disponíveis eletronicamente;",
            "relação nominal atualizada dos dirigentes, com endereço, telefone, e-mail, RG e CPF de cada um;",
            "comprovante de funcionamento no endereço declarado;",
            "declaração de que a OSC e seus dirigentes não incorrem nas vedações do art. 39;",
            "declaração sobre as instalações e condições materiais ou sobre a previsão de contratá-las ou adquiri-las com recursos da "
            "parceria; e",
            "na atuação em rede, os comprovantes do item 4.5."]),
        "Não será exigido reconhecimento de firma nem autenticação de cópias (Lei nº 13.726/2018, art. 3º).",
        "A Administração consultará os cadastros de entidades impedidas e de sanções (CEPIM, CEIS e CNEP) e os cadastros próprios do "
        "ente para verificar a existência de impedimento.",
        "Constatada irregularidade formal ou evento que impeça a celebração, a OSC será comunicada para regularizar a situação em até "
        "15 (quinze) dias corridos, sob pena de não celebração.",
        "Se a OSC selecionada não atender aos requisitos, a seguinte na ordem de classificação poderá ser convidada a celebrar a "
        "parceria nos termos da sua proposta, repetindo-se o procedimento, se necessário.",
        "A celebração dependerá da aprovação do plano de trabalho, do parecer técnico, do parecer jurídico, da designação do gestor e "
        "da comissão de monitoramento e avaliação e da indicação de prévia dotação orçamentária (art. 35). A aprovação do plano de "
        "trabalho não gera direito à celebração.",
        "Até a assinatura, a OSC deverá informar qualquer evento superveniente que possa prejudicar a celebração.",
        f"O {tipo_l} só produzirá efeitos após a publicação do extrato no órgão oficial de imprensa do ente (art. 38).",
    ], f"{LEI}, arts. 22, 33 a 35, 38 e 39; Lei nº 13.726/2018")

    sec("Programação orçamentária, valor de referência e recursos", [
        f"Os créditos orçamentários são provenientes da seguinte dotação: {_v(R, 'fonte', 'programa de trabalho, elemento de despesa e fonte de recursos')}.",
        "Nas parcerias plurianuais ou celebradas em exercício seguinte ao da seleção, os créditos dos exercícios seguintes serão "
        "indicados por certidão de apostilamento.",
        f"O valor de referência para a execução do objeto é de {valor}. O valor exato será definido no termo, observada a proposta "
        "selecionada.",
        "Os recursos serão liberados conforme o cronograma de desembolso, em parcelas vinculadas às metas, e depositados em conta "
        "corrente específica, isenta de tarifa, em instituição financeira pública (art. 51). Enquanto não utilizados, serão aplicados "
        "em caderneta de poupança, fundo de curto prazo ou operação lastreada em títulos da dívida pública.",
        "As parcelas ficarão retidas quando houver evidência de irregularidade na aplicação de parcela anterior, desvio de finalidade, "
        "inadimplemento de obrigação ou falta de medidas saneadoras (art. 48).",
        "Poderão ser pagas com recursos da parceria, se previstas no plano de trabalho: a remuneração da equipe, com encargos sociais e "
        "trabalhistas; diárias de deslocamento, hospedagem e alimentação; custos indiretos necessários à execução; e equipamentos e "
        "materiais permanentes essenciais ao objeto, com a adequação de espaço necessária (art. 46).",
        "É vedado remunerar, com recursos da parceria, servidor ou empregado público do ente celebrante, inclusive em cargo em "
        "comissão ou função de confiança, ou seu cônjuge, companheiro ou parente até o segundo grau, ressalvadas as hipóteses legais (art. 45).",
        "Os saldos remanescentes, inclusive os rendimentos das aplicações, serão devolvidos na conclusão, denúncia, rescisão ou "
        "extinção da parceria (art. 52).",
        "A seleção não obriga a Administração a celebrar a parceria, que depende da disponibilidade orçamentária e financeira e do "
        "interesse público.",
    ], f"{LEI}, arts. 24, § 1º, I e VI, 45, 46, 48, 51 e 52")

    sec("Contrapartida", [
        ("Contrapartida da OSC: " + contrapartida + ", em bens ou serviços, com a expressão monetária identificada no termo. "
         if contrapartida else "Não será exigida contrapartida da OSC. ") +
        "Contrapartida financeira nunca será requisito para a celebração (art. 35, § 1º).",
    ], f"{LEI}, art. 35, § 1º")

    sec("Vigência", [
        f"A vigência da parceria será de {prazo}, contada da publicação do extrato.",
        f"A vigência poderá ser prorrogada por termo aditivo, mediante solicitação fundamentada com antecedência mínima de 30 (trinta) "
        f"dias, demonstrados o cumprimento das metas e a vantajosidade, nos limites do {dec}. A prorrogação de ofício, limitada ao exato "
        "período do atraso, é obrigatória quando a Administração der causa ao atraso na liberação dos recursos (art. 55).",
    ], f"{LEI}, arts. 42, VI, e 55; {dec}")

    sec("Monitoramento, avaliação e prestação de contas", [
        f"A execução será acompanhada pelo gestor da parceria ({_v(R, 'gestor', 'gestor da parceria')}) e pela comissão de "
        "monitoramento e avaliação, que homologará o relatório técnico; sempre que possível, haverá pesquisa de satisfação com os "
        "beneficiários (arts. 58 e 59).",
        f"A OSC prestará contas na forma, nos prazos e com os relatórios definidos no termo e no {dec}, com a descrição das atividades "
        "e a comprovação do alcance das metas; a prestação de contas final será apresentada em até 90 (noventa) dias do término da "
        "vigência, prorrogáveis por até 30 (trinta) dias (arts. 64 e 69).",
    ], f"{LEI}, arts. 58, 59, 63 a 69; {dec}")

    sec("Sanções", [
        "Pela execução da parceria em desacordo com o plano de trabalho, com o termo ou com a legislação, a Administração poderá, "
        "garantida a prévia defesa no prazo de 10 (dez) dias, aplicar: advertência; suspensão temporária da participação em chamamento "
        "público e impedimento de celebrar parceria ou contrato com a esfera de governo sancionadora, por até 2 (dois) anos; ou "
        "declaração de inidoneidade (art. 73).",
        "A falsidade de documento ou informação descoberta após a celebração poderá ensejar a rescisão, a rejeição das contas e a "
        "aplicação das sanções do art. 73.",
    ], f"{LEI}, art. 73")

    sec("Disposições finais", [
        "Qualquer pessoa poderá impugnar o Edital e pedir esclarecimentos com antecedência mínima de 10 (dez) dias da data-limite para "
        "o envio das propostas. As respostas caberão à Comissão de Seleção e serão juntadas aos autos e publicadas no sítio oficial.",
        f"Canal de atendimento para esclarecimentos, impugnações e recursos: {contato}.",
        "As impugnações e os pedidos de esclarecimento não suspendem os prazos. Modificação do Edital será divulgada da mesma forma que "
        "o texto original, reabrindo-se o prazo quando afetar a formulação das propostas.",
        "O Edital poderá ser revogado por interesse público ou anulado por vício insanável, sem direito a indenização.",
        "A Administração não cobrará taxa para participar do Chamamento Público nem para obter o Edital. Os custos de elaboração das "
        "propostas correm por conta das OSCs.",
        "As OSCs comprometem-se a observar as condutas vedadas em período eleitoral (Lei nº 9.504/1997), sendo vedada qualquer promoção "
        "pessoal, político-partidária ou eleitoral nas ações e na comunicação da parceria.",
        "O Edital terá validade de [PREENCHER: 12 ou 24] meses, contados da homologação do resultado definitivo, para a convocação "
        "das OSCs classificadas.",
        "Os casos omissos serão resolvidos pela Comissão de Seleção, com base na Lei 13.019/2014, no regulamento do ente e nos "
        "princípios da Administração Pública.",
        f"Fica eleito o foro da comarca de {_v(R, 'municipio', 'município sede do ente')}, após tentativa prévia de solução administrativa.",
        f"Serão juntados a este Edital, pela Administração: o plano de trabalho orientativo, a minuta do {tipo_l} (art. 24, § 1º, IX) "
        "e os modelos de declaração (ciência e concordância, art. 39 e relação de dirigentes, instalações e condições materiais).",
    ], f"{LEI}, arts. 24, § 1º, IX, e 26; Lei nº 9.504/1997; {dec}")

    pend = ([f"Decreto do ente que regulamenta a Lei 13.019/2014 (citado como \"{dec}\")"] if not decreto else []) + [
        "Datas da fase de seleção (publicação, envio das propostas com no mínimo 30 dias, avaliação e resultado)",
        "Juntar ao Edital o plano de trabalho orientativo, a minuta do termo e os modelos de declaração"]
    return {"titulo": "EDITAL DE CHAMAMENTO PÚBLICO Nº [PREENCHER]/[ANO]", "secoes": secoes, "pendencias": pend, "jurisprudencia_ids": []}


def texto_plano(docj):
    partes = [docj.get("titulo", "")]
    for s in docj.get("secoes", []):
        partes.append(f"\n{s.get('titulo','').upper()}")
        partes += s.get("paragrafos", [])
    return "\n".join(partes)
