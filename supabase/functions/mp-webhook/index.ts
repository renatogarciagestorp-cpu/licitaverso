// Recebe as notificações do Mercado Pago e libera o acesso quando o pagamento é aprovado.
// Publicada sem exigir login do Supabase (o Mercado Pago não envia esse token);
// a autenticidade vem da assinatura x-signature (MP_WEBHOOK_SECRET) e, sobretudo,
// de a função sempre buscar o pagamento direto na API do Mercado Pago antes de agir.

import { aplicarPagamento, clienteServico, conferirRenovacao, CORS, mp, resposta, segredoConfere } from "../_shared/comum.ts";

async function hmacHex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Confere x-signature: "ts=<ts>,v1=<hmac>" sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" */
async function assinaturaValida(req: Request, dataId: string, segredo: string): Promise<boolean> {
  const cabecalho = req.headers.get("x-signature") ?? "";
  const partes = Object.fromEntries(
    cabecalho.split(",").map((p) => p.trim().split("=").map((x) => x.trim())).filter((p) => p.length === 2),
  );
  const ts = partes["ts"];
  const v1 = partes["v1"];
  if (!ts || !v1) return false;
  const requestId = req.headers.get("x-request-id") ?? "";
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifesto = "";
  if (id) manifesto += `id:${id};`;
  if (requestId) manifesto += `request-id:${requestId};`;
  manifesto += `ts:${ts};`;
  return iguais(await hmacHex(segredo, manifesto), v1.toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") return resposta({ ok: true, servico: "mp-webhook" });

  const url = new URL(req.url);
  const corpo = await req.json().catch(() => ({} as any));

  // Conferência periódica das renovações automáticas (chamada pelo agendamento do GitHub, com o segredo interno)
  if (corpo?.acao === "conferir_renovacoes" && segredoConfere(req)) {
    const admin = clienteServico();
    const { data: lista } = await admin.from("renovacoes").select("id, status, mp_preapproval").in("status", ["pendente", "ativa", "pausada"]).limit(500);
    let n = 0;
    for (const ren of lista ?? []) { try { await conferirRenovacao(admin, ren); n++; } catch (e) { console.error("renovacao", ren.id, e); } }
    return resposta({ ok: true, conferidas: n });
  }
  const tipo = String(corpo?.type ?? corpo?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const dataId = String(url.searchParams.get("data.id") ?? corpo?.data?.id ?? url.searchParams.get("id") ?? "");

  const segredo = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";
  if (segredo && !(await assinaturaValida(req, dataId, segredo))) {
    console.warn("mp-webhook: assinatura inválida", { tipo, dataId });
    return resposta({ erro: "assinatura inválida" }, 401);
  }

  // Renovação automática (assinatura recorrente do Mercado Pago)
  if (dataId && (tipo === "subscription_preapproval" || tipo === "preapproval" || tipo === "subscription_authorized_payment")) {
    try {
      const admin = clienteServico();
      let preId = dataId;
      if (tipo === "subscription_authorized_payment") {
        const ap = await mp(`/authorized_payments/${encodeURIComponent(dataId)}`);
        preId = String(ap?.preapproval_id ?? "");
        if (ap?.payment?.id) {
          const pg = await mp(`/v1/payments/${encodeURIComponent(String(ap.payment.id))}`);
          if (!pg.external_reference && preId) {
            const pre = await mp(`/preapproval/${encodeURIComponent(preId)}`);
            pg.external_reference = pre?.external_reference ?? "";
          }
          console.log("mp-webhook renovacao pagamento", await aplicarPagamento(admin, pg));
        }
      }
      const { data: ren } = await admin.from("renovacoes").select("id, status, mp_preapproval").eq("mp_preapproval", preId).maybeSingle();
      if (ren) await conferirRenovacao(admin, ren);
      return resposta({ ok: true });
    } catch (e) {
      console.error("mp-webhook renovacao falhou", dataId, e);
      return resposta({ erro: "falha ao processar" }, 500);
    }
  }

  // Demais: só notificações de pagamento
  if (!dataId || (tipo && tipo !== "payment")) return resposta({ ok: true, ignorado: tipo || "sem id" });

  try {
    const pagamento = await mp(`/v1/payments/${encodeURIComponent(dataId)}`);
    const resultado = await aplicarPagamento(clienteServico(), pagamento);
    console.log("mp-webhook", dataId, pagamento?.status, pagamento?.external_reference, resultado);
    return resposta({ ok: true, resultado });
  } catch (e) {
    console.error("mp-webhook falhou", dataId, e);
    // 500 faz o Mercado Pago tentar de novo mais tarde
    return resposta({ erro: "falha ao processar" }, 500);
  }
});
