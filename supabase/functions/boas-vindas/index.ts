// E-mail de boas-vindas, enviado uma única vez no primeiro acesso à conta (chamado pelo site).
import { clienteServico, CORS, resposta, usuarioDaRequisicao } from "../_shared/comum.ts";
import { enviarEmail, moldura, SITE } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = clienteServico();
  const usuario = await usuarioDaRequisicao(req, admin);
  if (!usuario) return resposta({ erro: "faça login" }, 401);

  // Marca antes de enviar: duas abas abertas ao mesmo tempo não geram dois e-mails.
  const { data: marcado } = await admin.from("perfis").update({ boas_vindas_em: new Date().toISOString() })
    .eq("id", usuario.id).is("boas_vindas_em", null).select("nome, email, notificacoes").maybeSingle();
  if (!marcado) return resposta({ ok: true, enviado: false });
  if (!marcado.email || marcado.notificacoes?.cobranca?.email === false) return resposta({ ok: true, enviado: false });

  const primeiro = (marcado.nome || "").trim().split(/\s+/)[0] || "Olá";
  const html = moldura(
    `Boas-vindas ao Licitacon, ${primeiro}!`,
    [
      "Sua conta está pronta. Veja por onde começar:",
      "<strong>1. Biblioteca Jurídica</strong> — gratuita para você: decisões do TCU, CGU, STF, STJ e de órgãos do Rio de Janeiro, com tema, tese e link para a fonte oficial. Salve anotações e marcadores na sua conta.",
      "<strong>2. Teste grátis de 7 dias</strong> — sem cartão e sem cobrança no fim. Libera a leitura do fórum para você conhecer a comunidade.",
      "<strong>3. Ficou com dúvida?</strong> Clique em <strong>💬 Dúvidas?</strong> no canto do site: o assistente responde na hora.",
    ],
    { texto: "Abrir a Biblioteca Jurídica", url: `${SITE}biblioteca.html` },
    `Quer conhecer o fórum? <a href="${SITE}index.html?p=planos" style="color:#0F6B7E">Comece o teste grátis</a>.`,
  );
  try {
    await enviarEmail({ email: marcado.email, nome: marcado.nome }, "Boas-vindas ao Licitacon", html);
    return resposta({ ok: true, enviado: true });
  } catch (e) {
    console.error("boas-vindas", e);
    // Libera para tentar de novo no próximo acesso
    await admin.from("perfis").update({ boas_vindas_em: null }).eq("id", usuario.id);
    return resposta({ erro: "falha ao enviar" }, 502);
  }
});
