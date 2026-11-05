// O Elaborador → Pesquisa de preços (fase de planejamento: estimativa do valor da contratação).
// Coleta de preços nas bases públicas (sem custo) e duas funções com IA (custo de API, com limite diário):
//   POST { acao: "catalogo", texto, tipo: "material" | "servico" }           -> { itens: [{ codigo, nome, tipo }] }
//   POST { acao: "coletar", codigo, tipo, uf, meses }                          -> { registros: [...], consulta, abrangencia }   (Painel de Preços / Compras.gov.br — IN 65/2021, art. 5º, I)
//   POST { acao: "pncp", descricao, uf, meses }                                -> { registros: [...] }                          (contratações similares no PNCP — art. 5º, II)
//   POST { acao: "ia_similares", descricao, unidade, registros: [{ id, descricao, unidade, preco }] } -> { avaliacao: [{ id, semelhante, motivo }] }
//   POST { acao: "ia_rilc", arquivo: "<uid>/pp/<nome>.pdf" | texto }           -> { regras: {...} }
//   POST { acao: "teste_fontes" }  (teste interno do GitHub, com o segredo)    -> { fontes: [...] }
// Acesso: planos Básico, Premium e Pro (e administradores com verificação em duas etapas).

import { clienteServico, CORS, erro, nivelDoToken, resposta, segredoConfere, usuarioDaRequisicao } from "../_shared/comum.ts";

const PNCP = "https://pncp.gov.br";
const COMPRAS = "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const MODELO_IA = Deno.env.get("PP_MODELO") || "claude-haiku-5-5";
const PLANOS = new Set(["basico", "premium", "pro"]);
const LIMITE_DIA: Record<string, number> = { coleta: 150, ia_similares: 25, ia_rilc: 5 };
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const MODALIDADE: Record<string, string> = { "1": "Convite", "2": "Tomada de preços", "3": "Concorrência", "5": "Pregão", "6": "Dispensa", "7": "Inexigibilidade", "20": "Concurso" };

const semAcento = (t: unknown) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (v: unknown) => { if (v === null || v === undefined || v === "") return null; const n = Number(typeof v === "string" ? v.replace(",", ".") : v); return Number.isFinite(n) ? n : null; };
const PARADAS = new Set(`a o as os de da do das dos e em no na nos nas para por com sem ao aos um uma uns umas que se sua seu tipo
contratacao contratar aquisicao adquirir servico servicos prestacao fornecimento empresa empresas especializada especializado
eventual eventuais futura futuras registro precos preco objeto atender demanda unidade material materiais conforme especificacao`.split(/\s+/));
const chavesDe = (t: string) => [...new Set((semAcento(t).match(/[a-z0-9]{3,}/g) ?? []).filter((p) => !PARADAS.has(p)))].slice(0, 6);

async function obter(url: string, ms = 15000): Promise<any> {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
      if (r.status === 204 || r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (t === 1) throw e;
      await new Promise((ok) => setTimeout(ok, 1200));
    }
  }
}

// ---------------------------------------------------------------- catálogo do Compras.gov.br (PDM de materiais e CATSER), publicado pelo site
const CATALOGO_URL = "https://renatogarciagestorp-cpu.github.io/licitaverso/catalogo-compras.json";
let catalogo: { pdm: [number, string, string][]; servico: [number, string, string][] } | null = null;
async function buscarCatalogo(texto: string, tipo: "material" | "servico") {
  if (!catalogo) catalogo = await (await fetch(CATALOGO_URL, { signal: AbortSignal.timeout(12000) })).json();
  const t = semAcento(texto).trim();
  const codigo = /^\d{3,9}$/.test(t) ? Number(t) : null;
  const chaves = chavesDe(texto);
  const raiz = (w: string) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2)));
  const raizes = chaves.map(raiz);
  const lista = tipo === "material" ? catalogo!.pdm : catalogo!.servico;
  const cand: { codigo: number; nome: string; p: number; ini: number; tam: number }[] = [];
  for (const [cod, nome] of lista) {
    if (codigo !== null) { if (cod === codigo) cand.push({ codigo: cod, nome, p: 99, ini: 1, tam: 0 }); continue; }
    const nm = semAcento(nome);
    if (nm.includes("inativo")) continue;
    const pal = nm.match(/[a-z0-9]+/g) ?? [];
    const p = raizes.filter((r) => pal.some((w) => w.startsWith(r))).length;
    if (!p) continue;
    cand.push({ codigo: cod, nome, p, ini: pal.length && raizes.some((r) => pal[0].startsWith(r)) ? 1 : 0, tam: pal.length });
  }
  cand.sort((a, b) => b.p - a.p || b.ini - a.ini || a.tam - b.tam);
  return cand.slice(0, 15).map((c) => ({ codigo: c.codigo, nome: c.nome, tipo }));
}

