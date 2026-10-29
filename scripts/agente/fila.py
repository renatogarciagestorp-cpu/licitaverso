#!/usr/bin/env python3
"""Fila de análises do site: pega as análises pagas ou incluídas no Pro, processa e devolve o parecer.

Roda no GitHub Actions (workflow "Agente — fila de análises"). Segredos usados (variáveis de ambiente):
SUPABASE_ACCESS_TOKEN (só para obter a chave de serviço), ANTHROPIC_API_KEY, AVISOS_SECRET.
O repositório é público: o log nunca mostra nome de arquivo, conteúdo ou dados do cliente — só o id da análise.

Uso: python3 scripts/agente/fila.py [--verificar]   (--verificar só informa se há análise na fila)
"""
import datetime, json, os, pathlib, re, shutil, subprocess, sys, tempfile, urllib.error, urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[2]
REF = os.environ.get("PROJECT_REF", "umnhhztdqersjfrzqcea")
SUPA = f"https://{REF}.supabase.co"
MAX_PAGINAS = 200
MAX_POR_EXECUCAO = 3
GRAV = {"alta", "media", "baixa"}


def http(metodo, url, dados=None, cab=None, binario=False, timeout=120):
    corpo = dados if isinstance(dados, (bytes, type(None))) else json.dumps(dados).encode()
    req = urllib.request.Request(url, data=corpo, method=metodo, headers=cab or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
        if binario:
            return b
        return json.loads(b) if b.strip() else None


_chave = None
def chave_servico():
    global _chave
    if _chave:
        return _chave
    lista = http("GET", f"https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true",
                 cab={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]})
    k = next((x["api_key"] for x in lista if x.get("name") == "service_role" and x.get("api_key")), None) \
        or next((x["api_key"] for x in lista if x.get("type") == "secret" and x.get("api_key")), None)
    if not k:
        sys.exit("chave de serviço não encontrada")
    print(f"::add-mask::{k}")
    _chave = k
    return k

def cab(extra=None):
    k = chave_servico()
    h = {"apikey": k, "Authorization": "Bearer " + k, "Content-Type": "application/json"}
    h.update(extra or {})
    return h

def rest(metodo, caminho, dados=None, extra=None):
    return http(metodo, f"{SUPA}/rest/v1/{caminho}", dados, cab(extra))

def atualizar(aid, campos):
    rest("PATCH", f"analises?id=eq.{aid}", campos, {"Prefer": "return=minimal"})

def avisar(aid):
    try:
        http("POST", f"{SUPA}/functions/v1/analise-aviso", {"id": aid},
             {"Content-Type": "application/json", "x-avisos": os.environ.get("AVISOS_SECRET", ""), "apikey": chave_servico()})
    except Exception as e:
        print(f"aviso por e-mail falhou ({aid}): {type(e).__name__}")


class ErroCliente(Exception):
    """Erro com mensagem que pode ser mostrada ao cliente."""


def rodar(args, **kw):
    r = subprocess.run(args, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout)[-800:])
    return r.stdout


def obter_documento(a, pasta):
    """Devolve (pdf, compra_json|None)."""
    if a["origem"] == "pdf":
        dados = http("GET", f"{SUPA}/storage/v1/object/analises/{a['arquivo']}", cab=cab(), binario=True, timeout=300)
        pdf = pasta / "documento.pdf"; pdf.write_bytes(dados)
        return pdf, None
    m = re.search(r"(\d{14})/(\d{4})/(\d+)", a.get("pncp_link") or "")
    if not m:
        raise ErroCliente("Link do PNCP inválido.")
    destino = pasta / "pncp"
    rodar([sys.executable, str(RAIZ / "scripts/agente/baixar-pncp.py"), *m.groups(), str(destino)], timeout=600)
    for z in destino.glob("*.zip"):
        subprocess.run(["unzip", "-qo", str(z), "-d", str(z.with_suffix(""))], capture_output=True)
    pdfs = list(destino.rglob("*.pdf"))
    if not pdfs:
        raise ErroCliente("Não há documento em PDF publicado nessa contratação do PNCP.")
    compra = destino / "compra.json"
    return max(pdfs, key=lambda p: p.stat().st_size), (compra if compra.exists() else None)


def resumo_de(analise):
    rot = json.loads((RAIZ / "agente/roteiros/lei-14133.json").read_text(encoding="utf-8"))
    itens = {i["id"]: i for i in rot["itens"]}
    cont = {"alta": 0, "media": 0, "baixa": 0}
    for r in analise["resultados"]:
        if r["resultado"] in ("parcial", "nao_conforme"):
            g = r.get("gravidade") if r.get("gravidade") in GRAV else itens.get(r["item"], {}).get("gravidade", "media")
            cont[g] += 1
    for o in analise.get("outros_apontamentos") or []:
        cont[o.get("gravidade") if o.get("gravidade") in GRAV else "baixa"] += 1
    if cont["alta"]:
        sit = "Há falhas graves que recomendam correção."
    elif cont["media"] or cont["baixa"]:
        sit = "Há ajustes recomendados, sem falha grave identificada."
    else:
        sit = "Nenhuma não conformidade identificada nos itens verificados."
    p = analise.get("processo", {})
    return {"situacao": sit, **cont, "objeto": p.get("objeto", "")[:400], "orgao": p.get("orgao", "")[:200], "numero": p.get("numero", "")[:200]}


