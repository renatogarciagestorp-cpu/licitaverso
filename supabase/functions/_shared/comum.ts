import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { avisarEquipeNovaConsultoria } from "./consultoria.ts";

// MP_API_URL só existe para testes locais; em produção fica a API oficial.
export const MP_API = Deno.env.get("MP_API_URL") || "https://api.mercadopago.com";

// CORS: só o endereço do site pode chamar as funções pelo navegador (SITE_URL; o primeiro endereço define a origem)
const ORIGEM_SITE = (() => {
  try { return new URL((Deno.env.get("SITE_URL") || "https://renatogarciagestorp-cpu.github.io/licitaverso/").split(",")[0].trim()).origin; }
  catch { return "https://renatogarciagestorp-cpu.github.io"; }
})();

export const CORS = {
  "Access-Control-Allow-Origin": ORIGEM_SITE,
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Confere o segredo interno (chamadas do GitHub Actions) em tempo constante; sem segredo configurado, nega. */
export function segredoConfere(req: Request): boolean {
  const segredo = Deno.env.get("AVISOS_SECRET") ?? "";
  const veio = req.headers.get("x-avisos") ?? "";
  if (segredo.length < 16 || veio.length !== segredo.length) return false;
  let d = 0;
  for (let i = 0; i < segredo.length; i++) d |= segredo.charCodeAt(i) ^ veio.charCodeAt(i);
  return d === 0;
}

export function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function erro(mensagem: string, status = 400): Response {
  return resposta({ erro: mensagem }, status);
}

export function env(nome: string, padrao?: string): string {
  const v = Deno.env.get(nome) ?? padrao;
  if (v === undefined || v === "") throw new Error(`Variável ${nome} não configurada`);
  return v;
}

/** Cliente com a chave de serviço (ignora RLS). Só existe dentro das funções. */
export function clienteServico(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Identifica quem chamou a função pelo token de login enviado pelo site. */
export async function usuarioDaRequisicao(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/** Nível de garantia do login (aal1 = só senha; aal2 = senha + código do aplicativo). O token já foi validado por getUser. */
export function nivelDoToken(req: Request): string {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const corpo = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(corpo + "=".repeat((4 - corpo.length % 4) % 4))).aal ?? "aal1");
  } catch { return "aal1"; }
}

export async function mp(caminho: string, init: RequestInit = {}) {
  const r = await fetch(MP_API + caminho, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const texto = await r.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = { bruto: texto };
  }
  if (!r.ok) {
    console.error("Mercado Pago", caminho, r.status, texto.slice(0, 500));
    throw new Error(`Mercado Pago respondeu ${r.status}`);
  }
  return corpo;
}

const NOME_METODO: Record<string, string> = {
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  bank_transfer: "Pix",
  ticket: "Boleto",
  account_money: "Saldo Mercado Pago",
  atm: "Lotérica",
};

/**
 * Aplica o resultado de um pagamento do Mercado Pago no banco.
 * Usado pelo webhook e pela conferência que o site pede ao voltar do checkout.
 * Idempotente: o mesmo pagamento nunca é registrado duas vezes.
 */
export async function aplicarPagamento(admin: SupabaseClient, pagamento: any): Promise<string> {
  const ref: string = pagamento?.external_reference ?? "";
  if (!/^(assinatura|consultoria|analise|renovacao|equipe):[0-9a-f-]{36}$/.test(ref)) return "referencia_ignorada";
  const status: string = pagamento.status;
  if (status === "approved") {
    const { data, error } = await admin.rpc(ref.startsWith("equipe:") ? "registrar_pagamento_equipe" : "registrar_pagamento_aprovado", {
      p_referencia: ref,
      p_mp_pagamento: String(pagamento.id),
      p_metodo: NOME_METODO[pagamento.payment_type_id] ?? pagamento.payment_type_id ?? "",
      p_valor: Number(pagamento.transaction_amount ?? 0),
      p_parcelas: Number(pagamento.installments ?? 1),
    });
    if (error) throw error;
    if (String(data) === "consultoria_paga") await avisarEquipeNovaConsultoria(admin, ref.split(":")[1]);
    if (String(data) === "assinatura_ativada") await encerrarRenovacoesSubstituidas(admin, ref.split(":")[1]);
    if (String(data) === "credito_indisponivel") await avisarCreditoIndisponivel(admin, ref, pagamento);
    return String(data);
  }
  // Cartão recusado não encerra o pedido: a pessoa pode tentar de novo no mesmo checkout.
  if (status === "cancelled") {
    if (ref.startsWith("equipe:")) return "recusado:equipe";
    const { data, error } = await admin.rpc("registrar_pagamento_recusado", { p_referencia: ref });
    if (error) throw error;
    return "recusado:" + data;
  }
  return "aguardando:" + status;
}

