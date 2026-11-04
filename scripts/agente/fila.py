#!/usr/bin/env python3
"""Fila de análises do site: pega as análises pagas ou incluídas no Pro, processa e devolve o parecer.

Roda no GitHub Actions (workflow "Agente — fila de análises"). Segredos usados (variáveis de ambiente):
SUPABASE_SERVICE_ROLE_KEY (chave de serviço do projeto; SUPABASE_ACCESS_TOKEN só como reserva), ANTHROPIC_API_KEY, AVISOS_SECRET.
O repositório é público: o log nunca mostra nome de arquivo, conteúdo ou dados do cliente — só o id da análise.

Uso: python3 scripts/agente/fila.py [--verificar]   (--verificar só informa se há análise na fila)
"""
import datetime, json, os, pathlib, re, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request

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
    # preferido: só a chave de serviço do projeto (segredo SUPABASE_SERVICE_ROLE_KEY). O token de gerenciamento
    # da conta inteira fica apenas como reserva, até o segredo novo ser cadastrado.
    direta = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if direta:
        print(f"::add-mask::{direta}")
        _chave = direta
        return direta
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
        print(f"::warning title=Fila::aviso por e-mail falhou ({aid}): {type(e).__name__}")
        return
    print(f"::notice title=Fila::análise {aid}: e-mail de aviso enviado")


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


def a_lista(a, campo):
    v = a.get(campo) or []
    if isinstance(v, str):
        try: v = json.loads(v)
        except Exception: v = []
    return [n for n in v if isinstance(n, dict) and n.get("arquivo")][:5]


def a_normas(a):
    v = a.get("normas") or []
    if isinstance(v, str):
        try: v = json.loads(v)
        except Exception: v = []
    return [n for n in v if isinstance(n, dict) and n.get("arquivo")][:3]


DOC_ANALISAR = {"edital": "edital", "tr": "tr", "etp": "etp", "riscos": "riscos", "plano_trabalho": "plano_trabalho"}
PRIORIDADE = ["edital", "tr", "plano_trabalho", "etp", "riscos", "memoria_calculo", "planilha_mo", "planilha_obras", "planilha_parceria"]
PLANILHA_ANEXO = {"planilha_mo": "planilha", "planilha_obras": "orcamento", "planilha_parceria": "plano-custos", "memoria_calculo": "outro"}
NOME_DOC = {"edital": "Edital", "tr": "Termo de Referência", "etp": "Estudo Técnico Preliminar", "riscos": "Matriz de Riscos",
            "plano_trabalho": "Plano de trabalho", "memoria_calculo": "Memória de cálculo", "planilha_mo": "Planilha de custos de mão de obra (IN 05/2017)",
            "planilha_obras": "Planilha orçamentária", "planilha_parceria": "Planilha de custos da parceria"}