// ---------------------------------------------------------------- Painel de Preços (API de dados abertos do Compras.gov.br)
async function coletarCompras(codigo: number, tipo: "material" | "servico", uf: string, meses: number) {
  const fim = new Date(), ini = new Date(fim.getTime() - meses * 30.44 * 864e5);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const consulta = (est: string, pagina: number) => {
    const p = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: "100", dataCompraInicio: d(ini), dataCompraFim: d(fim) });
    if (est) p.set("estado", est);
    if (tipo === "material") { p.set("tipo", "codigoPdm"); p.set("codigo", String(codigo)); return `${COMPRAS}/1_consultarMaterial?${p}`; }
    p.set("codigoItemCatalogo", String(codigo)); return `${COMPRAS}/3_consultarServico?${p}`;
  };
  let linhas: any[] = [], abrangencia = "nacional", url = "";
  for (const est of uf ? [uf, ""] : [""]) {
    linhas = []; url = consulta(est, 1);
    for (let pg = 1; pg <= 3; pg++) {
      const j = (await obter(consulta(est, pg), 20000)) ?? {};
      const res = j.resultado ?? [];
      linhas.push(...res);
      if (!res.length || pg >= Number(j.totalPaginas ?? 1)) break;
    }
    abrangencia = est ? "estado" : "nacional";
    if (linhas.filter((r) => (num(r.precoUnitario) ?? 0) > 0).length >= 5 || !est) break;
  }
  const limite = d(ini);
  const registros = linhas.filter((r) => (num(r.precoUnitario) ?? 0) > 0 && String(r.dataCompra ?? r.dataResultado ?? "9").slice(0, 10) >= limite)
    .slice(0, 300).map((r) => ({
      id: "cg-" + String(r.idItemCompra ?? r.idCompra ?? crypto.randomUUID()),
      fonte: "painel", inciso: "I",
      preco: num(r.precoUnitario), quantidade: num(r.quantidade),
      unidade: String(r.siglaUnidadeFornecimento ?? r.nomeUnidadeFornecimento ?? r.siglaUnidadeMedida ?? r.nomeUnidadeMedida ?? "").trim(),
      data: String(r.dataCompra ?? r.dataResultado ?? "").slice(0, 10),
      orgao: String(r.nomeOrgao ?? r.nomeUasg ?? "").trim(), uasg: String(r.codigoUasg ?? ""), nomeUasg: String(r.nomeUasg ?? ""),
      uf: String(r.estado ?? r.siglaUf ?? ""), municipio: String(r.municipio ?? r.nomeMunicipio ?? ""),
      modalidade: MODALIDADE[String(r.modalidade ?? "")] ?? (r.modalidade ? "Modalidade " + r.modalidade : ""), forma: String(r.forma ?? ""),
      fornecedor: String(r.nomeFornecedor ?? ""), cnpj: String(r.niFornecedor ?? ""), marca: String(r.marca ?? ""),
      descricao: String(r.descricaoItem ?? r.descricaoDetalhadaItem ?? "").replace(/\s+/g, " ").slice(0, 400),
      codigoItem: r.codigoItemCatalogo ?? codigo, idCompra: String(r.idCompra ?? ""), numeroItem: r.numeroItemCompra ?? null,
    }));
  return { registros, consulta: url, abrangencia };
}

