#!/usr/bin/env python3
"""Teste "como um estranho": tenta acessar o banco, os arquivos e as funções do Licitacon SEM login, só com a chave
pública que qualquer pessoa vê no site (config.js). Tudo deve ser negado ou vir vazio, exceto o que é público
(cursos ativos, oferta de lançamento). Não imprime dados: só códigos HTTP e quantidade de linhas.
Uso: python3 scripts/teste-estranho.py   (roda no GitHub Actions: workflow teste-seguranca.yml)"""
import json, re, sys, urllib.error, urllib.request, uuid, pathlib

cfg = pathlib.Path(__file__).resolve().parents[1].joinpath("config.js").read_text(encoding="utf-8")
URL = re.search(r'supabaseUrl:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'supabaseAnonKey:\s*"([^"]+)"', cfg).group(1)
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
falhas = []


def req(metodo, caminho, corpo=None, extra=None):
    r = urllib.request.Request(URL + caminho, data=None if corpo is None else json.dumps(corpo).encode(), method=metodo,
                               headers={**H, **(extra or {})})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            t = resp.read().decode("utf-8", "replace")
            return resp.status, t
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def checar(nome, ok, info):
    print(f"{'OK ' if ok else 'FALHA'}  {nome:58} {info}")
    if not ok:
        falhas.append(nome)


PUBLICAS = {"cursos"}
TABELAS = ["perfis", "assinaturas", "pagamentos", "analises", "contatos", "lista_espera", "chatbot_registros", "forum_topicos",
           "forum_perguntas", "forum_respostas", "forum_seguindo", "consultorias", "curso_acessos", "organizacoes",
           "organizacao_membros", "renovacoes", "normas_usuario", "elab_triagens", "registro_admin", "cupons_cursos",
           "biblioteca_pessoal", "solicitacoes_lgpd", "mo_preenchimentos", "mo_planilhas", "contratos", "contrato_eventos", "cursos"]
for t in TABELAS:
    st, txt = req("GET", f"/rest/v1/{t}?select=*&limit=5")
    try:
        n = len(json.loads(txt)) if st == 200 else 0
    except Exception:
        n = -1
    checar(f"ler {t}", t in PUBLICAS or n == 0, f"HTTP {st} · {n} linha(s)")

# escrever em tabelas protegidas
for t, corpo in [("perfis", {"id": str(uuid.uuid4()), "admin": True}), ("assinaturas", {"plano": "pro"}),
                 ("analises", {"documento": "edital"}), ("pagamentos", {"valor": 1}), ("forum_perguntas", {"titulo": "x"}),
                 ("registro_admin", {"acao": "x"}), ("mo_planilhas", {"modo": "planejamento", "nome": "x", "dados": {}}), ("contratos", {"numero": "x"}), ("contrato_eventos", {"contrato_id": "00000000-0000-0000-0000-000000000000", "tipo": "outro", "data": "2026-01-01"})]:
    st, _ = req("POST", f"/rest/v1/{t}", corpo, {"Prefer": "return=minimal"})
    checar(f"inserir em {t}", st >= 400, f"HTTP {st}")
st, _ = req("PATCH", "/rest/v1/perfis?id=not.is.null", {"admin": True}, {"Prefer": "return=minimal"})
checar("tornar-se administrador (perfis.admin)", st >= 400 or st == 204, f"HTTP {st}")
st, txt = req("PATCH", "/rest/v1/contrato_eventos?id=not.is.null", {"descricao": "x"}, {"Prefer": "return=representation"})
checar("alterar registros de contratos", st >= 400 or txt.strip() in ("[]", ""), f"HTTP {st}")
st, txt = req("GET", "/rest/v1/perfis?admin=eq.true&select=id")
checar("perfis continuam invisíveis após a tentativa", st != 200 or txt.strip() in ("[]", ""), f"HTTP {st}")

