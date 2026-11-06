// Calculadora → Mão de Obra Exclusiva: o agente lê a convenção coletiva enviada e preenche a planilha da IN 05/2017.
// Exclusivo do plano Pro (e administradores). Franquia semanal por assinatura: 1 por modelo (custo de API).
// POST { modo: "planejamento" | "repactuacao" | "proposta", arquivo: "<uid>/mo/<nome>.pdf", dados: { ...campos da planilha } }
//   -> { campos: [{ campo, valor, fonte }], observacoes: [], falhas: [{ rubrica, problema, fundamento, correcao, gravidade }] }

import { clienteServico, CORS, erro, nivelDoToken, resposta, usuarioDaRequisicao } from "../_shared/comum.ts";

const MODELO = Deno.env.get("AGENTE_MODELO") || "claude-sonnet-5-5";
// franquia semanal por assinatura (individual ou de equipe): 1 de cada modelo por semana
const LIMITE_SEMANA = 1;
const NOME_MODO: Record<string, string> = { planejamento: "elaboração de planilha (Planilha 1)", repactuacao: "análise de repactuação (Planilha 2)", proposta: "análise de proposta (Planilha 3)" };
// segunda-feira 00:00 no horário de Brasília (UTC−3)
const inicioSemanaBR = () => { const br = new Date(Date.now() - 3 * 3600e3); const dia = (br.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - dia, 3, 0, 0)); };

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
  aux_dia: "auxílio-alimentação por dia, R$ (convenção; se a convenção prevê só um auxílio, use este campo)", aux_part: "participação do empregado no auxílio-alimentação, %",
  ref_dia: "auxílio-refeição por dia, R$ – só quando a convenção prevê os dois auxílios (alimentação e refeição)", ref_part: "participação do empregado no auxílio-refeição, %",
  assist: "assistência médica/odontológica/familiar, R$ por mês (convenção)", seguro: "seguro de vida, R$ por mês (convenção)",
  outros23: "outros benefícios mensais da convenção, R$ por mês",
  api: "aviso prévio indenizado, %", apt: "aviso prévio trabalhado, % (1º ano: até 1,94%)",
  ferias: "férias do substituto (Módulo 4), %", aus: "ausências legais, %", pat: "licença-paternidade, %", acid: "ausência por acidente de trabalho, %",
  mat: "afastamento maternidade, %", outros41: "outras ausências, %", intra: "intervalo intrajornada, % (quando não usufruído e indenizado)",
  unif: "uniformes, R$ por empregado por mês (se a convenção fixar quantidade ou valor)",
};
// percentuais do Módulo 3 exatamente como estão na planilha da empresa (sem corrigir), para a conferência automática do site
const CAMPOS_M3_EMPRESA: Record<string, string> = {
  inf_api: "Módulo 3, A – aviso prévio indenizado, % EXATAMENTE como está na planilha da empresa (sem corrigir)",
  inf_fgts_api: "Módulo 3, B – incidência do FGTS sobre o aviso prévio indenizado, % como está na planilha da empresa",
  inf_multa_api: "Módulo 3, C – multa do FGTS (e contribuição social, se houver), % como está na planilha da empresa",
  inf_apt: "Módulo 3, D – aviso prévio trabalhado, % como está na planilha da empresa (sem a correção dos custos não renováveis)",
  inf_inc_apt: "Módulo 3, E – incidência do Submódulo 2.2 sobre o aviso prévio trabalhado, % como está na planilha da empresa",
  inf_multa_apt: "Módulo 3, F – multa do FGTS sobre o aviso prévio trabalhado, % como está na planilha da empresa",
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
  rp_contrato: "número do contrato (texto, como aparece na planilha ou no cabeçalho; omita se não houver)",
  rp_orgao: "contratante – órgão ou entidade (texto; omita se não houver)", rp_empresa: "contratada – razão social da empresa (texto; omita se não houver)",
  ...CAMPOS_M3_EMPRESA,
};

