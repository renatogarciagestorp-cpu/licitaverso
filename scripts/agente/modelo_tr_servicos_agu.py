"""Termo de Referência de SERVIÇOS e LOCAÇÃO e Projeto Básico de OBRAS E SERVIÇOS DE ENGENHARIA (Lei 14.133/2021), no texto
do modelo da AGU (Serviços e obras, versão de maio de 2026): agente/modelos/tr-servicos-agu.docx.

Perfis (perfil_de): "comum" (serviço sem dedicação exclusiva de mão de obra, descrito abaixo), "demo" (com dedicação
exclusiva: volta o que a AGU prevê para ela, como uniformes, fiscalização trabalhista, repactuação, conta-depósito vinculada
ou pagamento pelo fato gerador e custos mínimos da convenção coletiva; as regras de compensação de jornada e férias do
Decreto 12.174/2024 e da IN SEGES/MGI 81/2024 só para órgão federal), "loc" (locação de bens: entrega, manutenção,
substituição e devolução dos bens) e "eng" (obra ou serviço de engenharia, com o título de Projeto Básico: regime de
execução, medição por etapa, garantia adicional do art. 59, § 5º, aceitabilidade de preços, CREA/CAU, responsável técnico,
diário de obra, reajuste pelas planilhas SINAPI/SICRO e responsabilidade de 5 anos do art. 140, § 6º).

O texto vem do próprio arquivo da AGU, no layout do Licitacon. Das cláusulas alternativas ("OU") fica a escolhida pelas
respostas do questionário; saem as cláusulas próprias de dedicação exclusiva de mão de obra (repactuação, conta-depósito
vinculada, pagamento pelo fato gerador, uniformes, compensação de jornada, fiscalização trabalhista), de obras e
serviços de engenharia (contratação integrada e semi-integrada, regime de execução, aceitabilidade de preços, diário de
obra, resíduos da construção), as opcionais sem dado para preencher e o Anexo I (que só vale quando a nota de empenho
substitui o contrato). Os campos entre colchetes viram dados do assinante ou lacunas [PREENCHER].

Os índices abaixo são os parágrafos do modelo de maio/2026; conferir() verifica o início de alguns e acusa se a AGU
mudar o arquivo.
"""
import pathlib, re

RAIZ = pathlib.Path(__file__).resolve().parents[2]
MODELO = RAIZ / "agente" / "modelos" / "tr-servicos-agu.docx"

ANCORAS = {6: "CONDIÇÕES GERAIS DA CONTRATAÇÃO", 122: "MODELO DE EXECUÇÃO DO OBJETO", 194: "MODELO DE GESTÃO DO CONTRATO",
           323: "CRITÉRIOS DE MEDIÇÃO E PAGAMENTO", 515: "INFRAÇÕES E SANÇÕES ADMINISTRATIVAS",
           559: "FORMA E CRITÉRIOS DE SELEÇÃO", 672: "ESTIMATIVAS DO VALOR", 683: "ADEQUAÇÃO ORÇAMENTÁRIA", 694: "DISPOSIÇÕES FINAIS"}

NIVEL = {"Nivel 01": 1, "Nível 02": 2, "Nível 2-Opcional": 2, "Nivel 2-Opcional": 2, "Estilo7": 2, "Nivel 3": 3,
         "Nível 3-Opcional": 3, "Nível 3-R": 3, "Nivel 4": 4, "Nível 4-R": 4, "List Paragraph": 4, "paragraph": 4, "Nivel 5": 5}

# trechos sempre fora (serviço comum, sem mão de obra exclusiva, sem engenharia, por licitação, com contrato)
SEMPRE_FORA = [(0, 5), (8, 8), (13, 14), (24, 24), (28, 34), (44, 52), (69, 69), (74, 74), (89, 91), (102, 104),
               (118, 121), (127, 128), (134, 143), (144, 172), (177, 186), (188, 192), (213, 216), (218, 240), (244, 245),
               (247, 309), (319, 322), (325, 325), (331, 334), (337, 340), (349, 349), (393, 456), (459, 460),
               (475, 514), (538, 538), (562, 580), (595, 595), (613, 614), (627, 629), (635, 635), (640, 640),
               (643, 650), (657, 671), (674, 676), (682, 682), (692, 692), (696, 886)]

RE_DEMO = re.compile(r"dedicação exclusiva de mão de obra|verbas rescisórias|vale-transporte|vale-alimentação|folha de pagamento|"
                     r"Convenção Coletiva|compensação de jornada|Decreto n[º°]? ?12\.174|postos de trabalho", re.I)
RE_ENG = re.compile(r"(?<!mão de )\bobras?\b|engenharia", re.I)
DEMO = re.compile(RE_DEMO.pattern + "|" + RE_ENG.pattern, re.I)  # serviço comum: fora os dois

