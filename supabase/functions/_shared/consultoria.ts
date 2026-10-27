// E-mails da consultoria: aviso à equipe quando chega um pedido e aviso ao cliente sobre o andamento.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { enviarEmail, moldura, SITE } from "./email.ts";
import { CONSULTORIA, type Modalidade } from "./precos.ts";

export const esc = (t: string) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const brl = (v: number) => "R$ " + Number(v).toFixed(2).replace(".", ",");
const nomeMod = (m: string) => CONSULTORIA[m as Modalidade]?.nome ?? m;
const trecho = (t: string, n = 700) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);

/** E-mails dos administradores (quem atende as consultorias). */
async function equipe(admin: SupabaseClient): Promise<{ email: string; nome?: string }[]> {
  const { data } = await admin.from("perfis").select("email, nome").eq("admin", true);
  const lista = (data ?? []).filter((p) => p.email).map((p) => ({ email: p.email, nome: p.nome }));
  if (!lista.length && Deno.env.get("EMAIL_REMETENTE")) lista.push({ email: Deno.env.get("EMAIL_REMETENTE")!, nome: "Licitacon" });
  return lista;
}

/** Pedido novo (pago ou incluído no Pro): avisa a equipe. Nunca derruba quem chamou. */
export async function avisarEquipeNovaConsultoria(admin: SupabaseClient, id: string) {
  try {
    const { data: c } = await admin.from("consultorias").select("*").eq("id", id).maybeSingle();
    if (!c) return;
    const { data: p } = await admin.from("perfis").select("nome, email, celular, orgao, cargo").eq("id", c.usuario_id).maybeSingle();
    const anexos = Array.isArray(c.anexos) ? c.anexos.length : 0;
    const html = moldura(
      "Nova consultoria para atender",
      [
        `<strong>${esc(nomeMod(c.modalidade))}</strong> · ${Number(c.valor) > 0 ? brl(c.valor) + " pago" : "incluída no plano Pro"}`,
        `<strong>${esc(c.assunto)}</strong>`,
        `<span style="display:block;border-left:3px solid #0FA36B;padding:4px 0 4px 12px">${esc(trecho(c.descricao || "")).replace(/\n/g, "<br>")}</span>`,
        `Cliente: ${esc(p?.nome || "—")} · ${esc(p?.email || "")}${p?.celular ? " · " + esc(p.celular) : ""}${p?.orgao ? "<br>" + esc([p.cargo, p.orgao].filter(Boolean).join(" · ")) : ""}`,
        anexos ? `${anexos} arquivo(s) anexado(s) — baixe no Painel.` : "Sem arquivos anexados.",
        "Prazo de triagem: confirme o escopo em até 1 dia útil (Painel → Consultorias → “Em andamento” e avisar o cliente).",
      ],
      { texto: "Abrir no Painel", url: `${SITE}painel.html` },
      undefined,
      "avisos da equipe",
    );
    for (const pessoa of await equipe(admin)) {
      await enviarEmail(pessoa, `Nova consultoria: ${trecho(c.assunto, 70)}`, html).catch((e) => console.error("aviso equipe", e));
    }
  } catch (e) {
    console.error("avisarEquipeNovaConsultoria", e);
  }
}

/** Pedido de proposta de órgão público (registrado em contatos). */
export async function avisarEquipeProposta(admin: SupabaseClient, contato: any) {
  const d = contato.detalhes || {};
  const html = moldura(
    "Órgão público pediu proposta de consultoria",
    [
      `<strong>${esc(nomeMod(d.modalidade))}</strong> · ${esc(d.assunto || "")}`,
      `<span style="display:block;border-left:3px solid #0FA36B;padding:4px 0 4px 12px">${esc(trecho(contato.mensagem || "")).replace(/\n/g, "<br>")}</span>`,
      `Contato: ${esc(contato.nome)} · ${esc(contato.email)}${d.celular ? " · " + esc(d.celular) : ""}${d.orgao ? "<br>" + esc([d.cargo, d.orgao].filter(Boolean).join(" · ")) : ""}`,
      Array.isArray(d.anexos) && d.anexos.length ? `${d.anexos.length} arquivo(s) anexado(s) — veja no Painel → Mensagens.` : "Sem arquivos anexados.",
      "Envie em até 1 dia útil: proposta com valor e prazo, certidões de regularidade e dados bancários para empenho.",
    ],
    { texto: "Abrir no Painel", url: `${SITE}painel.html` },
    undefined,
    "avisos da equipe",
  );
  for (const pessoa of await equipe(admin)) {
    await enviarEmail(pessoa, `Proposta de consultoria para órgão público: ${trecho(d.assunto || "", 60)}`, html).catch((e) => console.error("aviso proposta", e));
  }
}

