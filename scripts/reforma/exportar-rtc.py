#!/usr/bin/env python3
"""Gera os dados da tela "Reforma tributária nas compras públicas" a partir da base oficial da
calculadora de tributos da Receita Federal (calculadora-rtc-regime-regular, banco SQLite calculadora-pro.db).

Uso:
    python3 scripts/reforma/exportar-rtc.py CAMINHO/calculadora-pro.db [--data AAAA-MM-DD]

Grava, sem tocar em banco nenhum do site (os arquivos são estáticos, publicados com o GitHub Pages):
    dados/reforma/rtc.json  classificações tributárias (cClassTrib), reduções, fundamentação legal, serviços
                            da LC 116 ligados à NBS, NBS, regras de compras governamentais e versão da base;
    dados/reforma/ncm.json  NCM com as classificações aplicáveis (carregado só quando a pessoa busca um produto).

Só entram registros vigentes na data informada (padrão: hoje). Nada é calculado aqui: os números são os da
tabela oficial, e a tela mostra a versão da base usada.
"""
import argparse
import datetime
import json
import pathlib
import sqlite3
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "dados" / "reforma"
SIGLA = {2: "cbs", 3: "ibsuf", 4: "ibsmun"}


def limpa(t):
    return " ".join(str(t or "").replace("\\n", "\n").split()) if t is not None else ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("banco")
    ap.add_argument("--data", default=datetime.date.today().isoformat())
    ap.add_argument("--commit", default="", help="commit do repositório da Receita usado (só para registro)")
    a = ap.parse_args()
    if not pathlib.Path(a.banco).is_file():
        sys.exit("Banco não encontrado: " + a.banco)
    c = sqlite3.connect(f"file:{a.banco}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    hoje = a.data

    def vig(p):  # cláusula de vigência para o prefixo de coluna p
        return f"({p}_INICIO_VIGENCIA <= '{hoje}' AND ({p}_FIM_VIGENCIA IS NULL OR {p}_FIM_VIGENCIA >= '{hoje}'))"

    q = lambda s: c.execute(s).fetchall()

    # ---------------------------------------------------------------- classificações tributárias
    cst = {r["SITR_ID"]: (r["SITR_CD"], r["SITR_DESCRICAO"]) for r in q("SELECT * FROM SITUACAO_TRIBUTARIA")}
    red = {}
    for r in q(f"SELECT * FROM PERCENTUAL_REDUCAO WHERE {vig('PERE')}"):
        if r["PERE_TBTO_ID"] in SIGLA:
            red.setdefault(r["PERE_CLTR_ID"], {})[SIGLA[r["PERE_TBTO_ID"]]] = r["PERE_VALOR"]
    fund = {}
    for r in q(f"""SELECT FC.FDCL_CLTR_ID id, F.FDLG_TEXTO_CURTO curto, F.FDLG_TEXTO texto FROM FUNDAMENTACAO_CLASSIFICACAO FC
                   JOIN FUNDAMENTACAO_LEGAL F ON F.FDLG_ID = FC.FDCL_FDLG_ID WHERE {vig('FC.FDCL')}"""):
        fund.setdefault(r["id"], []).append({"curto": limpa(r["curto"]), "texto": limpa(r["texto"])[:1500]})
    trat = {}
    for r in q(f"""SELECT TC.TRCL_CLTR_ID id, T.TRTR_DESCRICAO d FROM TRATAMENTO_CLASSIFICACAO TC
                   JOIN TRATAMENTO_TRIBUTARIO T ON T.TRTR_ID = TC.TRCL_TRTR_ID WHERE {vig('TC.TRCL')}"""):
        trat.setdefault(r["id"], []).append(limpa(r["d"]))
    tomador = {r["TMES_ID"]: r["TMES_NOME"] for r in q("SELECT * FROM TOMADOR_ESPECIFICO")}
    classes, por_id = [], {}
    for r in q(f"SELECT * FROM CLASSIFICACAO_TRIBUTARIA WHERE {vig('CLTR')} ORDER BY CLTR_CD"):
        cs = cst.get(r["CLTR_SITR_ID"], ("", ""))
        item = {"c": r["CLTR_CD"], "cst": cs[0], "cstD": cs[1], "d": limpa(r["CLTR_DESCRICAO"]),
                "tipo": r["CLTR_TIPO_ALIQUOTA"] or "", "nom": r["CLTR_NOMENCLATURA"] or "",
                "red": red.get(r["CLTR_ID"], {}), "fund": fund.get(r["CLTR_ID"], []), "trat": trat.get(r["CLTR_ID"], []),
                "credCbs": r["CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_CBS"] == 1,
                "credIbs": r["CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_IBS"] == 1}
        if r["CLTR_TMES_ID"] in tomador:
            item["tomador"] = tomador[r["CLTR_TMES_ID"]]
        classes.append(item)
        por_id[r["CLTR_ID"]] = r["CLTR_CD"]

    anexo = {r["ANXO_ID"]: f"Anexo {r['ANXO_NUMERO']}, item {r['ANXO_NUMERO_ITEM']}: {limpa(r['ANXO_TEXTO_ITEM'])[:300]}"
             for r in q(f"SELECT * FROM ANEXO WHERE {vig('ANXO')}")}

    # ---------------------------------------------------------------- serviços: LC 116 ↔ NBS ↔ classificação
    indop = {r["IOIC_ID"]: {"cod": r["IOIC_CD"], "local": limpa(r["IOIC_LOCAL_INCIDENCIA"]), "op": limpa(r["IOIC_TIPO_OPERACAO"])}
             for r in q("SELECT * FROM INDICADOR_OPERACAO_IBS_CBS")}
    nbs = {r["NBS_CD"]: limpa(r["NBS_DESCRICAO"]) for r in q(f"SELECT * FROM NBS WHERE {vig('NBS')}")}
    lc116 = [{"c": r["LSLC_CD"], "d": limpa(r["LSLC_DESCRICAO"])} for r in q(f"SELECT * FROM LISTA_SERVICOS_LC_116 WHERE {vig('LSLC')}")]
    lc116 = [x for x in lc116 if x["c"]]
    lc116.sort(key=lambda x: [int(p) if p.isdigit() else 0 for p in x["c"].split(".")])
    mapa = {}
    for r in q(f"SELECT * FROM CLASSIF_NBS_INDOP_LC WHERE {vig('CNIL')} AND CNIL_IN_ADQ_EXTERIOR = 0"):
        cl = por_id.get(r["CNIL_CLTR_ID"])
        if not cl:
            continue
        lst = mapa.setdefault(r["CNIL_LSLC_CD"], [])
        io = indop.get(r["CNIL_IOIC_ID"], {})
        reg = {"nbs": r["CNIL_NBS_CD"], "cl": cl, "local": io.get("local", ""), "op": io.get("op", "")}
        if reg not in lst:
            lst.append(reg)
    nbs_apl = []
    for r in q(f"SELECT * FROM NBS_APLICAVEL WHERE {vig('NBSA')}"):
        if r["NBSA_CLTR_ID"] in por_id:
            nbs_apl.append({"p": r["NBSA_NBS_CD"], "cl": por_id[r["NBSA_CLTR_ID"]], "anexo": anexo.get(r["NBSA_ANXO_ID"], "")})

    # ---------------------------------------------------------------- compras governamentais e alíquotas
    def por_ano(tab, p, col):
        out = {}
        for r in q(f"SELECT * FROM {tab}"):
            ini = int(r[f"{p}_INICIO_VIGENCIA"][:4]); fim = int((r[f"{p}_FIM_VIGENCIA"] or "2033")[:4])
            for ano in range(ini, max(fim, ini) + 1):
                if 2026 <= ano <= 2033:
                    out[str(ano)] = r[col]
        return out

    ref = {}
    for r in q("SELECT * FROM ALIQUOTA_REFERENCIA"):
        ref.setdefault(r["ALRE_INICIO_VIGENCIA"][:4], {})[SIGLA.get(r["ALRE_TBTO_ID"], "?")] = r["ALRE_VALOR"]
    redutor = q(f"SELECT RCGO_VALOR v FROM REDUTOR_COMPRA_GOVERNAMENTAL WHERE {vig('RCGO')}")
    versao = q("SELECT * FROM VERSAO_BASE_DADO ORDER BY VRBD_ID DESC LIMIT 1")[0]
    simples = [{"c": r["ATSN_CATIVSN"], "d": limpa(r["ATSN_DESCRICAO"]), "anexo": r["ATSN_ROTULO"]}
               for r in q("SELECT * FROM ATIVIDADE_SIMPLES_NACIONAL ORDER BY ATSN_ORDEM")]

    base = {
        "fonte": "Receita Federal do Brasil — base da calculadora de tributos da reforma (calculadora-rtc)",
        "versao": versao["VRBD_VERSAO_BASE_DADO"], "versaoData": versao["VRBD_DATA"][:10], "versaoNota": limpa(versao["VRBD_DESCRICAO"]),
        "vigenteEm": hoje, "gerado": datetime.date.today().isoformat(), "commitFonte": a.commit[:12],
        "classificacoes": classes, "lc116": lc116, "lc116Nbs": mapa, "nbs": nbs, "nbsAplicavel": nbs_apl,
        "aliquotaReferencia": ref,
        "compraGov": {"redutor": redutor[0]["v"] if redutor else None,
                      "transferenciaCbs": por_ano("TRANSFERENCIA_CBS_ENTE_GOV", "TCEG", "TCEG_VALOR"),
                      "fatorSimples": por_ano("TRANSICAO_ALIQUOTA_COMPRA_GOV_SIMPLES_NACIONAL", "TACG", "TACG_FATOR")},
        "simplesAtividades": simples,
    }

    # ---------------------------------------------------------------- NCM (arquivo separado, carregado sob demanda)
    ncm = {r["NCM_CD"]: limpa(r["NCM_DESCRICAO"]) for r in q(f"SELECT * FROM NCM WHERE {vig('NCM')}")}
    exc = {}
    for r in q(f"SELECT * FROM EXCECAO_NCM_APLICAVEL WHERE {vig('ENCM')}"):
        exc.setdefault(r["ENCM_NCMA_ID"], []).append(r["ENCM_NCM_CD"])
    regras = []
    for r in q(f"SELECT * FROM NCM_APLICAVEL WHERE {vig('NCMA')}"):
        if r["NCMA_CLTR_ID"] in por_id:
            reg = {"p": r["NCMA_NCM_CD"], "cl": por_id[r["NCMA_CLTR_ID"]], "anexo": anexo.get(r["NCMA_ANXO_ID"], "")}
            if r["NCMA_ID"] in exc:
                reg["exceto"] = exc[r["NCMA_ID"]]
            regras.append(reg)
    seletivo = sorted({r[0] for r in q(f"SELECT AAVP_NCM_CD FROM ALIQUOTA_AD_VALOREM_PRODUTO WHERE {vig('AAVP')}")})

    SAIDA.mkdir(parents=True, exist_ok=True)
    opts = dict(ensure_ascii=False, separators=(",", ":"))
    ncm_dados = {"versao": base["versao"], "ncm": ncm, "regras": regras, "seletivo": seletivo}
    meta = ("vigenteEm", "gerado", "commitFonte")
    try:
        antigo = json.loads((SAIDA / "rtc.json").read_text(encoding="utf-8"))
        antigo_ncm = json.loads((SAIDA / "ncm.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        antigo, antigo_ncm = None, None
    igual = (antigo is not None and {k: v for k, v in antigo.items() if k not in meta} == {k: v for k, v in base.items() if k not in meta}
             and antigo_ncm == ncm_dados)
    if igual:
        print(f"Base {base['versao']}: nada mudou desde a última exportação; arquivos mantidos.")
        return
    (SAIDA / "rtc.json").write_text(json.dumps(base, **opts), encoding="utf-8")
    (SAIDA / "ncm.json").write_text(json.dumps(ncm_dados, **opts), encoding="utf-8")
    print(f"Base {base['versao']} ({base['versaoData']}), vigente em {hoje}: {len(classes)} classificações, "
          f"{len(lc116)} itens da LC 116 ({len(mapa)} com NBS), {len(nbs)} NBS, {len(ncm)} NCM, {len(regras)} regras de NCM.")
    for f in ("rtc.json", "ncm.json"):
        print(f, round((SAIDA / f).stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
