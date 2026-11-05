// O Elaborador → Pesquisa de preços (fase de planejamento). Versão inicial: teste de acesso às fontes públicas.
import { CORS, erro, resposta, segredoConfere } from "../_shared/comum.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

async function testar(url: string) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json,text/html" }, signal: AbortSignal.timeout(25000) });
    const txt = await r.text();
    let amostra: unknown = txt.slice(0, 200);
    try { const j = JSON.parse(txt); const lista = j.resultado ?? j.items ?? j.data ?? null; amostra = Array.isArray(lista) && lista[0] ? { total: j.totalRegistros ?? j.total ?? lista.length, campos: lista[0] } : Object.keys(j).slice(0, 12); } catch { /* html */ }
    return { url, status: r.status, ms: Date.now() - t0, amostra };
  } catch (e) { return { url, status: 0, ms: Date.now() - t0, erro: String((e as Error).message ?? e).slice(0, 160) }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);
  const corpo = await req.json().catch(() => ({}));
  if (corpo.acao === "teste_fontes") {
    if (!segredoConfere(req)) return erro("Não autorizado", 401);
    const C = "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco";
    const ini = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), fim = new Date().toISOString().slice(0, 10);
    const urls = [
      `${C}/1_consultarMaterial?pagina=1&tamanhoPagina=10&tipo=codigoPdm&codigo=4813&dataCompraInicio=${ini}&dataCompraFim=${fim}&estado=RJ`,
      `${C}/1_consultarMaterial?pagina=1&tamanhoPagina=10&codigoItemCatalogo=461871`,
      `${C}/3_consultarServico?pagina=1&tamanhoPagina=10&codigoItemCatalogo=5380&dataCompraInicio=${ini}&dataCompraFim=${fim}`,
      "https://pncp.gov.br/api/search/?q=papel%20a4&tipos_documento=edital&pagina=1&tam_pagina=5&status=todos",
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20261001&dataFinal=20261002&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10",
      "https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx",
      "https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-e-pagamentos/custos-e-pagamentos-dnit/sistemas-de-custos/sicro",
    ];
    return resposta({ fontes: await Promise.all(urls.map(testar)) });
  }
  return erro("Ação desconhecida.");
});
