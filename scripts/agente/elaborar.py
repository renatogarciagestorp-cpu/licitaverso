#!/usr/bin/env python3
"""Elaboração de documentos pelo Agente Licitacon: ETP, Termo de Referência e Projeto Básico (Lei 14.133/2021).

Fluxo: questionário do assinante -> redação pelo modelo (com o roteiro de verificação, o texto legal e a jurisprudência
da Biblioteca, priorizando o Tribunal de Contas do estado informado) -> conferência automática do próprio texto pelo
analisar.py -> Word em formato ABNT, com a lista de pendências e os pontos de atenção da conferência.

Uso:
  python3 scripts/agente/elaborar.py --doc etp --respostas respostas.json --pasta saida/            (chama a API)
  python3 scripts/agente/elaborar.py --doc etp --respostas respostas.json --pasta saida/ --simular  (sem custo: monta
      o pedido, mostra o tamanho e gera um Word de exemplo com texto fictício, para testar o fluxo)
Saídas na pasta: documento.json, documento.docx (e documento.pdf se houver LibreOffice), conferencia.json.
"""
import argparse, importlib.util, json, pathlib, re, shutil, subprocess, sys, time

RAIZ = pathlib.Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("analisar", RAIZ / "scripts" / "agente" / "analisar.py")
an = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(an)
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
CAMPOS_ROTULO = {
    "orgao": "Órgão ou entidade", "uf": "UF e município", "unidade": "Unidade requisitante", "natureza": "Natureza do objeto",
    "objeto": "Objeto", "necessidade": "Necessidade", "pca": "Plano de contratações anual", "requisitos": "Requisitos",
    "quantidades": "Quantidades e memória de cálculo", "mercado": "Levantamento de mercado", "valor": "Estimativa de valor",
    "solucao": "Solução", "parcelamento": "Parcelamento", "resultados": "Resultados pretendidos", "providencias": "Providências prévias",
    "correlatas": "Contratações correlatas", "ambiental": "Impactos ambientais", "conclusao": "Conclusão do requisitante",
    "definicao": "Definição do objeto", "fundamentacao": "Fundamentação (ETP)", "execucao": "Modelo de execução",
    "gestao": "Modelo de gestão e fiscalização", "medicao": "Medição e pagamento", "selecao": "Seleção do fornecedor",
    "orcamento": "Orçamento", "levantamentos": "Levantamentos e estudos", "solucoes": "Soluções técnicas", "servicos": "Serviços e materiais",
    "metodos": "Métodos construtivos", "plano_obra": "Plano da obra",
}
UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}

