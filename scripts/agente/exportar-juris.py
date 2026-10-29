#!/usr/bin/env python3
"""Converte a jurisprudência achada fora do acervo (e usada num parecer) para o formato da coleção "decisoes" do acervo,
um arquivo <id>.json por documento, para a importação diária no acervo (tarefa "Atualizar site").
Uso: python3 scripts/agente/exportar-juris.py analise.json pasta-destino"""
import datetime, json, pathlib, sys

TEMAS = [("registro de pre", "Registro de preços"), ("habilita", "Habilitação e qualificação técnica"), ("qualifica", "Habilitação e qualificação técnica"),
         ("preço", "Pesquisa de preços e sobrepreço"), ("orçamento", "Pesquisa de preços e sobrepreço"), ("sobrepre", "Pesquisa de preços e sobrepreço"),
         ("contrata", "Execução e alteração contratual"), ("contrato", "Execução e alteração contratual"), ("dispensa", "Contratação direta"),
         ("inexigib", "Contratação direta"), ("obra", "Obras e engenharia"), ("julgamento", "Julgamento de propostas"), ("proposta", "Julgamento de propostas"),
         ("planejamento", "Planejamento e ETP"), ("sanç", "Sanções e responsabilização"), ("responsabil", "Sanções e responsabilização")]

def tema_acervo(t):
    t = (t or "").lower()
    return next((v for k, v in TEMAS if k in t), "Licitações (geral)")

a = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
dest = pathlib.Path(sys.argv[2]); dest.mkdir(parents=True, exist_ok=True)
n = 0
for j in a.get("jurisprudencia_externa") or []:
    doc = {"orgao": j["orgao"], "tipo": "Acórdão", "numero": j["numero"], "colegiado": j.get("colegiado", ""), "relator": j.get("relator", ""),
           "data": j.get("data", ""), "tema": tema_acervo(" ".join([j.get("tema", "")] + (j.get("tags") or []))), "entidade": "",
           "titulo": j["titulo"], "resumo": j["tese"], "tags": [t for t in (j.get("tags") or []) if t][:6], "leis": [],
           "fonte_nome": j.get("fonte_nome", ""), "fonte_url": j.get("fonte_url", ""),
           "capturado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(), "origem": "busca do agente de análise (fonte oficial)"}
    (dest / f"{j['id']}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    n += 1
print(f"jurisprudência nova exportada: {n}")