// ---------------------------------------------------------------- contratações similares no PNCP (preço homologado do item)
async function coletarPncp(descricao: string, uf: string, meses: number, limiteMs: number) {
  const chaves = chavesDe(descricao);
  if (!chaves.length) return [];
  const minimo = Math.min(2, chaves.length), inicio = Date.now();
  const desde = new Date(Date.now() - meses * 30.44 * 864e5).toISOString().slice(0, 10);
  const pontos = (t: string) => { const s = semAcento(t); return chaves.filter((c) => s.includes(c.slice(0, Math.max(4, c.length - 2)))).length; };
  const compras: any[] = [], vistos = new Set<string>();
  for (const u of uf ? [uf, ""] : [""]) {
    for (const n of [Math.min(3, chaves.length), 2, 1]) {
      if (Date.now() - inicio > limiteMs * 0.35) break;
      const p = new URLSearchParams({ q: chaves.slice(0, n).join(" "), tipos_documento: "edital", ordenacao: "-data", pagina: "1", tam_pagina: "30", status: "todos" });
      if (u) p.set("ufs", u);
      try {
        for (const h of ((await obter(`${PNCP}/api/search/?${p}`, 12000)) ?? {}).items ?? []) {
          const url = String(h.item_url ?? ""), m = url.match(/\/(\d{14})\/(\d{4})\/(\d+)/);
          if (!m || vistos.has(url)) continue;
          if (String(h.data_publicacao_pncp ?? "").slice(0, 10) < desde) continue;
          if (/revogad|anulad|cancelad|desert|fracassad/.test(semAcento(h.situacao_nome))) continue;
          vistos.add(url); compras.push({ h, cnpj: m[1], ano: m[2], seq: m[3], url });
        }
      } catch { /* PNCP fora do ar: segue */ }
      if (compras.length >= 12) break;
    }
    if (compras.length >= 6) break;
  }
  const registros: any[] = [];
  for (const c of compras.slice(0, 12)) {
    if (Date.now() - inicio > limiteMs) break;
    let itens: any[] = [];
    try { itens = (await obter(`${PNCP}/api/pncp/v1/orgaos/${c.cnpj}/compras/${c.ano}/${c.seq}/itens?pagina=1&tamanhoPagina=100`, 10000)) ?? []; } catch { itens = []; }
    const bons = (Array.isArray(itens) ? itens : []).map((it) => [pontos(it.descricao ?? ""), it] as [number, any]).filter(([p]) => p >= minimo)
      .sort((a, b) => b[0] - a[0]).slice(0, 3);
    for (const [, it] of bons) {
      if (Date.now() - inicio > limiteMs) break;
      let res: any[] = [];
      if (it.temResultado !== false) {
        try { res = (await obter(`${PNCP}/api/pncp/v1/orgaos/${c.cnpj}/compras/${c.ano}/${c.seq}/itens/${it.numeroItem}/resultados`, 8000)) ?? []; } catch { res = []; }
      }
      for (const r of (Array.isArray(res) ? res : []).slice(0, 2)) {
        const preco = num(r.valorUnitarioHomologado);
        if (!preco || preco <= 0) continue;
        registros.push({
          id: `pn-${c.cnpj}-${c.ano}-${c.seq}-${it.numeroItem}-${r.sequencialResultado ?? 1}`,
          fonte: "pncp", inciso: "II", preco, quantidade: num(r.quantidadeHomologada ?? it.quantidade),
          unidade: String(it.unidadeMedida ?? "").trim(), data: String(r.dataResultado ?? r.dataInclusao ?? c.h.data_publicacao_pncp ?? "").slice(0, 10),
          orgao: String(c.h.orgao_nome ?? ""), uf: String(c.h.uf ?? ""), municipio: String(c.h.municipio_nome ?? ""),
          modalidade: String(c.h.modalidade_licitacao_nome ?? ""), fornecedor: String(r.nomeRazaoSocialFornecedor ?? ""), cnpj: String(r.niFornecedor ?? ""),
          descricao: String(it.descricao ?? "").replace(/\s+/g, " ").slice(0, 400), numero: String(c.h.title ?? "").slice(0, 120),
          link: PNCP + "/app" + c.url.replace("/compras/", "/editais/"),
        });
      }
    }
  }
  return registros;
}