def processar(a):
    aid = a["id"]
    print(f"análise {aid}: início (tentativa {a.get('tentativas')})")
    with tempfile.TemporaryDirectory() as tmp:
        pasta = pathlib.Path(tmp)
        try:
            pdf, compra = obter_documento(a, pasta)
            info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
            m = re.search(r"^Pages:\s+(\d+)", info, re.M)
            if not m:
                raise ErroCliente("O arquivo não é um PDF válido ou está protegido por senha.")
            paginas = int(m.group(1))
            if paginas > MAX_PAGINAS:
                raise ErroCliente(f"O documento tem {paginas} páginas; o limite por análise é {MAX_PAGINAS}. Envie só o documento a analisar.")
            txt = pasta / "documento.txt"
            rodar(["pdftotext", "-layout", str(pdf), str(txt)], timeout=300)
            if len(re.sub(r"\s+", "", txt.read_text(encoding="utf-8", errors="replace"))) < 1500:
                raise ErroCliente("O PDF parece ser digitalizado (imagem), sem texto pesquisável. Envie uma versão em PDF pesquisável.")
            saida = pasta / "analise.json"
            args = [sys.executable, str(RAIZ / "scripts/agente/analisar.py"), "--doc", a["documento"], "--texto", str(txt),
                    "--paginas", str(paginas), "--saida", str(saida),
                    "--fonte", a.get("pncp_link") or a.get("nome_arquivo") or "documento enviado"]
            if compra:
                args += ["--compra", str(compra)]
            try:
                rodar(args, timeout=1500)
            except RuntimeError as e:
                if "grande demais" in str(e):
                    raise ErroCliente("O documento é extenso demais para uma única análise. Envie só o documento a analisar.")
                raise
            analise = json.loads(saida.read_text(encoding="utf-8"))
            rodar([sys.executable, str(RAIZ / "scripts/agente/gerar-relatorio.py"), str(saida), str(pasta / "parecer.docx"), "--pdf"], timeout=600)
            base = f"{a['usuario_id']}/pareceres/{aid}"
            for ext, tipo in (("pdf", "application/pdf"), ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")):
                http("POST", f"{SUPA}/storage/v1/object/analises/{base}.{ext}", (pasta / f"parecer.{ext}").read_bytes(),
                     cab({"Content-Type": tipo, "x-upsert": "true"}), timeout=300)
            atualizar(aid, {"status": "concluida", "concluido_em": datetime.datetime.now(datetime.timezone.utc).isoformat(), "paginas": paginas,
                            "parecer_pdf": base + ".pdf", "parecer_docx": base + ".docx", "resumo": resumo_de(analise),
                            "custo_usd": analise.get("_execucao", {}).get("custo_usd"), "erro_msg": None})
            print(f"análise {aid}: concluída · US$ {analise.get('_execucao', {}).get('custo_usd')}")
        except ErroCliente as e:
            atualizar(aid, {"status": "erro", "erro_msg": str(e)})
            print(f"análise {aid}: recusada ({type(e).__name__})")
        except Exception as e:
            # tentativas 1 e 2: volta para a fila; na 3ª, erro definitivo
            if int(a.get("tentativas") or 1) < 3:
                atualizar(aid, {"status": "na_fila"})
                print(f"análise {aid}: falhou, volta à fila ({type(e).__name__})")
                return
            atualizar(aid, {"status": "erro", "erro_msg": "Falha técnica no processamento automático."})
            print(f"análise {aid}: erro definitivo ({type(e).__name__})")
    avisar(aid)


def main():
    if "--verificar" in sys.argv:
        r = urllib.request.urlopen(urllib.request.Request(f"{SUPA}/rest/v1/analises?status=eq.na_fila&select=id&limit=1", headers=cab()), timeout=60)
        tem = bool(json.loads(r.read()))
        stuck = json.loads(urllib.request.urlopen(urllib.request.Request(
            f"{SUPA}/rest/v1/analises?status=eq.processando&iniciado_em=lt."
            + (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=40)).strftime("%Y-%m-%dT%H:%M:%SZ") + "&select=id&limit=1", headers=cab()), timeout=60).read())
        print(f"tem={'true' if (tem or stuck) else 'false'}")
        if os.environ.get("GITHUB_OUTPUT"):
            open(os.environ["GITHUB_OUTPUT"], "a").write(f"tem={'true' if (tem or stuck) else 'false'}\n")
        return
    if "--teste" in sys.argv:  # teste interno: põe na fila uma análise do PNCP para o primeiro administrador
        link = sys.argv[sys.argv.index("--teste") + 1]
        adm = rest("GET", "perfis?admin=eq.true&select=id&limit=1")[0]["id"]
        rest("POST", "analises", {"usuario_id": adm, "documento": "edital", "origem": "pncp", "pncp_link": link, "nome_arquivo": "teste interno",
                                  "cobranca": "avulsa", "valor": 0, "status": "na_fila",
                                  "termo_aceito_em": datetime.datetime.now(datetime.timezone.utc).isoformat(), "termo_versao": "teste"},
             {"Prefer": "return=minimal"})
        print("análise de teste incluída na fila")
    for _ in range(MAX_POR_EXECUCAO):
        lista = rest("POST", "rpc/analise_proxima", {}) or []
        if not lista:
            break
        processar(lista[0])


if __name__ == "__main__":
    main()
