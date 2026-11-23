#!/usr/bin/env python3
"""Leitura antecipada das fontes das coletas do RJ (roda no GitHub Actions aos domingos, véspera das coletas de segunda).

As coletas "Nacional e RJ" (8h07) e "TCE-RJ e TCM-RJ" (8h37) rodam com a rede filtrada e, às vezes, sem permissão de
envio ao GitHub; sem envio, não conseguem pedir leituras ao leitor de fontes. Esta automação faz os pedidos por elas,
antes de começarem, e deixa as leituras no ramo coleta-fontes, que elas só precisam ler (clone sem envio):

  lidas/rj-<AAAAMMDD>/      TCE-RJ (Jurisprudência Selecionada, páginas 1 e 2), TCMJuris (enunciados, informativos, súmulas)
  lidas/rj-<AAAAMMDD>-2/    TCMJuris: análise de cada enunciado novo (id maior que o último gravado, até 40)
  lidas/nacional-<AAAAMMDD>/    TCU, STF, STJ, PGE-RJ, TJ-RJ e normas (páginas-índice e informativos seguintes)
  lidas/nacional-<AAAAMMDD>-2/  boletins e informativos do TCU achados nos links da 1ª leitura

Os marcadores (último enunciado, últimos informativos do STF e do STJ) vêm do acervo do site (acervo-completo.json,
campo meta). Uso: python3 pre-leitura.py <acervo-completo.json> <pasta lidas> <AAAAMMDD>

O TCE-RJ e o TJ-RJ bloqueiam os servidores do GitHub; com o segredo FIRECRAWL_API_KEY, essas duas fontes são lidas pelo
Firecrawl com acesso a partir do Brasil (≈1 crédito o TCE-RJ; o PDF do TJ-RJ, 1 crédito para conferir a data de
atualização e ≈1 por página só quando a data muda). Sem o segredo, ficam no leitor comum (e falham).
"""
import json, os, pathlib, re, subprocess, sys, tempfile, urllib.request

raiz = pathlib.Path(__file__).resolve().parent


def ler(nome, linhas, lidas):
    """Roda o leitor de fontes para uma lista de endereços e devolve o índice."""
    destino = lidas / nome
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    subprocess.run([sys.executable, str(raiz / "ler-fontes.py"), f.name, str(destino)], timeout=1500)
    try:
        return json.loads((destino / "indice.json").read_text(encoding="utf-8")), destino
    except Exception:
        return [], destino


TCERJ_PAGINA = "https://www.tcerj.tc.br/cadastro-publicacoes/public/jurisprudencia-selecionada"
TJRJ_LISTA = "https://www.tjrj.jus.br/documents/d/portal-conhecimento/inconstitucionalidades-2026"