// ---------------------------------------------------------------- IA
async function chamarIA(chave: string, system: string, conteudo: unknown[], ferramenta: any, maxTokens = 4000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO_IA, max_tokens: maxTokens, system, messages: [{ role: "user", content: conteudo }], tools: [ferramenta], tool_choice: { type: "tool", name: ferramenta.name } }),
    signal: AbortSignal.timeout(120000),
  }).catch(() => null);
  if (!r || !r.ok) return { erro: "A IA não respondeu (" + (r ? r.status : "sem conexão") + "). Tente de novo em instantes." };
  const j = await r.json();
  const uso = j.usage ?? {};
  const bloco = (j.content ?? []).find((b: any) => b.type === "tool_use");
  if (!bloco) return { erro: "A IA não devolveu o resultado no formato esperado. Tente de novo." };
  return { dados: bloco.input, tokens: Number(uso.input_tokens ?? 0) + Number(uso.output_tokens ?? 0) };
}

const FERR_SIMILARES = {
  name: "avaliar_semelhanca",
  description: "Indica, para cada preço coletado, se o item é semelhante ao objeto pesquisado (mesma natureza, especificação e unidade compatíveis).",
  input_schema: { type: "object", properties: { avaliacao: { type: "array", items: { type: "object", properties: {
    id: { type: "string" }, semelhante: { type: "boolean" }, motivo: { type: "string", description: "uma frase curta: por que é ou não semelhante (especificação, unidade, embalagem, porte)" },
  }, required: ["id", "semelhante", "motivo"] } } }, required: ["avaliacao"] },
};

const FERR_RILC = {
  name: "regras_pesquisa_precos",
  description: "Extrai do regulamento interno de licitações e contratos da estatal as regras sobre pesquisa de preços e orçamento de referência.",
  input_schema: { type: "object", properties: {
    encontrado: { type: "boolean", description: "o regulamento trata da pesquisa de preços ou do orçamento de referência?" },
    parametros: { type: "array", items: { type: "object", properties: { fonte: { type: "string" }, prioridade: { type: "string" }, requisitos: { type: "string" }, dispositivo: { type: "string" } }, required: ["fonte", "dispositivo"] } },
    minimo_precos: { type: "string", description: "quantidade mínima de preços exigida, com o dispositivo; vazio se não houver" },
    validade_cotacoes: { type: "string", description: "prazo de validade das cotações/orçamentos, com o dispositivo; vazio se não houver" },
    metodo: { type: "string", description: "método de cálculo exigido (média, mediana, menor preço ou outro), com o dispositivo; vazio se não houver" },
    criterio_exclusao: { type: "string", description: "critério para desconsiderar preços inexequíveis ou excessivos, com o dispositivo; vazio se não houver" },
    obras: { type: "string", description: "regras para obras e serviços de engenharia (tabelas de referência, BDI), com o dispositivo; vazio se não houver" },
    sigilo: { type: "string", description: "regras sobre sigilo do orçamento, com o dispositivo; vazio se não houver" },
    observacoes: { type: "array", items: { type: "string" }, description: "outros pontos relevantes para a pesquisa (no máximo 6)" },
  }, required: ["encontrado", "parametros", "minimo_precos", "validade_cotacoes", "metodo", "criterio_exclusao", "obras", "sigilo", "observacoes"] },
};

