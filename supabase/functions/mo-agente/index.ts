// Calculadora → Mão de Obra Exclusiva: o agente lê a convenção coletiva enviada e preenche a planilha da IN 05/2017.
// Exclusivo do plano Pro (e administradores). Limite diário por pessoa (custo de API).
// POST { modo: "planejamento" | "repactuacao", arquivo: "<uid>/mo/<nome>.pdf", dados: { ...campos da planilha } }
//   -> { campos: [{ campo, valor, fonte }], observacoes: [], falhas: [{ rubrica, problema, fundamento, correcao, gravidade }] }

import { clienteServico, CORS, erro, resposta, usuarioDaRequisicao } from "../_shared/comum.ts";

const MODELO = Deno.env.get("AGENTE_MODELO") || "claude-sonnet-5-5";
const LIMITE_DIA = 10;

// campos que o agente pode preencher (as chaves da planilha do site)
const CAMPOS_PLANEJAMENTO: Record<string, string> = {
  salario: "salário-base (piso) da categoria, em R$", categoria: "categoria profissional (texto)", cbo: "CBO (texto, ex.: 5143-20)",
  data_base: "data-base da categoria (dd/mm/aaaa)", ano_cct: "ano do instrumento coletivo",
  peric: "adicional de periculosidade, % sobre o salário-base", insal: "adicional de insalubridade, % sobre o salário-base (ajuste se a base da convenção for o salário mínimo)",
  noturno: "adicional noturno, R$ por mês", hnr: "adicional de hora noturna reduzida, R$ por mês", he_feriado: "hora extra em feriado trabalhado, R$ por mês",
  outros1: "outras parcelas remuneratórias da convenção, R$ por mês",
  p13: "13º salário, %", pfa: "férias e adicional de férias, %",
  inss: "INSS, %", saled: "salário-educação, %", rat: "alíquota RAT, % (1, 2 ou 3, pelo CNAE da atividade)", sesc: "SESC ou SESI, %", senac: "SENAI ou SENAC, %",
  sebrae: "SEBRAE, %", incra: "INCRA, %", fgts: "FGTS, %",
  vt_tarifa: "tarifa do transporte público do município, R$", vt_viagens: "viagens por dia", dias: "dias trabalhados no mês",
  aux_dia: "auxílio-alimentação/refeição por dia, R$ (convenção)", aux_part: "participação do empregado no auxílio, %",
  assist: "assistência médica/odontológica/familiar, R$ por mês (convenção)", seguro: "seguro de vida, R$ por mês (convenção)",
  outros23: "outros benefícios mensais da convenção, R$ por mês",
  api: "aviso prévio indenizado, %", apt: "aviso prévio trabalhado, % (1º ano: até 1,94%)",
  ferias: "férias do substituto (Módulo 4), %", aus: "ausências legais, %", pat: "licença-paternidade, %", acid: "ausência por acidente de trabalho, %",
  mat: "afastamento maternidade, %", outros41: "outras ausências, %", intra: "intervalo intrajornada, % (quando não usufruído e indenizado)",
  unif: "uniformes, R$ por empregado por mês (se a convenção fixar quantidade ou valor)",
};
// Na repactuação, o agente reproduz a planilha da contratação (enviada em PDF ou Excel) e aplica as adequações
const CAMPOS_REPACTUACAO: Record<string, string> = {
  ...CAMPOS_PLANEJAMENTO,
  apt: "aviso prévio trabalhado, % (custo não renovável: no máximo 0,194% por ano de prorrogação)",
  api: "aviso prévio indenizado, %",
  unif: "uniformes/EPI, R$ por empregado por mês (valor da planilha da contratação, sem reajuste; zere ou reduza se for custo não renovável já amortizado)",
  materiais: "materiais, R$ por empregado por mês (valor da planilha da contratação, sem reajuste)",
  equip: "equipamentos, R$ por empregado por mês (valor da planilha da contratação, sem reajuste; zere ou reduza a depreciação já concluída)",
  outros5: "outros insumos, R$ por empregado por mês (valor da planilha da contratação)",
  fap: "FAP (fator, ex.: 0.843)",
  ci: "custos indiretos, % (da planilha da contratação)", lucro: "lucro, % (da planilha da contratação)",
  pis: "PIS, %", cofins: "COFINS, %", iss: "ISS, %",
  emp_posto: "empregados por posto", postos: "quantidade de postos", meses: "meses de execução",
  tipo_servico: "tipo de serviço (texto)", municipio: "município (texto)", uf: "UF (texto)",
  vigente: "preço total por empregado na planilha da contratação (antes da repactuação), R$",
};