// Na análise da proposta, o agente reproduz a planilha da licitante tal como apresentada (sem corrigir) e aponta as falhas
const CAMPOS_PROPOSTA: Record<string, string> = {
  ...CAMPOS_REPACTUACAO,
  apt: "aviso prévio trabalhado, % (como está na proposta)",
  unif: "uniformes/EPI, R$ por empregado por mês (como está na proposta)", materiais: "materiais, R$ por empregado por mês (como está na proposta)",
  equip: "equipamentos, R$ por empregado por mês (como está na proposta)", outros5: "outros insumos, R$ por empregado por mês (como está na proposta)",
  ci: "custos indiretos, % (da proposta)", lucro: "lucro, % (da proposta)",
  vigente: "preço total por empregado ofertado na planilha da proposta, R$",
};
delete CAMPOS_PROPOSTA.rp_contrato; delete CAMPOS_PROPOSTA.rp_orgao; delete CAMPOS_PROPOSTA.rp_empresa;
const REGRAS = `Planilha de custos e formação de preços da IN SEGES/MP nº 5/2017, Anexo VII-D (com a redação da IN nº 7/2018), para serviço com dedicação exclusiva de mão de obra.
Estrutura: Módulo 1 (remuneração), Módulo 2 (2.1 13º e férias; 2.2 GPS, FGTS e outras contribuições, incidindo sobre Módulo 1 + 2.1 + Módulo 4; 2.3 benefícios), Módulo 3 (provisão para rescisão), Módulo 4 (reposição do profissional ausente), Módulo 5 (insumos), Módulo 6 (custos indiretos, tributos e lucro).
Férias: o site usa o modelo em que o Submódulo 2.1, B traz só o adicional de 1/3 (2,78%) e a remuneração das férias (8,33%) fica no Módulo 4, A (substituto nas férias); campo pfa = 2,78. Na repactuação de contrato prorrogado, a parcela de férias do Submódulo 2.1 é custo não renovável (IN 05/2017, Anexo VII-D, Submódulo 2.1, nota 3; Nota Informativa nº 17408/2018-MP): planilha com 12,10% ou 11,11% no Submódulo 2.1, B e 8,33% no Módulo 4, A paga as férias duas vezes (falha alta); nunca proponha 11,11% ou 12,10% no 2.1, B quando o Módulo 4, A tiver as férias. Multa do FGTS: 40% (a contribuição social de 10% da LC 110/2001 foi extinta pela Lei 13.932/2019 a partir de 1º/1/2020; planilha que ainda some 50% tem falha). Módulo 3, C, pelo modelo dos cadernos técnicos da SEGES: multa sobre todos os depósitos do contrato = 8% × 40% × 90% × (1 + 5/56 + 5/56 + 5/168) ≈ 3,48% do Módulo 1. Módulo 3, F = 40% × 8% × aviso prévio trabalhado. Conta-depósito vinculada: retenção de 4% para a multa do FGTS.
Fontes a observar: a convenção/acordo coletivo enviado (piso da categoria, adicionais, vale-transporte, auxílio-alimentação e participação, assistência médica, seguro de vida, uniforme, data-base); CLT; Lei 7.418/1985 (vale-transporte, desconto de até 6% do salário-base); Lei 8.036/1990 (FGTS 8%); Lei 8.212/1991 (INSS 20%; RAT 1%, 2% ou 3% pelo grau de risco da atividade, multiplicado pelo FAP); Decreto-Lei 1.422/1975 (salário-educação 2,5%); SESC/SESI 1,5%; SENAC/SENAI 1%; SEBRAE 0,6%; INCRA 0,2%; Lei 12.506/2011 (aviso prévio proporcional); NR-15 (insalubridade 10%, 20% ou 40%) e NR-16 (periculosidade 30%); cadernos técnicos de serviços terceirizados do Ministério da Gestão (Compras.gov.br) para os percentuais de ausências legais, licença-paternidade, acidente de trabalho e maternidade; jurisprudência do TCU: Acórdão 1.904/2007-Plenário e Acórdão 1.186/2017-Plenário (aviso prévio trabalhado de no máximo 1,94% no 1º ano e 0,194% a cada ano de prorrogação; custo não renovável), Acórdão 3.006/2010-Plenário (exclusão do aviso prévio trabalhado após o 1º ano), e o art. 57 da IN 05/2017 (na repactuação, excluem-se os custos não renováveis já pagos ou amortizados no primeiro ano).`;

