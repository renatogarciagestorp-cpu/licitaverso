// Análise de documentos: e-mail ao cliente quando o parecer fica pronto (ou quando não foi possível analisar),
// e aviso à equipe em caso de erro em análise paga (para estorno ou reprocessamento).
// Chamada pela fila do GitHub Actions: POST { id } com o cabeçalho x-avisos = AVISOS_SECRET.

import { clienteServico, CORS, resposta } from "../_shared/comum.ts";
import { enviarEmail, moldura, SITE } from "../_shared/email.ts";
import { DOC_ANALISE, DOC_GERACAO, type DocAnalise } from "../_shared/precos.ts";

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
  const geracao = a.tipo === "geracao";
  const doc = geracao ? (DOC_GERACAO[a.documento] ?? a.documento) : (DOC_ANALISE[a.documento as DocAnalise] ?? a.documento);
  const primeiro = (p?.nome || "").trim().split(/\s+/)[0] || "Olá";
  const link = `${SITE}index.html?p=${geracao ? "elaborar" : "agente"}`;
  const enviados: string[] = [];

  try {
    if (p?.email) {
      if (a.status === "concluida" && geracao) {
        const r = a.resumo || {};
        // quem escolheu receber por e-mail recebe o Word e o PDF anexados (até ~8 MB no total)
        const anexos: { name: string; content: string }[] = [];
        const querEmail = String((a.respostas || {}).entrega || "") === "email";
        if (querEmail) {
          let total = 0;
          for (const [caminho, ext] of [[a.parecer_docx, "docx"], [a.parecer_pdf, "pdf"]] as [string | null, string][]) {
            if (!caminho) continue;
            const { data: arq } = await admin.storage.from("analises").download(caminho);
            if (!arq) continue;
            const bytes = new Uint8Array(await arq.arrayBuffer());
            if (total + bytes.length > 8_000_000) continue;
            total += bytes.length;
            let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            anexos.push({ name: `${doc} - minuta Licitacon.${ext}`, content: btoa(bin) });
          }
        }
        const html = moldura(`Seu ${esc(doc)} está pronto`, [
          `${esc(primeiro)}, a minuta do <strong>${esc(doc)}</strong> foi elaborada e conferida pelo Agente Licitacon.`,
          r.objeto ? `<strong>Objeto:</strong> ${esc(String(r.objeto).slice(0, 300))}` : "",
          anexos.length ? `O documento segue <strong>anexado a este e-mail</strong>, em Word (editável) e PDF, e também fica disponível na sua área.`
            : `O documento está disponível em Word (editável) e PDF na sua área, em <em>Criar documento</em> e em <em>Minha conta</em>.`,
          `No anexo final do documento estão as <strong>${Number(r.pendencias || 0)} pendências</strong> para você completar e os pontos de atenção da conferência automática.`,
          `Lembre-se: é uma minuta elaborada por inteligência artificial. Revise todo o texto e complete as lacunas destacadas antes de juntar ao processo.`,
        ].filter(Boolean), { texto: "Abrir o documento", url: link }, undefined, "Andamento de consultoria");
        await enviarEmail({ email: p.email, nome: p.nome }, `${doc} pronto para revisão`, html, anexos);
      } else if (a.status === "concluida") {
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
          a.cobranca === "cortesia_boas_vindas"
            ? "Sua análise grátis continua disponível. Você pode enviar os documentos de novo."
          : (a.cobranca === "franquia_pro" || a.cobranca === "franquia_org")
            ? "Esta análise não foi descontada da cota semanal. Você pode enviar o documento de novo."
            : "Como a análise foi paga, nossa equipe vai entrar em contato em até 1 dia útil para reprocessar ou estornar o valor.",
        ], { texto: "Ver minhas análises", url: link }, undefined, "Andamento de consultoria");
        await enviarEmail({ email: p.email, nome: p.nome }, `Análise do ${doc}: não foi possível concluir`, html);
      }
      enviados.push("cliente");
    }
    if (a.status === "erro") {
      const { data: eq } = await admin.from("perfis").select("email, nome").eq("admin", true);
      const html = moldura("Análise com erro", [
        `Documento: ${esc(doc)} · ${a.cobranca === "avulsa" ? "avulsa paga (R$ " + Number(a.valor).toFixed(2).replace(".", ",") + ")" : a.cobranca === "cortesia_boas_vindas" ? "1ª análise grátis" : "franquia Pro"}`,
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
