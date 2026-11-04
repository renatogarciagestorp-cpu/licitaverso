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

  const primeiro = (marcado.nome || "").trim().split(/\s+/)[0].replace(/[&<>"']/g, "") || "Olá";
  const html = moldura(
    `Boas-vindas ao Licitacon, ${primeiro}!`,
    [
      "Sua conta está pronta, no plano Gratuito. Veja por onde começar:",
      "<strong>1. Grátis para sempre</strong> — a Biblioteca Jurídica (jurisprudência de todo o país, com anotações, marcadores e dossiês), a calculadora de reajuste com nota técnica e a leitura do fórum.",
      "<strong>2. Teste grátis de 7 dias</strong> — sem cartão e sem cobrança no fim. Libera perguntar e responder no fórum e as planilhas de mão de obra da IN 05/2017.",
      "<strong>3. Ficou com dúvida?</strong> Clique em <strong>💬 Dúvidas?</strong> no canto do site: o assistente responde na hora.",
    ],
    { texto: "Abrir a Biblioteca Jurídica", url: `${SITE}biblioteca.html` },
    `Quer participar do fórum? <a href="${SITE}index.html?p=planos" style="color:#0F6B7E">Comece o teste grátis</a>.`,
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