const FERRAMENTA = (campos: Record<string, string>, comFalhas: boolean, proposta = false) => ({
  name: "preencher_planilha",
  description: "Devolve os valores da planilha, cada um com a fonte (cláusula da convenção, lei, caderno técnico ou acórdão).",
  input_schema: {
    type: "object",
    properties: {
      campos: { type: "array", items: { type: "object", properties: {
        campo: { type: "string", enum: Object.keys(campos) },
        valor: { type: "string", description: "número com ponto decimal (percentual sem o símbolo %; valor em reais sem R$), ou texto nos campos de texto" },
        fonte: { type: "string", description: "de onde veio: cláusula e página da convenção, artigo da lei, caderno técnico ou acórdão, em uma frase" },
        ...(comFalhas && !proposta ? { anterior: { type: "string", description: "valor deste campo na planilha da contratação (antes da repactuação), no mesmo formato; informe sempre que o campo existir na planilha da contratação" } } : {}),
      }, required: ["campo", "valor", "fonte"] } },
      observacoes: { type: "array", items: { type: "string" }, description: "pontos de atenção para quem confere a planilha (no máximo 6)" },
      ...(comFalhas ? { falhas: { type: "array", maxItems: 25, description: proposta ? "falhas de preenchimento, custos abaixo do mínimo legal ou da convenção e inconsistências encontradas na planilha da proposta, uma por item" : "falhas de preenchimento e inconsistências encontradas na planilha da contratação, uma por item", items: { type: "object", properties: {
        rubrica: { type: "string", description: "módulo e rubrica, ex.: Submódulo 2.2, C – SAT" },
        problema: { type: "string", description: "o que está errado na planilha analisada, com os valores encontrados" },
        fundamento: { type: "string", description: "norma, cláusula da convenção, caderno técnico ou acórdão que fundamenta, com número e ano" },
        correcao: { type: "string", description: "o caminho correto: como deve ser preenchido, com o percentual ou valor e a base de cálculo" },
        impacto: { type: "string", description: proposta ? "efeito da falha na exequibilidade e no preço: se a correção exige majorar o preço (não admitido) ou pode ser absorvida pelo preço ofertado (IN 05/2017, Anexo VII-A, item 7.9), com a estimativa em R$ por empregado por mês" : "efeito de manter a falha nos valores da repactuação: se aumenta ou reduz o preço e, quando possível, a estimativa em R$ por empregado por mês" },
        gravidade: { type: "string", enum: ["alta", "media", "baixa"], description: "alta: afeta o preço ou é vedado; media: afeta pouco o preço; baixa: forma ou transparência" },
      }, required: ["rubrica", "problema", "fundamento", "correcao", "gravidade"] } } } : {}),
      ...(proposta ? {
        exequibilidade: { type: "object", description: "conclusão sobre a exequibilidade da proposta", properties: {
          conclusao: { type: "string", enum: ["exequivel", "indicios", "inexequivel"], description: "exequivel: cobre os custos legais e da convenção; indicios: há custos abaixo do mínimo ou dúvidas que exigem diligência; inexequivel: o preço não cobre custos obrigatórios (salário, encargos ou benefícios da convenção) nem com ajuste sem majoração" },
          fundamento: { type: "string", description: "síntese da conclusão, com os itens decisivos e as normas (Lei 14.133/2021, art. 59, III e IV, e § 2º; IN 05/2017, Anexo VII-A, itens 7.9, 9.2, 9.3 e 9.4; IN 73/2022, art. 34)" } },
          required: ["conclusao", "fundamento"] },
        diligencias: { type: "array", maxItems: 12, items: { type: "string" }, description: "perguntas objetivas a fazer à licitante na diligência, cada uma pedindo justificativa ou comprovação de um custo (convenção, notas fiscais, EFD-Contribuições, FAP, contratos)" },
      } : {}),
      iss: { type: "object", description: "alíquota do ISS do município onde o serviço será prestado", properties: {
        encontrado: { type: "boolean", description: "true só se a alíquota foi confirmada em fonte oficial do município (lei, código tributário ou anexo) " },
        aliquota: { type: ["number", "null"], description: "percentual, entre 2 e 5 (LC 116/2003, arts. 8º e 8º-A)" },
        item_lc116: { type: "string", description: "item da lista anexa à LC 116/2003, ex.: 7.10 (limpeza e conservação), 11.02 (vigilância), 17.05 (fornecimento de mão de obra)" },
        fonte: { type: "string", description: "lei municipal e artigo/anexo, com o endereço da página oficial consultada" } },
        required: ["encontrado", "aliquota", "item_lc116", "fonte"] },
    },
    required: proposta ? ["campos", "observacoes", "falhas", "exequibilidade", "diligencias", "iss"] : comFalhas ? ["campos", "observacoes", "falhas", "iss"] : ["campos", "observacoes", "iss"],
  },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);
  const admin = clienteServico();
  const usuario = await usuarioDaRequisicao(req, admin);
  if (!usuario) return erro("Entre na sua conta para continuar.", 401);

  const { data: perfil } = await admin.from("perfis").select("admin").eq("id", usuario.id).maybeSingle();
  // administrador só tem acesso livre com a verificação em duas etapas ativa na sessão (aal2)
  const ehAdmin = !!perfil?.admin && nivelDoToken(req) === "aal2";
  const { data: vigente } = await admin.rpc("plano_vigente", { uid: usuario.id });
  if (!ehAdmin && vigente !== "pro") return erro("O preenchimento pelo agente é exclusivo do plano Pro.", 403);

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return erro("O agente está indisponível no momento. Tente mais tarde.", 503);

  const corpo = await req.json().catch(() => ({}));
  const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

  const modo = corpo.modo === "repactuacao" ? "repactuacao" : corpo.modo === "proposta" ? "proposta" : "planejamento";
  const comPlanilha = modo !== "planejamento";
  const dados0 = corpo.dados && typeof corpo.dados === "object" ? corpo.dados as Record<string, unknown> : {};
  const munServ = String(dados0.municipio ?? "").trim().slice(0, 80), ufServ = String(dados0.uf ?? "").toUpperCase().trim();
  if (!munServ || !UFS.includes(ufServ)) return erro("Antes da análise, informe o município e a UF onde o serviço será prestado.");
  const reforma = String(dados0.reforma ?? "");
  if (!["antes", "depois"].includes(reforma)) return erro("Antes da análise, escolha se os tributos devem ser calculados antes ou depois da reforma tributária.");
  if (!["real", "presumido", "simples"].includes(String(dados0.regime))) return erro("Antes da análise, escolha o regime de tributação da empresa (Lucro Real, Presumido ou Simples Nacional).");
  const regime = String(dados0.regime);
  const okPdf = (c: string) => c.startsWith(usuario.id + "/mo/") && !c.includes("..") && /\.pdf$/i.test(c);
  const arquivo = String(corpo.arquivo ?? "");             // convenção coletiva (na repactuação: a nova, opcional)
  const planArq = String(corpo.planilha_arquivo ?? "");    // repactuação: planilha da contratação em PDF
  const planTexto = String(corpo.planilha_texto ?? "").slice(0, 120000);  // repactuação: planilha em Excel, convertida em texto no navegador
  if (!okPdf(arquivo)) return erro(modo === "repactuacao" ? "Envie a nova convenção coletiva em PDF: ela é obrigatória para a análise da repactuação." : "Envie a convenção coletiva em PDF.");
  if (comPlanilha && !okPdf(planArq) && planTexto.trim().length < 50) return erro(modo === "proposta" ? "Envie a planilha de custos da proposta, em PDF ou Excel." : "Envie a planilha utilizada na contratação, em PDF ou Excel.");
  if (arquivo && !okPdf(arquivo)) return erro("Arquivo da convenção inválido.");
  if (planArq && !okPdf(planArq)) return erro("Arquivo da planilha inválido.");

  const { data: orgId } = await admin.rpc("org_do_usuario", { uid: usuario.id });
  const msgLimite = "A " + NOME_MODO[modo] + " pelo agente já foi usada nesta semana" + (orgId ? " pela sua equipe" : "") + ". A franquia é de 1 por semana em cada modelo e renova na segunda-feira.";
  const usosDaSemana = () => {
    let q = admin.from("mo_preenchimentos").select("id").eq("modo", modo).gte("criado_em", inicioSemanaBR().toISOString()).order("criado_em").order("id").limit(LIMITE_SEMANA + 5);
    return orgId ? q.eq("org_id", orgId) : q.eq("usuario_id", usuario.id);
  };
  if (!ehAdmin) {
    const { data: usos } = await usosDaSemana();
    if ((usos ?? []).length >= LIMITE_SEMANA) return erro(msgLimite, 429);
  }

  const lerPdf = async (caminho: string, nome: string): Promise<string | Response> => {
    const { data: blob, error: eDown } = await admin.storage.from("analises").download(caminho);
    if (eDown || !blob) return erro(`Não foi possível ler o arquivo da ${nome}. Envie de novo.`);
    if (blob.size > 20 * 1024 * 1024) return erro(`O arquivo da ${nome} passa de 20 MB.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(bin);
  };
  const docs: { titulo: string; pdf: string }[] = [];
  if (planArq) { const x = await lerPdf(planArq, "planilha"); if (x instanceof Response) return x; docs.push({ titulo: modo === "proposta" ? "PLANILHA DE CUSTOS DA PROPOSTA DA LICITANTE" : "PLANILHA DA CONTRATAÇÃO", pdf: x }); }
  if (arquivo) { const x = await lerPdf(arquivo, "convenção"); if (x instanceof Response) return x; docs.push({ titulo: modo === "repactuacao" ? "NOVA CONVENÇÃO COLETIVA" : "CONVENÇÃO COLETIVA", pdf: x }); }


  const campos = modo === "planejamento" ? CAMPOS_PLANEJAMENTO : modo === "proposta" ? CAMPOS_PROPOSTA : CAMPOS_REPACTUACAO;
  const dados = corpo.dados && typeof corpo.dados === "object" ? corpo.dados as Record<string, unknown> : {};
  const linhasDados = Object.entries(dados).filter(([k, v]) => /^[a-z0-9_]{1,20}$/.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim() && k !== "cct_arquivo")
    .slice(0, 80).map(([k, v]) => `- ${k}: ${String(v).slice(0, 120)}`).join("\n");
  // ISS: o agente busca a alíquota do município onde o serviço será prestado; se não confirmar em fonte oficial, o site pede ao assinante
  const blocoIss = `ISS: o serviço será prestado em ${munServ}/${ufServ}. Pesquise com a ferramenta de busca a alíquota do ISS desse município para o item da LC 116/2003 que corresponde ao serviço (prefira o código tributário municipal, a lei do ISS ou o site oficial da prefeitura). Se não confirmar em fonte oficial, devolva encontrado = false e aliquota = null (não use 5% como padrão). Depois da pesquisa, chame obrigatoriamente a ferramenta preencher_planilha.`;
  // regime de tributação e momento da reforma tributária escolhidos pelo assinante (o site calcula CBS, IBS e a transição)
  const regNome = { real: "Lucro Real (PIS/COFINS não cumulativos: valem as alíquotas efetivas, Acórdão 2.647/2009-TCU-Plenário)", presumido: "Lucro Presumido (PIS 0,65% e COFINS 3%, cumulativos)", simples: "Simples Nacional, Anexo IV (permitido só para vigilância, limpeza ou conservação: LC 123/2006, art. 17, XII, e art. 18, §§ 5º-C e 5º-H; sem contribuições a terceiros no Submódulo 2.2, art. 13, § 3º; INSS patronal e RAT fora do DAS)" }[regime];
  const blocoTrib = `TRIBUTAÇÃO: regime de tributação informado: ${regNome}. O assinante escolheu calcular os tributos ${reforma === "depois" ? "DEPOIS da reforma tributária (EC 132/2023 e LC 214/2025): o site calcula sozinho CBS, IBS e o período de transição a partir dos Módulos 1 a 5; não crie campos de CBS ou IBS" : "ANTES da reforma tributária (PIS, COFINS e ISS)"}. Considere o regime ao preencher e ao apontar falhas (ex.: Simples em serviço vedado, contribuições a terceiros cobradas por optante do Simples, PIS/COFINS nominais no Lucro Real sem comprovação da alíquota efetiva).`;
  const tarefa = modo === "repactuacao"
    ? `REPACTUAÇÃO (Planilha 2). Você recebe a planilha de custos utilizada na contratação e a nova convenção coletiva. Tarefa: (1) reproduza nos campos os valores e percentuais da planilha da contratação, rubrica por rubrica (em cada campo, informe em "anterior" o valor da planilha da contratação, para o quadro comparativo), e informe em "vigente" o preço total por empregado dessa planilha; (2) atualize o que decorre da nova convenção (salário-base, adicionais, auxílio-alimentação e participação, assistência médica, seguro de vida e demais benefícios), citando a cláusula; (3) faça a análise dos custos NÃO RENOVÁVEIS para o ano de execução informado (ano_exec): suprima ou reduza o que já foi pago ou amortizado no 1º ano (art. 57 da IN 05/2017), como o aviso prévio trabalhado (no máximo 0,194% por ano de prorrogação; Acórdão 1.186/2017-TCU-Plenário) e as incidências sobre ele, e equipamentos ou kits iniciais já amortizados, começando a fonte por "Não renovável:". NÃO reajuste insumos por índice (isso é feito à parte pelo sistema). Nos campos sem informação na planilha, não invente: omita o campo. (4) Como a planilha da contratação foi elaborada por terceiros, examine-a e liste em "falhas" cada erro de preenchimento ou inconsistência: percentuais ou bases de cálculo diferentes dos legais, da convenção ou dos cadernos técnicos, rubricas que faltam ou sobram, custos vedados (ex.: IRPJ e CSLL na planilha, Súmula TCU 254), contas que não fecham, benefício em desacordo com a convenção, tributos incompatíveis com o regime, incidências em duplicidade, entre outros. Para cada falha, indique o fundamento, o caminho correto e o impacto de mantê-la nos valores da repactuação, e já aplique a correção nos campos da planilha repactuada (fonte começando por "Correção:"); o campo "vigente" continua com o preço da planilha original. Se não houver falhas, devolva a lista vazia.`
    : modo === "proposta"
    ? `ANÁLISE DA PROPOSTA (Planilha 3). Você recebe a planilha de custos e formação de preços apresentada por uma licitante e a convenção coletiva da categoria. Tarefa: (1) reproduza nos campos os valores e percentuais da planilha da proposta TAL COMO APRESENTADOS, rubrica por rubrica, sem corrigir nada (fonte: "Proposta: ..."), e informe em "vigente" o preço total por empregado ofertado; nos campos sem informação na proposta, omita o campo. (2) Confira item por item contra a convenção (piso, adicionais, benefícios e participação do empregado), a legislação (encargos do Submódulo 2.2, FGTS, RAT × FAP, 13º, férias, provisões), os cadernos técnicos e a jurisprudência do TCU, e liste em "falhas" cada erro ou inconsistência: custo abaixo do mínimo legal ou da convenção, base de cálculo errada, rubrica faltante, custo vedado (IRPJ e CSLL, Súmula TCU 254; reserva técnica sem justificativa), tributos incompatíveis com o regime, Simples Nacional em serviço vedado (LC 123/2006, art. 17, XII), contas que não fecham. Em cada falha, diga se a correção pode ser absorvida pelo preço ofertado, sem majorá-lo (erro sanável: IN 05/2017, Anexo VII-A, item 7.9), ou se torna a proposta inexequível. Itens isolados abaixo do estimado não desclassificam se não contrariarem exigência legal (item 9.3). (3) Conclua sobre a exequibilidade em "exequibilidade" e (4) liste em "diligencias" as perguntas a fazer à licitante para comprovar os custos (Lei 14.133/2021, art. 59, § 2º; IN 05/2017, Anexo VII-A, item 9.4). Considere o valor estimado pela Administração, se informado (pr_estimado): abaixo de 50% dele é indício de inexequibilidade que exige diligência (IN SEGES/ME nº 73/2022, art. 34).`
    : `PLANEJAMENTO (Planilha 1). Preencha a planilha do profissional da categoria indicada a partir da convenção enviada e das normas: piso da categoria, adicionais, benefícios (com a participação do empregado), encargos e percentuais dos Módulos 2, 3 e 4. Para cada valor, indique a fonte. Se a convenção não tratar de um item, use o percentual legal ou do caderno técnico e diga isso na fonte. Não preencha custos indiretos, lucro nem tributos.`;
  const system = `Você é especialista em custos de serviços terceirizados com dedicação exclusiva de mão de obra na administração pública. ${REGRAS}
${tarefa}
${blocoTrib}
${blocoIss}
Use apenas o que está na convenção enviada e nas normas citadas; nunca invente cláusula, valor ou acórdão. Valores mensais por empregado. Campos disponíveis: ${Object.entries(campos).map(([k, v]) => `${k} (${v})`).join("; ")}.`;

  const mensagens = [{ role: "user", content: [
        ...docs.flatMap((x) => [{ type: "text", text: x.titulo + ":" }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: x.pdf } }]),
        ...(planTexto.trim() ? [{ type: "text", text: (modo === "proposta" ? "PLANILHA DE CUSTOS DA PROPOSTA" : "PLANILHA DA CONTRATAÇÃO") + " (Excel convertido em texto; cada linha é uma linha da planilha, colunas separadas por |):\n" + planTexto }] : []),
        { type: "text", text: `DADOS JÁ INFORMADOS NA PLANILHA DO SITE:\n${linhasDados || "(nenhum)"}` },
      ] }];
  const chamar = (comBusca: boolean) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      // max_tokens cobre o raciocínio e a resposta juntos: com 9.000 o raciocínio consumia o limite e a planilha vinha vazia
      model: MODELO, max_tokens: 32000, output_config: { effort: "medium" }, system, messages: mensagens,
      tools: comBusca ? [FERRAMENTA(campos, comPlanilha, modo === "proposta"), { type: "web_search_20250305", name: "web_search", max_uses: 2, user_location: { type: "approximate", country: "BR" } }]
        : [FERRAMENTA(campos, comPlanilha, modo === "proposta")],
      tool_choice: comBusca ? { type: "auto" } : { type: "tool", name: "preencher_planilha" },
    }),
    signal: AbortSignal.timeout(140000),
  }).catch(() => null);
  // reserva a franquia ANTES da chamada paga: grava o uso e confere se ele está entre os primeiros da semana
  // (pedidos simultâneos não passam do limite); se a análise falhar, a reserva é desfeita
  let reserva: number | null = null;
  const liberar = async () => { if (reserva != null) await admin.from("mo_preenchimentos").delete().eq("id", reserva); };
  if (!ehAdmin) {
    const { data: res, error: eRes } = await admin.from("mo_preenchimentos").insert({ usuario_id: usuario.id, modo, org_id: orgId || null }).select("id").single();
    if (eRes || !res) return erro("Não foi possível iniciar a análise agora. Tente de novo em alguns minutos.", 500);
    reserva = res.id as number;
    const { data: usos } = await usosDaSemana();
    if (!(usos ?? []).slice(0, LIMITE_SEMANA).some((x: any) => x.id === reserva)) { await liberar(); return erro(msgLimite, 429); }
  }
  let resp = await chamar(true);
  if (resp && resp.status === 400) {  // busca na internet indisponível na conta da API: segue sem ela (ISS fica para o assinante)
    console.log("mo-agente: busca indisponível, seguindo sem ela:", (await resp.text().catch(() => "")).slice(0, 200));
    resp = await chamar(false);
  }
  if (!resp || !resp.ok) {
    console.log("mo-agente indisponível:", resp ? resp.status + " " + (await resp.text().catch(() => "")).slice(0, 300) : "sem resposta");
    await liberar();
    return erro("O agente não conseguiu analisar a convenção agora. Tente de novo em alguns minutos.", 502);
  }
  const j = await resp.json().catch(() => ({}));
  const bloco = (j.content ?? []).find((c: any) => c.type === "tool_use" && c.name === "preencher_planilha");
  // resposta cortada (limite de saída) ou sem nenhum campo: é falha, não resultado; a franquia é devolvida
  const camposBrutos = (bloco?.input?.campos ?? []) as any[];
  if (!bloco || j.stop_reason === "max_tokens" || !camposBrutos.length) {
    console.log("mo-agente: resposta sem preenchimento", j.stop_reason, camposBrutos.length);
    await liberar();
    return erro("O agente não concluiu a análise. A franquia desta semana não foi usada; tente de novo em alguns minutos.", 502);
  }
  const saida = ((bloco?.input?.campos ?? []) as any[]).filter((c) => campos[c?.campo]).slice(0, 90).map((c) => ({
    campo: String(c.campo), valor: String(c.valor ?? "").slice(0, 120), fonte: String(c.fonte ?? "").slice(0, 300),
    ...(modo === "repactuacao" && c.anterior != null && String(c.anterior).trim() ? { anterior: String(c.anterior).slice(0, 120) } : {}),
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
  const eA = bloco?.input?.exequibilidade ?? null;
  const exequibilidade = modo === "proposta" && eA ? { conclusao: ["exequivel", "indicios", "inexequivel"].includes(eA.conclusao) ? eA.conclusao : "indicios", fundamento: String(eA.fundamento ?? "").slice(0, 1200) } : null;
  const diligencias = modo === "proposta" ? ((bloco?.input?.diligencias ?? []) as unknown[]).slice(0, 12).map((x) => String(x).slice(0, 400)).filter(Boolean) : [];
  // a reserva feita antes da chamada fica gravada: só a análise concluída consome a franquia da semana
  return resposta({ campos: saida.filter((c) => c.campo !== "iss"), observacoes, falhas, iss, exequibilidade, diligencias });
});
