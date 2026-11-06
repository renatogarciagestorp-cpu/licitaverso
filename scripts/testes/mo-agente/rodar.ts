// Teste do agente da Calculadora (mo-agente) com caso fictício: roda o código real da função, com banco e login simulados.
// deno run -A --import-map=scripts/testes/mo-agente/import_map.json scripts/testes/mo-agente/rodar.ts <modo> <saida.json>
// SECO=1: não chama a API (resposta simulada), para conferir o encaixe sem custo.
const [modo = "repactuacao", saida = "mo-teste.json"] = Deno.args;
const pasta = "agente/testes/mo/";
Deno.env.set("TESTE_ARQUIVOS", JSON.stringify({ "teste/mo/cct.pdf": pasta + "cct-2026-ficticia.pdf" }));
let uso: any = null;
const fetchOrig = globalThis.fetch;
globalThis.fetch = async (url: any, init?: any) => {
  if (String(url).includes("api.anthropic.com")) {
    if (Deno.env.get("SECO")) {
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "preencher_planilha", input: { campos: [{ campo: "salario", valor: "1760", fonte: "simulado", anterior: "1650" }], observacoes: [], falhas: [], iss: { encontrado: false, aliquota: null, item_lc116: "7.10", fonte: "" } } }], usage: { input_tokens: 0, output_tokens: 0 } }), { status: 200 });
    }
    const r = await fetchOrig(url, init);
    const j = await r.clone().json().catch(() => ({}));
    uso = { ...(j.usage || {}), modelo: JSON.parse(init.body).model };
    return r;
  }
  return fetchOrig(url, init);
};
let handler: any = null;
(Deno as any).serve = (h: any) => { handler = h; return {} as any; };
await import("../../../supabase/functions/mo-agente/index.ts");
const dados = JSON.parse(await Deno.readTextFile(pasta + "dados-site.json"));
const corpo = { modo, arquivo: "teste/mo/cct.pdf", planilha_arquivo: "", planilha_texto: await Deno.readTextFile(pasta + "planilha-contrato-2025.txt"), dados };
const t0 = Date.now();
const r: Response = await handler(new Request("http://teste/", { method: "POST", headers: { Authorization: "Bearer x" }, body: JSON.stringify(corpo) }));
const out = await r.json();
// preço de referência do Sonnet: US$ 3 por milhão de tokens de entrada e US$ 15 de saída; busca na web: US$ 10 por mil
const custo = uso ? ((uso.input_tokens || 0) * 3 + (uso.output_tokens || 0) * 15) / 1e6 + ((uso.server_tool_use || {}).web_search_requests || 0) * 0.01 : 0;
await Deno.writeTextFile(saida, JSON.stringify({ status: r.status, segundos: Math.round((Date.now() - t0) / 1000), uso, custo_estimado_usd: Math.round(custo * 1000) / 1000, resposta: out }, null, 1));
console.log(`status ${r.status} · ${(out.campos || []).length} campos · ${(out.falhas || []).length} falhas · custo estimado US$ ${custo.toFixed(3)}`);