async function testar(url: string) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json,text/html" }, signal: AbortSignal.timeout(25000) });
    await r.text();
    return { url, status: r.status, ms: Date.now() - t0 };
  } catch (e) { return { url, status: 0, ms: Date.now() - t0, erro: String((e as Error).message ?? e).slice(0, 160) }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);
  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao ?? "");
  const interno = segredoConfere(req);

  if (acao === "teste_fontes") {
    if (!interno) return erro("Não autorizado", 401);
    const ini = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), fim = new Date().toISOString().slice(0, 10);
    const urls = [
      `${COMPRAS}/1_consultarMaterial?pagina=1&tamanhoPagina=10&tipo=codigoPdm&codigo=4813&dataCompraInicio=${ini}&dataCompraFim=${fim}&estado=RJ`,
      `${COMPRAS}/3_consultarServico?pagina=1&tamanhoPagina=10&codigoItemCatalogo=5380&dataCompraInicio=${ini}&dataCompraFim=${fim}`,
      `${PNCP}/api/search/?q=papel%20a4&tipos_documento=edital&pagina=1&tam_pagina=5&status=todos`,
      `${PNCP}/api/consulta/v1/contratacoes/publicacao?dataInicial=20261001&dataFinal=20261002&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=10`,
      "https://www.caixa.gov.br/site/Paginas/downloads.aspx",
      "https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-e-pagamentos",
    ];
    const fontes = await Promise.all(urls.map(testar));
    let amostra: any = null;
    try { const c = await coletarCompras(4813, "material", "RJ", 12); amostra = { n: c.registros.length, primeiro: c.registros[0] ?? null }; } catch (e) { amostra = { erro: String(e) }; }
    let pncp: any = null;
    try { const r = await coletarPncp("papel sulfite A4 resma", "RJ", 12, 30000); pncp = { n: r.length, primeiro: r[0] ?? null }; } catch (e) { pncp = { erro: String(e) }; }
    return resposta({ fontes, amostra, pncp });
  }

  // ---------------------------------------------------------------- acesso
  const admin = clienteServico();
  let usuarioId = "";
  if (!interno) {
    const usuario = await usuarioDaRequisicao(req, admin);
    if (!usuario) return erro("Entre na sua conta para usar a pesquisa de preços.", 401);
    usuarioId = usuario.id;
    const { data: perfil } = await admin.from("perfis").select("admin").eq("id", usuario.id).maybeSingle();
    const ehAdmin = !!perfil?.admin && nivelDoToken(req) === "aal2";
    const { data: vigente } = await admin.rpc("plano_vigente", { uid: usuario.id });
    if (!ehAdmin && !PLANOS.has(String(vigente ?? ""))) return erro("A pesquisa de preços está nos planos Básico, Premium e Pro.", 403);
    const tipoUso = acao === "ia_similares" ? "ia_similares" : acao === "ia_rilc" ? "ia_rilc" : "coleta";
    if (!ehAdmin) {
      const desde = new Date(Date.now() - 24 * 3600e3).toISOString();
      const { count } = await admin.from("pesquisa_precos_usos").select("id", { count: "exact", head: true }).eq("usuario_id", usuario.id).eq("tipo", tipoUso).gte("criado_em", desde);
      if ((count ?? 0) >= LIMITE_DIA[tipoUso]) {
        return erro(tipoUso === "coleta" ? "Limite de consultas às bases públicas nas últimas 24 horas atingido. Tente mais tarde."
          : tipoUso === "ia_similares" ? "Limite diário do filtro por IA atingido (" + LIMITE_DIA.ia_similares + " por dia). Use o filtro manual ou tente amanhã."
          : "Limite diário de leitura do regulamento por IA atingido (" + LIMITE_DIA.ia_rilc + " por dia).", 429);
      }
    }
  }
  const registrarUso = async (tipo: string, tokens: number | null = null) => { if (usuarioId) await admin.from("pesquisa_precos_usos").insert({ usuario_id: usuarioId, tipo, tokens }); };
  const uf = String(corpo.uf ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  const ufOk = UFS.includes(uf) ? uf : "";
  const meses = Math.min(24, Math.max(3, Number(corpo.meses ?? 12) || 12));

  if (acao === "catalogo") {
    const texto = String(corpo.texto ?? "").slice(0, 200), tipo = corpo.tipo === "servico" ? "servico" : "material";
    if (texto.trim().length < 3) return erro("Digite ao menos 3 letras ou o código do catálogo.");
    try { return resposta({ itens: await buscarCatalogo(texto, tipo) }); } catch { return erro("O catálogo não respondeu. Tente de novo.", 502); }
  }

  if (acao === "coletar") {
    const codigo = Number(corpo.codigo), tipo = corpo.tipo === "servico" ? "servico" : "material";
    if (!Number.isFinite(codigo) || codigo <= 0) return erro("Escolha o item do catálogo antes de buscar os preços.");
    await registrarUso("coleta");
    try { return resposta(await coletarCompras(codigo, tipo, ufOk, meses)); }
    catch (e) { return erro("O Compras.gov.br não respondeu (" + String((e as Error).message ?? e).slice(0, 60) + "). Tente de novo em instantes.", 502); }
  }

  if (acao === "pncp") {
    const descricao = String(corpo.descricao ?? "").slice(0, 300);
    if (chavesDe(descricao).length < 1) return erro("Descreva o item para buscar contratações similares.");
    await registrarUso("coleta");
    try { return resposta({ registros: await coletarPncp(descricao, ufOk, meses, 45000) }); }
    catch (e) { return erro("O PNCP não respondeu (" + String((e as Error).message ?? e).slice(0, 60) + ").", 502); }
  }

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if ((acao === "ia_similares" || acao === "ia_rilc") && !chave) return erro("A IA está indisponível no momento.", 503);

  if (acao === "ia_similares") {
    const descricao = String(corpo.descricao ?? "").slice(0, 600), unidade = String(corpo.unidade ?? "").slice(0, 40);
    const regs = (Array.isArray(corpo.registros) ? corpo.registros : []).slice(0, 80)
      .map((r: any) => ({ id: String(r.id ?? "").slice(0, 80), descricao: String(r.descricao ?? "").slice(0, 300), unidade: String(r.unidade ?? "").slice(0, 30), preco: num(r.preco) }))
      .filter((r: any) => r.id);
    if (!descricao.trim() || !regs.length) return erro("Informe a descrição do item e colete os preços antes de filtrar.");
    const system = "Você apoia a pesquisa de preços da fase de planejamento de contratações públicas (Lei 14.133/2021, art. 23; IN SEGES/ME 65/2021). " +
      "Sua tarefa é só dizer se cada item coletado corresponde ao objeto pesquisado: mesma natureza, especificação essencial compatível e unidade de fornecimento comparável. " +
      "Não avalie se o preço é alto ou baixo (o tratamento estatístico é feito pelo sistema). Na dúvida por falta de descrição, marque como não semelhante e diga que falta especificação.";
    const texto = `OBJETO PESQUISADO: ${descricao}\nUNIDADE: ${unidade || "não informada"}\n\nITENS COLETADOS (id | unidade | descrição):\n` + regs.map((r: any) => `${r.id} | ${r.unidade} | ${r.descricao || "(sem descrição)"}`).join("\n");
    const r = await chamarIA(chave!, system, [{ type: "text", text: texto }], FERR_SIMILARES, 6000);
    if (r.erro) return erro(r.erro, 502);
    await registrarUso("ia_similares", r.tokens ?? null);
    return resposta({ avaliacao: (r.dados?.avaliacao ?? []).filter((a: any) => regs.some((x: any) => x.id === a.id)), modelo: MODELO_IA });
  }

  if (acao === "ia_rilc") {
    const arquivo = String(corpo.arquivo ?? ""), texto = String(corpo.texto ?? "").slice(0, 150000);
    const conteudo: unknown[] = [];
    if (arquivo) {
      if (!usuarioId || !arquivo.startsWith(usuarioId + "/pp/") || arquivo.includes("..") || !/\.pdf$/i.test(arquivo)) return erro("Arquivo do regulamento inválido. Envie em PDF.");
      const { data: blob, error: eDown } = await admin.storage.from("analises").download(arquivo);
      if (eDown || !blob) return erro("Não foi possível ler o arquivo do regulamento. Envie de novo.");
      if (blob.size > 20 * 1024 * 1024) return erro("O arquivo do regulamento passa de 20 MB.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
      conteudo.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: btoa(bin) } });
    } else if (texto.trim().length >= 200) {
      conteudo.push({ type: "text", text: "TEXTO DO REGULAMENTO:\n" + texto });
    } else return erro("Envie o regulamento em PDF ou cole o trecho sobre pesquisa de preços (ao menos 200 caracteres).");
    conteudo.push({ type: "text", text: "Extraia as regras de pesquisa de preços e de orçamento de referência deste regulamento interno de licitações e contratos (art. 40 da Lei 13.303/2016). Cite o artigo de cada regra. Não invente regra que não esteja no texto: se o regulamento não tratar de um ponto, deixe o campo vazio." });
    const system = "Você é especialista em licitações de empresas estatais (Lei 13.303/2016). Extraia apenas o que está escrito no regulamento enviado, sempre com o dispositivo (artigo, parágrafo, inciso).";
    const r = await chamarIA(chave!, system, conteudo, FERR_RILC, 4000);
    if (r.erro) return erro(r.erro, 502);
    await registrarUso("ia_rilc", r.tokens ?? null);
    return resposta({ regras: r.dados, modelo: MODELO_IA });
  }

  return erro("Ação desconhecida.");
});