# perfis além do serviço comum: trechos do modelo que voltam (estavam em SEMPRE_FORA)
VOLTA_DEMO = [(69, 69), (177, 179), (185, 186), (247, 264), (267, 291), (319, 321), (349, 349), (409, 455), (566, 566), (572, 580)]
VOLTA_DEMO_FEDERAL = [(218, 240), (293, 309), (322, 322)]
VOLTA_ENG = [(74, 74), (325, 325), (337, 339), (460, 460), (564, 568), (627, 628), (643, 645), (647, 647), (649, 650)]
CONTA_VINCULADA = [(476, 478), (481, 496)]
FATO_GERADOR = [(498, 500), (507, 514)]


def perfil_de(R, doc="tr"):
    """comum (serviço sem mão de obra exclusiva), demo (com mão de obra exclusiva), loc (locação de bens), eng (obra ou
    serviço de engenharia: Projeto Básico)."""
    if doc == "projeto_basico" or re.search(r"engenharia|(?<!mão de )\bobra\b|reforma", str((R or {}).get("natureza") or ""), re.I):
        return "eng"
    nat = str((R or {}).get("natureza") or "")
    if re.search(r"m[ãa]o de obra", nat, re.I):
        return "demo"
    if re.match(r"loca", nat, re.I):
        return "loc"
    return "comum"


def ler():
    import docx
    d = docx.Document(str(MODELO))
    return [(i, p.style.name, p.text.strip()) for i, p in enumerate(d.paragraphs)]


def conferir(pars=None):
    pars = pars or ler()
    por = {i: t for i, _, t in pars}
    erros = [f"parágrafo {i}: esperado '{a}', encontrado '{por.get(i, '')[:60]}'" for i, a in ANCORAS.items()
             if not por.get(i, "").upper().startswith(a.upper())]
    return erros


def _v(R, k, desc):
    v = str((R or {}).get(k) or "").strip()
    return v if v else f"[PREENCHER: {desc}]"


def _meio(t):
    return t[0].lower() + t[1:] if len(t) > 1 and t[0].isupper() and t[1].islower() else t


def _limpa_colchetes(t):
    """[a] OU [b] -> a (a primeira opção); [texto] -> [PREENCHER: texto]; XX (xxxxx) -> lacuna."""
    t = re.sub(r"\[([^\[\]]+)\](?:\s*(?:OU|/)\s*\[[^\[\]]+\])+", r"\1", t)
    t = re.sub(r"XX+ \(x+\)|XX+%? \(x+ por cento\)|\.{4,}", "[PREENCHER: valor]", t)
    t = re.sub(r"\[(?!PREENCHER)([^\[\]]+)\]", lambda m: f"[PREENCHER: {m.group(1).strip(' .')}]", t)
    return t


def _intervalos(lista):
    return {i for a, b in lista for i in range(a, b + 1)}