/** Troca de plano paga com um crédito que já não existe (pedido trocado por outro, ou plano antigo já encerrado):
 *  o plano não é ativado e a equipe recebe uma mensagem no Painel para estornar ou ajustar. Uma por pagamento. */
async function avisarCreditoIndisponivel(admin: SupabaseClient, ref: string, pagamento: any): Promise<void> {
  try {
    const mpId = String(pagamento?.id ?? "");
    const { data: ja } = await admin.from("contatos").select("id").eq("detalhes->>mp_pagamento", mpId).limit(1).maybeSingle();
    if (ja) return;
    const { data: a } = await admin.from("assinaturas").select("usuario_id, plano, ciclo, valor, credito").eq("id", ref.split(":")[1]).maybeSingle();
    const { data: p } = a ? await admin.from("perfis").select("nome, email").eq("id", a.usuario_id).maybeSingle() : { data: null };
    await admin.from("contatos").insert({
      usuario_id: a?.usuario_id ?? null, nome: p?.nome || "Assinante", email: p?.email || "sem-email@licitacon.invalid", assunto: "Assinatura e cobrança",
      mensagem: `Pagamento de troca de plano recebido, mas o crédito do plano anterior não está mais disponível (pedido trocado por outro ou plano antigo já encerrado). O plano NÃO foi ativado. Conferir no Mercado Pago (operação ${mpId}, R$ ${Number(pagamento?.transaction_amount ?? 0).toFixed(2).replace(".", ",")}) e estornar ou ajustar o plano manualmente.`,
      detalhes: { tipo: "credito_indisponivel", referencia: ref, mp_pagamento: mpId, plano: a?.plano ?? null, ciclo: a?.ciclo ?? null, valor: a?.valor ?? null, credito: a?.credito ?? null },
    });
  } catch (e) {
    console.error("troca de plano: não avisou a equipe do crédito indisponível", ref, e);
  }
}

/** Troca de plano: a renovação automática dos planos substituídos é cancelada no Mercado Pago, para não cobrar
 *  de novo o plano antigo. Falha aqui não desfaz a ativação: fica registrada no log para conferência. */
async function encerrarRenovacoesSubstituidas(admin: SupabaseClient, assinaturaId: string): Promise<void> {
  try {
    const { data: a } = await admin.from("assinaturas").select("usuario_id, plano, substitui").eq("id", assinaturaId).maybeSingle();
    if (!a || !Array.isArray(a.substitui) || !a.substitui.length) return;
    const { data: antigos } = await admin.from("assinaturas").select("plano").in("id", a.substitui);
    const planos = [...new Set((antigos ?? []).map((x: any) => String(x.plano)))].filter((p) => p !== a.plano);
    if (!planos.length) return;
    const { data: rens } = await admin.from("renovacoes").select("id, mp_preapproval").eq("usuario_id", a.usuario_id)
      .in("plano", planos).in("status", ["pendente", "ativa", "pausada"]);
    for (const r of rens ?? []) {
      if (r.mp_preapproval) {
        try { await mp(`/preapproval/${encodeURIComponent(r.mp_preapproval)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }); }
        catch (e) { console.error("troca de plano: não cancelou a renovação no Mercado Pago", r.id, e); continue; }
      }
      const agora = new Date().toISOString();
      await admin.from("renovacoes").update({ status: "cancelada", cancelado_em: agora, atualizado_em: agora }).eq("id", r.id);
    }
  } catch (e) {
    console.error("troca de plano: falha ao encerrar renovações", assinaturaId, e);
  }
}

/** Atualiza a renovação automática pelo Mercado Pago: situação da assinatura recorrente e cobranças aprovadas. */
export async function conferirRenovacao(admin: SupabaseClient, ren: { id: string; status: string; mp_preapproval: string | null }) {
  const resultados: string[] = [];
  if (ren.mp_preapproval) {
    const pre = await mp(`/preapproval/${encodeURIComponent(ren.mp_preapproval)}`).catch(() => null);
    const mapa: Record<string, string> = { authorized: "ativa", paused: "pausada", cancelled: "cancelada" };
    const novo = pre?.status ? mapa[pre.status] : undefined;
    if (novo && novo !== ren.status && ren.status !== "cancelada") {
      await admin.from("renovacoes").update({ status: novo, atualizado_em: new Date().toISOString(),
        proxima_cobranca: pre?.next_payment_date ?? null }).eq("id", ren.id);
    }
  }
  const busca = await mp(`/v1/payments/search?external_reference=${encodeURIComponent("renovacao:" + ren.id)}&sort=date_created&criteria=desc&limit=50`).catch(() => null);
  for (const p of (busca?.results ?? [])) resultados.push(await aplicarPagamento(admin, p));
  return resultados;
}

