#!/usr/bin/env python3
"""Referência de mercado para o custo de mão de obra: média salarial do estado no site salario.com.br (dados do Novo CAGED,
salário-base em carteira, últimos 12 meses). Não é parâmetro normativo — serve como indicador de mercado para o parecer.

Entrada: JSON de postos (saída de extrair-postos.py): {"uf": "RJ", "postos": [{"funcao", "cbo", "uf", "salario_base",
"jornada_semanal", "custo_total_mensal", "quantidade"}]}
Saída: mesmo JSON com "referencia" em cada posto e a situação da comparação.

Uso: python3 scripts/agente/salarios.py postos.json saida.json
"""
import difflib, html as htmllib, json, re, sys, time, unicodedata, urllib.request

BASE = "https://www.salario.com.br"
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
     "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9"}
UFS = set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())
TOLERANCIA = 0.05  # até 5% acima da média: ponto de atenção; acima disso: acima da referência


def baixar(url):
    for t in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ""
            time.sleep(3 * (t + 1))
        except Exception:
            time.sleep(3 * (t + 1))
    return ""


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def texto(h):
    h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", h)
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", h)))


def valor(s):
    return float(s.replace(".", "").replace(",", "."))


def paginas_do_cbo(cbo):
    """Links /profissao/<slug>-cbo-<cbo>/ listados na página de cargos do CBO."""
    h = baixar(f"{BASE}/ocupacao/cargos/cbo-{cbo}-cargos/")
    links = re.findall(r'href="(?:https://www\.salario\.com\.br)?(/profissao/([a-z0-9-]+)-cbo-(\d{6})/)"[^>]*>\s*([^<]{2,120})<', h)
    por_url = {}
    for url, slug, c, nome in links:
        if c != cbo:
            continue
        nome = htmllib.unescape(nome).strip()
        atual = por_url.setdefault(url, {"url": url, "slug": slug, "nome": slug.replace("-", " ").capitalize()})
        if nome and not re.search(r"(?i)pesquisa|salari|ver |saiba", nome):
            atual["nome"] = nome
    return list(por_url.values())


def escolher(cands, funcao):
    if not cands:
        return None
    alvo = norm(funcao)
    def nota(c):
        nome = norm(c["nome"]); slug = norm(c["slug"].replace("-", " "))
        palavras = set(alvo.split())
        comum = len(palavras & set((nome + " " + slug).split())) / max(1, len(palavras))
        return comum + max(difflib.SequenceMatcher(None, alvo, nome).ratio(), difflib.SequenceMatcher(None, alvo, slug).ratio())
    return max(cands, key=nota)


def media_estado(url_prof, uf):
    t = texto(baixar(f"{BASE}{url_prof}{uf.lower()}/"))
    m = re.search(r"ganha em média R\$\s*([\d\.]+,\d{2})\s*por mês(?:,\s*para uma jornada de\s*(\d+)\s*horas semanais)?", t)
    if not m:
        return None
    ref = {"media": valor(m.group(1)), "jornada": int(m.group(2)) if m.group(2) else None,
           "url": f"{BASE}{url_prof}{uf.lower()}/"}
    m2 = re.search(r"[Cc]usto (?:total )?(?:para|da|à) (?:a )?empresa\D{0,80}?R\$\s*([\d\.]+(?:,\d{2})?)", t)
    if m2:
        ref["custo_empresa"] = valor(m2.group(1))
    m3 = re.search(r"[Aa]tualizado em (\d{1,2} de [a-zç]+ de \d{4})", t)
    if m3:
        ref["atualizado"] = m3.group(1)
    m4 = re.search(r"média nacional de R\$\s*([\d\.]+(?:,\d{2})?)", t)
    if m4:
        ref["media_nacional"] = valor(m4.group(1))
    return ref


def comparar(p, ref):
    sb = p.get("salario_base")
    if not sb or not ref:
        return "sem_referencia", None
    media = ref["media"]
    if ref.get("jornada") and p.get("jornada_semanal"):
        media = media * float(p["jornada_semanal"]) / ref["jornada"]  # proporcional à jornada da planilha
    desvio = sb / media - 1
    sit = "acima" if desvio > TOLERANCIA else ("atencao" if desvio > 0 else "compativel")
    return sit, {"media_ajustada": round(media, 2), "desvio": round(desvio, 4)}


def main():
    dados = json.load(open(sys.argv[1], encoding="utf-8"))
    cache = {}
    for p in dados.get("postos", []):
        cbo = re.sub(r"\D", "", str(p.get("cbo") or ""))[:6]
        uf = (p.get("uf") or dados.get("uf") or "").upper()
        p["referencia"], p["situacao"] = None, "sem_referencia"
        if len(cbo) != 6 or uf not in UFS:
            p["motivo"] = "CBO ou UF não informado na planilha"
            continue
        if cbo not in cache:
            cache[cbo] = paginas_do_cbo(cbo)
        prof = escolher(cache[cbo], p.get("funcao", ""))
        if not prof:
            p["motivo"] = "CBO sem página de pesquisa salarial no site"
            continue
        ref = media_estado(prof["url"], uf)
        if not ref:
            p["motivo"] = "o site não informa média para o estado"
            continue
        ref["ocupacao_site"] = prof["nome"]
        p["referencia"] = ref
        p["situacao"], comp = comparar(p, ref)
        if comp:
            p.update(comp)
        if ref.get("custo_empresa") and p.get("custo_total_mensal"):
            p["custo_total_sobre_custo_empresa_site"] = round(float(p["custo_total_mensal"]) / ref["custo_empresa"], 3)
        time.sleep(1)
    dados["fonte"] = {"nome": "Salario.com.br — pesquisa salarial (dados do Novo CAGED/MTE, salário-base em carteira, últimos 12 meses)",
                      "url": BASE, "tolerancia": TOLERANCIA}
    json.dump(dados, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for p in dados.get("postos", []):
        print(f"posto {p.get('funcao','')[:40]} · CBO {p.get('cbo')} · {p['situacao']} · {p.get('desvio')}")


if __name__ == "__main__":
    main()