FERRAMENTA = {
    "name": "entregar_documento",
    "description": "Entrega o documento redigido, seção por seção, com as pendências que o requisitante precisa completar.",
    "input_schema": {"type": "object", "properties": {
        "titulo": {"type": "string"},
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


def montar_pedido(doc, respostas):
    d = DOCS[doc]
    roteiro = an.carregar_roteiro("lei-14133")
    itens, _ = an.montar_itens(roteiro, d["roteiro"], "lei-14133", d["objetos"])
    texto_resp = "\n".join(f"- {CAMPOS_ROTULO.get(k, k)}: {str(v).strip()}" for k, v in respostas.items() if str(v).strip())
    uf = uf_de(respostas.get("uf", ""))
    juris = jurisprudencia_do_estado(uf, " ".join([respostas.get("objeto", ""), respostas.get("necessidade", "")]))
    refs = an.selecionar_referencias(itens, texto_resp, limite=10)
    bloco_juris = "\n".join(f"- [{j['id']}] {j.get('orgao','')} {j.get('numero','')} ({j.get('data','')[:4]}): {(j.get('tese') or j.get('titulo') or '')[:500]}" for j in juris) or "(nenhuma)"
    system = (
        f"Você é especialista em planejamento de contratações públicas e redige o {d['nome']} conforme o {d['base']}. "
        "Escreva em português formal, claro e técnico, na terceira pessoa, pronto para o processo administrativo. "
        "Regras: (1) use exclusivamente as informações do requisitante; nunca invente números, valores, datas, nomes, quantitativos, "
        "marcas ou fontes de pesquisa de preços; (2) onde faltar dado essencial, escreva o trecho-modelo com a lacuna entre colchetes, "
        "no formato [PREENCHER: o que falta], e registre o item em pendencias; (3) cite os dispositivos legais corretos e vigentes, "
        "usando o texto oficial fornecido; (4) siga o roteiro de verificação fornecido para que o documento atenda a cada item; "
        "(5) jurisprudência: só a fornecida, citando órgão, número e ano, e só quando pertinente; informe os ids usados; "
        "(6) não use marca ou especificação que restrinja a competição sem justificativa técnica; "
        f"(7) produza as seções na ordem: {'; '.join(d['secoes'])}. Entregue com a ferramenta entregar_documento."
    )
    usuario = (
        f"RESPOSTAS DO REQUISITANTE ({d['nome']}):\n{texto_resp}\n\n"
        f"ROTEIRO DE VERIFICAÇÃO (o documento deve atender a estes itens):\n{an.bloco_roteiro(itens)}\n\n"
        f"{an.bloco_referencias(refs)}\n\n"
        f"JURISPRUDÊNCIA DA BIBLIOTECA (priorize o Tribunal de Contas do estado{(' ' + uf) if uf else ''}):\n{bloco_juris}\n"
    )
    return system, usuario, juris


def chamar(system, usuario):
    """Usa a mesma conexão do analisar.py, com a ferramenta de entrega do documento."""
    original = an.FERRAMENTA
    an.FERRAMENTA = FERRAMENTA
    try:
        return an.chamar(system, usuario, max_tokens=32000)
    finally:
        an.FERRAMENTA = original


def texto_plano(docj):
    partes = [docj.get("titulo", "")]
    for i, s in enumerate(docj.get("secoes", []), 1):
        partes.append(f"\n{i}. {s.get('titulo','')}")
        partes += s.get("paragrafos", [])
    return "\n".join(partes)


def simulado(doc, respostas):
    d = DOCS[doc]
    return {"titulo": f"{d['nome'].upper()}", "secoes": [{"titulo": t, "paragrafos": [
        f"[Texto de exemplo da seção \"{t}\". Na elaboração real, o agente redige esta seção a partir das respostas: "
        f"{respostas.get('objeto', '[PREENCHER: objeto]')}.]"], "fundamento": "Lei 14.133/2021"} for t in d["secoes"]],
        "pendencias": ["[Exemplo] Confirmar o valor estimado com a pesquisa de preços anexada ao processo."], "jurisprudencia_ids": []}


# ------------------------------------------------------------------ Word (ABNT)
def gerar_docx(doc, docj, respostas, juris, conferencia, saida):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Cm, Pt, RGBColor
    d = DOCS[doc]
    w = Document()
    sec = w.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21)
    sec.top_margin, sec.left_margin, sec.bottom_margin, sec.right_margin = Cm(3), Cm(3), Cm(2), Cm(2)
    est = w.styles["Normal"]; est.font.name = "Arial"; est.font.size = Pt(12)
    est.paragraph_format.line_spacing = 1.5; est.paragraph_format.space_after = Pt(6)

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
    par(d["nome"].upper(), negrito=True, centro=True, tam=14)
    par(respostas.get("objeto", ""), centro=True)
    w.add_paragraph()
    for i, s in enumerate(docj.get("secoes", []), 1):
        par(f"{i} {s.get('titulo','').upper()}", negrito=True, recuo=False)
        for t in s.get("paragrafos", []):
            par(t)
        if s.get("fundamento"):
            par("Fundamento: " + s["fundamento"], recuo=False, tam=10, cor="66757F")
    usados = set(docj.get("jurisprudencia_ids") or [])
    refs = [j for j in juris if j["id"] in usados]
    if refs:
        par("REFERÊNCIAS", negrito=True, recuo=False)
        for j in refs:
            par((j.get("citacao_abnt") or f"{j.get('orgao','')} {j.get('numero','')}") + (f" Disponível em: {j['fonte_url']}." if j.get("fonte_url") else ""), recuo=False, tam=10)
    w.add_paragraph()
    par("Local e data: ____________________", recuo=False)
    par("Responsável pela elaboração: ____________________ (nome, cargo e matrícula)", recuo=False)
    # anexo: pendências e conferência
    w.add_page_break()
    par("ANEXO — PENDÊNCIAS E PONTOS DE ATENÇÃO", negrito=True, centro=True)
    par("Esta minuta foi elaborada por inteligência artificial a partir das respostas do requisitante e conferida automaticamente "
        "pelo Agente Licitacon. Revise todo o texto, complete as lacunas destacadas e remova este anexo antes de juntar ao processo.", tam=10)
    if docj.get("pendencias"):
        par("Pendências para completar", negrito=True, recuo=False)
        for t in docj["pendencias"]:
            par("• " + t, recuo=False, tam=11)
    achados = [r for r in (conferencia or {}).get("resultados", []) if r.get("resultado") in ("nao_conforme", "parcial")]
    achados += (conferencia or {}).get("outros_apontamentos", []) or []
    if achados:
        par("Pontos de atenção da conferência automática", negrito=True, recuo=False)
        ordem = {"alta": 0, "media": 1, "baixa": 2}
        for r in sorted(achados, key=lambda x: ordem.get(x.get("gravidade"), 3)):
            g = {"alta": "Alta", "media": "Média", "baixa": "Baixa"}.get(r.get("gravidade"), "")
            par(f"[{g}] {r.get('titulo') or r.get('item') or ''}: {r.get('constatacao') or ''} {('Providência: ' + r['correcao']) if r.get('correcao') else ''}".strip(), recuo=False, tam=11)
    w.save(str(saida))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", required=True, choices=sorted(DOCS))
    ap.add_argument("--respostas", required=True)
    ap.add_argument("--pasta", required=True)
    ap.add_argument("--simular", action="store_true", help="não chama a API: monta o pedido e gera um Word de exemplo")
    ap.add_argument("--sem-conferencia", action="store_true")
    a = ap.parse_args()
    pasta = pathlib.Path(a.pasta); pasta.mkdir(parents=True, exist_ok=True)
    respostas = {k: str(v) for k, v in json.loads(pathlib.Path(a.respostas).read_text(encoding="utf-8")).items()}
    system, usuario, juris = montar_pedido(a.doc, respostas)
    print(f"pedido: {len(system) + len(usuario)} caracteres (~{(len(system) + len(usuario)) // 4} tokens de entrada); jurisprudência: {len(juris)}")
    t0, custo_usd, uso = time.time(), 0.0, {}
    if a.simular:
        docj = simulado(a.doc, respostas)
    else:
        resp = chamar(system, usuario)
        uso = resp.get("usage") or {}
        custo_usd += an.custo(uso)
        bloco = next((c for c in resp.get("content", []) if c.get("type") == "tool_use"), None)
        if not bloco or not bloco.get("input"):
            sys.exit("O modelo não entregou o documento (resposta incompleta).")
        docj = bloco["input"]
    (pasta / "documento.json").write_text(json.dumps(docj, ensure_ascii=False, indent=1), encoding="utf-8")
    conferencia = None
    if not a.simular and not a.sem_conferencia:
        txt = pasta / "documento.txt"; txt.write_text(texto_plano(docj), encoding="utf-8")
        conf = pasta / "conferencia.json"
        args = [sys.executable, str(RAIZ / "scripts/agente/analisar.py"), "--doc", DOCS[a.doc]["roteiro"], "--texto", str(txt),
                "--saida", str(conf), "--fonte", "minuta elaborada pelo agente"]
        for o in DOCS[a.doc]["objetos"]:
            args += ["--objeto", o]
        r = subprocess.run(args, capture_output=True, text=True, timeout=2700)
        if r.returncode == 0 and conf.exists():
            conferencia = json.loads(conf.read_text(encoding="utf-8"))
            custo_usd += float((conferencia.get("_execucao") or {}).get("custo_usd") or 0)
        else:
            print("conferência não concluída (o documento é entregue sem os pontos de atenção)")
    gerar_docx(a.doc, docj, respostas, juris, conferencia, pasta / "documento.docx")
    if shutil.which("soffice"):
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(pasta), str(pasta / "documento.docx")],
                       capture_output=True, timeout=300)
    resumo = {"custo_usd": round(custo_usd, 4), "segundos": round(time.time() - t0), "uso": uso,
              "pendencias": len(docj.get("pendencias") or []),
              "alta": sum(1 for r in (conferencia or {}).get("resultados", []) if r.get("gravidade") == "alta" and r.get("resultado") in ("nao_conforme", "parcial")),
              "media": sum(1 for r in (conferencia or {}).get("resultados", []) if r.get("gravidade") == "media" and r.get("resultado") in ("nao_conforme", "parcial"))}
    (pasta / "execucao.json").write_text(json.dumps(resumo, ensure_ascii=False), encoding="utf-8")
    print(f"documento gerado · custo US$ {resumo['custo_usd']} · {resumo['segundos']} s")


if __name__ == "__main__":
    main()
