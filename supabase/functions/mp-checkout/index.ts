// Cria o checkout do Mercado Pago para um plano ou uma consultoria
// e confere pagamentos quando a pessoa volta do checkout.
//
// POST { acao: "criar", tipo: "plano", plano, ciclo, parcelas, contratante, metodo, retorno }
// POST { acao: "criar", tipo: "consultoria", modalidade, assunto, descricao, metodo, aceite, termo_versao, anexos, retorno }
// POST { acao: "criar", tipo: "analise", aceite, termo_versao, metodo, retorno }
//      Etapa 1: Pro com cota na semana recebe a análise sem pagamento; demais pagam antes de enviar os documentos.
// POST { acao: "enviar_analise", id, regime, obras, mao_de_obra, documentos: [{tipo, arquivo, nome_arquivo, paginas}] (1 a 3),
//        cct: {arquivo, nome_arquivo}, normas: [ids], pncp_link }  — etapa 2: documentos; a análise entra na fila.
// POST { acao: "conferir", referencia: "assinatura:<id>" | "consultoria:<id>" | "analise:<id>" }

import {
  aplicarPagamento, clienteServico, conferirRenovacao, CORS, env, erro, mp, resposta, usuarioDaRequisicao, nivelDoToken } from "../_shared/comum.ts";
import {
  CONSULTORIA, type Ciclo, FRANQUIA_PRO_SEMANA, inicioMesBR, MAX_DOCS_ANALISE, MAX_PAGINAS_ANALISE, type Modalidade, type Plano, PLANOS,
  precoAnalise, precoConsultoria, DOC_GERACAO, MAX_RESPOSTAS_GERACAO, precoPlano, TIPOS_DOC_ANALISE, FRANQUIA_EQUIPE_MES, MIN_ACESSOS_EQUIPE, MAX_ACESSOS_EQUIPE, precoEquipe,
} from "../_shared/precos.ts";
import { avisarEquipeNovaConsultoria } from "../_shared/consultoria.ts";

const SITE_PADRAO = "https://renatogarciagestorp-cpu.github.io/licitaverso/";

// Tipos de pagamento que ficam de fora para cada forma escolhida no site
const EXCLUIR: Record<string, string[]> = {
  pix: ["credit_card", "debit_card", "ticket", "atm"],
  cartao: ["debit_card", "ticket", "bank_transfer", "atm"],
  cpgf: ["debit_card", "ticket", "bank_transfer", "atm"],
  debito: ["credit_card", "ticket", "bank_transfer", "atm"],
  boleto: ["credit_card", "debit_card", "bank_transfer"],
};

/** Endereços do site autorizados a receber a volta do checkout (SITE_URL aceita vários, separados por vírgula). */
function urlDeRetorno(pedida: unknown): string {
  const permitidos = (Deno.env.get("SITE_URL") || SITE_PADRAO).split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof pedida === "string") {
    try {
      const u = new URL(pedida);
      const ok = permitidos.some((p) => {
        const base = new URL(p);
        return u.origin === base.origin && u.pathname.startsWith(base.pathname);
      });
      if (ok) return u.origin + u.pathname;
    } catch { /* usa o padrão */ }
  }
  return permitidos[0];
}

