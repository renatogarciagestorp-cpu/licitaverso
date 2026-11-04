// Avisos diários por e-mail: o plano está perto de acabar.
// Chamada uma vez por dia pelo GitHub Actions (workflow avisos-diarios.yml).
// Idempotente: cada assinatura recebe o aviso uma única vez (coluna aviso_fim_em).
//  - planos pagos: aviso quando faltam 7 dias ou menos;
//  - teste grátis: dica de uso no 3º dia e aviso na véspera do fim ("termina amanhã");
//  - fim do preço de fundador: aviso com 30 dias de antecedência e, depois do prazo, novo valor na renovação automática.

import { clienteServico, CORS, mp, resposta, segredoConfere } from "../_shared/comum.ts";
import { enviarEmail, moldura, SITE } from "../_shared/email.ts";
import { PLANOS, precoPlano } from "../_shared/precos.ts";

const DIA = 86400000;
const nomePlano = (p: string) => (p === "teste" ? "Teste grátis" : PLANOS[p as keyof typeof PLANOS]?.nome ?? p);
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!segredoConfere(req)) return resposta({ erro: "não autorizado" }, 401);

  const admin = clienteServico();
  const agora = Date.now();
  const { data: lista, error } = await admin.from("assinaturas")
    .select("id, usuario_id, plano, ciclo, fim")
    .eq("status", "ativa").is("aviso_fim_em", null)
    .gt("fim", new Date(agora).toISOString())
    .lte("fim", new Date(agora + 7 * DIA).toISOString())
    .limit(500);
  if (error) { console.error("avisos", error); return resposta({ erro: "falha ao consultar" }, 500); }

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
    const primeiro = (p.nome || "").trim().split(/\s+/)[0].replace(/[&<>"']/g, "") || "Olá";
    const teste = a.plano === "teste";
    const assunto = teste
      ? "Seu teste grátis do Licitacon termina amanhã"
      : `Seu plano ${nomePlano(a.plano)} termina em ${dias} dia${dias > 1 ? "s" : ""}`;
    const html = moldura(
      teste ? "Seu teste termina amanhã" : "Seu plano está perto do fim",
      [
        `${primeiro}, ${teste ? "o seu teste grátis" : `o seu plano <strong>${nomePlano(a.plano)}</strong>`} no Licitacon vale até <strong>${dataBR(a.fim)}</strong>.`,
        teste
          ? "Depois do teste você continua no plano Gratuito, com a Biblioteca Jurídica, a calculadora de reajuste e a leitura do fórum. Para continuar perguntando no fórum, usando as planilhas de mão de obra e com desconto em cursos e consultoria, escolha um plano. Nada é cobrado automaticamente."
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
    const primeiro = (p.nome || "").trim().split(/\s+/)[0].replace(/[&<>"']/g, "") || "Olá";
    const html = moldura(
      "Aproveite seu teste: 3 dicas rápidas",
      [
        `${primeiro}, seu teste grátis vale até <strong>${dataBR(t.fim)}</strong>. Três jeitos de tirar proveito dele:`,
        "<strong>1. Pergunte no fórum</strong> — reajuste, repactuação, adesão a ata, aditivos e mais, com resposta da comunidade e do especialista.",
        "<strong>2. Monte uma planilha de mão de obra</strong> — planilha de custos da IN 05/2017, repactuação ou análise da proposta, com download em Excel e PDF.",
        "<strong>3. Veja o que um plano libera</strong> — os agentes de IA com desconto, cursos e consultoria; no Pro, 1 consultoria por escrito por mês.",
      ],
      { texto: "Abrir o fórum", url: `${SITE}index.html?p=forum` },
      "Nada é cobrado quando o teste termina.",
    );
    try { await enviarEmail({ email: p.email, nome: p.nome }, "3 dicas para aproveitar seu teste no Licitacon", html); resultado.enviados++; }
    catch (e) { console.error("avisos: dica do teste", t.id, e); resultado.falhas++; }
  }

  // ---------------------------------------------------------------- fim do preço de fundador (renovações automáticas)
  const { data: rens } = await admin.from("renovacoes")
    .select("id, usuario_id, plano, ciclo, valor, status, mp_preapproval, aviso_preco_em, novo_valor")
    .eq("fundador", true).in("status", ["ativa", "pausada", "pendente"]).not("mp_preapproval", "is", null).limit(500);
  const precos = { avisados: 0, atualizados: 0, falhas: 0 };
  for (const r of rens ?? []) {
    const cheio = precoPlano(r.plano, r.ciclo, false);
    if (Number(r.valor) + 0.01 >= cheio) { await admin.from("renovacoes").update({ fundador: false }).eq("id", r.id); continue; }
    if (!r.aviso_preco_em) {
      // aviso obrigatório (mudança de preço): sai mesmo para quem desligou os e-mails de cobrança
      const { data: p } = await admin.from("perfis").select("nome, email").eq("id", r.usuario_id).maybeSingle();
      if (!p?.email) { precos.falhas++; continue; }
      const primeiro = (p.nome || "").trim().split(/\s+/)[0].replace(/[&<>"']/g, "") || "Olá";
      const quando = new Date(agora + 30 * DIA).toISOString();
      const periodo = r.ciclo === "anual" ? "por ano" : "por mês";
      const html = moldura(
        "Mudança no valor da sua renovação automática",
        [
          `${primeiro}, o preço de lançamento (preço de fundador) do Licitacon foi encerrado.`,
          `A partir de <strong>${dataBR(quando)}</strong>, a renovação automática do seu plano <strong>${nomePlano(r.plano)}</strong> passa de <strong>${brl(Number(r.valor))}</strong> para <strong>${brl(cheio)}</strong> ${periodo}, o preço de tabela atual. Até essa data, nada muda.`,
          "Se não quiser continuar com o novo valor, desligue a renovação automática em Minha conta → Assinatura antes dessa data. O acesso continua até o fim do período já pago e nada mais é cobrado.",
        ],
        { texto: "Ver minha assinatura", url: `${SITE}index.html?p=conta` },
        "Aviso enviado com 30 dias de antecedência, conforme as regras de cobrança do Licitacon.",
      );
      try {
        await enviarEmail({ email: p.email, nome: p.nome }, "Aviso: novo valor da sua renovação automática do Licitacon", html);
        await admin.from("renovacoes").update({ aviso_preco_em: new Date().toISOString(), novo_valor: cheio }).eq("id", r.id);
        precos.avisados++;
      } catch (e) { console.error("avisos: aviso de preço", r.id, e); precos.falhas++; }
      continue;
    }
    if (agora - new Date(r.aviso_preco_em).getTime() < 30 * DIA) continue;
    const novo = Number(r.novo_valor) || cheio;
    try {
      // primeiro o Mercado Pago; só depois o banco (se o banco subir antes, a cobrança antiga seria recusada)
      await mp(`/preapproval/${encodeURIComponent(r.mp_preapproval)}`, { method: "PUT",
        body: JSON.stringify({ auto_recurring: { transaction_amount: novo, currency_id: "BRL" } }) });
      await admin.from("renovacoes").update({ valor: novo, fundador: false, preco_atualizado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", r.id);
      precos.atualizados++;
    } catch (e) { console.error("avisos: novo valor no Mercado Pago", r.id, e); precos.falhas++; }
  }

  console.log("avisos", resultado, precos);
  return resposta({ ok: true, ...resultado, precos });
});