def termo(R, pars=None, doc="tr"):
    R = dict(R or {})
    pars = pars or ler()
    perfil = perfil_de(R, doc)
    pb = doc == "projeto_basico"
    natureza = str(R.get("natureza") or "")
    regime_exec = str(R.get("regime_exec") or "")
    unitario = "unitário" in regime_exec.lower()
    # mão de obra exclusiva e locação são, em regra, contínuas (art. 106); obra e serviço de engenharia do Projeto Básico, por escopo
    continuo = perfil in ("demo",) or bool(re.search(r"cont[ií]nuo", natureza, re.I)) or (perfil == "loc" and not re.search(r"entrega|única", str(R.get("prazo") or ""), re.I))
    sub = str(R.get("subcontratacao") or "").startswith("Sim")
    gar = str(R.get("garantia_contratual") or "")
    com_garantia = bool(gar) and not gar.startswith("Não")
    vistoria = str(R.get("vistoria") or "").startswith("Sim")
    srp = str(R.get("srp") or "").startswith("Sim")
    cons = str(R.get("consorcio") or "").startswith("Sim")
    federal = str(R.get("normas") or "").startswith("Órgão federal")
    imr = bool(re.search(r"\bimr\b|medição de resultado", str(R.get("execucao") or ""), re.I))

    fora = _intervalos(SEMPRE_FORA)
    if perfil == "demo":
        fora -= _intervalos(VOLTA_DEMO + (VOLTA_DEMO_FEDERAL if federal else []))
        fora -= _intervalos(FATO_GERADOR if re.search(r"fato gerador", str(R.get("conta_vinculada") or ""), re.I) else CONTA_VINCULADA)
        fora.update(range(456, 468))  # repactuação no lugar do reajuste
    if perfil == "eng":
        fora -= _intervalos(VOLTA_ENG)
        fora.update([340, 341, 458, 459])  # medição por etapa (337-339) e reajuste pelas planilhas referenciais (460)
        if unitario:
            fora.add(325)  # medição por etapas do cronograma só nos regimes de preço global, integral, tarefa e integrada
        if not re.search(r"preg", str(R.get("selecao") or ""), re.I):
            fora.discard(14); fora.add(12)  # obra ou serviço especial de engenharia não é serviço comum
    fora.update([16, 17, 20, 21, 23] if continuo else [17, 18, 21, 22, 23])
    fora.update([] if federal else [690])
    fora.update(range(55, 69) if not sub else [54, 55])
    fora.update(range(72, 108) if not com_garantia else [71, 72])
    if perfil == "eng":
        fora.discard(74)
    if perfil == "demo" and com_garantia:
        fora -= _intervalos([(89, 91), (102, 104)])
    fora.update(range(110, 118) if not vistoria else [109, 110])
    fora.update([175, 176])
    fora.update([] if imr else [324, 330])
    fora.update([] if srp else [581, 582, 678, 679, 680, 681])
    fora.update([] if cons else [594])
    fora.update([] if continuo else [620, 621, 622, 633, 691])
    fora.update([531, 532] if not com_garantia else [])
    fora.update(range(684, 691) if srp else [693])

    objeto = _v(R, "objeto", "objeto")
    obj_sem = re.sub(r"^(contratação de )?(serviços? )?(contínuos? )?(de )?", "", objeto, flags=re.I)
    prazo = str(R.get("prazo") or "")
    prazo = str(R.get("prazo_outro") or "") if prazo == "Outro" else prazo
    prazo = prazo or "[PREENCHER: prazo de vigência]"
    ano = (re.search(r"20\d\d", str(R.get("pca_item") or "")) or re.search(r"20\d\d", str(R.get("processo") or "")) or [None])[0]
    selecao = str(R.get("selecao") or "")
    modal = "CONCORRÊNCIA" if "concorr" in selecao.lower() else "PREGÃO"
    criterio = str(R.get("criterio") or "menor preço").upper()
    pct = re.sub(r" \(.*", "", gar) if com_garantia else ""
    cadastro = (R.get("cadastro") or "").strip() if not federal else "SICAF"
    cadastro = cadastro if cadastro and cadastro != "Outro" else (R.get("cadastro_outro") or "").strip() or ("SICAF" if federal else "cadastro de fornecedores do órgão")
    dot = {"Gestão/unidade": R.get("dot_unidade"), "Fonte de recursos": R.get("dot_fonte"),
           "Programa de trabalho": R.get("dot_programa"), "Elemento de despesa": R.get("dot_elemento")}
    linhas = [x.strip(" .;") for x in re.split(r"\n+|;\s*", str(R.get("quantidades") or "")) if x.strip(" .;")]

    subst = {
        7: f"Contratação de serviços {'contínuos ' if continuo else ''}de {_meio(obj_sem)}, nos termos da tabela abaixo, conforme "
           "condições e exigências estabelecidas neste instrumento.",
        18: "O serviço é enquadrado como continuado tendo em vista que atende a necessidade permanente da Administração, sendo a "
            "vigência plurianual mais vantajosa considerando o Estudo Técnico Preliminar.",
        20: f"O prazo de vigência da contratação é de {prazo} contados da assinatura do contrato, na forma do artigo 105 da Lei n° 14.133, de 2021.",
        22: f"O prazo de vigência da contratação é de {prazo} contados da assinatura do contrato, prorrogável por até 10 anos, na "
            "forma dos artigos 106 e 107 da Lei n° 14.133, de 2021.",
        35: (f"O objeto da contratação está previsto no Plano de Contratações Anual {ano or '[PREENCHER: ano]'}"
             + (f" ({R['pca_item'].strip()})." if (R.get("pca_item") or "").strip() else ", conforme consta das informações básicas desse Termo de Referência.")),
        41: "uso de produtos e materiais com menor impacto ambiental e de equipamentos com melhor eficiência energética;",
        42: "redução, reaproveitamento e destinação ambientalmente adequada dos resíduos gerados na execução; e",
        43: "observância das normas ambientais e sanitárias aplicáveis ao serviço.",
        73: "Será exigida a garantia da contratação de que tratam os arts. 96 e seguintes da Lei nº 14.133, de 2021, com validade "
            "durante a execução do contrato e 90 (noventa) dias após término da vigência contratual, podendo o Contratado optar pela "
            "caução em dinheiro ou em títulos da dívida pública, seguro-garantia, fiança bancária ou título de capitalização, em valor "
            f"correspondente a {pct or '[PREENCHER: percentual]'} do valor {'anual' if continuo else 'total'} da contratação.",
        125: "Início da execução do objeto: " + (f"{R['inicio'].strip()}." if (R.get("inicio") or "").strip() else
                                                "em até 10 (dez) dias da emissão da ordem de serviço."),
        126: "Descrição detalhada dos métodos, rotinas, etapas, tecnologias, procedimentos, frequência e periodicidade de execução do "
             f"trabalho: {_meio(_v(R, 'execucao', 'métodos, rotinas, frequência e periodicidade da execução'))}"
             + ("" if str(R.get("execucao") or "").strip().endswith(".") else "."),
        130: f"Os serviços serão prestados no seguinte endereço: {_v(R, 'local', 'endereço da prestação dos serviços')};",
        131: "Os serviços serão prestados no seguinte horário: " + (f"{R['horario'].strip()}." if (R.get("horario") or "").strip() else
                                                                  "o indicado na descrição da execução (item anterior)."),
        133: "A execução contratual observará as rotinas descritas nas especificações deste Termo de Referência.",
        174: "O prazo de garantia dos serviços é aquele estabelecido na Lei nº 8.078, de 11 de setembro de 1990 (Código de Defesa do Consumidor).",
        202: "O Contratado não necessitará manter preposto da empresa no local da execução do objeto, devendo mantê-lo acessível "
             "para atender às convocações da fiscalização.",
        324: "A avaliação da execução do objeto utilizará o Instrumento de Medição de Resultado (IMR), conforme previsto em anexo.",
        336: "Os serviços serão recebidos provisoriamente, no prazo de 15 (quinze) dias, pelos fiscais técnico e administrativo, "
             "mediante termos detalhados, quando verificado o cumprimento das exigências de caráter técnico e administrativo.",
        341: "Para fins de recebimento provisório, será considerada a conclusão de cada período mensal de execução ou de cada "
             "serviço demandado, conforme a medição.",
        346: "Para efeito de recebimento provisório, será considerado para fins de faturamento o período mensal de execução.",
        356: "Os serviços serão recebidos definitivamente no prazo de 15 (quinze) dias, contados do recebimento provisório, por "
             "servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e "
             "consequente aceitação mediante termo detalhado, obedecendo os seguintes procedimentos:",
        461: "Após o interregno de um ano, e independentemente de pedido do Contratado, os preços iniciais serão reajustados, "
             f"mediante a aplicação, pelo Contratante, do {R.get('indice') or 'IPCA'}, exclusivamente para as obrigações iniciadas e "
             "concluídas após a ocorrência da anualidade.",
        458: "Os preços inicialmente contratados são fixos e irreajustáveis no prazo de um ano contado da data do orçamento estimado"
             + (f", em {R['data_orcamento'].strip()}." if (R.get("data_orcamento") or "").strip() else ", indicada na pesquisa de preços."),
        530: "Moratória, para as infrações descritas no item “d”, de 0,5% (meio por cento) por dia de atraso injustificado sobre o "
             "valor da parcela inadimplida, até o limite de 30 (trinta) dias.",
        533: "Compensatória, para as infrações descritas acima alíneas “e” a “h”, de 15% (quinze por cento) a 30% (trinta por cento) do valor da contratação.",
        534: "Compensatória, para a inexecução total do contrato prevista acima na alínea “c”, de 10% (dez por cento) a 30% (trinta por cento) do valor da contratação.",
        535: "Compensatória, para a infração descrita acima na alínea “b”, de 5% (cinco por cento) a 20% (vinte por cento) do valor da contratação.",
        536: "Compensatória, em substituição à multa moratória para a infração descrita acima na alínea “d”, de 5% (cinco por cento) a 15% (quinze por cento) do valor da contratação.",
        537: "Compensatória, para a infração descrita acima na alínea “a”, de 0,5% (meio por cento) a 10% (dez por cento) do valor da contratação.",
        543: "A multa poderá ser recolhida administrativamente no prazo máximo de 30 (trinta) dias, a contar da data do recebimento "
             "da comunicação enviada pela autoridade competente.",
        561: f"O fornecedor será selecionado por meio da realização de procedimento de LICITAÇÃO, na modalidade {modal}, sob a forma "
             f"ELETRÔNICA, com adoção do critério de julgamento pelo {criterio}.",
        609: "balanço patrimonial, demonstração de resultado de exercício e demais demonstrações contábeis dos dois últimos "
             "exercícios sociais, já exigíveis e apresentados na forma da lei, comprovando índices de Liquidez Geral (LG), Liquidez "
             "Corrente (LC) e Solvência Geral (SG) superiores a 1 (um), obtidos por meio da aplicação das seguintes fórmulas:",
        612: "Caso a empresa apresente resultado inferior ou igual a 1 (um) em qualquer dos índices de Liquidez Geral (LG), Solvência "
             "Geral (SG) e Liquidez Corrente (LC), será exigido, para fins de habilitação, patrimônio líquido mínimo de 10% (dez por "
             "cento) do " + ("valor total estimado da contratação para o período de doze meses." if continuo else "valor total estimado da contratação."),
        615: "Patrimônio líquido de 10% (dez por cento) do valor estimado da contratação"
             + (" para o período de doze meses" if continuo else "") + ", por meio da apresentação do balanço patrimonial e "
             "demonstrações contábeis do último exercício social;",
        633: "contrato(s) que comprove(m) a experiência mínima de 3 (três) anos do fornecedor na prestação dos serviços, em períodos "
             "sucessivos ou não, sendo aceito o somatório de atestados de períodos diferentes;",
        634: "contrato(s) que comprove(m) a execução, pelo fornecedor, de serviços equivalentes a até 50% (cinquenta por cento) do "
             "quantitativo das parcelas de maior relevância do objeto;",
        673: f"O custo estimado total da contratação, que é o máximo aceitável, é de {_v(R, 'valor', 'valor estimado (R$ e por extenso)')}, "
             "conforme custos unitários apostos na tabela contida no item 1.1 acima.",
        684: "As despesas decorrentes da presente contratação correrão à conta de recursos específicos consignados no orçamento do "
             + ("ente." if not federal else "Orçamento Geral da União."),
        695: "As informações contidas neste Termo de Referência não são classificadas como sigilosas.",
        386: None,
        56: "É permitida a subcontratação parcial do objeto, até o limite de [PREENCHER: percentual máximo do valor do contrato que "
            "pode ser subcontratado] do valor total do contrato, nas seguintes condições:",
        57: "É vedada a subcontratação completa ou da parcela principal da obrigação.",
        61: "Poderão ser subcontratadas apenas parcelas acessórias do objeto, definidas na proposta e aprovadas pelo Contratante.",
    }
    for i, _, t in pars:
        if i == 111:
            subst[111] = re.sub(r",? de segunda à sexta-feira, das XX horas às XX horas", ", de segunda a sexta-feira, em data e horário "
                                "agendados previamente com a unidade requisitante", t)
    for i, (rot, v) in zip(range(686, 690), dot.items()):
        subst[i] = f"{rot}: {(v or '').strip() or '[PREENCHER: ' + rot.lower() + ']'};"

    doc_nome = "Projeto Básico" if pb else "Termo de Referência"
    indice = str(R.get("indice") or ("INCC-DI" if perfil == "eng" else "IPCA"))
    execucao = str(R.get("execucao") or "").strip()
    if perfil == "demo":
        cct = _v(R, "cct", "acordo, convenção ou dissídio coletivo de trabalho usado como referência (sindicato, número de registro e vigência)")
        subst.update({
            7: f"Contratação de serviços contínuos de {_meio(obj_sem)}, a serem executados com regime de dedicação exclusiva de mão de obra, "
               "nos termos da tabela abaixo, conforme condições e exigências estabelecidas neste instrumento.",
            179: "O uniforme deverá compreender as seguintes peças do vestuário, entregues em 2 (dois) conjuntos completos ao empregado no "
                 "início da execução do contrato e substituídas por 1 (um) conjunto completo a cada 6 (seis) meses, ou a qualquer época, "
                 "no prazo de 48 (quarenta e oito) horas da comunicação escrita do Contratante, sempre que não atendam às condições "
                 "mínimas de apresentação: " + _meio(_v(R, "uniformes", "peças do uniforme")).rstrip(".") + ".",
            202: "O Contratado deverá manter preposto da empresa no local da execução do objeto durante o horário de prestação dos serviços.",
            272: "Sempre que houver admissão de novos empregados pela contratada, os documentos exigidos no primeiro mês da prestação dos "
                 "serviços deverão ser apresentados.",
            273: "A Administração deverá analisar a documentação solicitada no prazo de 30 (trinta) dias após o recebimento dos "
                 "documentos, prorrogáveis por mais 30 (trinta) dias, justificadamente.",
            431: "Quando a repactuação solicitada pelo Contratado se referir aos custos decorrentes do mercado, o respectivo aumento será "
                 f"apurado mediante a aplicação do {indice}, pela fórmula R = V × (I – Iº) / Iº, em que R é o valor do reajustamento, V é o "
                 "valor contratual da parcela dos custos decorrentes do mercado, Iº é o índice da data de apresentação da proposta e I é "
                 "o índice relativo ao mês do reajustamento.",
            448: "O Contratante decidirá sobre o pedido de repactuação de preços em até 60 (sessenta) dias, contados da data do "
                 "fornecimento, pelo Contratado, da documentação comprobatória da variação dos custos a serem repactuados.",
            478: "Eventuais tarifas bancárias da conta-depósito vinculada são de responsabilidade do Contratado e serão debitadas dos "
                 "valores depositados.",
            500: "Serão objeto de pagamento mensal ao Contratado o somatório dos seguintes módulos da planilha de custos e formação de "
                 "preços (Anexo VII-D da IN SEGES/MP nº 5/2017): Módulo 1 (composição da remuneração); Submódulo 2.2 (encargos "
                 "previdenciários e FGTS); Submódulo 2.3 (benefícios mensais e diários); Submódulo 4.2 (substituto na intrajornada); "
                 "Módulo 5 (insumos); e Módulo 6 (custos indiretos, tributos e lucro), calculado sobre os anteriores.",
            572: "Somente serão aceitas propostas que adotem, na planilha de custos e formação de preços, valores iguais ou superiores aos "
                 f"orçados pela Administração para as seguintes parcelas, conforme estimativa baseada em {cct}:",
            573: "salário-base e adicionais, auxílio-alimentação e benefícios de natureza trabalhista ou social que contemplem todos os "
                 "trabalhadores representados pelo sindicato laboral: "
                 + _meio(_v(R, "custos_minimos", "valores mínimos de salário-base, adicionais, auxílio-alimentação e benefícios, por categoria")).rstrip(".") + ";",
            580: "Os valores orçados pela Administração constam da planilha de custos e formação de preços anexa a este Termo de Referência.",
        })
        fora.update(range(574, 578))
        subst.pop(634, None)  # mantém o texto da AGU (até 50% dos postos de trabalho)
    if perfil == "loc":
        obj_loc = re.sub(r"^(contratação de )?(empresa para (a )?)?(locação de )?", "", objeto, flags=re.I)
        subst.update({
            7: f"Locação de {_meio(obj_loc)}, nos termos da tabela abaixo, conforme condições e exigências estabelecidas neste instrumento.",
            18: "A locação é enquadrada como contínua tendo em vista que atende a necessidade permanente da Administração, sendo a "
                "vigência plurianual mais vantajosa considerando o Estudo Técnico Preliminar.",
            126: ["Condições de entrega, instalação, manutenção e substituição dos bens locados: "
                  + (_meio(execucao).rstrip(".") + "." if execucao else "[PREENCHER: entrega, instalação, manutenção e substituição dos bens locados]"),
                  "A manutenção preventiva e corretiva, a reposição de peças e insumos e a substituição dos bens que apresentarem defeito "
                  "correm por conta do Contratado, sem ônus adicional ao Contratante, e o bem substituto terá características iguais ou "
                  "superiores às do substituído.",
                  "Ao fim da locação, o Contratado retirará os bens no prazo de 30 (trinta) dias, sem ônus ao Contratante, que os "
                  "restituirá no estado em que os recebeu, salvo as deteriorações naturais ao uso regular."],
            130: f"Os bens serão entregues e instalados no seguinte endereço: {_v(R, 'local', 'endereço de entrega e instalação dos bens')};",
            131: "Horário de entrega e de atendimento técnico: " + (f"{R['horario'].strip()}." if (R.get("horario") or "").strip() else
                                                               "em dias úteis, no horário de expediente do Contratante."),
            12: "O objeto desta contratação é caracterizado como comum, conforme justificativa constante do Estudo Técnico Preliminar.",
            129: "Local e horário de entrega e de atendimento",
            173: "Garantia de funcionamento dos bens locados",
            174: "Durante toda a vigência, o Contratado garante o perfeito funcionamento dos bens locados, mantendo-os em estado de servir "
                 "ao uso a que se destinam, nos termos dos arts. 566 e 568 do Código Civil.",
        })
    if perfil == "eng":
        nat_eng = natureza.lower()
        obra = not ("serviço" in nat_eng)
        obj_eng = re.sub(r"^(contratação de )?(empresa (especializada )?para (a )?)?(execução de )?(obras? de |serviços? de engenharia de )?", "", objeto, flags=re.I)
        sinapi = re.search(r"((?:SINAPI|SICRO)(?:-[A-Z]{2})?)[^\d]*(\d\d/\d{4})", str(R.get("valor") or ""), re.I)
        base_orc = (f"datadas de {R['data_orcamento'].strip()}" if (R.get("data_orcamento") or "").strip() else
                    f"elaboradas com base no {sinapi.group(1).upper()} de {sinapi.group(2)}" if sinapi else
                    "elaboradas com base no [PREENCHER: sistema de referência (SINAPI/SICRO) e mês-base do orçamento]")
        prazo_txt = prazo
        subst.update({
            7: f"Contratação de {'obra' if obra else 'serviços de engenharia'} de {_meio(obj_eng)}, nos termos da tabela abaixo, conforme "
               "condições e exigências estabelecidas neste instrumento.",
            12: "O objeto da contratação é serviço comum de engenharia, conforme justificativa constante do Estudo Técnico Preliminar.",
            14: f"O objeto da contratação tem a natureza de {'obra' if obra else 'serviço especial de engenharia'}, conforme justificativa "
                "constante do Estudo Técnico Preliminar.",
            16: "A contratação é por escopo, com conclusão do objeto predefinido.",
            20: f"O prazo de execução do objeto é de {prazo_txt}, contado da emissão da ordem de serviço, e o prazo de vigência da "
                f"contratação é de {prazo_txt} acrescido de 90 (noventa) dias para o recebimento definitivo, contados da assinatura do "
                "contrato, prorrogado automaticamente quando o objeto não for concluído no período firmado, na forma do art. 111 da Lei "
                "nº 14.133, de 2021.",
            37: ["A descrição da solução como um todo encontra-se pormenorizada em tópico específico dos Estudos Técnicos Preliminares, "
                 "apêndice deste Projeto Básico.",
                 "Integram este Projeto Básico, como anexos, os levantamentos topográficos e cadastrais, as sondagens e os demais "
                 "estudos que se fizerem necessários, os desenhos, o memorial descritivo, as especificações técnicas, o orçamento "
                 "detalhado com as composições de custos unitários e o BDI e o cronograma físico-financeiro (art. 6º, XXV, da Lei nº "
                 "14.133, de 2021)."],
            125: ["Início da execução do objeto: " + (f"{R['inicio'].strip()}." if (R.get("inicio") or "").strip() else
                                                     "em até 10 (dez) dias da emissão da ordem de serviço."),
                  "Antes do início da execução, o Contratado apresentará a Anotação de Responsabilidade Técnica (ART) ou o Registro de "
                  "Responsabilidade Técnica (RRT) da execução e, quando exigível, o alvará de obra e a matrícula da obra no CNO."],
            126: "Descrição detalhada dos métodos, rotinas, etapas, tecnologias, procedimentos, frequência e periodicidade de execução do "
                 "trabalho: " + (_meio(execucao).rstrip(".") + "." if execucao else
                                 "conforme o memorial descritivo, as especificações técnicas e o cronograma físico-financeiro anexos a este Projeto Básico."),
            127: "Cronograma de realização dos serviços: o cronograma físico-financeiro anexo a este Projeto Básico, com a execução por "
                 "etapas e medições mensais.",
            130: f"Os serviços serão executados no seguinte endereço: {_v(R, 'local', 'endereço da obra')};",
            131: "Os serviços serão executados no seguinte horário: " + (f"{R['horario'].strip()}." if (R.get("horario") or "").strip() else
                                                                      "em dias úteis, no horário comercial, salvo autorização da fiscalização para outros horários."),
            133: "A execução contratual observará as normas técnicas da ABNT, as normas de segurança e saúde do trabalho (em especial a "
                 "NR 18), o memorial descritivo e as especificações técnicas deste Projeto Básico.",
            174: "Recebido definitivamente o objeto, o Contratado responde, pelo prazo mínimo de 5 (cinco) anos, pela solidez e pela "
                 "segurança dos materiais e dos serviços executados e pela funcionalidade da obra, nos termos do art. 140, § 6º, da Lei "
                 "nº 14.133, de 2021, e do art. 618 do Código Civil, sem prejuízo da garantia legal da Lei nº 8.078, de 1990." if obra else
                 "O prazo de garantia dos serviços é aquele estabelecido na Lei nº 8.078, de 11 de setembro de 1990 (Código de Defesa do "
                 "Consumidor), sem prejuízo da responsabilidade do art. 140, § 6º, da Lei nº 14.133, de 2021, quando couber.",
            43: "observância das normas ambientais aplicáveis, em especial da Resolução CONAMA nº 307, de 2002, na gestão e na "
                "destinação dos resíduos da construção civil.",
            202: "O Contratado deverá manter preposto da empresa, com o engenheiro ou arquiteto responsável técnico acessível à "
                 "fiscalização, no local da execução do objeto durante todo o período de execução.",
            208: ["O fiscal técnico do contrato anotará no histórico de gerenciamento do contrato todas as ocorrências relacionadas à "
                  "execução do contrato, com a descrição do que for necessário para a regularização das faltas ou dos defeitos "
                  "observados.",
                  "O Contratado manterá Diário de Obra, preenchido diariamente pelo responsável técnico, com o andamento dos serviços, "
                  "o efetivo de pessoal e de equipamentos, as condições meteorológicas e as ocorrências, à disposição da fiscalização, "
                  "que nele registrará suas observações."],
            346: "Para efeito de recebimento provisório, será considerada para fins de faturamento cada etapa concluída do cronograma "
                 "físico-financeiro, conforme a medição aprovada pela fiscalização.",
            356: "Os serviços serão recebidos definitivamente no prazo de até 90 (noventa) dias, contados do recebimento provisório, por "
                 "servidor ou comissão designada pela autoridade competente, após a verificação da qualidade e quantidade do serviço e "
                 "consequente aceitação mediante termo detalhado, obedecendo os seguintes procedimentos:",
            460: "Os preços inicialmente contratados são fixos e irreajustáveis no prazo de um ano contado da data do orçamento estimado, "
                 f"considerando as planilhas referenciais {base_orc}.",
            565: f"O regime de execução do objeto será de {regime_exec.lower() or '[PREENCHER: regime de execução]'}.",
            627: "Registro ou inscrição da empresa no Conselho Regional de Engenharia e Agronomia (CREA) ou no Conselho de Arquitetura e "
                 "Urbanismo (CAU), em plena validade;",
            644: "Apresentação do(s) profissional(is) de nível superior, devidamente registrado(s) no CREA ou no CAU, detentor(es) de "
                 "atestado de responsabilidade técnica por execução de obra ou serviço de características semelhantes às parcelas de "
                 "maior relevância a seguir:",
            645: "Para o responsável técnico (engenheiro civil ou arquiteto): " + _meio(_v(R, "parcelas_relevantes",
                 "parcelas de maior relevância técnica e valor significativo do objeto (até 4% do valor total cada)")).rstrip(".") + ".",
            634: "contrato(s) que comprove(m) a execução, pelo fornecedor, de quantitativos de até 50% (cinquenta por cento) das parcelas "
                 "de maior relevância técnica ou de valor significativo do objeto;",
            673: f"O custo estimado total da contratação, que é o máximo aceitável, é de {_v(R, 'valor', 'valor estimado (R$ e por extenso)')}, "
                 "conforme o orçamento detalhado em planilhas, com as composições de custos unitários e o BDI, anexo a este Projeto Básico.",
        })
        if unitario:
            subst[569] = ("Para o objeto ou parte dele sujeito ao regime de empreitada por preço unitário, o critério de aceitabilidade de "
                          "preços será o valor global estimado e os custos unitários das composições do orçamento de referência.")
            fora.discard(569)
        if (R.get("fonte") or "").strip() and not any((v or "").strip() for v in dot.values()):
            subst[686] = f"Dotação orçamentária: {R['fonte'].strip()}."
            fora.update(range(687, 690))
    subst[461] = subst[461].replace(str(R.get("indice") or "IPCA"), indice)

    tab_itens = (["Tabela 1 – Itens e quantidades", "| Item | Descrição e quantidade |"]
                 + ([f"| {i} | {x[0].upper() + x[1:]} |" for i, x in enumerate(linhas, 1)] or ["| 1 | [PREENCHER: itens, unidades e quantidades] |"]))

    # monta as seções no formato do Licitacon (numeração própria)
    secoes, cur, cont = [], None, [0, 0, 0]
    tem_h = False

    def adiciona(t, prof):
        nonlocal cont
        n = len(secoes)
        if prof == 1:
            cont = [cont[0] + 1, 0, 0]
            cur["paragrafos"].append(f"{n}.{cont[0]} {t}")
        elif prof == 2:
            cont = [cont[0], cont[1] + 1, 0]
            cur["paragrafos"].append(f"{n}.{cont[0]}.{cont[1]} {t}")
        elif prof == 3:
            cont[2] += 1
            cur["paragrafos"].append(f"{chr(96 + min(cont[2], 26))}) {t}")
        else:
            cur["paragrafos"].append(f"– {t}")

    filtro = {"comum": DEMO, "loc": DEMO, "demo": RE_ENG, "eng": RE_DEMO}[perfil]
    for i, st, t in pars:
        if not t or i in fora or t == "OU":
            continue
        t = subst.get(i) or t
        extras = []
        if isinstance(t, list):
            t, extras = t[0], t[1:]
        if i == 386:
            t = re.sub(r"\[definir o índice\]|\[[^\]]*índice[^\]]*\]", indice, t)
        if st == "Nivel 01" and i != 53:
            t = t.replace(" E REGIME DE EXECUÇÃO", "")
            secoes.append({"titulo": t[0] + t[1:].lower() if t.isupper() else t, "paragrafos": [], "fundamento": "Lei nº 14.133, de 1º de abril de 2021"})
            cur, cont, tem_h = secoes[-1], [0, 0, 0], False
            if i == 6:
                pass
            continue
        if cur is None:
            continue
        if i != 7 and i not in subst and filtro.search(t):
            continue
        if not federal:
            t = (t.replace("SICAF", cadastro).replace("Orçamento Geral da União", "orçamento do ente")
                  .replace("Advocacia-Geral da União", "órgão de representação judicial do ente"))
        if perfil == "demo" and not federal:
            t = re.sub(r",? ?(conforme o |\()art\. 2º, inciso [IVX]+, do Decreto n\.?º ?12\.174(/2024|, de 2024)\)?", "", t)
        t = t.replace(", conforme modelo constante do Anexo XXX deste Termo de Referência", "")
        if pb:
            t = t.replace("Termo de Referência", "Projeto Básico").replace("termo de referência", "projeto básico")
        t = _limpa_colchetes(t)
        if not re.sub(r"\[PREENCHER:[^\]]*\]|[\s;.,e]", "", t):
            continue  # só lacuna vazia: opcional sem dado
        if st.startswith("Nível 1-Sem") or i == 53:
            tem_h = True
            adiciona(t, 1)
            continue
        nv = NIVEL.get(st)
        if nv is None:  # parágrafo de instrução ou fórmula (Normal): fica como texto solto só se tiver conteúdo útil
            continue
        prof = (nv - 1) if tem_h else (nv - 1)
        prof = ({2: 2, 3: 3, 4: 4, 5: 4} if tem_h else {2: 1, 3: 2, 4: 3, 5: 4})[nv]
        adiciona(t, prof)
        for x in extras:
            adiciona(x, prof)
        if i == 7:
            cur["paragrafos"] += tab_itens
            if (R.get("especificacoes") or "").strip():
                adiciona("Especificações e requisitos: " + R["especificacoes"].strip().rstrip(".") + ".", 1)

    secoes = [s for s in secoes if s["paragrafos"]]
    return {"titulo": doc_nome.upper(), "preambulo": [], "secoes": secoes, "pendencias": [], "jurisprudencia_ids": []}