# funções do banco que não podem ser chamadas sem login
for fn, corpo in [("meu_email_conta", {"uid": str(uuid.uuid4())}), ("org_do_usuario", {"uid": str(uuid.uuid4())}),
                  ("definir_admin", {"p_usuario": str(uuid.uuid4()), "p_admin": True}),
                  ("registrar_pagamento_aprovado", {"p_referencia": "assinatura:" + str(uuid.uuid4()), "p_mp_pagamento": "1", "p_metodo": "x", "p_valor": 1, "p_parcelas": 1}),
                  ("analise_proxima", {}), ("geracao_proxima", {}), ("criar_cortesia", {}), ("forum_ranking", {}),
                  ("iniciar_teste", {}), ("meu_plano", {}), ("forum_resumo", {}), ("limitar_envios", {})]:
    st, txt = req("POST", f"/rest/v1/rpc/{fn}", corpo)
    vazio = txt.strip() in ("", "null", "[]", '""')
    checar(f"executar {fn}()", st >= 400 or (st == 200 and vazio), f"HTTP {st}")

# vitrine pública do fórum: responde sem login, mas só com títulos e contagens (nunca autores, contexto ou respostas)
st, txt = req("POST", "/rest/v1/rpc/forum_vitrine", {})
try:
    j = json.loads(txt) if st == 200 else {}
    chaves = set().union(*[set(q.keys()) for q in j.get("perguntas", [])]) if j.get("perguntas") else set()
    ok = st == 200 and chaves <= {"topico", "titulo", "criado_em", "respostas", "oficial"}
except Exception:
    ok = False
checar("vitrine do fórum sem dados pessoais", ok, f"HTTP {st}")

# arquivos privados
for b in ["analises", "consultorias"]:
    st, txt = req("POST", f"/storage/v1/object/list/{b}", {"prefix": "", "limit": 5})
    try:
        n = len(json.loads(txt)) if st == 200 else 0
    except Exception:
        n = -1
    checar(f"listar arquivos do bucket {b}", n == 0, f"HTTP {st} · {n} item(ns)")
    st, _ = req("GET", f"/storage/v1/object/public/{b}/teste.pdf")
    checar(f"link público do bucket {b}", st >= 400, f"HTTP {st}")
    st, _ = req("POST", f"/storage/v1/object/{b}/{uuid.uuid4()}/teste.txt", {"x": 1})
    checar(f"enviar arquivo ao bucket {b}", st >= 400, f"HTTP {st}")

# funções do servidor sem login / sem segredo
for fn in ["mp-checkout", "elab-triagem", "pesquisa-mercado", "boas-vindas", "forum-aviso", "consultoria-aviso", "mo-agente"]:
    st, _ = req("POST", f"/functions/v1/{fn}", {"acao": "teste"}, {"Authorization": f"Bearer {KEY}"})
    checar(f"função {fn} sem login", st in (401, 403), f"HTTP {st}")
for fn in ["avisos", "analise-aviso"]:
    st, _ = req("POST", f"/functions/v1/{fn}", {}, {"x-avisos": "segredo-errado-0123456789"})
    checar(f"função {fn} com segredo errado", st in (401, 403), f"HTTP {st}")

# CORS: outro site não pode chamar as funções pelo navegador
r = urllib.request.Request(URL + "/functions/v1/mp-checkout", method="OPTIONS", headers={"Origin": "https://site-estranho.example", "Access-Control-Request-Method": "POST"})
try:
    with urllib.request.urlopen(r, timeout=30) as resp:
        origem = resp.headers.get("Access-Control-Allow-Origin", "")
except urllib.error.HTTPError as e:
    origem = e.headers.get("Access-Control-Allow-Origin", "")
checar("CORS só para o endereço do site", origem not in ("*", "https://site-estranho.example"), f"Allow-Origin: {origem or '(nenhum)'}")

print(f"\n{len(falhas)} falha(s)")
sys.exit(1 if falhas else 0)
