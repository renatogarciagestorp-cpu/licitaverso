// Cria o checkout do Mercado Pago para um plano ou uma consultoria
// e confere pagamentos quando a pessoa volta do checkout.
//
// POST { acao: "criar", tipo: "plano", plano, ciclo, parcelas, contratante, metodo, retorno }
// POST { acao: "criar", tipo: "consultoria", modalidade, assunto, descricao, metodo, retorno }
// POST { acao: "conferir", referencia: "assinatura:<id>" | "consultoria:<id>" }

import {
  aplicarPagamento, clienteServico, CORS, env, erro, mp, resposta, usuarioDaRequisicao,
} from "../_shared/comum.ts";
import {
  CONSULTORIA, type Ciclo, type Modalidade, type Plano, PLANOS, precoConsultoria, precoPlano,
} from "../_shared/precos.ts";

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
      const m = ref.match(/^(assinatura|consultoria):([0-9a-f-]{36})$/);
      if (!m) return erro("Referência inválida.");
      const tabela = m[1] === "assinatura" ? "assinaturas" : "consultorias";
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

    if (acao !== "criar") return erro("Ação desconhecida.");

    const { data: perfil } = await admin.from("perfis").select("nome, email").eq("id", usuario.id).maybeSingle();
    const { data: vigente } = await admin.rpc("plano_vigente", { uid: usuario.id });
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
      if (ciclo !== "mensal" && ciclo !== "anual") return erro("Ciclo inválido.");
      const contratante = ["fisica", "privada", "publica"].includes(corpo.contratante) ? corpo.contratante : "fisica";
      valor = precoPlano(plano, ciclo);
      const cartao = metodo === "cartao" || metodo === "cpgf";
      parcelas = ciclo === "anual" && cartao ? Math.max(1, Math.min(12, Number(corpo.parcelas) || 1)) : 1;
      titulo = `Licitacon · Plano ${PLANOS[plano].nome} · ${ciclo === "anual" ? "12 meses" : "1 mês"}`;

      const { data: nova, error } = await admin.from("assinaturas").insert({
        usuario_id: usuario.id, plano, ciclo, status: "pendente", valor, parcelas, contratante, metodo,
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
      valor = precoConsultoria(modalidade, vigente ?? null);
      titulo = `Licitacon · ${CONSULTORIA[modalidade].nome}`;

      const gratuita = valor <= 0;
      const { data: nova, error } = await admin.from("consultorias").insert({
        usuario_id: usuario.id, modalidade, assunto, descricao, plano: vigente ?? null, valor,
        status: gratuita ? "recebida" : "aguardando_pagamento",
      }).select("id").single();
      if (error) throw error;
      if (gratuita) return resposta({ gratuito: true, referencia: `consultoria:${nova.id}` });
      referencia = `consultoria:${nova.id}`;
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

    const tabela = referencia.startsWith("assinatura:") ? "assinaturas" : "consultorias";
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