function voltar(base: string, ref: string, situacao: string) {
  const u = new URL(base.endsWith("/") ? base + "index.html" : base);
  u.searchParams.set("p", "conta");
  u.searchParams.set("retorno", situacao);
  u.searchParams.set("ref", ref);
  return u.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);

  try {
    const admin = clienteServico();
    const usuario = await usuarioDaRequisicao(req, admin);
    if (!usuario) return erro("Entre na sua conta para continuar.", 401);

    const corpo = await req.json().catch(() => ({}));
    const acao = corpo.acao ?? "criar";

    // ---------------------------------------------------------------- conferir
    if (acao === "conferir") {
      const ref = String(corpo.referencia ?? "");
      const m = ref.match(/^(assinatura|consultoria|analise|renovacao|equipe):([0-9a-f-]{36})$/);
      if (!m) return erro("Referência inválida.");
      if (m[1] === "renovacao") {
        const { data: ren } = await admin.from("renovacoes").select("id, usuario_id, status, mp_preapproval").eq("id", m[2]).maybeSingle();
        if (!ren || ren.usuario_id !== usuario.id) return erro("Pedido não encontrado.", 404);
        const resultados = await conferirRenovacao(admin, ren);
        const { data: depois } = await admin.from("renovacoes").select("status").eq("id", m[2]).maybeSingle();
        return resposta({ status: depois?.status ?? ren.status, resultados });
      }
      const tabela = m[1] === "assinatura" ? "assinaturas" : m[1] === "consultoria" ? "consultorias" : m[1] === "equipe" ? "organizacoes" : "analises";
      const { data: linha } = await admin.from(tabela).select("id, usuario_id, status").eq("id", m[2]).maybeSingle();
      if (!linha || linha.usuario_id !== usuario.id) return erro("Pedido não encontrado.", 404);

      const busca = await mp(
        `/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc&limit=20`,
      );
      const lista: any[] = busca?.results ?? [];
      // Aprovados primeiro, para não marcar como cancelado algo que foi pago em outra tentativa
      lista.sort((a, b) => (a.status === "approved" ? -1 : 0) - (b.status === "approved" ? -1 : 0));
      const resultados: string[] = [];
      for (const p of lista) resultados.push(await aplicarPagamento(admin, p));

      const { data: depois } = await admin.from(tabela).select("status").eq("id", m[2]).maybeSingle();
      return resposta({ status: depois?.status ?? linha.status, pagamentos: lista.length, resultados });
    }

    // ---------------------------------------------------------------- enviar documentos da análise (etapa 2)
    if (acao === "enviar_analise") {
      const id = String(corpo.id ?? "");
      const { data: an } = await admin.from("analises").select("id, usuario_id, status, tipo").eq("id", id).maybeSingle();
      if (!an || an.usuario_id !== usuario.id || (an.tipo && an.tipo !== "analise")) return erro("Análise não encontrada.", 404);
      if (an.status !== "aguardando_documentos") return erro("Esta análise não está aguardando documentos (verifique o pagamento).");
      const regime = ["lei-14133", "lei-13303", "lei-13019"].includes(String(corpo.regime)) ? String(corpo.regime) : "";
      if (!regime) return erro("Escolha o regime da contratação.");
      if (typeof corpo.mao_de_obra !== "boolean" || typeof corpo.obras !== "boolean") {
        return erro("Informe se a contratação envolve dedicação exclusiva de mão de obra e se é obra ou serviço de engenharia.");
      }
      const lista = Array.isArray(corpo.documentos) ? corpo.documentos : [];
      if (lista.length < 1 || lista.length > MAX_DOCS_ANALISE) return erro(`Envie de 1 a ${MAX_DOCS_ANALISE} documentos.`);
      const prefixo = usuario.id + "/analises-docs/";
      const documentos: { tipo: string; arquivo: string; nome_arquivo: string; paginas: number | null }[] = [];
      for (const x of lista) {
        const tipo = String(x?.tipo ?? ""), arq = String(x?.arquivo ?? "");
        const def = TIPOS_DOC_ANALISE[tipo];
        if (!def) return erro("Tipo de documento inválido.");
        const extOk = def.formato === "pdf" ? /\.pdf$/i.test(arq) : /\.(pdf|xlsx|xlsm|xls|ods)$/i.test(arq);
        if (!arq.startsWith(prefixo) || arq.includes("..") || !extOk) return erro(`Arquivo inválido para ${def.nome}.`);
        const pag = Number(x?.paginas ?? 0) || null;
        if (pag && pag > MAX_PAGINAS_ANALISE) return erro(`${def.nome}: o limite é de ${MAX_PAGINAS_ANALISE} páginas por documento.`);
        documentos.push({ tipo, arquivo: arq, nome_arquivo: String(x?.nome_arquivo ?? "").slice(0, 160), paginas: pag });
      }
      const tipos = new Set(documentos.map((d) => d.tipo));
      if (tipos.size !== documentos.length) return erro("Cada tipo de documento só pode ser enviado uma vez.");
      if (regime !== "lei-13019" && (tipos.has("plano_trabalho") || tipos.has("planilha_parceria"))) {
        return erro("Plano de trabalho e planilha de custos da parceria são documentos da Lei 13.019/2014.");
      }
      if (corpo.obras && !tipos.has("planilha_obras")) return erro("Obras e serviços de engenharia: inclua a planilha orçamentária entre os documentos.");
      if (corpo.mao_de_obra && !tipos.has("planilha_mo")) return erro("Dedicação exclusiva de mão de obra: inclua a planilha de custos de mão de obra (IN 05/2017).");
      if (regime === "lei-13019" && !tipos.has("planilha_parceria")) return erro("Parceria (Lei 13.019): inclua a planilha de custos da parceria.");
      const anexos: { tipo: string; arquivo: string; nome_arquivo: string }[] = [];
      if (corpo.mao_de_obra) {
        const cct = String(corpo.cct?.arquivo ?? "");
        if (!cct.startsWith(prefixo) || cct.includes("..") || !/\.(pdf|docx)$/i.test(cct)) {
          return erro("Dedicação exclusiva de mão de obra: anexe a convenção ou acordo coletivo (PDF ou Word).");
        }
        anexos.push({ tipo: "cct", arquivo: cct, nome_arquivo: String(corpo.cct?.nome_arquivo ?? "").slice(0, 160) });
      }
      let normas: { id: string; nome: string; arquivo: string }[] = [];
      const pedidas = (Array.isArray(corpo.normas) ? corpo.normas : []).map(String).slice(0, 3);
      if (pedidas.length) {
        const { data: ns } = await admin.from("normas_usuario").select("id, nome, arquivo").in("id", pedidas).eq("usuario_id", usuario.id);
        normas = (ns ?? []).map((n: any) => ({ id: n.id, nome: n.nome, arquivo: n.arquivo }));
      }
      const pncp = String(corpo.pncp_link ?? "").trim();
      const objeto = [...(corpo.obras ? ["obras"] : []), ...(corpo.mao_de_obra ? ["mao-de-obra"] : [])];
      const { error } = await admin.from("analises").update({
        documentos, anexos, normas, regime, objeto, documento: "multiplos", origem: "arquivos",
        pncp_link: /^https:\/\/(www\.)?pncp\.gov\.br\/.*\d{14}\/\d{4}\/\d+/.test(pncp) ? pncp : null,
        nome_arquivo: documentos.map((d) => d.nome_arquivo).join(" · ").slice(0, 160),
        status: "na_fila", enviado_em: new Date().toISOString(),
      }).eq("id", id).eq("status", "aguardando_documentos");
      if (error) throw error;
      return resposta({ ok: true, id });
    }

    // ---------------------------------------------------------------- respostas do questionário da elaboração (etapa 2)
    if (acao === "enviar_geracao") {
      const id = String(corpo.id ?? "");
      const { data: g } = await admin.from("analises").select("id, usuario_id, status, tipo, documento").eq("id", id).maybeSingle();
      if (!g || g.usuario_id !== usuario.id || g.tipo !== "geracao") return erro("Elaboração não encontrada.", 404);
      if (g.status !== "aguardando_documentos") return erro("Esta elaboração não está aguardando as respostas (verifique o pagamento).");
      const respostas = corpo.respostas && typeof corpo.respostas === "object" && !Array.isArray(corpo.respostas) ? corpo.respostas : null;
      if (!respostas) return erro("Responda ao questionário para continuar.");
      const limpo: Record<string, string> = {};
      for (const [k, v] of Object.entries(respostas)) {
        if (!/^[a-z0-9_]{1,40}$/.test(k)) continue;
        limpo[k] = String(v ?? "").slice(0, 8000);
      }
      if (JSON.stringify(limpo).length > MAX_RESPOSTAS_GERACAO) return erro("O questionário ficou grande demais. Resuma as respostas mais longas.");
      const faltam = ["orgao", "uf", "objeto", "necessidade", "quantidades"].filter((k) => !String(limpo[k] ?? "").trim());
      if (faltam.length || String(limpo.objeto ?? "").trim().length < 8) return erro("Preencha os campos obrigatórios (órgão, UF, objeto, necessidade e quantidades).");
      const { error } = await admin.from("analises").update({
        respostas: limpo, status: "na_fila", enviado_em: new Date().toISOString(),
        nome_arquivo: String(limpo.objeto).slice(0, 160),
      }).eq("id", id).eq("status", "aguardando_documentos");
      if (error) throw error;
      return resposta({ ok: true, id });
    }

    // ---------------------------------------------------------------- cancelar a renovação automática
    if (acao === "cancelar_renovacao") {
      const { data: ren } = await admin.from("renovacoes").select("id, usuario_id, status, mp_preapproval").eq("id", String(corpo.id ?? "")).maybeSingle();
      if (!ren || ren.usuario_id !== usuario.id) return erro("Renovação não encontrada.", 404);
      if (ren.status === "cancelada") return resposta({ ok: true, status: "cancelada" });
      if (ren.mp_preapproval) {
        await mp(`/preapproval/${encodeURIComponent(ren.mp_preapproval)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
      }
      await admin.from("renovacoes").update({ status: "cancelada", cancelado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", ren.id);
      return resposta({ ok: true, status: "cancelada" });
    }

    // ------------------------------------------------- remover verificação em duas etapas de um assinante (só admin)
    if (acao === "remover_2fa") {
      const { data: eu } = await admin.from("perfis").select("admin").eq("id", usuario.id).maybeSingle();
      if (!eu?.admin || nivelDoToken(req) !== "aal2") return erro("Somente a administração, com verificação em duas etapas, pode fazer isso.", 403);
      const alvo = String(corpo.usuario_id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(alvo)) return erro("Usuário inválido.");
      const { data: fat, error: e1 } = await admin.auth.admin.mfa.listFactors({ userId: alvo });
      if (e1) return erro("Não foi possível consultar a verificação desse usuário.");
      let removidos = 0;
      for (const f of fat?.factors ?? []) {
        const { error: e2 } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: alvo });
        if (!e2) removidos++;
      }
      await admin.from("registro_admin").insert({ admin_id: usuario.id, acao: "remover_2fa", detalhes: { usuario_id: alvo, removidos } }).then(() => {}, () => {});
      return resposta({ ok: true, removidos });
    }

    if (acao !== "criar") return erro("Ação desconhecida.");

    const { data: perfil } = await admin.from("perfis").select("nome, email, admin").eq("id", usuario.id).maybeSingle();
    const ehAdmin = !!perfil?.admin && nivelDoToken(req) === "aal2"; // administrador (com verificação em duas etapas): sem cobrança
    const { data: vigente } = await admin.rpc("plano_vigente", { uid: usuario.id });
    // organização (plano de equipe) da pessoa, se houver
    const { data: orgId } = await admin.rpc("org_do_usuario", { uid: usuario.id });
    const { data: org } = orgId ? await admin.from("organizacoes").select("id, plano, acessos").eq("id", orgId).maybeSingle() : { data: null };
    const orgPro = !!org && org.plano === "pro";
    const retorno = urlDeRetorno(corpo.retorno);
    const metodo = String(corpo.metodo ?? "");
    const excluir = (EXCLUIR[metodo] ?? []).map((id) => ({ id }));

    let referencia = "";
    let titulo = "";
    let valor = 0;
    let parcelas = 1;

    // ------------------------------------------------------------------ plano
    if (corpo.tipo === "plano") {
      const plano = corpo.plano as Plano;
      const ciclo = corpo.ciclo as Ciclo;
      if (!PLANOS[plano]) return erro("Plano inválido.");
      if (ehAdmin) return erro("Você é administrador: já tem acesso total a todos os recursos, sem cobrança.");
      if (ciclo !== "mensal" && ciclo !== "anual") return erro("Ciclo inválido.");
      const contratante = ["fisica", "privada", "publica"].includes(corpo.contratante) ? corpo.contratante : "fisica";
      // preço de fundador: quem já é fundador (com assinatura ativa) ou enquanto houver vagas
      const { data: souFundador } = await admin.rpc("eh_fundador", { uid: usuario.id });
      const { data: vagas } = await admin.rpc("vagas_fundador");
      const fundador = !!souFundador || Number(vagas ?? 0) > 0;
      valor = precoPlano(plano, ciclo, fundador);
      const cartao = metodo === "cartao" || metodo === "cpgf";
      parcelas = ciclo === "anual" && cartao ? Math.max(1, Math.min(12, Number(corpo.parcelas) || 1)) : 1;
      titulo = `Licitacon · Plano ${PLANOS[plano].nome} · ${ciclo === "anual" ? "12 meses" : "1 mês"}${fundador ? " · preço de fundador" : ""}`;

      // Renovação automática: assinatura recorrente do Mercado Pago (só cartão de crédito; cobra o valor cheio a cada ciclo).
      // O cartão fica guardado no Mercado Pago, nunca no Licitacon.
      if (corpo.renovacao_auto === true) {
        if (metodo !== "cartao") return erro("A renovação automática só está disponível no cartão de crédito.");
        const { data: ren, error: e1 } = await admin.from("renovacoes").insert({
          usuario_id: usuario.id, plano, ciclo, valor, status: "pendente", fundador,
        }).select("id").single();
        if (e1) throw e1;
        const ref = `renovacao:${ren.id}`;
        const pre = await mp("/preapproval", {
          method: "POST",
          body: JSON.stringify({
            reason: `Licitacon · Plano ${PLANOS[plano].nome} · renovação automática ${ciclo === "anual" ? "anual" : "mensal"}`,
            external_reference: ref,
            payer_email: perfil?.email || usuario.email,
            auto_recurring: { frequency: ciclo === "anual" ? 12 : 1, frequency_type: "months", transaction_amount: valor, currency_id: "BRL" },
            back_url: voltar(retorno, ref, "aprovado"),
            status: "pending",
          }),
        });
        await admin.from("renovacoes").update({ mp_preapproval: String(pre.id) }).eq("id", ren.id);
        return resposta({ url: pre.init_point, referencia: ref, valor, renovacao: true });
      }

      const { data: nova, error } = await admin.from("assinaturas").insert({
        usuario_id: usuario.id, plano, ciclo, status: "pendente", valor, parcelas, contratante, metodo, fundador,
        observacao: fundador ? "preço de fundador" : "",
      }).select("id").single();
      if (error) throw error;
      referencia = `assinatura:${nova.id}`;

    // ------------------------------------------------------------ consultoria
    } else if (corpo.tipo === "consultoria") {
      const modalidade = corpo.modalidade as Modalidade;
      if (!CONSULTORIA[modalidade]) return erro("Modalidade inválida.");
      const assunto = String(corpo.assunto ?? "").trim().slice(0, 200);
      const descricao = String(corpo.descricao ?? "").trim().slice(0, 10000);
      if (assunto.length < 4) return erro("Descreva o assunto da consultoria.");
      if (corpo.aceite !== true) return erro("Aceite as condições da consultoria para continuar.");
      // Anexos: só arquivos que a própria pessoa enviou para a pasta dela
      const anexos = (Array.isArray(corpo.anexos) ? corpo.anexos : []).slice(0, 5)
        .filter((a: any) => a && typeof a.caminho === "string" && a.caminho.startsWith(usuario.id + "/") && !a.caminho.includes(".."))
        .map((a: any) => ({ caminho: a.caminho.slice(0, 300), nome: String(a.nome ?? "").slice(0, 160), tamanho: Number(a.tamanho) || 0 }));

      // Pro: 1 consultoria por escrito por mês incluída
      // Pro individual: 1 por mês por pessoa; plano de equipe Pro: 1 por mês para a organização inteira
      let franquiaLivre = false;
      if (vigente === "pro" && modalidade === "escrita") {
        let busca = admin.from("consultorias").select("id", { count: "exact", head: true })
          .eq("modalidade", "escrita").eq("valor", 0).neq("status", "cancelada").gte("criado_em", inicioMesBR().toISOString());
        busca = orgPro ? busca.eq("org_id", org!.id) : busca.eq("usuario_id", usuario.id);
        const { count } = await busca;
        franquiaLivre = (count ?? 0) === 0;
      }
      valor = ehAdmin ? 0 : precoConsultoria(modalidade, vigente ?? null, franquiaLivre);
      titulo = `Licitacon · ${CONSULTORIA[modalidade].nome}`;

      const gratuita = valor <= 0;
      const { data: nova, error } = await admin.from("consultorias").insert({
        usuario_id: usuario.id, modalidade, assunto, descricao, plano: vigente ?? null, valor, anexos, org_id: orgPro ? org!.id : null,
        termo_aceito_em: new Date().toISOString(), termo_versao: String(corpo.termo_versao ?? "").slice(0, 20),
        status: gratuita ? "recebida" : "aguardando_pagamento",
      }).select("id").single();
      if (error) throw error;
      if (gratuita) {
        await avisarEquipeNovaConsultoria(admin, nova.id);
        return resposta({ gratuito: true, referencia: `consultoria:${nova.id}` });
      }
      referencia = `consultoria:${nova.id}`;
    // ------------------------------------------------------- plano de equipe (empresas e órgãos)
    } else if (corpo.tipo === "equipe") {
      const plano = corpo.plano as Plano;
      const ciclo = corpo.ciclo as Ciclo;
      const acessos = Math.floor(Number(corpo.acessos) || 0);
      if (!PLANOS[plano]) return erro("Plano inválido.");
      if (ciclo !== "mensal" && ciclo !== "anual") return erro("Ciclo inválido.");
      if (acessos < MIN_ACESSOS_EQUIPE || acessos > MAX_ACESSOS_EQUIPE) return erro(`Planos de equipe vão de ${MIN_ACESSOS_EQUIPE} a ${MAX_ACESSOS_EQUIPE} acessos. Acima disso, peça uma proposta.`);
      const nomeOrg = String(corpo.organizacao ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
      if (nomeOrg.length < 3) return erro("Informe o nome da empresa ou do órgão.");
      const cnpj = String(corpo.cnpj ?? "").replace(/\D/g, "").slice(0, 14);
      const emailGestor = String(perfil?.email || usuario.email || "").trim().toLowerCase();
      if (!emailGestor) return erro("Sua conta precisa ter um e-mail para ser a gestora da equipe.");
      const p = precoEquipe(plano, acessos, ciclo);
      valor = p.total;
      const cartao = metodo === "cartao" || metodo === "cpgf" || metodo === "";
      parcelas = ciclo === "anual" && cartao ? Math.max(1, Math.min(12, Number(corpo.parcelas) || 1)) : 1;
      titulo = `Licitacon · Plano ${PLANOS[plano].nome} para equipes · ${acessos} acessos · ${ciclo === "anual" ? "12 meses" : "1 mês"}`;
      const fimProvisorio = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
      const { data: nova, error } = await admin.from("organizacoes").insert({
        nome: nomeOrg, cnpj: cnpj || null, tipo: corpo.contratante === "publica" ? "publica" : "privada", plano, acessos, ciclo,
        inicio: new Date().toISOString(), fim: fimProvisorio, status: "pendente", origem: "mercado_pago", valor, usuario_id: usuario.id,
        observacao: `Compra pelo site · ${p.porAcessoMes.toFixed(2)} por acesso/mês (desconto de ${Math.round(p.desconto * 100)}%${ciclo === "anual" ? " + 20% do anual" : ""})`,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await admin.from("organizacao_membros").insert({ org_id: nova.id, email: emailGestor, papel: "gestor" });
      if (e2) throw e2;
      referencia = `equipe:${nova.id}`;
    // ---------------------------------------------------------------- análise
    } else if (corpo.tipo === "analise" || corpo.tipo === "geracao") {
      // Etapa 1 do agente: aceite das condições e pagamento (ou cota do Pro). Depois: documentos (acao "enviar_analise")
      // ou, na elaboração de ETP/TR/Projeto Básico, as respostas do questionário (acao "enviar_geracao").
      // A franquia do Pro é a mesma para analisar e elaborar (2 por semana; equipes: 6 por acesso por mês, somados).
      const geracao = corpo.tipo === "geracao";
      const docG = geracao ? String(corpo.documento ?? "") : "";
      if (geracao && !DOC_GERACAO[docG]) return erro("Escolha o documento: ETP, Termo de Referência ou Projeto Básico.");
      const base = geracao
        ? { tipo: "geracao", documento: docG, origem: "questionario", regime: "lei-14133" }
        : { tipo: "analise", documento: "multiplos", origem: "arquivos" };
      if (corpo.aceite !== true) return erro(geracao ? "Aceite as condições da elaboração para continuar." : "Aceite as condições da análise para continuar.");
      if (ehAdmin) {
        const { data: pend } = await admin.from("analises").select("id").eq("usuario_id", usuario.id)
          .eq("status", "aguardando_documentos").eq("tipo", base.tipo).eq("documento", base.documento).limit(1).maybeSingle();
        if (pend) return resposta({ gratuito: true, referencia: `analise:${pend.id}`, id: pend.id });
        const { data: nova, error } = await admin.from("analises").insert({
          usuario_id: usuario.id, ...base, cobranca: "cortesia_admin", plano: "pro", valor: 0,
          termo_aceito_em: new Date().toISOString(), termo_versao: String(corpo.termo_versao ?? "").slice(0, 20), status: "aguardando_documentos",
        }).select("id").single();
        if (error) throw error;
        return resposta({ gratuito: true, referencia: `analise:${nova.id}`, id: nova.id });
      }
      // plano de equipe Pro: franquia somada (6 análises por acesso por mês), compartilhada pela equipe
      if (orgPro) {
        const { data: pendOrg } = await admin.from("analises").select("id").eq("usuario_id", usuario.id)
          .eq("status", "aguardando_documentos").eq("cobranca", "franquia_org").eq("tipo", base.tipo).eq("documento", base.documento).limit(1).maybeSingle();
        if (pendOrg) return resposta({ gratuito: true, referencia: `analise:${pendOrg.id}`, id: pendOrg.id });
        const { data: usadasOrg } = await admin.rpc("analises_usadas_org", { org: org!.id });
        if (Number(usadasOrg ?? 0) < FRANQUIA_EQUIPE_MES * Number(org!.acessos)) {
          const { data: nova, error } = await admin.from("analises").insert({
            usuario_id: usuario.id, ...base, arquivo: null, pncp_link: null,
            cobranca: "franquia_org", plano: "pro", valor: 0, org_id: org!.id,
            termo_aceito_em: new Date().toISOString(), termo_versao: String(corpo.termo_versao ?? "").slice(0, 20), status: "aguardando_documentos",
          }).select("id").single();
          if (error) throw error;
          return resposta({ gratuito: true, referencia: `analise:${nova.id}`, id: nova.id });
        }
      }
      let franquia = false;
      if (vigente === "pro" && !orgPro) {
        // reaproveita uma análise da cota ainda sem documentos, para não consumir a cota duas vezes
        const { data: pendente } = await admin.from("analises").select("id").eq("usuario_id", usuario.id)
          .eq("status", "aguardando_documentos").eq("cobranca", "franquia_pro").eq("tipo", base.tipo).eq("documento", base.documento).limit(1).maybeSingle();
        if (pendente) return resposta({ gratuito: true, referencia: `analise:${pendente.id}`, id: pendente.id });
        const { data: usadas } = await admin.rpc("analises_usadas_semana", { uid: usuario.id });
        franquia = Number(usadas ?? 0) < FRANQUIA_PRO_SEMANA;
      }
      // primeira análise grátis (uma por CPF e por conta, com e-mail confirmado), quando não há franquia
      if (!franquia && !geracao) {
        const { data: pendC } = await admin.from("analises").select("id").eq("usuario_id", usuario.id)
          .eq("status", "aguardando_documentos").eq("cobranca", "cortesia_boas_vindas").limit(1).maybeSingle();
        if (pendC) return resposta({ gratuito: true, cortesia: true, referencia: `analise:${pendC.id}`, id: pendC.id });
        // 1 por CPF e por conta; acima de 20 por dia, a análise vai para a fila do primeiro dia com vaga (liberar_em)
        if (usuario.email_confirmed_at) {
          const { data: cort, error: eC } = await admin.rpc("criar_cortesia", { uid: usuario.id, p_plano: vigente ?? null, p_termo: String(corpo.termo_versao ?? "") });
          if (eC) throw eC;
          if (cort?.id) return resposta({ gratuito: true, cortesia: true, referencia: `analise:${cort.id}`, id: cort.id, liberar_em: cort.liberar_em ?? null });
        }
      }
      valor = franquia ? 0 : precoAnalise(vigente ?? null);
      titulo = geracao ? `Licitacon · Elaboração de ${DOC_GERACAO[docG]} pelo Agente IA` : "Licitacon · Análise pelo Agente IA (até 3 documentos)";
      const { data: nova, error } = await admin.from("analises").insert({
        usuario_id: usuario.id, ...base, arquivo: null, pncp_link: null,
        cobranca: franquia ? "franquia_pro" : "avulsa", plano: vigente ?? null, valor,
        termo_aceito_em: new Date().toISOString(), termo_versao: String(corpo.termo_versao ?? "").slice(0, 20),
        status: franquia ? "aguardando_documentos" : "aguardando_pagamento",
      }).select("id").single();
      if (error) throw error;
      if (franquia) return resposta({ gratuito: true, referencia: `analise:${nova.id}`, id: nova.id });
      referencia = `analise:${nova.id}`;
    } else {
      return erro("Tipo de compra inválido.");
    }

    // -------------------------------------------------- preferência no Mercado Pago
    const funcoes = env("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1";
    const [nome, ...resto] = String(perfil?.nome ?? "").trim().split(/\s+/);
    const preferencia = await mp("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: referencia, title: titulo, quantity: 1, currency_id: "BRL", unit_price: valor }],
        payer: { email: perfil?.email || usuario.email, name: nome || undefined, surname: resto.join(" ") || undefined },
        external_reference: referencia,
        notification_url: `${funcoes}/mp-webhook`,
        back_urls: {
          success: voltar(retorno, referencia, "aprovado"),
          pending: voltar(retorno, referencia, "pendente"),
          failure: voltar(retorno, referencia, "falhou"),
        },
        auto_return: "approved",
        statement_descriptor: "LICITACON",
        payment_methods: {
          excluded_payment_types: excluir,
          installments: parcelas,
          default_installments: parcelas,
        },
        expires: true,
        expiration_date_to: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
        metadata: { usuario_id: usuario.id, referencia },
      }),
    });

    const tabela = referencia.startsWith("assinatura:") ? "assinaturas" : referencia.startsWith("consultoria:") ? "consultorias" : referencia.startsWith("equipe:") ? "organizacoes" : "analises";
    await admin.from(tabela).update({ mp_preferencia: preferencia.id }).eq("id", referencia.split(":")[1]);

    const producao = !String(Deno.env.get("MP_ACCESS_TOKEN") ?? "").startsWith("TEST-");
    return resposta({
      url: producao ? preferencia.init_point : (preferencia.sandbox_init_point || preferencia.init_point),
      referencia,
      valor,
    });
  } catch (e) {
    console.error(e);
    return erro("Não foi possível iniciar o pagamento agora. Tente de novo em instantes.", 500);
  }
});
