"""Modelo padrão Licitacon do Termo de Referência de SERVIÇOS (Lei 14.133/2021) e de qualquer TR da Lei 13.303/2016.

(O TR de compras da Lei 14.133 continua no modelo oficial da AGU: modelo_tr.py.)

Estrutura inspirada no Termo de Referência de Material/Serviço da Secretaria de Estado de Polícia Civil do RJ
(SEI-360018/000440/2025, registro de preços de ar-condicionado): apresentação com quadro-resumo; 1 propósito e
justificativa; 2 objeto; 3 modelo de execução; 4 habilitação; 5 gestão, recebimento e pagamento; 6 orçamento;
7 seleção do fornecedor; 8 registro de preços (se houver); 9 sanções; 10 estimativa do valor; 11 disposições finais.

O que NÃO se repete daquele TR (falhas encontradas):
- duas tabelas de itens com numeração diferente (apresentação com 8 itens, item 2.2 com 16) — aqui há uma só;
- remissão a subitem inexistente ("subitem c" no 2.2.4) e anexos trocados (cadastro de reserva no Anexo D, que era a
  autorização de compra) — aqui as remissões são calculadas;
- especificação contraditória (tensão "200 V" com observação "220 V");
- "LC 123/2016" no lugar de LC 123/2006;
- multa compensatória de 40%, acima do teto de 30% do art. 156, § 3º, da Lei 14.133;
- pagamento "à vista" com prazo de 30 dias;
- regras de cooperativas de trabalho (mão de obra) numa compra de bens;
- exigência de certidões da Fazenda do Estado do órgão para todos os licitantes, em vez da Fazenda do domicílio ou sede
  (art. 68, III), e frase incompleta na fiscalização (5.1, "a").
"""
import re

LEI = {"lei-14133": "Lei nº 14.133, de 1º de abril de 2021", "lei-13303": "Lei nº 13.303, de 30 de junho de 2016"}


def _v(R, k, desc):
    v = str((R or {}).get(k) or "").strip()
    return v if v else f"[PREENCHER: {desc}]"


def _meio(t):
    return t[0].lower() + t[1:] if len(t) > 1 and t[0].isupper() and t[1].islower() else t


def _fim(t):
    t = t.strip()
    return t if t.endswith((".", "]", ")")) else t + "."


def _solto(t):
    return isinstance(t, str) and (re.match(r"^[a-z]\) |^[a-z]\.\d\) ", t) or t.startswith("|") or t.startswith("Tabela "))


def _numerar(itens, n):
    out, k = [], 0
    for it in itens:
        if _solto(it):
            out.append(it); continue
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


def _alineas(lista):
    """a) ...; b) ...; e por último 'e' e ponto final."""
    out = []
    for i, t in enumerate(lista):
        t = t.rstrip(" .;")
        fim = "." if i == len(lista) - 1 else ("; e" if i == len(lista) - 2 else ";")
        out.append(f"{chr(97 + i)}) {t}{fim}")
    return out


def _sim(R, k):
    return str(R.get(k) or "").lower().startswith("sim")


