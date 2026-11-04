// Conferência prévia das informações, ANTES de criar o ETP, TR ou Projeto Básico.
// O agente lê as respostas do assinante e devolve as dúvidas e inconsistências que precisam ser resolvidas com ele,
// item a item (especificação estranha, dado que só o órgão tem, contradição, marca sem justificativa etc.).
// Só para quem está logado, com limite diário (custo de API). POST { doc, respostas } -> { perguntas: [...] }

import { clienteServico, CORS, erro, resposta, usuarioDaRequisicao, segredoConfere } from "../_shared/comum.ts";

const MODELO = Deno.env.get("AGENTE_MODELO") || "claude-sonnet-5-5";
const LIMITE_DIA = 40;
const NOMES: Record<string, string> = { etp: "Estudo Técnico Preliminar", tr: "Termo de Referência", projeto_basico: "Projeto Básico" };
const ROTULOS: Record<string, string> = {
  orgao: "Órgão", uf: "UF", objeto: "Objeto", necessidade: "Necessidade / fundamentação", quantidades: "Quantidades", especificacoes: "Especificações",
  natureza: "Natureza / solução", prazo: "Prazo", prazo_outro: "Prazo (detalhe)", pca: "PCA", correlatas: "Contratações ligadas", processo: "Nº do processo",
  parcelamento: "Parcelamento", parc_motivo: "Motivo do parcelamento", valor: "Valor estimado", adjudicacao: "Adjudicação", selecao: "Forma de seleção",
  criterio: "Critério de julgamento", regime_exec: "Regime de execução", local: "Local da obra", unidade: "Unidade requisitante", gestor: "Gestor",
  fiscais: "Fiscais", fonte: "Fonte orçamentária", observacoes: "Observações", municipio: "Município", autoridade: "Autoridade que aprova",
  precos_manual: "Valores informados", precos_links: "Links de preço", historico: "Situação atual e contratações anteriores",
};

const FERRAMENTA = {
  name: "registrar_duvidas",
  description: "Registra as dúvidas e inconsistências que o requisitante precisa resolver antes da elaboração.",
  input_schema: {
    type: "object",
    properties: {
      perguntas: {
        type: "array", maxItems: 8,
        items: {
          type: "object",
          properties: {
            tema: { type: "string", description: "assunto curto, ex.: Tamanho de tela" },
            pergunta: { type: "string", description: "pergunta direta ao requisitante, em segunda pessoa (você)" },
            por_que: { type: "string", description: "por que isso importa (lei, mercado, pesquisa de preços), em uma frase" },
            opcoes: { type: "array", items: { type: "string" }, maxItems: 4, description: "respostas prováveis para ele só clicar, quando couber" },
          },
          required: ["tema", "pergunta", "por_que"],
        },
      },
    },
    required: ["perguntas"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);
  const admin = clienteServico();
  const interno = segredoConfere(req);  // teste interno (GitHub Actions)
  const usuario = interno ? { id: "00000000-0000-0000-0000-000000000000" } : await usuarioDaRequisicao(req, admin);
  if (!usuario) return erro("Entre na sua conta para continuar.", 401);
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return resposta({ perguntas: [], indisponivel: true });

  const desde = new Date(Date.now() - 864e5).toISOString();
  const { count } = await admin.from("elab_triagens").select("id", { count: "exact", head: true }).eq("usuario_id", usuario.id).gte("criado_em", desde);
  if ((count ?? 0) >= LIMITE_DIA) return erro("Limite diário de conferências atingido. Tente de novo amanhã.", 429);
  await admin.from("elab_triagens").insert({ usuario_id: usuario.id });

  const corpo = await req.json().catch(() => ({}));
  const doc = String(corpo.doc ?? "");
  if (!NOMES[doc]) return erro("Documento inválido.");
  const r = corpo.respostas && typeof corpo.respostas === "object" ? corpo.respostas as Record<string, unknown> : {};
  const linhas = Object.entries(r).filter(([k, v]) => ROTULOS[k] && String(v ?? "").trim())
    .map(([k, v]) => `- ${ROTULOS[k]}: ${String(v).slice(0, 2000)}`).join("\n");
  let esclarecimentos = "";
  try {
    const lista = JSON.parse(String(r.esclarecimentos ?? "[]"));
    if (Array.isArray(lista)) esclarecimentos = lista.slice(0, 40).map((x: any) => `- P: ${String(x.pergunta ?? "").slice(0, 400)}\n  R: ${String(x.resposta ?? "").slice(0, 1000)}`).join("\n");
  } catch { /* sem esclarecimentos */ }

  const system = `Você confere as informações de um requisitante ANTES de redigir o ${NOMES[doc]} (Lei 14.133/2021) para um órgão público.
Aponte somente o que precisa ser resolvido COM O REQUISITANTE para que o documento saia completo e correto, sem lacunas:
(1) especificações inconsistentes, incomuns ou com provável erro de digitação (ex.: notebook de 19 polegadas, "SSD 225"), unidades confusas, quantidades incoerentes;
(2) exigência de marca, fabricante ou software específico sem justificativa técnica (art. 41 da Lei 14.133/2021): pergunte a justificativa ou se aceita equivalentes;
(3) requisitos essenciais que faltam e mudam o preço ou a solução (ex.: para notebook: processador, memória, armazenamento, tela, sistema operacional, garantia; para serviço: horários, local, produtividade);
(4) dados que só o órgão tem e que o documento exige, se estiverem em branco;
(5) contradições entre as respostas.
NÃO pergunte o que você mesmo pode redigir com texto técnico padrão, nem o que o próprio estudo deve analisar (comparação de soluções, pesquisa de mercado, riscos).
Não repita perguntas já respondidas nos esclarecimentos; se o requisitante disse que não tem a informação, não pergunte de novo.
Seja específico e objetivo; no máximo 8 perguntas, das mais importantes para as menos; se estiver tudo certo, devolva a lista vazia.`;
  const usuarioMsg = `RESPOSTAS DO REQUISITANTE:\n${linhas || "(vazio)"}\n\nESCLARECIMENTOS JÁ DADOS:\n${esclarecimentos || "(nenhum)"}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 2000, system, tools: [FERRAMENTA], tool_choice: { type: "tool", name: "registrar_duvidas" },
      messages: [{ role: "user", content: usuarioMsg }] }),
    signal: AbortSignal.timeout(90000),
  }).catch(() => null);
  if (!resp || !resp.ok) {
    const det = resp ? `${resp.status} ${(await resp.text().catch(() => "")).slice(0, 200)}` : "sem resposta";
    console.log("triagem indisponível:", det);
    return resposta({ perguntas: [], indisponivel: true });  // o motivo fica só no registro interno
  }
  const j = await resp.json().catch(() => ({}));
  const bloco = (j.content ?? []).find((c: any) => c.type === "tool_use");
  const perguntas = ((bloco?.input?.perguntas ?? []) as any[]).slice(0, 8).map((p, i) => ({
    id: "q" + (i + 1), tema: String(p.tema ?? "").slice(0, 80), pergunta: String(p.pergunta ?? "").slice(0, 600),
    por_que: String(p.por_que ?? "").slice(0, 400), opcoes: Array.isArray(p.opcoes) ? p.opcoes.slice(0, 4).map((o: unknown) => String(o).slice(0, 120)) : [],
  })).filter((p) => p.pergunta);
  return resposta({ perguntas });
});
