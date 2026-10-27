// Consultoria: e-mails disparados pelo site e pelo Painel.
// POST { tipo: "andamento", consultoria_id }  → só administrador; avisa o cliente sobre o status atual.
// POST { tipo: "proposta" }                   → quem fez o pedido; avisa a equipe sobre proposta de órgão público.

import { clienteServico, CORS, resposta, usuarioDaRequisicao } from "../_shared/comum.ts";
import { enviarEmail } from "../_shared/email.ts";
import { avisarEquipeProposta, emailAndamento } from "../_shared/consultoria.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = clienteServico();
  const usuario = await usuarioDaRequisicao(req, admin);
  if (!usuario) return resposta({ erro: "faça login" }, 401);
  const corpo = await req.json().catch(() => ({}));

  if (corpo.tipo === "proposta") {
    // O pedido mais recente da própria pessoa, dos últimos 15 minutos, ainda não avisado
    const { data: lista } = await admin.from("contatos").select("*").eq("usuario_id", usuario.id)
      .eq("detalhes->>tipo", "consultoria_orgao").gte("criado_em", new Date(Date.now() - 15 * 60000).toISOString())
      .order("criado_em", { ascending: false }).limit(1);
    const ct = lista?.[0];
    if (!ct || ct.detalhes?.avisado) return resposta({ ok: true, enviado: false });
    await admin.from("contatos").update({ detalhes: { ...ct.detalhes, avisado: true } }).eq("id", ct.id);
    await avisarEquipeProposta(admin, ct);
    return resposta({ ok: true, enviado: true });
  }

  if (corpo.tipo === "andamento") {
    const { data: eu } = await admin.from("perfis").select("admin").eq("id", usuario.id).maybeSingle();
    if (!eu?.admin) return resposta({ erro: "não autorizado" }, 403);
    const { data: c } = await admin.from("consultorias").select("*").eq("id", String(corpo.consultoria_id ?? "")).maybeSingle();
    if (!c) return resposta({ erro: "consultoria não encontrada" }, 404);
    const { data: p } = await admin.from("perfis").select("nome, email, notificacoes").eq("id", c.usuario_id).maybeSingle();
    if (!p?.email) return resposta({ ok: true, enviado: false, motivo: "sem e-mail" });
    // E-mails de andamento são parte do serviço contratado: só não saem se a pessoa desligou "Andamento de consultoria".
    if (p.notificacoes?.consultoria?.email === false) return resposta({ ok: true, enviado: false, motivo: "cliente desligou os avisos" });
    const primeiro = (p.nome || "").trim().split(/\s+/)[0] || "Olá";
    const msg = emailAndamento(c, primeiro);
    if (!msg) return resposta({ ok: true, enviado: false, motivo: "status sem aviso" });
    try {
      await enviarEmail({ email: p.email, nome: p.nome }, msg.assunto, msg.html);
      await admin.from("consultorias").update({ avisado_status: c.status }).eq("id", c.id);
      return resposta({ ok: true, enviado: true });
    } catch (e) {
      console.error("consultoria-aviso", e);
      return resposta({ erro: "falha ao enviar o e-mail" }, 502);
    }
  }
  return resposta({ erro: "tipo desconhecido" }, 400);
});
