#!/usr/bin/env python3
"""LGPD — retenção mínima: apaga os documentos enviados ao Agente IA 30 dias depois que a análise termina
(concluída, com erro ou cancelada). O parecer gerado continua na conta do assinante. Não imprime dados pessoais."""
import datetime, json, os, sys, urllib.parse, urllib.request

REF = os.environ.get("PROJECT_REF", "umnhhztdqersjfrzqcea")
SUPA = f"https://{REF}.supabase.co"
DIAS = int(os.environ.get("RETENCAO_DIAS", "30"))


def http(metodo, url, dados=None, cab=None):
    req = urllib.request.Request(url, method=metodo, data=json.dumps(dados).encode() if dados is not None else None, headers=cab or {})
    with urllib.request.urlopen(req, timeout=120) as r:
        corpo = r.read()
        return json.loads(corpo) if corpo else None


def chave():
    lista = http("GET", f"https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true",
                 cab={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]})
    for k in lista:
        if k.get("name") in ("service_role",) or k.get("type") == "secret":
            v = k.get("api_key") or ""
            if v:
                print(f"::add-mask::{v}")
                return v
    sys.exit("chave de serviço não encontrada")


def main():
    k = chave()
    cab = {"apikey": k, "Authorization": "Bearer " + k, "Content-Type": "application/json"}
    limite = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DIAS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    filtro = ("analises?select=id,arquivo,documentos,anexos,concluido_em,criado_em&documentos_excluidos_em=is.null"
              "&status=in.(concluida,erro,cancelada)&or=(concluido_em.lt." + limite + ",and(concluido_em.is.null,criado_em.lt." + limite + "))&limit=500")
    lista = http("GET", f"{SUPA}/rest/v1/{filtro}", cab=cab) or []
    apagadas = 0
    for a in lista:
        caminhos = [a["arquivo"]] if a.get("arquivo") else []
        for campo in ("documentos", "anexos"):
            caminhos += [d["arquivo"] for d in (a.get(campo) or []) if isinstance(d, dict) and d.get("arquivo")]
        caminhos = [c for c in caminhos if "/pareceres/" not in c]
        if caminhos:
            http("DELETE", f"{SUPA}/storage/v1/object/analises", {"prefixes": caminhos}, cab)
        http("PATCH", f"{SUPA}/rest/v1/analises?id=eq.{a['id']}",
             {"documentos_excluidos_em": datetime.datetime.now(datetime.timezone.utc).isoformat()}, {**cab, "Prefer": "return=minimal"})
        apagadas += 1
    print(f"::notice::LGPD: documentos apagados de {apagadas} análise(s) encerrada(s) há mais de {DIAS} dias")
    avisar_pedidos(cab)


def avisar_pedidos(cab):
    """Pedidos de titulares em aberto (exclusão, acesso, portabilidade): avisa o administrador por e-mail, para cumprir o prazo de 15 dias."""
    abertos = http("GET", f"{SUPA}/rest/v1/solicitacoes_lgpd?select=tipo,criado_em&status=eq.aberta&tipo=eq.exclusao&order=criado_em", cab=cab) or []
    print(f"::notice::LGPD: {len(abertos)} pedido(s) de exclusão em aberto")
    chave_brevo, remetente = os.environ.get("BREVO_API_KEY", ""), os.environ.get("EMAIL_REMETENTE", "")
    if not abertos or not chave_brevo or not remetente:
        return
    admins = http("GET", f"{SUPA}/rest/v1/perfis?select=email&admin=eq.true", cab=cab) or []
    destinos = [{"email": a["email"]} for a in admins if a.get("email")]
    if not destinos:
        return
    hoje = datetime.datetime.now(datetime.timezone.utc)
    linhas = []
    for p in abertos:
        d = datetime.datetime.fromisoformat(p["criado_em"].replace("Z", "+00:00"))
        prazo = d + datetime.timedelta(days=15)
        linhas.append(f"<li>Pedido de exclusão de {d:%d/%m/%Y} — prazo até {prazo:%d/%m/%Y} ({max(0, (prazo - hoje).days)} dia(s))</li>")
    corpo = {"sender": {"email": remetente, "name": "Licitacon"}, "to": destinos,
             "subject": f"LGPD: {len(abertos)} pedido(s) de exclusão de conta em aberto",
             "htmlContent": "<p>Há pedidos de exclusão de conta aguardando atendimento (prazo de 15 dias da LGPD):</p><ul>" + "".join(linhas)
                            + "</ul><p>Atenda pelo painel administrativo do Licitacon e marque o pedido como concluído.</p>"}
    try:
        http("POST", "https://api.brevo.com/v3/smtp/email", corpo, {"api-key": chave_brevo, "Content-Type": "application/json", "accept": "application/json"})
        print("::notice::LGPD: aviso enviado ao administrador")
    except Exception as e:
        print(f"::warning::LGPD: aviso por e-mail não enviado ({type(e).__name__})")


if __name__ == "__main__":
    main()
