import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { avisarEquipeNovaConsultoria } from "./consultoria.ts";

// MP_API_URL só existe para testes locais; em produção fica a API oficial.
export const MP_API = Deno.env.get("MP_API_URL") || "https://api.mercadopago.com";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  if (!/^(assinatura|consultoria|analise):[0-9a-f-]{36}$/.test(ref)) return "referencia_ignorada";
  const status: string = pagamento.status;
  if (status === "approved") {
    const { data, error } = await admin.rpc("registrar_pagamento_aprovado", {
      p_referencia: ref,
      p_mp_pagamento: String(pagamento.id),
      p_metodo: NOME_METODO[pagamento.payment_type_id] ?? pagamento.payment_type_id ?? "",
      p_valor: Number(pagamento.transaction_amount ?? 0),
      p_parcelas: Number(pagamento.installments ?? 1),
    });
    if (error) throw error;
    if (String(data) === "consultoria_paga") await avisarEquipeNovaConsultoria(admin, ref.split(":")[1]);
    return String(data);
  }
  // Cartão recusado não encerra o pedido: a pessoa pode tentar de novo no mesmo checkout.
  if (status === "cancelled") {
    const { data, error } = await admin.rpc("registrar_pagamento_recusado", { p_referencia: ref });
    if (error) throw error;
    return "recusado:" + data;
  }
  return "aguardando:" + status;
}