/** Aviso ao cliente sobre o andamento (escopo confirmado, entregue ou cancelada). */
export function emailAndamento(c: any, primeiro: string): { assunto: string; html: string } | null {
  const conta = `${SITE}index.html?p=conta&tab=atividade`;
  const link = String(c.entrega_link || "");
  const nota = String(c.resposta || "").trim();
  const extra = nota ? [`<span style="display:block;border-left:3px solid #0FA36B;padding:4px 0 4px 12px;color:#3D5058">${esc(trecho(nota, 600)).replace(/\n/g, "<br>")}</span>`] : [];
  if (c.status === "em_andamento") {
    if (c.modalidade === "reuniao") {
      return {
        assunto: "Consultoria confirmada: escolha o horário da reunião",
        html: moldura("Sua reunião está confirmada", [
          `${primeiro}, o escopo da sua consultoria “<strong>${esc(c.assunto)}</strong>” foi confirmado.`,
          link ? "Escolha o melhor horário na agenda do especialista. O link do Google Meet chega junto com a confirmação do horário." : "Em breve enviamos o link para você escolher o horário.",
          ...extra,
          "Se precisar remarcar, avise com pelo menos 24 horas de antecedência.",
        ], link ? { texto: "Escolher horário", url: link } : { texto: "Acompanhar a consultoria", url: conta }, undefined, "Andamento de consultoria"),
      };
    }
    return {
      assunto: "Consultoria confirmada: análise iniciada",
      html: moldura("Escopo confirmado", [
        `${primeiro}, o escopo da sua consultoria “<strong>${esc(c.assunto)}</strong>” foi confirmado e a análise começou.`,
        `Prazo: ${c.modalidade === "video" ? "até 7 dias úteis" : "até 5 dias úteis"}. Avisaremos por e-mail assim que a entrega estiver pronta.`,
        ...extra,
      ], { texto: "Acompanhar a consultoria", url: conta }, undefined, "Andamento de consultoria"),
    };
  }
  if (c.status === "entregue") {
    const rotulo = c.modalidade === "video" ? "Assistir ao vídeo" : c.modalidade === "reuniao" ? "Abrir link da reunião" : "Ler a resposta";
    return {
      assunto: "Sua consultoria foi entregue",
      html: moldura("Entrega disponível", [
        `${primeiro}, a sua consultoria “<strong>${esc(c.assunto)}</strong>” foi entregue.`,
        nota ? "A resposta completa está na sua Área do Assinante, em Atividade." : "",
        "Se ficar alguma dúvida, você tem 1 rodada de esclarecimento por escrito em até 7 dias: basta responder a este e-mail.",
      ].filter(Boolean), { texto: rotulo, url: link && c.modalidade !== "escrita" ? link : conta }, undefined, "Andamento de consultoria"),
    };
  }
  if (c.status === "cancelada") {
    return {
      assunto: "Sua consultoria foi cancelada",
      html: moldura("Pedido cancelado", [
        `${primeiro}, o pedido de consultoria “<strong>${esc(c.assunto)}</strong>” foi cancelado.`,
        Number(c.valor) > 0 && c.pago_em ? "O valor pago será devolvido integralmente pelo Mercado Pago, na mesma forma de pagamento." : "",
        ...extra,
      ].filter(Boolean), { texto: "Ver minha conta", url: conta }, undefined, "Andamento de consultoria"),
    };
  }
  return null;
}
