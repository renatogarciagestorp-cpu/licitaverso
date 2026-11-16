#!/usr/bin/env python3
"""Leitura antecipada das fontes das coletas do RJ (roda no GitHub Actions, toda segunda às 7h50 de Brasília).

As coletas "Nacional e RJ" (8h07) e "TCE-RJ e TCM-RJ" (8h37) rodam com a rede filtrada e, às vezes, sem permissão de
envio ao GitHub; sem envio, não conseguem pedir leituras ao leitor de fontes. Esta automação faz os pedidos por elas,
antes de começarem, e deixa as leituras no ramo coleta-fontes, que elas só precisam ler (clone sem envio):

  lidas/rj-<AAAAMMDD>/      TCE-RJ (Jurisprudência Selecionada, páginas 1 e 2), TCMJuris (enunciados, informativos, súmulas)
  lidas/rj-<AAAAMMDD>-2/    TCMJuris: análise de cada enunciado novo (id maior que o último gravado, até 40)
  lidas/nacional-<AAAAMMDD>/    TCU, STF, STJ, PGE-RJ, TJ-RJ e normas (páginas-índice e informativos seguintes)
  lidas/nacional-<AAAAMMDD>-2/  boletins e informativos do TCU achados nos links da 1ª leitura

Os marcadores (último enunciado, últimos informativos do STF e do STJ) vêm do acervo do site (acervo-completo.json,
campo meta). Uso: python3 pre-leitura.py <acervo-completo.json> <pasta lidas> <AAAAMMDD>
"""
import json, pathlib, re, subprocess, sys, tempfile

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
    tcmjuris = "https://etcm.tcmrio.tc.br/tcmjuris"
    ind, dest = ler(f"rj-{dia}", [
        "POST https://www.tcerj.tc.br/liana-processo-webapi/consulta/pagina/1/tamanhoPagina/100 {}",
        "POST https://www.tcerj.tc.br/liana-processo-webapi/consulta/pagina/2/tamanhoPagina/100 {}",
        f"POST {tcmjuris}/Enunciados/EnunciadosPorClassificacao",
        f"{tcmjuris}/informativos/lista",
        f"{tcmjuris}/sumulas/lista",
    ], lidas)
    ids = sorted({int(x) for x in re.findall(r"radio-(\d+)", texto(dest, ind[2]) if len(ind) > 2 else "")})
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
        "https://www.tjrj.jus.br/documents/d/portal-conhecimento/inconstitucionalidades-2026",
        "https://www.gov.br/compras/pt-br/acesso-a-informacao/legislacao/instrucoes-normativas",
        "https://redelog.rj.gov.br/redelog/legislacao-licitacoes/",
    ], lidas)
    links = re.findall(r"^https?://\S+$", texto(dest, ind[0]) if ind else "", re.M)
    tcu = [u for u in dict.fromkeys(links) if re.search(r"tcu\.gov\.br", u) and re.search(r"boletim|informativo", u, re.I)][:8]
    if tcu:
        ler(f"nacional-{dia}-2", tcu, lidas)
    print(f"Nacional: STF a partir do {stf}, STJ a partir do {stj}, {len(tcu)} boletim(ns)/informativo(s) do TCU")


if __name__ == "__main__":
    main()