def firecrawl(url, paginas=None):
    """Lê uma página pelo Firecrawl (acesso do Brasil). Devolve (markdown, erro)."""
    corpo = {"url": url, "formats": ["markdown"], "onlyMainContent": True, "maxAge": 0,
             "location": {"country": "BR", "languages": ["pt-BR"]}, "timeout": 120000}
    if url.lower().endswith(".pdf") or "/documents/" in url:
        corpo["parsers"] = [{"type": "pdf", **({"maxPages": paginas} if paginas else {})}]
    req = urllib.request.Request("https://api.firecrawl.dev/v2/scrape", data=json.dumps(corpo).encode(),
                                 headers={"Authorization": "Bearer " + os.environ["FIRECRAWL_API_KEY"],
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.load(r)
        return (d.get("data") or {}).get("markdown") or "", None if d.get("success", True) else str(d)[:300]
    except Exception as e:
        return "", f"{type(e).__name__}: {e}"[:300]


def anexar(destino, url, conteudo, erro=None):
    """Acrescenta uma leitura (NN.txt) ao índice de uma pasta já lida."""
    destino.mkdir(parents=True, exist_ok=True)
    try:
        ind = json.loads((destino / "indice.json").read_text(encoding="utf-8"))
    except Exception:
        ind = []
    arq = None
    if conteudo:
        arq = f"{len(ind) + 1:02d}.txt"
        (destino / arq).write_text(conteudo, encoding="utf-8")
    ind.append({"url": url, "arquivo": arq, "status": 200 if conteudo else None, "tipo": "firecrawl",
                "bytes": len(conteudo.encode()), "erro": erro})
    (destino / "indice.json").write_text(json.dumps(ind, ensure_ascii=False, indent=1), encoding="utf-8")


def tjrj(destino, lidas):
    """Lista de inconstitucionalidades do TJ-RJ: lê a 1ª página e só baixa o PDF inteiro se a data de atualização mudou."""
    marca = lidas / "tjrj-inconstitucionalidades-atualizacao.txt"
    anterior = marca.read_text().strip() if marca.exists() else ""
    capa, erro = firecrawl(TJRJ_LISTA, paginas=1)
    data = (re.search(r"atualiza\S*\s*:?\s*\**\s*(\d{2}[-/.]\d{2}[-/.]\d{4})", capa, re.I) or [None, ""])[1]
    if data and data == anterior:
        anexar(destino, TJRJ_LISTA, f"SEM ATUALIZAÇÃO: a lista do TJ-RJ continua com data de atualização {data}, "
                                    "já lida em semana anterior. Nada novo a coletar desta fonte.\n")
        return f"sem mudança ({data})"
    texto_ = capa
    if not erro:
        texto_, erro = firecrawl(TJRJ_LISTA)
    anexar(destino, TJRJ_LISTA, texto_, erro)
    if texto_ and data:
        marca.write_text(data + "\n")
    return f"atualizada em {data or '?'}" + (f" (erro: {erro})" if erro else "")


def achar(ind, trecho):
    return next((i for i in ind if trecho in (i.get("url") or "")), {})


def texto(destino, item):
    return (destino / item["arquivo"]).read_text(encoding="utf-8", errors="replace") if item.get("arquivo") else ""


def main():
    acervo, lidas, dia = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
    meta = dict(json.loads(acervo.read_text(encoding="utf-8")).get("meta") or [])
    tcm = meta.get("coleta_tcmrj") or {}
    ult_enunciado = int(tcm.get("ultimo_enunciado") or 552)
    obs = " ".join(str((meta.get("coleta") or {}).get(k) or "") for k in ("observacao", "ultimo_stf", "ultimo_stj"))
    nums = lambda pad, padrao: [int(x) for x in re.findall(padrao, obs)] or [pad]
    stf = max(nums(1236, r"STF[^\d]{0,20}(1\d{3})"))  # próximo a ler (a observação cita o pendente)
    stj = max(nums(909, r"STJ[^\d]{0,20}(9\d{2})"))
    lidas.mkdir(parents=True, exist_ok=True)

    # ---------- TCE-RJ e TCM-RJ
    fc = bool(os.environ.get("FIRECRAWL_API_KEY"))
    tcmjuris = "https://etcm.tcmrio.tc.br/tcmjuris"
    tcerj = [] if fc else [
        "POST https://www.tcerj.tc.br/liana-processo-webapi/consulta/pagina/1/tamanhoPagina/100 {}",
        "POST https://www.tcerj.tc.br/liana-processo-webapi/consulta/pagina/2/tamanhoPagina/100 {}",
    ]
    ind, dest = ler(f"rj-{dia}", [
        *tcerj,
        f"POST {tcmjuris}/Enunciados/EnunciadosPorClassificacao",
        f"{tcmjuris}/informativos/lista",
        f"{tcmjuris}/sumulas/lista",
    ], lidas)
    if fc:  # Jurisprudência Selecionada do TCE-RJ: os 10 registros mais recentes, com data, tipo e assunto
        anexar(dest, TCERJ_PAGINA, *firecrawl(TCERJ_PAGINA))
    ids = sorted({int(x) for x in re.findall(r"radio-(\d+)", texto(dest, achar(ind, "EnunciadosPorClassificacao")))})
    novos = [i for i in ids if i > ult_enunciado][:40]
    if novos:
        ler(f"rj-{dia}-2", [f"POST {tcmjuris}/Enunciados/AnalisesPorEnunciado enunciadoID={i}" for i in novos], lidas)
    print(f"TCM-RJ: {len(novos)} enunciado(s) novo(s) depois do {ult_enunciado}")

    # ---------- Nacional e RJ
    stf_pdf = "https://www.stf.jus.br/arquivo/cms/informativoSTF/anexo/Informativo_PDF/Informativo_stf_{}.pdf"
    stj_inf = "https://scon.stj.jus.br/jurisprudencia/externo/informativo/?acao=pesquisar&b=INFJ&pesquisaPorNumero=S&livre={}"
    ind, dest = ler(f"nacional-{dia}", [
        "https://portal.tcu.gov.br/jurisprudencia/boletins-e-informativos",
        *[stf_pdf.format(n) for n in range(stf, stf + 3)],
        *[stj_inf.format(n) for n in range(stj, stj + 2)],
        "https://pge.rj.gov.br/entendimento/enunciados",
        "https://pge.rj.gov.br/entendimento/pareceres-normativos",
        "https://pge.rj.gov.br/entendimento/pareceres-referenciais",
        "https://pge.rj.gov.br/entendimento/orientacoes-administrativas",
        *([] if fc else [TJRJ_LISTA]),
        "https://www.gov.br/compras/pt-br/acesso-a-informacao/legislacao/instrucoes-normativas",
        "https://redelog.rj.gov.br/redelog/legislacao-licitacoes/",
        # Jurisprudência Selecionada do TCU (JSON): os 100 enunciados mais recentes, com KEY, acórdão, área e tema
        "https://pesquisa.apps.tcu.gov.br/rest/publico/base/jurisprudencia-selecionada/documentosResumidos?termo=*&ordenacao=DTRELEVANCIA%20desc&quantidade=100&inicio=0",
    ], lidas)
    situacao_tj = tjrj(dest, lidas) if fc else "leitor comum"
    print(f"TJ-RJ (inconstitucionalidades): {situacao_tj}")
    links = re.findall(r"^https?://\S+$", texto(dest, achar(ind, "portal.tcu.gov.br")), re.M)
    tcu = [u for u in dict.fromkeys(links) if re.search(r"tcu\.gov\.br", u) and re.search(r"boletim|informativo", u, re.I)][:8]
    if tcu:
        ler(f"nacional-{dia}-2", tcu, lidas)
    print(f"Nacional: STF a partir do {stf}, STJ a partir do {stj}, {len(tcu)} boletim(ns)/informativo(s) do TCU")


if __name__ == "__main__":
    main()