const REGRAS = `Planilha de custos e formação de preços da IN SEGES/MP nº 5/2017, Anexo VII-D (com a redação da IN nº 7/2018), para serviço com dedicação exclusiva de mão de obra.
Estrutura: Módulo 1 (remuneração), Módulo 2 (2.1 13º e férias; 2.2 GPS, FGTS e outras contribuições, incidindo sobre Módulo 1 + 2.1 + Módulo 4; 2.3 benefícios), Módulo 3 (provisão para rescisão), Módulo 4 (reposição do profissional ausente), Módulo 5 (insumos), Módulo 6 (custos indiretos, tributos e lucro).
Fontes a observar: a convenção/acordo coletivo enviado (piso da categoria, adicionais, vale-transporte, auxílio-alimentação e participação, assistência médica, seguro de vida, uniforme, data-base); CLT; Lei 7.418/1985 (vale-transporte, desconto de até 6% do salário-base); Lei 8.036/1990 (FGTS 8%); Lei 8.212/1991 (INSS 20%; RAT 1%, 2% ou 3% pelo grau de risco da atividade, multiplicado pelo FAP); Decreto-Lei 1.422/1975 (salário-educação 2,5%); SESC/SESI 1,5%; SENAC/SENAI 1%; SEBRAE 0,6%; INCRA 0,2%; Lei 12.506/2011 (aviso prévio proporcional); NR-15 (insalubridade 10%, 20% ou 40%) e NR-16 (periculosidade 30%); cadernos técnicos de serviços terceirizados do Ministério da Gestão (Compras.gov.br) para os percentuais de ausências legais, licença-paternidade, acidente de trabalho e maternidade; jurisprudência do TCU: Acórdão 1.904/2007-Plenário e Acórdão 1.186/2017-Plenário (aviso prévio trabalhado de no máximo 1,94% no 1º ano e 0,194% a cada ano de prorrogação; custo não renovável), Acórdão 3.006/2010-Plenário (exclusão do aviso prévio trabalhado após o 1º ano), e o art. 57 da IN 05/2017 (na repactuação, excluem-se os custos não renováveis já pagos ou amortizados no primeiro ano).`;

