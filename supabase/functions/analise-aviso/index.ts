// Análise de documentos: e-mail ao cliente quando o parecer fica pronto (ou quando não foi possível analisar),
// e aviso à equipe em caso de erro em análise paga (para estorno ou reprocessamento).
// Chamada pela fila do GitHub Actions: POST { id } com o cabeçalho x-avisos = AVISOS_SECRET.

import { clienteServico, CORS, resposta } from "../_shared/comum.ts";
import { enviarEmail, moldura, SITE } from "../_shared/email.ts";
import { DOC_ANALISE, type DocAnalise } from "../_shared/precos.ts";

const esc = (t: string) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const segredo = Deno.env.get("AVISOS_SECRET");
  if (!segredo || req.headers.get("x-avisos") !== segredo) return resposta({ erro: "não autorizado" }, 401);
  const { id } = await req.json().catch(() => ({}));
  const admin = clienteServico();
  const { data: a } = await admin.from("analises").select("*").eq("id", String(id ?? "")).maybeSingle();
  if (!a) return resposta({ erro: "análise não encontrada" }, 404);
  if (a.avisado_status === a.status) return resposta({ ok: true, enviado: false, motivo: "já avisado" });
  if (a.status !== "concluida" && a.status !== "erro") return resposta({ ok: true, enviado: false, motivo: "status sem aviso" });

  const { data: p } = await admin.from("perfis").select("nome, email").eq("id", a.usuario_id).maybeSingle();
  const doc = DOC_ANALISE[a.documento as DocAnalise] ?? a.documento;
  const primeiro = (p?.nome || "").trim().split(/\s+/)[0] || "Olá";
  const link = `${SITE}index.html?p=agente`;
  const enviados: string[] = [];

  try {
    if (p?.email) {
      if (a.status === "concluida") {
        const r = a.resumo || {};
        const html = moldura(`Seu parecer técnico está pronto`, [
          `${esc(primeiro)}, a análise do documento <strong>${esc(doc)}</strong>${a.nome_arquivo ? ` (${esc(a.nome_arquivo)})` : ""} foi concluída.`,
          r.objeto ? `<strong>Objeto:</strong> ${esc(String(r.objeto).slice(0, 300))}` : "",
          `<strong>Resultado:</strong> ${esc(r.situacao || "")} Apontamentos: ${Number(r.alta || 0)} de gravidade alta, ${Number(r.media || 0)} média e ${Number(r.baixa || 0)} baixa.`,
          `O parecer está disponível em PDF e Word na sua área, em <em>Análise de documentos</em>.`,
          `Lembre-se: o parecer é <strong>opinativo</strong>. Ele aponta todos os aspectos identificados, dos críticos aos leves, mas a decisão de ajustar ou manter cada ponto é sua.`,
        ].filter(Boolean), { texto: "Abrir o parecer", url: link }, undefined, "Andamento de consultoria");
        await enviarEmail({ email: p.email, nome: p.nome }, `Parecer pronto: análise do ${doc}`, html);
      } else {
        const html = moldura(`Não foi possível concluir a análise`, [
          `${esc(primeiro)}, não conseguimos analisar o documento <strong>${esc(doc)}</strong>${a.nome_arquivo ? ` (${esc(a.nome_arquivo)})` : ""}.`,
          `<strong>Motivo:</strong> ${esc(a.erro_msg || "falha no processamento.")}`,
          a.cobranca === "franquia_pro"
            ? "Esta análise não foi descontada da sua cota semanal. Você pode enviar o documento de novo."
            : "Como a análise foi paga, nossa equipe vai entrar em contato em até 1 dia útil para reprocessar ou estornar o valor.",
        ], { texto: "Ver minhas análises", url: link }, undefined, "Andamento de consultoria");
        await enviarEmail({ email: p.email, nome: p.nome }, `Análise do ${doc}: não foi possível concluir`, html);
      }
      enviados.push("cliente");
    }
    if (a.status === "erro") {
      const { data: eq } = await admin.from("perfis").select("email, nome").eq("admin", true);
      const html = moldura("Análise com erro", [
        `Documento: ${esc(doc)} · ${a.cobranca === "avulsa" ? "avulsa paga (R$ " + Number(a.valor).toFixed(2).replace(".", ",") + ")" : "franquia Pro"}`,
        `Cliente: ${esc(p?.nome || "—")} · ${esc(p?.email || "")}`,
        `Erro: ${esc(a.erro_msg || "")}`,
        a.cobranca === "avulsa" ? "Ação: reprocessar (Painel → Análises) ou estornar no Mercado Pago." : "Sem cobrança; a cota não foi consumida.",
      ], { texto: "Abrir no Painel", url: `${SITE}painel.html` }, undefined, "avisos da equipe");
      for (const pessoa of (eq ?? []).filter((x) => x.email)) await enviarEmail({ email: pessoa.email, nome: pessoa.nome }, "Licitacon · análise com erro", html);
      enviados.push("equipe");
    }
    await admin.from("analises").update({ avisado_status: a.status }).eq("id", a.id);
    return resposta({ ok: true, enviados });
  } catch (e) {
    console.error("analise-aviso", e);
    return resposta({ erro: "falha ao enviar" }, 500);
  }
});