def preparar_documentos(a, pasta):
    """Até 3 documentos: baixa, extrai o texto (PDF com OCR; Excel célula a célula) e monta os argumentos do analisar.py.
    Devolve (texto_principal, tipo_principal, paginas_total, args_extra, salarios_json|None)."""
    docs = sorted(a_lista(a, "documentos"), key=lambda d: PRIORIDADE.index(d["tipo"]) if d["tipo"] in PRIORIDADE else 99)
    textos, total = [], 0
    for k, d in enumerate(docs, 1):
        orig = pasta / f"doc{k}{pathlib.Path(d['arquivo']).suffix.lower()}"
        orig.write_bytes(http("GET", f"{SUPA}/storage/v1/object/analises/{d['arquivo']}", cab=cab(), binario=True, timeout=300))
        txt = pasta / f"doc{k}.txt"
        nome = d.get("nome_arquivo") or orig.name
        if orig.suffix == ".pdf":
            m = re.search(r"^Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(orig)], capture_output=True, text=True).stdout, re.M)
            if not m:
                raise ErroCliente(f"\"{nome}\" não é um PDF válido ou está protegido por senha.")
            pg = int(m.group(1))
            if pg > MAX_PAGINAS:
                raise ErroCliente(f"\"{nome}\" tem {pg} páginas; o limite é de {MAX_PAGINAS} páginas por documento.")
            total += pg
            r = subprocess.run([sys.executable, str(RAIZ / "scripts/agente/extrair-texto.py"), str(orig), str(txt)], capture_output=True, text=True, timeout=3600)
            if r.returncode == 3 or not txt.exists():
                raise ErroCliente(f"Não foi possível ler o texto de \"{nome}\", nem por reconhecimento óptico (OCR). A análise não foi feita para não "
                                  "presumir conteúdo; envie uma versão legível ou em PDF pesquisável.")
        else:
            r = subprocess.run([sys.executable, str(RAIZ / "scripts/agente/extrair-planilha.py"), str(orig), str(txt)], capture_output=True, text=True, timeout=600)
            if r.returncode != 0 or not txt.exists():
                raise ErroCliente(f"Não foi possível ler a planilha \"{nome}\". Envie o arquivo em Excel (.xlsx) sem senha, ou em PDF legível.")
        textos.append((d["tipo"], nome, txt))
    if not textos:
        raise ErroCliente("Nenhum documento enviado.")
    # documento principal: o primeiro que tem roteiro próprio; se só houver planilhas, a primeira planilha
    principal = next((t for t in textos if t[0] in DOC_ANALISAR), textos[0])
    tipo_p = DOC_ANALISAR.get(principal[0]) or {"planilha_mo": "planilha", "planilha_obras": "orcamento",
                                                 "planilha_parceria": "plano_trabalho", "memoria_calculo": "edital"}[principal[0]]
    extra, salarios = [], None
    for tipo, nome, txt in textos:
        if (tipo, nome, txt) == principal:
            continue
        if tipo in DOC_ANALISAR:
            extra += ["--doc-adicional", f"{tipo}::{NOME_DOC[tipo]} ({nome})::{txt}"]
        else:
            extra += ["--anexo", f"{PLANILHA_ANEXO[tipo]}::{NOME_DOC[tipo]} ({nome})::{txt}"]
    mo = next((t for t in textos if t[0] == "planilha_mo"), None)
    if mo:  # custo total do profissional × referência do estado (salario.com.br); leitura sem IA quando for o modelo IN 5/2017
        postos, sal = pasta / "postos.json", pasta / "salarios.json"
        try:
            conteudo = mo[2].read_text(encoding="utf-8", errors="replace")
            uf = (re.search(r"\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b", conteudo) or [None, ""])[1]
            if "QUADRO RESUMO" in conteudo.upper() and re.search(r"M[ÓO]DULO 1", conteudo, re.I):
                rodar([sys.executable, str(RAIZ / "scripts/agente/postos-in05.py"), str(mo[2]), str(postos), "--uf", uf], timeout=300)
            else:
                rodar([sys.executable, str(RAIZ / "scripts/agente/extrair-postos.py"), str(mo[2]), str(postos)], timeout=900)
            rodar([sys.executable, str(RAIZ / "scripts/agente/salarios.py"), str(postos), str(sal)], timeout=900)
            salarios = sal if sal.exists() else None
        except Exception as e:
            print(f"análise {a['id']}: referência salarial não obtida ({type(e).__name__})")
    return principal[2], tipo_p, total, extra, salarios


def processar(a):
    aid = a["id"]
    print(f"análise {aid}: início (tentativa {a.get('tentativas')})")
    with tempfile.TemporaryDirectory() as tmp:
        pasta = pathlib.Path(tmp)
        try:
            extra, salarios, compra = [], None, None
            if a_lista(a, "documentos"):  # fluxo atual: até 3 documentos enviados pelo assinante
                txt, doc_p, paginas, extra, salarios = preparar_documentos(a, pasta)
                m3 = re.search(r"(\d{14})/(\d{4})/(\d+)", a.get("pncp_link") or "")
                if m3:  # link do PNCP opcional: só os dados da contratação (prazos e itens), sem baixar documento
                    try:
                        destino = pasta / "pncp"
                        rodar([sys.executable, str(RAIZ / "scripts/agente/baixar-pncp.py"), *m3.groups(), str(destino), "--so-dados"], timeout=600)
                        compra = destino / "compra.json" if (destino / "compra.json").exists() else None
                    except Exception:
                        compra = None
            else:  # pedidos antigos: um documento (PDF ou PNCP)
                pdf, compra = obter_documento(a, pasta)
                info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
                m = re.search(r"^Pages:\s+(\d+)", info, re.M)
                if not m:
                    raise ErroCliente("O arquivo não é um PDF válido ou está protegido por senha.")
                paginas = int(m.group(1))
                if paginas > MAX_PAGINAS:
                    raise ErroCliente(f"O documento tem {paginas} páginas; o limite por análise é {MAX_PAGINAS}. Envie só o documento a analisar.")
                txt = pasta / "documento.txt"
                r = subprocess.run([sys.executable, str(RAIZ / "scripts/agente/extrair-texto.py"), str(pdf), str(txt)], capture_output=True, text=True, timeout=1800)
                if r.returncode == 3 or not txt.exists():
                    raise ErroCliente("Não foi possível ler o texto do PDF, nem por reconhecimento óptico (OCR). Envie uma versão com melhor qualidade ou em PDF pesquisável.")
                if r.returncode != 0:
                    raise RuntimeError(r.stderr[-500:])
                doc_p = a["documento"]
            saida = pasta / "analise.json"
            args = [sys.executable, str(RAIZ / "scripts/agente/analisar.py"), "--doc", doc_p, "--texto", str(txt),
                    "--paginas", str(paginas), "--saida", str(saida),
                    "--fonte", a.get("pncp_link") or a.get("nome_arquivo") or "documento enviado"] + extra
            if salarios:
                args += ["--salarios", str(salarios)]
            if compra:
                args += ["--compra", str(compra)]
            # regulamentação específica enviada pelo assinante (decreto, RILC etc.)
            for k, n in enumerate(a_normas(a), 1):
                try:
                    bruto = http("GET", f"{SUPA}/storage/v1/object/analises/{n['arquivo']}", cab=cab(), binario=True, timeout=300)
                    orig = pasta / f"norma{k}{pathlib.Path(n['arquivo']).suffix.lower() or '.pdf'}"
                    orig.write_bytes(bruto)
                    txt_n = pasta / f"norma{k}.txt"
                    if orig.suffix == ".docx":
                        import docx  # python-docx
                        txt_n.write_text("\n".join(p.text for p in docx.Document(str(orig)).paragraphs), encoding="utf-8")
                    else:
                        subprocess.run([sys.executable, str(RAIZ / "scripts/agente/extrair-texto.py"), str(orig), str(txt_n)], capture_output=True, timeout=1800)
                    if txt_n.exists() and len(txt_n.read_text(encoding="utf-8", errors="replace").strip()) > 200:
                        args += ["--norma-local", f"{n['nome']}::{txt_n}"]
                except Exception as e:
                    print(f"análise {aid}: norma local {k} não lida ({type(e).__name__})")
            # regime jurídico, objeto especial e planilhas em Excel
            if a.get("regime") in ("lei-14133", "lei-13303", "lei-13019"):
                args += ["--regime", a["regime"]]
            for o in (a.get("objeto") or []):
                if o in ("obras", "mao-de-obra"):
                    args += ["--objeto", o]
            for k, x in enumerate(a_lista(a, "anexos"), 1):
                orig = pasta / f"anexo{k}{pathlib.Path(x['arquivo']).suffix.lower() or '.xlsx'}"
                try:
                    orig.write_bytes(http("GET", f"{SUPA}/storage/v1/object/analises/{x['arquivo']}", cab=cab(), binario=True, timeout=300))
                except Exception as e:
                    print(f"análise {aid}: planilha {k} não baixada ({type(e).__name__})"); continue
                txt_x = pasta / f"anexo{k}.txt"
                if x.get("tipo") == "cct":  # convenção coletiva em PDF ou Word
                    if orig.suffix == ".docx":
                        import docx  # python-docx
                        txt_x.write_text("\n".join(p.text for p in docx.Document(str(orig)).paragraphs), encoding="utf-8")
                    else:
                        subprocess.run([sys.executable, str(RAIZ / "scripts/agente/extrair-texto.py"), str(orig), str(txt_x)], capture_output=True, timeout=1800)
                    if not txt_x.exists() or len(txt_x.read_text(encoding="utf-8", errors="replace").strip()) < 200:
                        raise ErroCliente(f"Não foi possível ler a convenção coletiva \"{x.get('nome_arquivo') or k}\". Envie em PDF pesquisável ou Word (.docx).")
                else:
                    rx = subprocess.run([sys.executable, str(RAIZ / "scripts/agente/extrair-planilha.py"), str(orig), str(txt_x)], capture_output=True, text=True, timeout=600)
                    if rx.returncode != 0 or not txt_x.exists():
                        raise ErroCliente(f"Não foi possível ler a planilha \"{x.get('nome_arquivo') or k}\". Envie o arquivo em Excel (.xlsx) sem senha.")
                args += ["--anexo", f"{x.get('tipo', 'outro')}::{x.get('nome_arquivo') or orig.name}::{txt_x}"]
                # mão de obra: postos da planilha × média salarial do estado (salario.com.br)
                if x.get("tipo") == "planilha" or (x.get("tipo") == "plano-custos" and "mao-de-obra" in (a.get("objeto") or [])):
                    postos, sal = pasta / f"postos{k}.json", pasta / f"salarios{k}.json"
                    try:
                        if "QUADRO RESUMO" in txt_x.read_text(encoding="utf-8", errors="replace").upper():
                            rodar([sys.executable, str(RAIZ / "scripts/agente/postos-in05.py"), str(txt_x), str(postos)], timeout=300)
                        else:
                            rodar([sys.executable, str(RAIZ / "scripts/agente/extrair-postos.py"), str(txt_x), str(postos)], timeout=900)
                        rodar([sys.executable, str(RAIZ / "scripts/agente/salarios.py"), str(postos), str(sal)], timeout=900)
                        if sal.exists() and "--salarios" not in args:
                            args += ["--salarios", str(sal)]
                    except Exception as e:
                        print(f"análise {aid}: referência salarial não obtida ({type(e).__name__})")
            # análise de preços (sobrepreço): itens do PNCP no edital; nos demais casos, extraídos do documento
            precos = pasta / "precos.json"
            cmd = [sys.executable, str(RAIZ / "scripts/agente/precos-do-processo.py"), "--texto", str(txt), "--saida", str(precos)]
            if compra and doc_p == "edital":
                cmd += ["--pasta-pncp", str(compra.parent)]
            m2 = re.search(r"(\d{14})/(\d{4})/(\d+)", a.get("pncp_link") or "")
            if m2:
                cmd += ["--excluir", "-".join(m2.groups())]
            subprocess.run(cmd, capture_output=True, text=True, timeout=2700)
            if precos.exists():
                args += ["--precos", str(precos)]
            etapa_paga = True  # daqui em diante há custo de API: falha não volta para a fila automaticamente
            try:
                rodar(args, timeout=2700)
            except RuntimeError as e:
                if "grande demais" in str(e):
                    raise ErroCliente("O documento é extenso demais para uma única análise. Envie só o documento a analisar.")
                raise
            analise = json.loads(saida.read_text(encoding="utf-8"))
            subprocess.run([sys.executable, str(RAIZ / "scripts/agente/exportar-juris.py"), str(saida), "/tmp/jurisprudencia-nova"], capture_output=True)
            rodar([sys.executable, str(RAIZ / "scripts/agente/gerar-relatorio.py"), str(saida), str(pasta / "parecer.docx"), "--pdf"], timeout=600)
            base = f"{a['usuario_id']}/pareceres/{aid}"
            for ext, tipo in (("pdf", "application/pdf"), ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")):
                http("POST", f"{SUPA}/storage/v1/object/analises/{base}.{ext}", (pasta / f"parecer.{ext}").read_bytes(),
                     cab({"Content-Type": tipo, "x-upsert": "true"}), timeout=300)
            atualizar(aid, {"status": "concluida", "concluido_em": datetime.datetime.now(datetime.timezone.utc).isoformat(), "paginas": paginas,
                            "parecer_pdf": base + ".pdf", "parecer_docx": base + ".docx", "resumo": resumo_de(analise),
                            "custo_usd": analise.get("_execucao", {}).get("custo_usd"), "erro_msg": None})
            print(f"::notice title=Fila::análise {aid}: concluída · US$ {analise.get('_execucao', {}).get('custo_usd')}")
        except ErroCliente as e:
            atualizar(aid, {"status": "erro", "erro_msg": str(e)})
            print(f"::notice title=Fila::análise {aid}: recusada ({type(e).__name__})")
        except Exception as e:
            # antes da chamada paga: volta para a fila (até 3 tentativas). Depois dela: erro, sem repetir (evita pagar de novo); a equipe é avisada.
            if not locals().get("etapa_paga") and int(a.get("tentativas") or 1) < 3:
                atualizar(aid, {"status": "na_fila"})
                print(f"::notice title=Fila::análise {aid}: falhou, volta à fila ({type(e).__name__})")
                return
            try:
                atualizar(aid, {"status": "erro", "erro_msg": "Falha técnica no processamento automático.", "erro_tecnico": f"{type(e).__name__}: {e}"[-1500:]})
            except Exception:
                atualizar(aid, {"status": "erro", "erro_msg": "Falha técnica no processamento automático."})
            print(f"::notice title=Fila::análise {aid}: erro definitivo ({type(e).__name__})")
    avisar(aid)


def processar_geracao(a):
    """Elaboração de ETP, TR ou Projeto Básico a partir do questionário (scripts/agente/elaborar.py)."""
    aid = a["id"]
    print(f"elaboração {aid}: início (tentativa {a.get('tentativas')})")
    try:
        atualizar(aid, {"progresso": "iniciando"})
    except Exception:
        pass
    with tempfile.TemporaryDirectory() as tmp:
        pasta = pathlib.Path(tmp)
        try:
            if a.get("documento") not in ("etp", "tr", "projeto_basico"):
                raise ErroCliente("Tipo de documento inválido.")
            respostas = a.get("respostas") or {}
            if not str(respostas.get("objeto", "")).strip():
                raise ErroCliente("O questionário chegou sem o objeto da contratação.")
            (pasta / "respostas.json").write_text(json.dumps(respostas, ensure_ascii=False), encoding="utf-8")
            # arquivos do assinante (modelo em Word, logo, PDFs de preço): só da pasta dele; falha em um arquivo não impede o documento
            extra, prefixo = [], f"{a['usuario_id']}/elab-arquivos/"
            def baixar(caminho, nome):
                if not isinstance(caminho, str) or not caminho.startswith(prefixo) or ".." in caminho:
                    return None
                try:
                    destino = pasta / "arquivos" / nome; destino.parent.mkdir(exist_ok=True)
                    destino.write_bytes(http("GET", f"{SUPA}/storage/v1/object/analises/{caminho}", cab=cab(), binario=True, timeout=300))
                    return destino
                except Exception:
                    print(f"elaboração {aid}: arquivo do assinante não baixado ({nome.split('.')[0]})")
                    return None
            mod = baixar(respostas.get("modelo_arquivo"), "modelo.docx")
            if mod: extra += ["--modelo", str(mod)]
            ext_logo = ".png" if str(respostas.get("logo_arquivo", "")).lower().endswith(".png") else ".jpg"
            logo = baixar(respostas.get("logo_arquivo"), "logo" + ext_logo)
            if logo: extra += ["--logo", str(logo)]
            try:
                pdfs = json.loads(respostas.get("precos_pdfs") or "[]")
            except Exception:
                pdfs = []
            for i, f in enumerate(pdfs[:5] if isinstance(pdfs, list) else []):
                arq = baixar((f or {}).get("arquivo"), f"preco{i + 1}.pdf")
                if arq: extra += ["--preco-pdf", f"{str((f or {}).get('nome') or 'PDF')[:80].replace('=', '-')}={arq}"]
            base_rascunho = f"{a['usuario_id']}/pareceres/{aid}-rascunho"
            if a.get("fase") == "completar":  # só preencher as lacunas no texto já redigido: baixa o rascunho
                (pasta / "rascunho").mkdir(exist_ok=True)
                (pasta / "rascunho" / "documento.json").write_bytes(http("GET", f"{SUPA}/storage/v1/object/analises/{base_rascunho}.json", cab=cab(), binario=True, timeout=300))
                try:
                    (pasta / "rascunho" / "pesquisa.json").write_bytes(http("GET", f"{SUPA}/storage/v1/object/analises/{base_rascunho}-pesquisa.json", cab=cab(), binario=True, timeout=300))
                except Exception:
                    pass
                extra += ["--docj", str(pasta / "rascunho" / "documento.json")]
            etapa_paga = True  # a partir daqui há custo de API: falha não volta para a fila automaticamente
            proc = subprocess.Popen([sys.executable, str(RAIZ / "scripts/agente/elaborar.py"), "--doc", a["documento"], "--respostas",
                                     str(pasta / "respostas.json"), "--pasta", str(pasta / "saida")] + extra,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            saida_txt, inicio_proc = [], time.time()
            for linha in proc.stdout:
                saida_txt.append(linha)
                if linha.startswith("ETAPA:"):
                    try:
                        atualizar(aid, {"progresso": linha.split(":", 1)[1].strip()[:40]})
                    except Exception:
                        pass
                if time.time() - inicio_proc > 3300:
                    proc.kill(); break
            if proc.wait() != 0:
                raise RuntimeError("".join(saida_txt)[-800:])
            saida = pasta / "saida"
            exe = json.loads((saida / "execucao.json").read_text(encoding="utf-8"))
            custo_ant = float(a.get("custo_usd") or 0)
            if exe.get("aguardando"):  # o agente precisa de informações do assinante: pausa e avisa no site e por e-mail
                perguntas = json.loads((saida / "perguntas.json").read_text(encoding="utf-8"))
                guardou = True
                if exe.get("fase") == "completar":
                    try:
                        http("POST", f"{SUPA}/storage/v1/object/analises/{base_rascunho}.json", (saida / "documento.json").read_bytes(),
                             cab({"Content-Type": "application/json", "x-upsert": "true"}), timeout=300)
                        if (saida / "pesquisa.json").exists():
                            http("POST", f"{SUPA}/storage/v1/object/analises/{base_rascunho}-pesquisa.json", (saida / "pesquisa.json").read_bytes(),
                                 cab({"Content-Type": "application/json", "x-upsert": "true"}), timeout=300)
                    except Exception as e:  # sem onde guardar o rascunho: entrega o documento já pago, com as lacunas destacadas
                        guardou = False
                        print(f"elaboração {aid}: rascunho não guardado ({type(e).__name__}); entregando com as lacunas destacadas")
                        rodar([sys.executable, str(RAIZ / "scripts/agente/elaborar.py"), "--doc", a["documento"], "--respostas", str(pasta / "respostas.json"),
                               "--pasta", str(pasta / "saida"), "--docj", str(saida / "documento.json")] + [x for x in extra if x != "--docj"], timeout=900)
                        exe = {**json.loads((saida / "execucao.json").read_text(encoding="utf-8")), "custo_usd": exe.get("custo_usd")}
            if exe.get("aguardando"):
                perguntas = json.loads((saida / "perguntas.json").read_text(encoding="utf-8"))
                atualizar(aid, {"status": "aguardando_informacoes", "perguntas": perguntas, "fase": exe.get("fase") if exe.get("fase") == "completar" else None,
                                "progresso": None, "custo_usd": round(custo_ant + float(exe.get("custo_usd") or 0), 4)})
                print(f"::notice title=Fila::elaboração {aid}: aguardando {len(perguntas)} informações do assinante")
                avisar(aid)
                return
            base = f"{a['usuario_id']}/pareceres/{aid}"
            campos = {"status": "concluida", "progresso": "pronto", "fase": None, "perguntas": None, "concluido_em": datetime.datetime.now(datetime.timezone.utc).isoformat(), "erro_msg": None,
                      "custo_usd": round(custo_ant + float(exe.get("custo_usd") or 0), 4), "parecer_docx": base + ".docx",
                      "resumo": {"situacao": "elaborado", "pendencias": exe.get("pendencias", 0), "alta": exe.get("alta", 0), "media": exe.get("media", 0),
                                 "objeto": str(respostas.get("objeto", ""))[:200], "orgao": str(respostas.get("orgao", ""))[:200],
                                 **({"recomendacao": exe["recomendacao"]} if exe.get("recomendacao") else {})}}
            http("POST", f"{SUPA}/storage/v1/object/analises/{base}.docx", (saida / "documento.docx").read_bytes(),
                 cab({"Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x-upsert": "true"}), timeout=300)
            if (saida / "documento.pdf").exists():
                http("POST", f"{SUPA}/storage/v1/object/analises/{base}.pdf", (saida / "documento.pdf").read_bytes(),
                     cab({"Content-Type": "application/pdf", "x-upsert": "true"}), timeout=300)
                campos["parecer_pdf"] = base + ".pdf"
            atualizar(aid, campos)
            print(f"::notice title=Fila::elaboração {aid}: concluída · US$ {exe.get('custo_usd')}")
        except ErroCliente as e:
            atualizar(aid, {"status": "erro", "erro_msg": str(e)})
        except Exception as e:
            if not locals().get("etapa_paga") and int(a.get("tentativas") or 1) < 3:
                atualizar(aid, {"status": "na_fila"}); return
            try:
                atualizar(aid, {"status": "erro", "erro_msg": "Falha técnica no processamento automático.", "erro_tecnico": f"{type(e).__name__}: {e}"[-1500:]})
            except Exception:
                atualizar(aid, {"status": "erro", "erro_msg": "Falha técnica no processamento automático."})
            print(f"::notice title=Fila::elaboração {aid}: erro definitivo ({type(e).__name__})")
    avisar(aid)


def main():
    if "--verificar" in sys.argv:
        r = urllib.request.urlopen(urllib.request.Request(f"{SUPA}/rest/v1/analises?status=eq.na_fila&or=(liberar_em.is.null,liberar_em.lte.{datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')})&select=id&limit=1", headers=cab()), timeout=60)
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
    for _ in range(MAX_POR_EXECUCAO):
        lista = rest("POST", "rpc/geracao_proxima", {}) or []
        if not lista:
            break
        processar_geracao(lista[0])


if __name__ == "__main__":
    main()