const FERRAMENTA = (campos: Record<string, string>, comFalhas: boolean) => ({
  name: "preencher_planilha",
  description: "Devolve os valores da planilha, cada um com a fonte (cláusula da convenção, lei, caderno técnico ou acórdão).",
  input_schema: {
    type: "object",
    properties: {
      campos: { type: "array", items: { type: "object", properties: {
        campo: { type: "string", enum: Object.keys(campos) },
        valor: { type: "string", description: "número com ponto decimal (percentual sem o símbolo %; valor em reais sem R$), ou texto nos campos de texto" },
        fonte: { type: "string", description: "de onde veio: cláusula e página da convenção, artigo da lei, caderno técnico ou acórdão, em uma frase" },
      }, required: ["campo", "valor", "fonte"] } },
      observacoes: { type: "array", items: { type: "string" }, description: "pontos de atenção para quem confere a planilha (no máximo 6)" },
      ...(comFalhas ? { falhas: { type: "array", maxItems: 25, description: "falhas de preenchimento e inconsistências encontradas na planilha da contratação, uma por item", items: { type: "object", properties: {
        rubrica: { type: "string", description: "módulo e rubrica, ex.: Submódulo 2.2, C – SAT" },
        problema: { type: "string", description: "o que está errado na planilha da contratação, com os valores encontrados" },
        fundamento: { type: "string", description: "norma, cláusula da convenção, caderno técnico ou acórdão que fundamenta, com número e ano" },
        correcao: { type: "string", description: "o caminho correto: como deve ser preenchido, com o percentual ou valor e a base de cálculo" },
        impacto: { type: "string", description: "efeito de manter a falha nos valores da repactuação: se aumenta ou reduz o preço e, quando possível, a estimativa em R$ por empregado por mês" },
        gravidade: { type: "string", enum: ["alta", "media", "baixa"], description: "alta: afeta o preço ou é vedado; media: afeta pouco o preço; baixa: forma ou transparência" },
      }, required: ["rubrica", "problema", "fundamento", "correcao", "gravidade"] } } } : {}),
      iss: { type: "object", description: "alíquota do ISS do município onde o serviço será prestado", properties: {
        encontrado: { type: "boolean", description: "true só se a alíquota foi confirmada em fonte oficial do município (lei, código tributário ou anexo) " },
        aliquota: { type: ["number", "null"], description: "percentual, entre 2 e 5 (LC 116/2003, arts. 8º e 8º-A)" },
        item_lc116: { type: "string", description: "item da lista anexa à LC 116/2003, ex.: 7.10 (limpeza e conservação), 11.02 (vigilância), 17.05 (fornecimento de mão de obra)" },
        fonte: { type: "string", description: "lei municipal e artigo/anexo, com o endereço da página oficial consultada" } },
        required: ["encontrado", "aliquota", "item_lc116", "fonte"] },
    },
    required: comFalhas ? ["campos", "observacoes", "falhas", "iss"] : ["campos", "observacoes", "iss"],
  },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);
  const admin = clienteServico();
  const usuario = await usuarioDaRequisicao(req, admin);
  if (!usuario) return erro("Entre na sua conta para continuar.", 401);

  const { data: perfil } = await admin.from("perfis").select("admin").eq("id", usuario.id).maybeSingle();
  const { data: vigente } = await admin.rpc("plano_vigente", { uid: usuario.id });
  if (!perfil?.admin && vigente !== "pro") return erro("O preenchimento pelo agente é exclusivo do plano Pro.", 403);

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return erro("O agente está indisponível no momento. Tente mais tarde.", 503);

  const corpo = await req.json().catch(() => ({}));
  const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

  const modo = corpo.modo === "repactuacao" ? "repactuacao" : "planejamento";
  const dados0 = corpo.dados && typeof corpo.dados === "object" ? corpo.dados as Record<string, unknown> : {};
  const munServ = String(dados0.municipio ?? "").trim().slice(0, 80), ufServ = String(dados0.uf ?? "").toUpperCase().trim();
  if (!munServ || !UFS.includes(ufServ)) return erro("Antes da análise, informe o município e a UF onde o serviço será prestado.");
  const reforma = String(dados0.reforma ?? "");
  if (!["antes", "depois"].includes(reforma)) return erro("Antes da análise, escolha se os tributos devem ser calculados antes ou depois da reforma tributária.");
  const regime = ["real", "presumido", "simples"].includes(String(dados0.regime)) ? String(dados0.regime) : "real";
  const okPdf = (c: string) => c.startsWith(usuario.id + "/mo/") && !c.includes("..") && /\.pdf$/i.test(c);
  const arquivo = String(corpo.arquivo ?? "");             // convenção coletiva (na repactuação: a nova, opcional)
  const planArq = String(corpo.planilha_arquivo ?? "");    // repactuação: planilha da contratação em PDF
  const planTexto = String(corpo.planilha_texto ?? "").slice(0, 120000);  // repactuação: planilha em Excel, convertida em texto no navegador
  if (!okPdf(arquivo)) return erro(modo === "repactuacao" ? "Envie a nova convenção coletiva em PDF: ela é obrigatória para a análise da repactuação." : "Envie a convenção coletiva em PDF.");
  if (modo === "repactuacao" && !okPdf(planArq) && planTexto.trim().length < 50) return erro("Envie a planilha utilizada na contratação, em PDF ou Excel.");
  if (arquivo && !okPdf(arquivo)) return erro("Arquivo da convenção inválido.");
  if (planArq && !okPdf(planArq)) return erro("Arquivo da planilha inválido.");

  const desde = new Date(Date.now() - 864e5).toISOString();
  const { count } = await admin.from("mo_preenchimentos").select("id", { count: "exact", head: true }).eq("usuario_id", usuario.id).gte("criado_em", desde);
  if ((count ?? 0) >= LIMITE_DIA) return erro("Limite diário de preenchimentos pelo agente atingido. Tente de novo amanhã.", 429);

  const lerPdf = async (caminho: string, nome: string): Promise<string | Response> => {
    const { data: blob, error: eDown } = await admin.storage.from("analises").download(caminho);
    if (eDown || !blob) return erro(`Não foi possível ler o arquivo da ${nome}. Envie de novo.`);
    if (blob.size > 20 * 1024 * 1024) return erro(`O arquivo da ${nome} passa de 20 MB.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(bin);
  };
  const docs: { titulo: string; pdf: string }[] = [];
  if (planArq) { const x = await lerPdf(planArq, "planilha"); if (x instanceof Response) return x; docs.push({ titulo: "PLANILHA DA CONTRATAÇÃO", pdf: x }); }
  if (arquivo) { const x = await lerPdf(arquivo, "convenção"); if (x instanceof Response) return x; docs.push({ titulo: modo === "repactuacao" ? "NOVA CONVENÇÃO COLETIVA" : "CONVENÇÃO COLETIVA", pdf: x }); }

  await admin.from("mo_preenchimentos").insert({ usuario_id: usuario.id, modo });

  const campos = modo === "repactuacao" ? CAMPOS_REPACTUACAO : CAMPOS_PLANEJAMENTO;
  const dados = corpo.dados && typeof corpo.dados === "object" ? corpo.dados as Record<string, unknown> : {};
  const linhasDados = Object.entries(dados).filter(([k, v]) => /^[a-z0-9_]{1,20}$/.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim() && k !== "cct_arquivo")
    .slice(0, 80).map(([k, v]) => `- ${k}: ${String(v).slice(0, 120)}`).join("\n");
  // ISS: o agente busca a alíquota do município onde o serviço será prestado; se não confirmar em fonte oficial, o site pede ao assinante
  const blocoIss = `ISS: o serviço será prestado em ${munServ}/${ufServ}. Pesquise com a ferramenta de busca a alíquota do ISS desse município para o item da LC 116/2003 que corresponde ao serviço (prefira o código tributário municipal, a lei do ISS ou o site oficial da prefeitura). Se não confirmar em fonte oficial, devolva encontrado = false e aliquota = null (não use 5% como padrão). Depois da pesquisa, chame obrigatoriamente a ferramenta preencher_planilha.`;
  // regime de tributação e momento da reforma tributária escolhidos pelo assinante (o site calcula CBS, IBS e a transição)
  const regNome = { real: "Lucro Real (PIS/COFINS não cumulativos: valem as alíquotas efetivas, Acórdão 2.647/2009-TCU-Plenário)", presumido: "Lucro Presumido (PIS 0,65% e COFINS 3%, cumulativos)", simples: "Simples Nacional, Anexo IV (permitido só para vigilância, limpeza ou conservação: LC 123/2006, art. 17, XII, e art. 18, §§ 5º-C e 5º-H; sem contribuições a terceiros no Submódulo 2.2, art. 13, § 3º; INSS patronal e RAT fora do DAS)" }[regime];
  const blocoTrib = `TRIBUTAÇÃO: regime de tributação informado: ${regNome}. O assinante escolheu calcular os tributos ${reforma === "depois" ? "DEPOIS da reforma tributária (EC 132/2023 e LC 214/2025): o site calcula sozinho CBS, IBS e o período de transição a partir dos Módulos 1 a 5; não crie campos de CBS ou IBS" : "ANTES da reforma tributária (PIS, COFINS e ISS)"}. Considere o regime ao preencher e ao apontar falhas (ex.: Simples em serviço vedado, contribuições a terceiros cobradas por optante do Simples, PIS/COFINS nominais no Lucro Real sem comprovação da alíquota efetiva).`;
  const tarefa = modo === "repactuacao"
    ? `REPACTUAÇÃO (Planilha 2). Você recebe a planilha de custos utilizada na contratação e a nova convenção coletiva. Tarefa: (1) reproduza nos campos os valores e percentuais da planilha da contratação, rubrica por rubrica, e informe em "vigente" o preço total por empregado dessa planilha; (2) atualize o que decorre da nova convenção (salário-base, adicionais, auxílio-alimentação e participação, assistência médica, seguro de vida e demais benefícios), citando a cláusula; (3) faça a análise dos custos NÃO RENOVÁVEIS para o ano de execução informado (ano_exec): suprima ou reduza o que já foi pago ou amortizado no 1º ano (art. 57 da IN 05/2017), como o aviso prévio trabalhado (no máximo 0,194% por ano de prorrogação; Acórdão 1.186/2017-TCU-Plenário) e as incidências sobre ele, e equipamentos ou kits iniciais já amortizados, começando a fonte por "Não renovável:". NÃO reajuste insumos por índice (isso é feito à parte pelo sistema). Nos campos sem informação na planilha, não invente: omita o campo. (4) Como a planilha da contratação foi elaborada por terceiros, examine-a e liste em "falhas" cada erro de preenchimento ou inconsistência: percentuais ou bases de cálculo diferentes dos legais, da convenção ou dos cadernos técnicos, rubricas que faltam ou sobram, custos vedados (ex.: IRPJ e CSLL na planilha, Súmula TCU 254), contas que não fecham, benefício em desacordo com a convenção, tributos incompatíveis com o regime, incidências em duplicidade, entre outros. Para cada falha, indique o fundamento, o caminho correto e o impacto de mantê-la nos valores da repactuação, e já aplique a correção nos campos da planilha repactuada (fonte começando por "Correção:"); o campo "vigente" continua com o preço da planilha original. Se não houver falhas, devolva a lista vazia.`
    : `PLANEJAMENTO (Planilha 1). Preencha a planilha do profissional da categoria indicada a partir da convenção enviada e das normas: piso da categoria, adicionais, benefícios (com a participação do empregado), encargos e percentuais dos Módulos 2, 3 e 4. Para cada valor, indique a fonte. Se a convenção não tratar de um item, use o percentual legal ou do caderno técnico e diga isso na fonte. Não preencha custos indiretos, lucro nem tributos.`;
  const system = `Você é especialista em custos de serviços terceirizados com dedicação exclusiva de mão de obra na administração pública. ${REGRAS}
${tarefa}
${blocoTrib}
${blocoIss}
Use apenas o que está na convenção enviada e nas normas citadas; nunca invente cláusula, valor ou acórdão. Valores mensais por empregado. Campos disponíveis: ${Object.entries(campos).map(([k, v]) => `${k} (${v})`).join("; ")}.`;

  const mensagens = [{ role: "user", content: [
        ...docs.flatMap((x) => [{ type: "text", text: x.titulo + ":" }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: x.pdf } }]),
        ...(planTexto.trim() ? [{ type: "text", text: "PLANILHA DA CONTRATAÇÃO (Excel convertido em texto; cada linha é uma linha da planilha, colunas separadas por |):\n" + planTexto }] : []),
        { type: "text", text: `DADOS JÁ INFORMADOS NA PLANILHA DO SITE:\n${linhasDados || "(nenhum)"}` },
      ] }];
  const chamar = (comBusca: boolean) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO, max_tokens: 9000, system, messages: mensagens,
      tools: comBusca ? [FERRAMENTA(campos, modo === "repactuacao"), { type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "BR" } }]
        : [FERRAMENTA(campos, modo === "repactuacao")],
      tool_choice: comBusca ? { type: "auto" } : { type: "tool", name: "preencher_planilha" },
    }),
    signal: AbortSignal.timeout(140000),
  }).catch(() => null);
  let resp = await chamar(true);
  if (resp && resp.status === 400) {  // busca na internet indisponível na conta da API: segue sem ela (ISS fica para o assinante)
    console.log("mo-agente: busca indisponível, seguindo sem ela:", (await resp.text().catch(() => "")).slice(0, 200));
    resp = await chamar(false);
  }
  if (!resp || !resp.ok) {
    console.log("mo-agente indisponível:", resp ? resp.status + " " + (await resp.text().catch(() => "")).slice(0, 300) : "sem resposta");
    return erro("O agente não conseguiu analisar a convenção agora. Tente de novo em alguns minutos.", 502);
  }
  const j = await resp.json().catch(() => ({}));
  const bloco = (j.content ?? []).find((c: any) => c.type === "tool_use" && c.name === "preencher_planilha");
  if (!bloco) { console.log("mo-agente: resposta sem preenchimento", j.stop_reason); return erro("O agente não concluiu a análise. Tente de novo em alguns minutos.", 502); }
  const saida = ((bloco?.input?.campos ?? []) as any[]).filter((c) => campos[c?.campo]).slice(0, 90).map((c) => ({
    campo: String(c.campo), valor: String(c.valor ?? "").slice(0, 120), fonte: String(c.fonte ?? "").slice(0, 300),
  }));
  const observacoes = ((bloco?.input?.observacoes ?? []) as unknown[]).slice(0, 6).map((o) => String(o).slice(0, 400));
  const falhas = ((bloco?.input?.falhas ?? []) as any[]).slice(0, 25).map((f) => ({
    rubrica: String(f?.rubrica ?? "").slice(0, 160), problema: String(f?.problema ?? "").slice(0, 600), fundamento: String(f?.fundamento ?? "").slice(0, 400),
    correcao: String(f?.correcao ?? "").slice(0, 600), impacto: String(f?.impacto ?? "").slice(0, 400), gravidade: ["alta", "media", "baixa"].includes(f?.gravidade) ? f.gravidade : "media",
  })).filter((f) => f.problema);
  const iA = bloco?.input?.iss ?? {};
  let iss = { encontrado: !!iA.encontrado && Number(iA.aliquota) >= 2 && Number(iA.aliquota) <= 5, aliquota: Number(iA.aliquota) || null,
    item: String(iA.item_lc116 ?? "").slice(0, 10), fonte: String(iA.fonte ?? "").slice(0, 300), municipio: munServ, uf: ufServ };
  if (!iss.encontrado) iss = { ...iss, aliquota: null };
  return resposta({ campos: saida.filter((c) => c.campo !== "iss"), observacoes, falhas, iss });
});
