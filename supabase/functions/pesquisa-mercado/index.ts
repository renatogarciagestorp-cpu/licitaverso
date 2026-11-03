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

function solucoes(natureza: string): [string, string][] {
  const n = semAcento(natureza);
  if (/obra|engenharia|reforma/.test(n)) return [["execução da obra ou serviço", ""]];
  if (/bem|compra|locacao/.test(n)) return [["aquisição", ""], ["locação", "locacao"], ["serviço com fornecimento do bem (outsourcing)", "outsourcing"]];
  return [["contratação do serviço", ""]];
}

async function itens(controle: string, raizes: string[]) {
  if (!controle) return [];
  const q = `tipo=numeroControlePNCPCompra&codigo=${encodeURIComponent(controle)}`;
  const lista = ((await obter(`${COMPRAS}/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id?${q}`, 10000)) ?? {}).resultado ?? [];
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
  const usuario = await usuarioDaRequisicao(req, admin);
  if (!usuario) return erro("Entre na sua conta para fazer a pesquisa.", 401);
  const corpo = await req.json().catch(() => ({}));
  const objeto = String(corpo.objeto ?? "").slice(0, 500);
  const uf = String(corpo.uf ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  const chaves = chavesDe(objeto), raizes = chaves.map((c) => c.slice(0, 5));
  if (!chaves.length) return resposta({ referencias: [], erro: "Descreva melhor o objeto para pesquisar." });
  const inicio = Date.now(), refs: any[] = [], vistos = new Set<string>();
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
        try { its = await itens(tipo === "ata" ? controle.replace(/-\d{6}$/, "") : controle, raizes); } catch { its = []; }
      }
      const url = String(h.item_url ?? "");
      refs.push({ solucao: rotulo, abrangencia: abr, tipo: tipo === "ata" ? "ata de registro de preços" : "contratação",
        orgao: h.orgao_nome ?? "", municipio: h.municipio_nome ?? "", uf: h.uf ?? "", data: String(h.data_publicacao_pncp ?? "").slice(0, 10),
        objeto: String(h.description ?? h.title ?? "").replace(/\s+/g, " ").slice(0, 220), valor_total_estimado: num(h.valor_total_estimado),
        link: url ? PNCP + "/app" + url.replace("/compras/", "/editais/") : "", itens: its });
    }
  }
  return resposta({ referencias: refs, erro: refs.length ? "" : (falha || "Nenhuma contratação semelhante encontrada no PNCP.") });
});