def termo(R, regime="lei-14133", norma=""):
    R = dict(R or {})
    r13303 = regime == "lei-13303"
    L = LEI.get(regime, LEI["lei-14133"])
    rilc = norma or ("[PREENCHER: Regulamento Interno de Licitações e Contratos (RILC) da estatal]" if r13303 else "")
    reg = (R.get("normas_ref") or "").strip() if str(R.get("normas") or "").startswith("Regulamento") else ""
    reg_txt = rilc if r13303 else (reg or "regulamento do órgão")
    orgao = _v(R, "orgao", "órgão ou entidade")
    unidade = (R.get("unidade") or "").strip()
    objeto = _v(R, "objeto", "objeto da contratação")
    obj_m = _meio(objeto)
    natureza = str(R.get("natureza") or "")
    compra = bool(re.search(r"compra|aquisi", natureza, re.I))
    mao_obra = bool(re.search(r"mão de obra|mao de obra", natureza, re.I))
    continuo = bool(re.search(r"cont[ií]nuo", natureza, re.I)) or mao_obra
    srp = _sim(R, "srp")
    prazo = str(R.get("prazo") or "")
    prazo = str(R.get("prazo_outro") or "") if prazo == "Outro" else prazo
    prazo = prazo or "[PREENCHER: prazo de vigência]"
    valor = _v(R, "valor", "valor estimado da contratação (da pesquisa de preços)")
    selecao = _v(R, "selecao", "modalidade ou forma de seleção")
    criterio = _v(R, "criterio", "critério de julgamento")
    adjud = (R.get("adjudicacao") or "").strip()
    pag = (R.get("pagamento_prazo") or "").strip() or "30 (trinta) dias"
    sec, num = [], {}

    def s(titulo, itens, fundamento, chave=""):
        num[chave or titulo] = len(sec) + 1
        sec.append({"titulo": titulo, "paragrafos": _numerar(itens, len(sec) + 1), "fundamento": fundamento})

    def it(c):
        return "{{item:" + c + "}}"

    art = (lambda a14, a13: a13 if r13303 else a14)

    preambulo = [
        f"Este Termo de Referência define o objeto, as condições de execução, de gestão e de pagamento e as regras de seleção do "
        f"fornecedor para {('o registro de preços para ' if srp else 'a contratação de ')}"
        f"{re.sub(r'^(registro de preços para |contratação de |aquisição de )', '', obj_m, flags=re.I) if not srp else re.sub(r'^registro de preços para ', '', obj_m, flags=re.I)}, na forma da {L}"
        + (f" e do {rilc}" if r13303 else (f" e do {reg}" if reg else "")) + ".",
        "Tabela 1 – Quadro-resumo",
        "| Campo | Informação |",
        f"| Órgão ou entidade | {orgao}{' – ' + unidade if unidade else ''} |",
        f"| Processo administrativo | {_v(R, 'processo', 'nº do processo administrativo')} |",
        f"| Objeto | {objeto} |",
        f"| Natureza | {natureza or '[PREENCHER: natureza do objeto]'} |",
        f"| Forma de seleção | {selecao} |",
        f"| Critério de julgamento | {criterio}{' · adjudicação ' + _meio(adjud) if adjud else ''} |",
        f"| Registro de preços | {'Sim' if srp else 'Não'} |",
        f"| Vigência | {prazo} |",
        f"| Pagamento | até {pag} do adimplemento de cada parcela |",
        f"| Valor estimado | {valor} |",
    ]

    # 1 propósito
    pca = (R.get("pca_item") or "").strip()
    s("Propósito e justificativa da contratação", [
        ("Justificativa da contratação", [_fim(_v(R, "necessidade", "necessidade da contratação e referência ao ETP"))]),
        ("Instrumentos de planejamento", [
            (f"A contratação está prevista no Plano de Contratações Anual: {_meio(pca)}." if pca else
             "[PREENCHER: item do Plano de Contratações Anual ou justificativa de não previsão]") if not r13303 else
            "A contratação observa o planejamento da estatal e o " + rilc + "."]),
        ("Resultados pretendidos", [
            "Atender à necessidade descrita no item 1.1 com a qualidade, a quantidade e os prazos definidos neste Termo, ao menor "
            "custo total, considerando o ciclo de vida do objeto" + ("" if r13303 else " (art. 11, I)") + "."]),
    ], f"{L}, " + art("arts. 6º, XXIII, \"b\", 11 e 12, VII", "art. 40 e regras de planejamento do " + (rilc or "RILC")), "prop")

    # 2 objeto
    linhas = [x.strip(" .;") for x in re.split(r"\n+|;\s*", str(R.get("quantidades") or "")) if x.strip(" .;")]
    tab = ["Tabela 2 – Itens e quantidades", "| Item | Descrição e quantidade |"]
    tab += [f"| {i} | {x[0].upper() + x[1:]} |" for i, x in enumerate(linhas, 1)] or ["| 1 | [PREENCHER: itens, unidades e quantidades] |"]
    me = str(R.get("me_epp") or "")
    me_txt = []
    if me.startswith("Exclusiva"):
        me_txt = ["A participação é exclusiva de microempresas e empresas de pequeno porte nos itens de valor até R$ 80.000,00 "
                  "(LC nº 123/2006, art. 48, I)."]
    elif me.startswith("Cota"):
        me_txt = (["Em cada item de bem divisível, até 25% (vinte e cinco por cento) do quantitativo fica reservado a microempresas "
                   "e empresas de pequeno porte, sem impedir sua participação na cota principal (LC nº 123/2006, art. 48, III).",
                   "Se a mesma empresa vencer a cota reservada e a principal, a cota reservada será contratada pelo menor dos dois preços.",
                   "As aquisições começarão pela cota reservada."] if compra else
                  ["[PREENCHER: a cota reservada da LC nº 123/2006, art. 48, III, vale só para aquisição de bens divisíveis; "
                   "para serviço, escolha ampla participação ou participação exclusiva até R$ 80.000,00]"])
    s("Descrição do objeto", [
        f"Objeto: {obj_m}, de acordo com as especificações, quantidades e condições deste Termo.",
        *tab,
        ("Especificações e requisitos", [_fim(_v(R, "especificacoes", "especificações técnicas e requisitos"))]),
        *me_txt,
        ("Natureza do objeto", [
            ("O objeto é bem comum, pois seus padrões de desempenho e qualidade podem ser objetivamente definidos pelas "
             "especificações usuais de mercado." if compra else
             "O objeto é serviço comum, pois seus padrões de desempenho e qualidade podem ser objetivamente definidos pelas "
             "especificações usuais de mercado") + (" e de natureza contínua, por atender necessidade permanente da administração"
                                                   if continuo and not compra else "") + ("." if not compra else ""),
        ]),
        *(["As especificações não indicam marca; havendo indicação, ela é só referência e admite similar de qualidade equivalente "
           "ou superior" + ("" if r13303 else " (art. 41, I)") + "."] if compra else []),
    ], f"{L}, " + art("arts. 6º, XIII e XXIII, \"a\", 40, § 1º, e 41; LC nº 123/2006, arts. 47 a 49", "arts. 32 e 47; LC nº 123/2006, arts. 47 a 49; " + rilc), "obj")

    # 3 execução
    loc = (R.get("local") or "").strip()
    exec_txt = (R.get("execucao") or "").strip()
    garantia_c = str(R.get("garantia_contratual") or "")
    sub = _sim(R, "subcontratacao")
    cons = _sim(R, "consorcio")
    ind = (R.get("indice") or "").strip() or "IPCA/IBGE"
    s("Modelo de execução do objeto", [
        ("Forma de execução", [
            *([_fim(exec_txt)] if exec_txt else []),
            (f"Local de {'entrega' if compra else 'execução'}: {loc}." if loc else
             f"[PREENCHER: local de {'entrega' if compra else 'execução'}]"),
            (f"Prazo de entrega: {_meio(R['prazo_entrega'].strip())}." if (R.get('prazo_entrega') or '').strip() else
             ("[PREENCHER: prazo de entrega, contado do recebimento da nota de empenho ou da ordem de fornecimento]" if compra else
              "A execução começará na data indicada na ordem de serviço, emitida após a assinatura do contrato.")),
            "A contratada indicará preposto para representá-la na execução, aceito pela administração" + ("" if r13303 else " (art. 118)") + ".",
        ]),
        ("Vigência", [
            f"A vigência é de {prazo}, contada da assinatura do contrato" + (
                ", prorrogável sucessivamente até 10 (dez) anos, desde que haja previsão no edital, o serviço continue vantajoso e a "
                "autoridade ateste a manutenção da necessidade (arts. 106 e 107)" if continuo and not r13303 else
                ", observado o limite de 5 (cinco) anos do art. 71" if r13303 else "") + "."]),
        ("Reajuste" + (" e repactuação" if mao_obra else ""), [
            (f"Os preços serão reajustados pelo {ind}, com data-base na do orçamento estimado"
             + (f" ({R['data_orcamento']})" if (R.get('data_orcamento') or '').strip() else "")
             + ", após o interregno de 12 (doze) meses" + ("" if r13303 else " (arts. 25, § 7º, e 92, § 3º)") + "."
             if not mao_obra else
             "Os custos de mão de obra serão repactuados com base na convenção ou no acordo coletivo da categoria, mediante "
             "demonstração analítica da variação dos custos, e os demais insumos reajustados pelo " + ind
             + ("" if r13303 else " (arts. 25, § 8º, II, e 135)") + "."),
        ]),
        ("Garantia da contratação", [
            ("Não será exigida garantia contratual." if not garantia_c or garantia_c.startswith("Não") else
             f"Será exigida garantia de {re.sub(r' \(.*', '', garantia_c)} do valor do contrato, em caução em dinheiro ou em títulos da dívida "
             "pública, seguro-garantia, fiança bancária ou título de capitalização, à escolha da contratada"
             + ((" (arts. 96 a 98)" + (", percentual acima de 5% justificado pela complexidade técnica e pelos riscos da execução"
                                       if garantia_c.startswith("10") else "")) if not r13303 else " (art. 70)") + "."),
            *([f"Garantia do produto: {_meio(str(R.get('garantia_bem') or ''))}, contada do recebimento definitivo, sem prejuízo da "
               "garantia legal do Código de Defesa do Consumidor."] if compra and R.get("garantia_bem") else []),
        ]),
        ("Sustentabilidade", [
            "A contratada adotará práticas de economia de água e energia, redução e destinação ambientalmente adequada de resíduos e "
            "uso racional de materiais, observadas as normas ambientais aplicáveis" + ("" if r13303 else " (art. 5º e art. 11, IV)") + "."]),
        ("Subcontratação, consórcio e cooperativas", [
            ("Será admitida a subcontratação de partes acessórias do objeto, até o limite fixado no edital, sem transferir a parcela "
             "principal e mantida a responsabilidade integral da contratada" if sub else
             "Não será admitida a subcontratação, pois o objeto não tem parcela acessória separável da principal")
            + ("" if r13303 else " (art. 122)") + ".",
            ("Será admitida a participação de consórcios, nas condições do edital" if cons else
             "Não será admitida a participação de consórcios, pois o porte e a natureza do objeto permitem a execução por uma "
             "única empresa, sem restringir a competição") + ("" if r13303 else " (art. 15)") + ".",
            *([] if compra or r13303 else ["Será admitida a participação de cooperativas que atendam ao art. 16 da Lei 14.133/2021, "
                                           "vedada a intermediação de mão de obra subordinada." if not mao_obra else
                                           "Não será admitida a participação de cooperativas, pois a execução exige subordinação "
                                           "e habitualidade incompatíveis com o trabalho cooperado (art. 16)."]),
        ]),
        ("Obrigações do contratante", _alineas([
            "exigir o cumprimento das obrigações da contratada, conforme este Termo, o edital e a proposta",
            "acompanhar e fiscalizar a execução, por gestor e fiscais designados, anotando as ocorrências e determinando a correção",
            "receber o objeto e efetuar o pagamento nos prazos e condições deste Termo",
            "notificar a contratada por escrito sobre vícios, defeitos ou incorreções, fixando prazo para correção",
            "decidir os requerimentos da contratada no prazo de 1 (um) mês, salvo prorrogação motivada" + ("" if r13303 else " (art. 123)"),
        ])),
        ("Obrigações da contratada", _alineas([
            f"executar o objeto conforme as especificações, quantidades, prazos e locais deste Termo e da proposta",
            "reparar, corrigir, remover ou substituir, às suas expensas, o que for executado ou entregue com vício ou defeito",
            "manter durante toda a execução as condições de habilitação e qualificação exigidas na licitação",
            "responder pelos encargos trabalhistas, previdenciários, fiscais e comerciais da execução" + ("" if r13303 else " (art. 121)"),
            "comunicar ao fiscal, por escrito e de imediato, qualquer ocorrência que impeça ou atrase a execução",
            *(["cumprir a cota de aprendizes e as normas de saúde e segurança do trabalho e manter o quadro de empregados conforme a "
               "planilha de custos"] if mao_obra else []),
        ])),
    ], f"{L}, " + art("arts. 6º, XXIII, \"c\" e \"e\", 15, 16, 25, 92, 96 a 98, 104 a 107, 115 a 123 e 135",
                      "arts. 68 a 81; " + rilc), "exec")

    # 4 habilitação
    s("Requisitos de habilitação", [
        ("Habilitação jurídica: ato constitutivo, estatuto ou contrato social em vigor, registrado no órgão competente, ou o "
         "documento equivalente ao tipo de pessoa (empresário individual, MEI, sociedade estrangeira autorizada, cooperativa).", []),
        ("Regularidade fiscal, social e trabalhista:", _alineas([
            "inscrição no CNPJ ou no CPF",
            "regularidade perante a Fazenda Federal, inclusive seguridade social, e o FGTS",
            "regularidade perante a Fazenda estadual e/ou municipal do domicílio ou da sede do licitante, pertinente ao objeto",
            "inexistência de débitos inadimplidos perante a Justiça do Trabalho (CNDT)",
            "declaração de cumprimento do art. 7º, XXXIII, da Constituição (trabalho do menor)",
        ])),
        ("Qualificação técnica: atestado(s) de capacidade técnica emitido(s) por pessoa jurídica de direito público ou privado, "
         "comprovando a execução de objeto compatível em características, quantidades e prazos, admitida a soma de atestados e "
         "limitada a exigência a 50% (cinquenta por cento) do quantitativo das parcelas de maior relevância"
         + ("" if r13303 else " (art. 67, II e § 2º)") + "." + (
             " Nos serviços com dedicação exclusiva de mão de obra, o licitante comprovará também experiência mínima de 3 (três) "
             "anos na gestão de mão de obra terceirizada, admitida a soma de atestados" + ("" if r13303 else " (art. 67, § 5º)") + "."
             if mao_obra else ""), []),
        ("Qualificação econômico-financeira:", _alineas([
            "certidão negativa de falência expedida pelo distribuidor da sede do licitante, não sendo causa de inabilitação a "
            "recuperação judicial com plano homologado",
            ("balanço patrimonial e demonstrações contábeis dos 2 (dois) últimos exercícios, com índices de liquidez geral, "
             "solvência geral e liquidez corrente superiores a 1 (um)" + ("" if r13303 else " (art. 69, I)"))
            if (continuo or not compra or srp or "empenho" not in str(R.get("instrumento") or "").lower()) else
            "dispensado o balanço nas compras para entrega imediata" + ("" if r13303 else " (art. 70, III)"),
            *(["patrimônio líquido mínimo de 10% (dez por cento) do valor estimado da contratação, admitido em substituição aos "
               "índices quando estes forem iguais ou inferiores a 1 (um)" + ("" if r13303 else " (art. 69, § 4º)")] if mao_obra or continuo else []),
        ])),
        ("Microempresas e empresas de pequeno porte com restrição na regularidade fiscal e trabalhista terão 5 (cinco) dias úteis, "
         "prorrogáveis por igual período, para regularizar a documentação (LC nº 123/2006, art. 43, § 1º).", []),
    ], f"{L}, " + art("arts. 62 a 70; LC nº 123/2006, arts. 42 e 43", "art. 58; LC nº 123/2006, arts. 42 e 43; " + rilc), "hab")

    # 5 gestão
    fiscais = (R.get("fiscais") or "").strip()
    imr = mao_obra or bool(re.search(r"imr|resultado", str(R.get("medicao") or "") + exec_txt, re.I))
    s("Gestão, fiscalização, recebimento e pagamento", [
        ("Gestão e fiscalização", [
            f"Gestor do contrato: {_v(R, 'gestor', 'gestor do contrato (nome, cargo e matrícula)')}.",
            f"Fiscalização: {fiscais.replace(chr(10), '; ')}." if fiscais else
            "[PREENCHER: fiscais técnico e administrativo e respectivos substitutos]",
            "As comunicações entre a fiscalização e o preposto serão feitas por escrito; ordens verbais não produzem efeito.",
            "A fiscalização não exclui nem reduz a responsabilidade da contratada, inclusive perante terceiros"
            + ("" if r13303 else " (arts. 117 e 120)") + ".",
        ]),
        ("Recebimento", [
            ("Recebimento provisório: em até 15 (quinze) dias da entrega, pelo fiscal, para verificação posterior da conformidade "
             "com as especificações." if compra else
             "Recebimento provisório: em até 15 (quinze) dias da comunicação de conclusão de cada etapa ou período, pelo fiscal, "
             "mediante termo detalhado."),
            "Recebimento definitivo: em até 30 (trinta) dias do provisório, pelo gestor ou comissão designada, mediante termo "
            "circunstanciado, após verificação da qualidade e da quantidade" + ("" if r13303 else " (art. 140)") + ".",
            "O objeto em desacordo será rejeitado, no todo ou em parte, e a contratada o refará ou substituirá em até 5 (cinco) dias "
            "úteis da notificação, às suas custas, sem prejuízo das sanções.",
            "O recebimento não exclui a responsabilidade civil e ético-profissional pela execução" + ("" if r13303 else " (art. 140, § 2º)") + ".",
        ]),
        ("Medição e pagamento", [
            *(["A medição será mensal, com Instrumento de Medição de Resultado (IMR) que ajusta o pagamento aos níveis de serviço "
               "alcançados, nos termos do anexo de medição."] if imr and not compra else []),
            f"O pagamento será feito em até {pag}, contados do recebimento definitivo da parcela e da nota fiscal atestada, por crédito "
            "em conta indicada pela contratada, com as retenções tributárias cabíveis"
            + ("" if r13303 else ", observada a ordem cronológica de exigibilidade (art. 141)") + ".",
            "O atraso no pagamento por culpa da administração gera atualização monetária pelo " + ind + " desde o fim do prazo até o "
            "efetivo pagamento" + ("" if r13303 else " (art. 92, V)") + ".",
            "Antes de cada pagamento será verificada a manutenção das condições de habilitação; a irregularidade não retém o "
            "pagamento, mas gera notificação para regularização e, persistindo, as medidas contratuais cabíveis.",
        ]),
    ], f"{L}, " + art("arts. 6º, XXIII, \"f\" e \"g\", 92, 117, 140 e 141", "arts. 69, 76 e 81; " + rilc), "gest")

    # 6 orçamento
    dot = [f"{rot}: {R[k].strip()}" for k, rot in (("dot_unidade", "unidade orçamentária"), ("dot_programa", "programa de trabalho"),
                                                     ("dot_elemento", "elemento de despesa"), ("dot_fonte", "fonte de recursos"))
           if (R.get(k) or "").strip()]
    s("Adequação orçamentária", [
        ("As despesas correrão à conta da dotação: " + "; ".join(dot) + "." if dot else
         "[PREENCHER: dotação orçamentária (unidade, programa de trabalho, elemento de despesa e fonte)]")
        if not srp else "No registro de preços, a dotação será indicada só na formalização de cada contratação.",
        *(["Nos exercícios seguintes, as despesas correrão à conta das dotações próprias de cada exercício."] if continuo else []),
    ], f"{L}, " + art("arts. 6º, XXIII, \"j\", 72, IV, e 150", "art. 69, VII"), "orc")

    # 7 seleção
    s("Seleção do fornecedor", [
        f"Forma de seleção: {_meio(selecao)}" + ((", na forma eletrônica" if "eletr" not in selecao.lower() else "") + ", com modo de disputa aberto (art. 56)"
                                    if "pregão" in selecao.lower() and not r13303 else "") + ".",
        f"Critério de julgamento: {_meio(criterio)}" + (f", com adjudicação {_meio(adjud)}" if adjud else "") + ".",
        "O orçamento estimado será " + ("divulgado com o edital (art. 24)." if not r13303 else
                                        "sigiloso até o julgamento, salvo decisão em contrário, na forma do art. 34."),
        "A proposta terá validade mínima de 60 (sessenta) dias e conterá preços unitários e totais, com todos os custos da execução.",
        *(["O licitante vencedor apresentará catálogos, folhetos ou fichas técnicas do produto ofertado, com marca e modelo, para "
           "verificação da conformidade com as especificações."] if compra else []),
        *(["O licitante apresentará a planilha de custos e formação de preços, com a convenção ou o acordo coletivo que a fundamenta."] if mao_obra else []),
        "O empate entre propostas será resolvido pelos critérios do " + ("art. 60 da Lei 14.133/2021" if not r13303 else "art. 55 da Lei 13.303/2016") + ".",
    ], f"{L}, " + art("arts. 6º, XXIII, \"h\", 24, 33, 56, 59 e 60", "arts. 32, 34, 54 e 55; " + rilc), "sel")

    # 8 registro de preços
    if srp:
        s("Registro de preços", [
            "A ata de registro de preços terá vigência de 1 (um) ano, prorrogável por igual período se comprovado o preço vantajoso"
            + ("" if r13303 else " (art. 84)") + ".",
            "Será formado cadastro de reserva com os licitantes que aceitarem cotar o preço do primeiro colocado, na ordem de classificação.",
            "Órgãos não participantes poderão aderir à ata, com justificativa da vantagem e anuência do gerenciador e do fornecedor, "
            "limitada cada adesão a 50% (cinquenta por cento) e o total das adesões ao dobro dos quantitativos registrados"
            + ("" if r13303 else " (art. 86, §§ 2º a 5º)") + ".",
            "A existência de preços registrados não obriga a administração a contratar.",
        ], f"{L}, " + art("arts. 82 a 86", "art. 66; " + rilc), "srp")

    # 9 sanções
    if r13303:
        sanc = ["advertência", "multa, na forma prevista no contrato",
                "suspensão temporária de participação em licitação e impedimento de contratar com a estatal, por até 2 (dois) anos"]
        fund_s = f"{L}, arts. 82 a 84; {rilc}"
    else:
        sanc = ["advertência, pela falta leve que não justifique sanção mais grave",
                "multa moratória de 0,5% (meio por cento) por dia de atraso sobre o valor da parcela inadimplida, até 30 (trinta) "
                "dias, após o que se caracteriza inexecução parcial",
                "multa compensatória de 10% (dez por cento) do valor do contrato na inexecução parcial e de 20% (vinte por cento) na "
                "inexecução total, dentro dos limites de 0,5% a 30% do art. 156, § 3º",
                "impedimento de licitar e contratar no âmbito do ente, por até 3 (três) anos",
                "declaração de inidoneidade para licitar ou contratar, de 3 (três) a 6 (seis) anos, nas infrações mais graves"]
        fund_s = f"{L}, arts. 155 a 163"
    s("Sanções administrativas", [
        ("Pelas infrações previstas em lei, a contratada fica sujeita, garantidos o contraditório e a ampla defesa, a:", _alineas(sanc)),
        "As multas podem ser aplicadas com as demais sanções e descontadas da garantia ou dos pagamentos devidos.",
        "Na aplicação das sanções serão considerados a natureza e a gravidade da infração, os danos causados, as circunstâncias "
        "agravantes ou atenuantes e os antecedentes da contratada" + ("" if r13303 else " (art. 156, § 1º)") + ".",
    ], fund_s, "sanc")

    # 10 valor
    s("Estimativa do valor da contratação", [
        f"O valor estimado é de {valor}, conforme a pesquisa de preços juntada ao processo"
        + ("" if r13303 else ", realizada nos parâmetros do art. 23") + ".",
    ], f"{L}, " + art("arts. 6º, XXIII, \"i\", e 23", "art. 31; " + rilc), "valor")

    # 11 disposições
    s("Disposições finais", [
        "Integram este Termo, quando houver: o Estudo Técnico Preliminar, a pesquisa de preços, a matriz de riscos e os anexos de "
        "especificação" + (", de medição" if imr and not compra else "") + (" e a planilha de custos e formação de preços" if mao_obra else "") + ".",
        "Os casos omissos serão resolvidos pela administração, à luz da " + L + (f" e do {reg_txt}" if (r13303 or reg) else "") + ".",
    ], L, "disp")

    for x in sec:
        x["paragrafos"] = [re.sub(r"\{\{item:(\w+)\}\}", lambda m: str(num.get(m.group(1), "?")), p) for p in x["paragrafos"]]
    return {"titulo": "TERMO DE REFERÊNCIA", "preambulo": preambulo, "secoes": sec, "pendencias": [], "jurisprudencia_ids": []}
