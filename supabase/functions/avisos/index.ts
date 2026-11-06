// Avisos diários por e-mail: o plano está perto de acabar.
// Chamada uma vez por dia pelo GitHub Actions (workflow avisos-diarios.yml).
// Idempotente: cada assinatura recebe o aviso uma única vez (coluna aviso_fim_em).
//  - planos pagos: aviso quando faltam 7 dias ou menos;
//  - teste grátis: dica de uso no 3º dia e aviso na véspera do fim ("termina amanhã");
//  - fim do preço de fundador: aviso com 30 dias de antecedência e, depois do prazo, novo valor na renovação automática;
//  - Meus contratos: anualidade do reajuste, data-base da convenção coletiva e fim da vigência (90 e 30 dias antes);
//  - resumo mensal da carteira (dias 1 a 3 de cada mês, uma vez por mês: coluna perfis.resumo_mensal_ref).

import { clienteServico, CORS, mp, resposta, segredoConfere } from "../_shared/comum.ts";
import { enviarEmail, moldura, SITE } from "../_shared/email.ts";
import { PLANOS, precoPlano } from "../_shared/precos.ts";
import { diaBrasilia, mesReferencia, montarResumo } from "../_shared/resumo.ts";

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

  // ---------------------------------------------------------------- prazos dos contratos (Gestão Contratual)
  const prazos = { enviados: 0, pulados: 0, falhas: 0 };
  const { data: cts } = await admin.from("contratos")
    .select("id, usuario_id, numero, contratada, objeto, data_proposta, fim, mao_obra, data_base_cct").eq("alertas", true).limit(3000);
  const contratosLista = (cts ?? []) as any[];
  const eventos: Record<string, any[]> = {}, enviados = new Set<string>();
  for (let i = 0; i < contratosLista.length; i += 200) {
    const ids = contratosLista.slice(i, i + 200).map((c) => c.id);
    const { data: evs } = await admin.from("contrato_eventos").select("contrato_id, tipo, data, novo_fim").in("contrato_id", ids);
    for (const e of evs ?? []) (eventos[e.contrato_id] = eventos[e.contrato_id] || []).push(e);
    const { data: ja } = await admin.from("contrato_alertas").select("contrato_id, tipo, ref").in("contrato_id", ids);
    for (const a of ja ?? []) enviados.add(a.contrato_id + "|" + a.tipo + "|" + a.ref);
  }
  const mesN = (iso: string | null) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ""); return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null; };
  const mesTxt = (n: number) => String(n % 12 + 1).padStart(2, "0") + "/" + Math.floor(n / 12);
  const inicioMes = (n: number) => Date.UTC(Math.floor(n / 12), n % 12, 1);
  const perfis: Record<string, any> = {}, planos: Record<string, string | null> = {};
  for (const c of contratosLista) {
    const evs = eventos[c.id] || [];
    const ultReaj = evs.filter((e) => e.tipo === "reajuste").map((e) => e.data).sort().pop() || null;
    let fim: string | null = c.fim; for (const e of evs) if (e.novo_fim && (!fim || e.novo_fim > fim)) fim = e.novo_fim;
    const devidos: { tipo: string; ref: string; texto: string }[] = [];
    // 1) anualidade: 12 meses da proposta (ou do último reajuste registrado)
    const base = mesN(ultReaj) ?? mesN(c.data_proposta);
    if (base != null) {
      const direito = base + 12, ini = inicioMes(direito);
      if (agora >= ini - 30 * DIA && agora <= ini + 60 * DIA) devidos.push({ tipo: "anualidade", ref: mesTxt(direito),
        texto: `<strong>Anualidade:</strong> o contrato completa 12 meses ${ultReaj ? "do último reajuste" : "da proposta (ou do orçamento estimado)"} em <strong>${mesTxt(direito)}</strong> e pode ser reajustado pelo índice previsto. Calcule o reajuste e baixe a nota técnica na Calculadora.` });
    }
    // 2) data-base da convenção coletiva (mão de obra exclusiva): repactuação
    const db = /^(\d{2})\/(\d{2})$/.exec(c.data_base_cct || "");
    if (c.mao_obra && db) {
      const ano = new Date(agora).getUTCFullYear(), dt = Date.UTC(ano, Number(db[2]) - 1, Number(db[1]));
      if (agora >= dt - 15 * DIA && agora <= dt + 30 * DIA) devidos.push({ tipo: "convencao", ref: String(ano),
        texto: `<strong>Convenção coletiva:</strong> a data-base da categoria é <strong>${db[1]}/${db[2]}</strong>. Quando a nova convenção for registrada, verifique a repactuação; o pedido deve ser feito antes da prorrogação ou do fim do contrato.` });
    }
    // próximo reajuste depois da prorrogação: a contagem dos 12 meses não reinicia
    const proxReaj = (ate: string) => {
      const u = evs.filter((e) => e.tipo === "reajuste" && String(e.data) <= ate).map((e) => String(e.data)).sort().pop() || null;
      const b = mesN(u) ?? mesN(c.data_proposta); if (b == null) return "";
      const d = b + 12, a = mesN(ate) as number;
      return d <= a ? ` Há reajuste possível desde <strong>${mesTxt(d)}</strong> ainda não registrado: peça-o antes de assinar a prorrogação.`
        : ` Se o contrato for prorrogado, o próximo reajuste caberá a partir de <strong>${mesTxt(d)}</strong> (12 meses ${u ? "do último reajuste" : "do orçamento estimado"}; a prorrogação não reinicia a contagem).`;
    };
    // 3) fim da vigência: 90 e 30 dias antes
    if (fim) {
      const dias = Math.ceil((Date.parse(fim + "T00:00:00Z") - agora) / DIA);
      const txt = `<strong>Fim da vigência:</strong> o contrato termina em <strong>${dataBR(fim + "T12:00:00Z")}</strong> (${dias} dia${dias === 1 ? "" : "s"}). Se houver prorrogação, peça antes o reajuste, a repactuação ou o reequilíbrio pendente: depois dela, o direito pode se perder (Lei 14.133/2021, art. 131, parágrafo único).`;
      if (dias > 90 && dias <= 122) {
        const iniT = new Date(fim + "T12:00:00Z"); iniT.setUTCMonth(iniT.getUTCMonth() - 4);
        devidos.push({ tipo: "fim120", ref: fim, texto: `<strong>Prorrogação:</strong> o contrato termina em <strong>${dataBR(fim + "T12:00:00Z")}</strong>. A orientação usual é começar a tramitação da prorrogação 4 meses antes, até <strong>${dataBR(iniT.toISOString())}</strong>: o termo aditivo precisa estar assinado antes do fim da vigência (contrato extinto não pode ser prorrogado). Verifique a previsão no edital, o interesse da contratada, a pesquisa de preços que demonstre a vantajosidade (art. 107), as certidões e a disponibilidade orçamentária. Peça antes o reajuste, a repactuação ou o reequilíbrio pendente (art. 131, parágrafo único).${proxReaj(fim)}` });
      }
      if (dias > 0 && dias <= 30) devidos.push({ tipo: "fim30", ref: fim, texto: txt });
      else if (dias > 30 && dias <= 90) devidos.push({ tipo: "fim90", ref: fim, texto: txt });
    }
    const novos = devidos.filter((a) => !enviados.has(c.id + "|" + a.tipo + "|" + a.ref));
    if (!novos.length) continue;
    if (!(c.usuario_id in perfis)) {
      const { data: p } = await admin.from("perfis").select("nome, email, notificacoes").eq("id", c.usuario_id).maybeSingle();
      perfis[c.usuario_id] = p; const { data: pl } = await admin.rpc("plano_vigente", { uid: c.usuario_id }); planos[c.usuario_id] = pl ?? null;
    }
    const p = perfis[c.usuario_id];
    const marcar = () => admin.from("contrato_alertas").upsert(novos.map((a) => ({ contrato_id: c.id, tipo: a.tipo, ref: a.ref })), { onConflict: "contrato_id,tipo,ref", ignoreDuplicates: true });
    if (!p?.email || p?.notificacoes?.contratos?.email === false || !planos[c.usuario_id]) { await marcar(); prazos.pulados++; continue; }
    const primeiro = (p.nome || "").trim().split(/\s+/)[0].replace(/[&<>"']/g, "") || "Olá";
    const esc = (t: string) => String(t || "").replace(/[&<>"']/g, "");
    const ident = `contrato <strong>${esc(c.numero)}</strong>${c.contratada ? " (" + esc(c.contratada) + ")" : ""}`;
    const html = moldura(`Prazos do contrato ${esc(c.numero)}`,
      [`${primeiro}, há ${novos.length === 1 ? "um prazo" : "prazos"} para acompanhar no ${ident}:`].concat(novos.map((a) => a.texto)),
      { texto: "Ver meus contratos", url: `${SITE}index.html?p=contratos` },
      "Você recebe este aviso porque cadastrou o contrato na Gestão Contratual do Licitacon. Para parar, desmarque os avisos no cadastro do contrato ou em Minha conta → Notificações.", "Prazos dos meus contratos");
    try {
      await enviarEmail({ email: p.email, nome: p.nome }, `Prazos do contrato ${String(c.numero).slice(0, 40)}: ${novos.map((a) => ({ anualidade: "anualidade", convencao: "convenção coletiva", fim120: "prorrogação", fim90: "fim da vigência", fim30: "fim da vigência" } as Record<string, string>)[a.tipo]).join(", ")}`, html);
      await marcar(); prazos.enviados++;
    } catch (e) { console.error("avisos: prazos do contrato", c.id, e); prazos.falhas++; }
  }

  // ---------------------------------------------------------------- resumo mensal da carteira (Gestão Contratual)
  const resumo = { enviados: 0, pulados: 0, falhas: 0 };
  const ref = mesReferencia(agora);
  const forcar = await req.clone().json().then((b) => b && b.resumo === true).catch(() => false);
  if (diaBrasilia(agora) <= 3 || forcar) {
    const { data: todos } = await admin.from("contratos")
      .select("id, usuario_id, numero, contratante, contratada, data_proposta, inicio, assinatura, fim, valor_inicial, periodicidade, mao_obra, data_base_cct, fiscal, essencial").limit(5000);
    const porUsuario: Record<string, any[]> = {};
    for (const c of (todos ?? []) as any[]) (porUsuario[c.usuario_id] = porUsuario[c.usuario_id] || []).push(c);
    for (const uid of Object.keys(porUsuario)) {
      const { data: p } = await admin.from("perfis").select("nome, email, notificacoes, setor, resumo_mensal_ref").eq("id", uid).maybeSingle();
      if (!p || p.resumo_mensal_ref === ref) continue;
      const marcarR = () => admin.from("perfis").update({ resumo_mensal_ref: ref }).eq("id", uid);
      const { data: pl } = await admin.rpc("plano_vigente", { uid });
      if (!p.email || p.notificacoes?.resumo?.email === false || !pl) { await marcarR(); resumo.pulados++; continue; }
      const lista = porUsuario[uid], evs: Record<string, any[]> = {};
      for (let i = 0; i < lista.length; i += 200) {
        const { data: e } = await admin.from("contrato_eventos").select("contrato_id, tipo, data, valor_novo, novo_fim, valor_penalidade").in("contrato_id", lista.slice(i, i + 200).map((c) => c.id));
        for (const x of e ?? []) (evs[x.contrato_id] = evs[x.contrato_id] || []).push(x);
      }
      const r = montarResumo(lista, evs, p.setor === "Setor Privado", agora);
      const primeiro = (p.nome || "").trim().split(/\s+/)[0].replace(/[&<>"']/g, "") || "Olá";
      const html = moldura(r.titulo, [`${primeiro}, ` + r.paragrafos[0].charAt(0).toLowerCase() + r.paragrafos[0].slice(1)].concat(r.paragrafos.slice(1)),
        { texto: "Abrir o Painel da Organização", url: `${SITE}index.html?p=contratos` },
        "Os números vêm dos contratos e registros cadastrados por você na Gestão Contratual. Confira cada prazo no painel antes de agir.", "Resumo mensal da carteira");
      try { await enviarEmail({ email: p.email, nome: p.nome }, r.assunto, html); await marcarR(); resumo.enviados++; }
      catch (e) { console.error("avisos: resumo mensal", uid, e); resumo.falhas++; }
    }
  }

  console.log("avisos", resultado, precos, prazos, resumo);
  return resposta({ ok: true, ...resultado, precos, prazos, resumo });
});
