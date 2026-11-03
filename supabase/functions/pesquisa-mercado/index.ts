// Pesquisa de mercado preliminar, feita ANTES de criar o documento (para avisar o assinante se não houver dados).
// Mesma lógica de scripts/agente/pesquisa_mercado.py, em versão curta: busca do PNCP (contratações e atas de outros órgãos,
// primeiro no estado do órgão) e, quando a compra passou pelo Compras.gov.br, o preço unitário dos itens.
// Só para quem está logado. Sem custo: usa APIs públicas.
// POST { objeto, uf, natureza } -> { referencias: [...], erro }

import { clienteServico, CORS, erro, resposta, usuarioDaRequisicao } from "../_shared/comum.ts";

const PNCP = "https://pncp.gov.br";
const COMPRAS = "https://dadosabertos.compras.gov.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const PARADAS = new Set(`a o as os de da do das dos e em no na nos nas para por com sem ao aos um uma uns umas que se sua seu
contratacao contratar aquisicao adquirir servico servicos prestacao fornecimento empresa empresas especializada
especializado eventual eventuais futura futuras registro precos preco objeto visando atender atendimento demanda demandas
municipal municipais estadual secretaria prefeitura orgao continuo continuos continuada continuadas comum comuns
locacao inclusive conforme especificacoes termo referencia anexo`.split(/\s+/));

const semAcento = (t: unknown) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const chavesDe = (objeto: string) => [...new Set((semAcento(objeto).match(/[a-z0-9]{3,}/g) ?? []).filter((p) => !PARADAS.has(p)))].slice(0, 4);
const pontos = (t: string, raizes: string[]) => { const s = semAcento(t); return raizes.filter((r) => s.includes(r)).length; };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== "" ? Math.round(n * 100) / 100 : null; };

async function obter(url: string, ms = 12000): Promise<any> {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
      if (r.status === 204) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (t === 1) throw e;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  }
}

// ---------------------------------------------------------------- preços praticados (Compras.gov.br), mesma lógica do agente
const CATALOGO_URL = "https://renatogarciagestorp-cpu.github.io/licitaverso/catalogo-compras.json";
const SINONIMOS: Record<string, string[]> = { notebook: ["computador"], notebooks: ["computador"], laptop: ["notebook", "computador"],
  desktop: ["microcomputador"], carro: ["veiculo"], carros: ["veiculo"], automovel: ["veiculo"], veiculos: ["veiculo"], onibus: ["veiculo"],
  predial: ["areas", "internas"], faxina: ["limpeza"], seguranca: ["vigilancia"], vigia: ["vigilancia"], climatizacao: ["condicionado"],
  impressao: ["impressora", "reprografia"], copias: ["reprografia"] };
let catalogo: { pdm: [number, string, string][]; servico: [number, string, string][] } | null = null;

async function obterCatalogo() {
  if (!catalogo) catalogo = await (await fetch(CATALOGO_URL, { signal: AbortSignal.timeout(10000) })).json();
  return catalogo!;
}

const raiz = (w: string) => w.length <= 3 ? w : w.slice(0, Math.max(5, w.length - 1));
const casa = (w: string, r: string) => r.length >= 6 ? w.startsWith(r) : (w === r || w === r + "s" || w === r + "es");

async function codigosCatalogo(objeto: string, tipo: "material" | "servico", extra: string) {
  const chaves = [...(extra ? [extra] : []), ...chavesDe(objeto).slice(0, 5), ...((semAcento(objeto).match(/\b[a-z]\d{1,2}\b/g) ?? []).slice(0, 1))];
  const raizes: string[] = [];
  for (const c of chaves) for (const x of [c, ...(SINONIMOS[c] ?? [])]) if (!raizes.includes(raiz(x))) raizes.push(raiz(x));
  if (!raizes.length) return [];
  const obrig = raiz(chaves[0]), sin = (SINONIMOS[chaves[0]] ?? []).map(raiz);
  const cat = await obterCatalogo();
  const cand: [number, number, number, number, string][] = [];
  for (const [cod, nome] of (tipo === "material" ? cat.pdm : cat.servico)) {
    const nm = semAcento(String(nome ?? "").replace(/-\s*/g, ""));
    if (nm.includes("inativo")) continue;
    const pal = nm.match(/[a-z0-9]+/g) ?? [];
    if (!pal.some((w) => casa(w, obrig)) && !sin.some((r) => pal.some((w) => casa(w, r)))) continue;
    const p = raizes.filter((r) => pal.some((w) => casa(w, r))).length;
    const ini = pal.length && raizes.some((r) => casa(pal[0]!, r)) ? 1 : 0;
    cand.push([p, ini, -pal.length, cod, nome]);
  }
  cand.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  if (!cand.length || cand[0][0] < 1) return [];
  const emp = cand.filter((c) => c[0] === cand[0][0] && c[1] === cand[0][1]);
  if (cand[0][0] === 1 && emp.length > 10) return emp.filter((c) => c[2] === -1).slice(0, 1).map((c) => [c[3], c[4]] as [number, string]);
  return emp.slice(0, 3).map((c) => [c[3], c[4]] as [number, string]);
}

function semDiscrepantes(v: number[]) {
  v = [...v].sort((a, b) => a - b);
  if (v.length < 4) return v;
  const q1 = v[Math.floor(v.length / 4)], q3 = v[Math.floor(3 * v.length / 4)], iqr = q3 - q1;
  const ok = v.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
  return ok.length ? ok : v;
}
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) * 50) / 100; };

async function precosPraticados(objeto: string, natureza: string, uf: string, extra: string, limite: number) {
  const n = semAcento(natureza);
  const tipo: "material" | "servico" = /bem|compra/.test(n) && !extra ? "material" : "servico";
  const hoje = new Date(), ini = new Date(hoje.getTime() - 365 * 864e5).toISOString().slice(0, 10), fim = hoje.toISOString().slice(0, 10);
  const saida: any[] = [];
  for (const [cod, nome] of await codigosCatalogo(objeto, tipo, extra)) {
    if (Date.now() > limite) break;
    let linhas: any[] = [];
    for (const est of uf ? [uf, ""] : [""]) {
      const p = new URLSearchParams({ pagina: "1", tamanhoPagina: "50", dataCompraInicio: ini, dataCompraFim: fim });
      if (est) p.set("estado", est);
      let url;
      if (tipo === "material") { p.set("tipo", "codigoPdm"); p.set("codigo", String(cod)); url = `${COMPRAS}/modulo-pesquisa-preco/1_consultarMaterial?${p}`; }
      else { p.set("codigoItemCatalogo", String(cod)); url = `${COMPRAS}/modulo-pesquisa-preco/3_consultarServico?${p}`; }
      try { linhas = (((await obter(url, 15000)) ?? {}).resultado ?? []).filter((r: any) => (num(r.precoUnitario) ?? 0) > 0.01 && String(r.dataCompra ?? r.dataResultado ?? "9").slice(0, 10) >= ini); }
      catch { linhas = []; }
      if (linhas.length >= 3) break;
    }
    const porUn: Record<string, any[]> = {};
    for (const r of linhas) {
      let un = String(r.siglaUnidadeFornecimento ?? r.siglaUnidadeMedida ?? r.nomeUnidadeFornecimento ?? r.nomeUnidadeMedida ?? "—").trim().toUpperCase();
      un = ({ UNIDADE: "UN", UND: "UN", "METRO QUADRADO": "M2", "M²": "M2" } as Record<string, string>)[un] ?? un;
      (porUn[un] ??= []).push(r);
    }
    for (const [un, rs] of Object.entries(porUn).sort((a, b) => b[1].length - a[1].length)) {
      const todos = rs.map((r) => num(r.precoUnitario)!), vals = semDiscrepantes(todos);
      saida.push({ catalogo: `${tipo === "material" ? "PDM" : "CATSER"} ${cod} — ${nome}`, unidade: un, n: vals.length, excluidos: todos.length - vals.length,
        minimo: vals[0], mediana: mediana(vals), maximo: vals[vals.length - 1], abrangencia: uf && rs.every((r) => r.estado === uf) ? "estado" : "nacional" });
    }
  }
  return saida;
}

function solucoes(natureza: string): [string, string][] {
  const n = semAcento(natureza);
  if (/obra|engenharia|reforma/.test(n)) return [["execução da obra ou serviço", ""]];
  if (/bem|compra|locacao/.test(n)) return [["aquisição", ""], ["locação", "locacao"], ["serviço com fornecimento do bem (outsourcing)", "outsourcing"]];
  return [["contratação do serviço", ""]];
}

let pncpItensOk = true;  // se a API de itens do PNCP não responder uma vez, não tenta de novo nesta pesquisa

async function itens(controle: string, raizes: string[], url = "") {
  if (!controle) return [];
  const q = `tipo=numeroControlePNCPCompra&codigo=${encodeURIComponent(controle)}`;
  let lista = ((await obter(`${COMPRAS}/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id?${q}`, 10000)) ?? {}).resultado ?? [];
  const m = url.match(/\/(\d{14})\/(\d{4})\/(\d+)/);
  if (!lista.length && m && pncpItensOk) {  // compras de estados e municípios: itens direto no PNCP
    try {
      const r = await fetch(`${PNCP}/api/pncp/v1/orgaos/${m[1]}/compras/${m[2]}/${m[3]}/itens?pagina=1&tamanhoPagina=100`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      lista = r.ok ? ((await r.json()) ?? []) : [];
    } catch { pncpItensOk = false; }
  }
  const minimo = Math.min(2, raizes.length);
  return lista.map((it: any) => [pontos(it.descricaoResumida ?? it.descricao ?? "", raizes), it] as [number, any])
    .filter(([p]: [number, any]) => p >= minimo).sort((a: any, b: any) => b[0] - a[0]).slice(0, 3)
    .map(([, it]: [number, any]) => ({
      descricao: String(it.descricaoResumida ?? it.descricao ?? "").replace(/\s+/g, " ").slice(0, 200),
      unidade: it.unidadeMedida ?? null, quantidade: num(it.quantidade), valor_unitario_estimado: num(it.valorUnitarioEstimado),
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);
  const admin = clienteServico();
  const segredo = Deno.env.get("AVISOS_SECRET") ?? "";
  const interno = segredo.length >= 16 && req.headers.get("x-avisos") === segredo;  // teste interno (GitHub Actions)
  if (!interno && !(await usuarioDaRequisicao(req, admin))) return erro("Entre na sua conta para fazer a pesquisa.", 401);
  const corpo = await req.json().catch(() => ({}));
  const objeto = String(corpo.objeto ?? "").slice(0, 500);
  const uf = String(corpo.uf ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  const chaves = chavesDe(objeto), raizes = chaves.map((c) => c.slice(0, 5));
  if (!chaves.length) return resposta({ referencias: [], erro: "Descreva melhor o objeto para pesquisar." });
  const inicio = Date.now(), refs: any[] = [], vistos = new Set<string>();
  pncpItensOk = true;
  let falha = "";
  const sols = solucoes(String(corpo.natureza ?? ""));
  const porSol = Math.max(3, Math.floor(10 / sols.length));
  for (const [rotulo, extra] of sols) {
    const achados: [string, string, any][] = [];
    for (const [abr, u] of (uf ? [["estado", uf], ["nacional", ""]] : [["nacional", ""]]) as [string, string][]) {
      for (const n of [2, 1]) {
        const q = [extra, ...chaves.slice(0, n)].filter(Boolean).join(" ");
        for (const tipo of ["edital", "ata"]) {
          if (Date.now() - inicio > 35000) break;
          try {
            const p = new URLSearchParams({ q, tipos_documento: tipo, ordenacao: "-data", pagina: "1", tam_pagina: "40", status: "todos" });
            if (u) p.set("ufs", u);
            const hits = ((await obter(`${PNCP}/api/search/?${p}`)) ?? {}).items ?? [];
            for (const h of hits) {
              const ctrl = String(h.numero_controle_pncp ?? h.item_url ?? "");
              const texto = `${h.description ?? ""} ${h.title ?? ""}`;
              if (extra && !semAcento(texto).includes(extra.slice(0, 5))) continue;
              if (/revogad|anulad|cancelad|desert|fracassad/.test(semAcento(h.situacao_nome))) continue;
              if (vistos.has(ctrl) || pontos(texto, raizes) < Math.min(2, raizes.length)) continue;
              vistos.add(ctrl); achados.push([abr, tipo, h]);
            }
          } catch (e) { falha = "O PNCP não respondeu (" + String((e as Error).message ?? e).slice(0, 80) + ")."; }
        }
        if (achados.length >= porSol) break;
      }
      if (achados.filter((a) => a[0] === "estado").length >= porSol) break;
    }
    for (const [abr, tipo, h] of achados.slice(0, porSol)) {
      const controle = String(h.numero_controle_pncp ?? "");
      let its: any[] = [];
      if (Date.now() - inicio < 40000) {
        try { its = await itens(tipo === "ata" ? controle.replace(/-\d{6}$/, "") : controle, raizes, tipo === "ata" ? "" : String(h.item_url ?? "")); } catch { its = []; }
      }
      const url = String(h.item_url ?? "");
      refs.push({ solucao: rotulo, abrangencia: abr, tipo: tipo === "ata" ? "ata de registro de preços" : "contratação",
        orgao: h.orgao_nome ?? "", municipio: h.municipio_nome ?? "", uf: h.uf ?? "", data: String(h.data_publicacao_pncp ?? "").slice(0, 10),
        objeto: String(h.description ?? h.title ?? "").replace(/\s+/g, " ").slice(0, 220), valor_total_estimado: num(h.valor_total_estimado),
        link: url ? PNCP + "/app" + url.replace("/compras/", "/editais/") : "", itens: its });
    }
  }
  const precos: any[] = [];
  for (const [rotulo, extra] of sols) {
    try { for (const x of await precosPraticados(objeto, String(corpo.natureza ?? ""), uf, extra, inicio + 55000)) precos.push({ ...x, solucao: rotulo }); }
    catch { /* catálogo ou API indisponível: segue com o PNCP */ }
  }
  const nada = !refs.length && !precos.length;
  return resposta({ referencias: refs, precos_praticados: precos, erro: nada ? (falha || "Nenhuma contratação semelhante nem preço praticado encontrado.") : "" });
});
