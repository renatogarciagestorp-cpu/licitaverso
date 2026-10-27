// Fórum: avisa por e-mail quem fez a pergunta quando chega uma resposta nova.
// Chamada pelo site logo depois de publicar a resposta (corpo: { resposta_id }).
// Só envia se o autor da pergunta escolheu receber o aviso, não desligou
// "Resposta na minha pergunta" em Notificações e não é quem respondeu.
// Cada resposta gera no máximo um e-mail (coluna aviso_enviado_em).

import { clienteServico, CORS, resposta, usuarioDaRequisicao } from "../_shared/comum.ts";
import { enviarEmail, moldura, SITE } from "../_shared/email.ts";

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const trecho = (t: string, n = 400) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = clienteServico();
  const usuario = await usuarioDaRequisicao(req, admin);
  if (!usuario) return resposta({ erro: "faça login" }, 401);
  const { resposta_id } = await req.json().catch(() => ({}));
  if (!resposta_id) return resposta({ erro: "resposta_id ausente" }, 400);

  const { data: r } = await admin.from("forum_respostas")
    .select("id, pergunta_id, autor_id, autor_nome, texto, oficial, criado_em, aviso_enviado_em")
    .eq("id", resposta_id).maybeSingle();
  if (!r || r.autor_id !== usuario.id) return resposta({ erro: "resposta não encontrada" }, 404);
  if (r.aviso_enviado_em) return resposta({ ok: true, enviado: false, motivo: "já avisado" });
  if (Date.now() - new Date(r.criado_em).getTime() > 3600000) return resposta({ ok: true, enviado: false, motivo: "resposta antiga" });

  const { data: q } = await admin.from("forum_perguntas")
    .select("id, titulo, autor_id, avisar_respostas, forum_topicos(nome)").eq("id", r.pergunta_id).maybeSingle();
  const marcar = () => admin.from("forum_respostas").update({ aviso_enviado_em: new Date().toISOString() }).eq("id", r.id);
  if (!q || !q.avisar_respostas || q.autor_id === r.autor_id) { await marcar(); return resposta({ ok: true, enviado: false }); }

  const { data: p } = await admin.from("perfis").select("nome, email, notificacoes").eq("id", q.autor_id).maybeSingle();
  if (!p?.email || p?.notificacoes?.["resposta-thread"]?.email === false) { await marcar(); return resposta({ ok: true, enviado: false }); }

  // deno-lint-ignore no-explicit-any
  const topico = ((q as any).forum_topicos?.nome as string) || "";
  const primeiro = (p.nome || "").trim().split(/\s+/)[0] || "Olá";
  const quem = r.oficial ? "A equipe Licitacon" : esc(r.autor_nome || "Um participante");
  const html = moldura(
    "Nova resposta à sua pergunta",
    [
      `${primeiro}, ${quem} respondeu à sua pergunta no fórum${topico ? ` (${esc(topico)})` : ""}:`,
      `<strong>“${esc(q.titulo)}”</strong>`,
      `<span style="display:block;border-left:3px solid #0FA36B;padding:4px 0 4px 12px;color:#3D5058">${esc(trecho(r.texto)).replace(/\n/g, "<br>")}</span>`,
    ],
    { texto: "Ver a resposta no fórum", url: `${SITE}index.html?p=forum${topico ? `&topico=${encodeURIComponent(topico)}` : ""}` },
    "Para não receber mais avisos desta pergunta, abra-a no fórum e desligue o aviso de respostas por e-mail.",
    "Resposta na minha pergunta",
  );
  try {
    await enviarEmail({ email: p.email, nome: p.nome }, `Nova resposta: ${trecho(q.titulo, 80)}`, html);
    await marcar();
    return resposta({ ok: true, enviado: true });
  } catch (e) {
    console.error("forum-aviso: falha ao enviar", r.id, e);
    return resposta({ erro: "falha ao enviar" }, 502);
  }
});
