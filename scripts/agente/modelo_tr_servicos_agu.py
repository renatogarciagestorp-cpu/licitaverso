"""Termo de Referência de SERVIÇOS COMUNS SEM DEDICAÇÃO EXCLUSIVA DE MÃO DE OBRA (Lei 14.133/2021), fora de obras e
serviços de engenharia, no texto do modelo da AGU (Serviços e obras, versão de maio de 2026):
agente/modelos/tr-servicos-agu.docx.

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

DEMO = re.compile(r"dedicação exclusiva de mão de obra|verbas rescisórias|vale-transporte|vale-alimentação|folha de pagamento|"
                  r"Convenção Coletiva|compensação de jornada|Decreto n[º°]? ?12\.174|(?<!mão de )\bobras?\b|engenharia|"
                  r"postos de trabalho", re.I)


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


def termo(R, pars=None):
    R = dict(R or {})
    pars = pars or ler()
    natureza = str(R.get("natureza") or "")
    continuo = bool(re.search(r"cont[ií]nuo", natureza, re.I))
    sub = str(R.get("subcontratacao") or "").startswith("Sim")
    gar = str(R.get("garantia_contratual") or "")
    com_garantia = bool(gar) and not gar.startswith("Não")
    vistoria = str(R.get("vistoria") or "").startswith("Sim")
    srp = str(R.get("srp") or "").startswith("Sim")
    cons = str(R.get("consorcio") or "").startswith("Sim")
    federal = str(R.get("normas") or "").startswith("Órgão federal")
    imr = bool(re.search(r"\bimr\b|medição de resultado", str(R.get("execucao") or ""), re.I))

    fora = set()
    for a, b in SEMPRE_FORA:
        fora.update(range(a, b + 1))
    fora.update([16, 17, 20, 21, 23] if continuo else [17, 18, 21, 22, 23])
    fora.update([] if federal else [690])
    fora.update(range(55, 69) if not sub else [54, 55])
    fora.update(range(72, 108) if not com_garantia else [71, 72])
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
    }
    for i, (rot, v) in zip(range(686, 690), dot.items()):
        subst[i] = f"{rot}: {(v or '').strip() or '[PREENCHER: ' + rot.lower() + ']'};"

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

    for i, st, t in pars:
        if not t or i in fora or t == "OU":
            continue
        t = subst.get(i) or t
        if i == 386:
            t = re.sub(r"\[definir o índice\]|\[[^\]]*índice[^\]]*\]", str(R.get("indice") or "IPCA"), t)
        if st == "Nivel 01" and i != 53:
            t = t.replace(" E REGIME DE EXECUÇÃO", "")
            secoes.append({"titulo": t[0] + t[1:].lower() if t.isupper() else t, "paragrafos": [], "fundamento": "Lei nº 14.133, de 1º de abril de 2021"})
            cur, cont, tem_h = secoes[-1], [0, 0, 0], False
            if i == 6:
                pass
            continue
        if cur is None:
            continue
        if i != 7 and DEMO.search(t):
            continue
        if not federal:
            t = (t.replace("SICAF", cadastro).replace("Orçamento Geral da União", "orçamento do ente")
                  .replace("Advocacia-Geral da União", "órgão de representação judicial do ente"))
        t = _limpa_colchetes(t)
        t = t.replace(", conforme modelo constante do Anexo XXX deste Termo de Referência", "")
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
        if i == 7:
            cur["paragrafos"] += tab_itens
            if (R.get("especificacoes") or "").strip():
                adiciona("Especificações e requisitos: " + R["especificacoes"].strip().rstrip(".") + ".", 1)

    secoes = [s for s in secoes if s["paragrafos"]]
    return {"titulo": "TERMO DE REFERÊNCIA", "preambulo": [], "secoes": secoes, "pendencias": [], "jurisprudencia_ids": []}
