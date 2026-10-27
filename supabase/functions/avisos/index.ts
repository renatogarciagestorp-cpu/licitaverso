// Avisos diários por e-mail: o plano está perto de acabar.
// Chamada uma vez por dia pelo GitHub Actions (workflow avisos-diarios.yml).
// Idempotente: cada assinatura recebe o aviso uma única vez (coluna aviso_fim_em).
//  - planos pagos: aviso quando faltam 7 dias ou menos;
//  - teste grátis: dica de uso no 3º dia e aviso na véspera do fim ("termina amanhã").

import { clienteServico, CORS, resposta } from "../_shared/comum.ts";
import { enviarEmail, moldura, SITE } from "../_shared/email.ts";
import { PLANOS } from "../_shared/precos.ts";

const DIA = 86400000;
const nomePlano = (p: string) => (p === "teste" ? "Teste grátis" : PLANOS[p as keyof typeof PLANOS]?.nome ?? p);
const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const segredo = Deno.env.get("AVISOS_SECRET");
  if (segredo && req.headers.get("x-avisos") !== segredo) return resposta({ erro: "não autorizado" }, 401);

  const admin = clienteServico();
  const agora = Date.now();
  const { data: lista, error } = await admin.from("assinaturas")
    .select("id, usuario_id, plano, ciclo, fim")
    .eq("status", "ativa").is("aviso_fim_em", null)
    .gt("fim", new Date(agora).toISOString())
    .lte("fim", new Date(agora + 7 * DIA).toISOString())
    .limit(500);
  if (error) return resposta({ erro: error.message }, 500);

  const resultado = { enviados: 0, pulados: 0, falhas: 0 };
  const marcar = (id: string) => admin.from("assinaturas").update({ aviso_fim_em: new Date().toISOString() }).eq("id", id);

  for (const a of lista ?? []) {
    const restante = new Date(a.fim).getTime() - agora;
    if (a.plano === "teste" && restante > 1.5 * DIA) continue; // teste: só na véspera do fim

    // Já renovou ou tem outro plano que vai além desta data? Não avisa.
    const { data: outros } = await admin.from("assinaturas").select("id")
      .eq("usuario_id", a.usuario_id).eq("status", "ativa").neq("id", a.id).gt("fim", a.fim).limit(1);
    const { data: p } = await admin.from("perfis").select("nome, email, notificacoes").eq("id", a.usuario_id).maybeSingle();
    const querEmail = p?.notificacoes?.cobranca?.email !== false;
    if ((outros && outros.length) || !p?.email || !querEmail) {
      await marcar(a.id);
      resultado.pulados++;
      continue;
    }

    const dias = Math.max(1, Math.ceil(restante / DIA));
    const primeiro = (p.nome || "").trim().split(/\s+/)[0] || "Olá";
    const teste = a.plano === "teste";
    const assunto = teste
      ? "Seu teste grátis do Licitacon termina amanhã"
      : `Seu plano ${nomePlano(a.plano)} termina em ${dias} dia${dias > 1 ? "s" : ""}`;
    const html = moldura(
      teste ? "Seu teste termina amanhã" : "Seu plano está perto do fim",
      [
        `${primeiro}, ${teste ? "o seu teste grátis" : `o seu plano <strong>${nomePlano(a.plano)}</strong>`} no Licitacon vale até <strong>${dataBR(a.fim)}</strong>.`,
        teste
          ? "Para continuar com o fórum, os descontos em cursos e consultoria e a Biblioteca completa, escolha um plano. Nada é cobrado automaticamente."
          : "Não há renovação automática: para não perder o acesso ao fórum e aos descontos, renove quando quiser. O tempo que ainda resta é somado ao novo período.",
      ],
      { texto: teste ? "Escolher um plano" : "Renovar meu plano", url: `${SITE}index.html?p=planos` },
      "Se você já renovou, pode ignorar esta mensagem.",
    );
    try {
      await enviarEmail({ email: p.email, nome: p.nome }, assunto, html);
      await marcar(a.id);
      resultado.enviados++;
    } catch (e) {
      console.error("avisos: falha ao enviar", a.id, e);
      resultado.falhas++;
    }
  }
  // ---------------------------------------------------------------- dica do teste (3º dia)
  const { data: testes } = await admin.from("assinaturas")
    .select("id, usuario_id, inicio, fim")
    .eq("plano", "teste").eq("status", "ativa").is("dica_teste_em", null)
    .lte("inicio", new Date(agora - 2 * DIA).toISOString())
    .gt("fim", new Date(agora + 2 * DIA).toISOString())
    .limit(500);
  for (const t of testes ?? []) {
    await admin.from("assinaturas").update({ dica_teste_em: new Date().toISOString() }).eq("id", t.id);
    const { data: p } = await admin.from("perfis").select("nome, email, notificacoes").eq("id", t.usuario_id).maybeSingle();
    if (!p?.email || p?.notificacoes?.cobranca?.email === false) { resultado.pulados++; continue; }
    const primeiro = (p.nome || "").trim().split(/\s+/)[0] || "Olá";
    const html = moldura(
      "Aproveite seu teste: 3 dicas rápidas",
      [
        `${primeiro}, seu teste grátis vale até <strong>${dataBR(t.fim)}</strong>. Três jeitos de tirar proveito dele:`,
        "<strong>1. Leia as perguntas frequentes do fórum</strong> — reajuste, repactuação, adesão a ata, aditivos e mais, com resposta fundamentada na lei e na jurisprudência.",
        "<strong>2. Pesquise com filtros na Biblioteca</strong> — combine tema, órgão e artigo da lei e copie a citação pronta (ABNT, peça ou curta).",
        "<strong>3. Veja o que um plano libera</strong> — perguntar e responder no fórum, desconto em cursos e consultoria; no Pro, 1 consultoria por escrito por mês.",
      ],
      { texto: "Abrir o fórum", url: `${SITE}index.html?p=forum` },
      "Nada é cobrado quando o teste termina.",
    );
    try { await enviarEmail({ email: p.email, nome: p.nome }, "3 dicas para aproveitar seu teste no Licitacon", html); resultado.enviados++; }
    catch (e) { console.error("avisos: dica do teste", t.id, e); resultado.falhas++; }
  }

  console.log("avisos", resultado);
  return resposta({ ok: true, ...resultado });
});
