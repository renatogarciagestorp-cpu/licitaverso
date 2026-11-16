// Tabela de preços do Licitacon — a única fonte de verdade para cobrança.
// O site mostra os mesmos valores (src/site.html), mas quem decide o preço
// cobrado é sempre esta função, no servidor.

export type Plano = "basico" | "premium" | "pro";
export type Ciclo = "mensal" | "anual";
export type Modalidade = "escrita" | "video" | "reuniao";

export const PLANOS: Record<Plano, { nome: string; mensal: number }> = {
  basico: { nome: "Básico", mensal: 119.9 },
  premium: { nome: "Premium", mensal: 199.9 },
  pro: { nome: "Pro", mensal: 479.9 },
};

/** Planos para equipes (empresas e órgãos): desconto por quantidade em cada acesso (3–5: 5%, 6–10: 10%, 11–25: 15%) e,
 *  no anual, o mesmo desconto de 20% de todos os planos. No Pro, a franquia do agente é de 6 análises por acesso por mês,
 *  somadas para a equipe. Acima de 25 acessos, sob consulta. */
export const MIN_ACESSOS_EQUIPE = 3;
export const MAX_ACESSOS_EQUIPE = 25;
export const FRANQUIA_EQUIPE_MES = 6;
export function descontoEquipe(acessos: number): number {
  if (acessos >= 11) return 0.15;
  if (acessos >= 6) return 0.1;
  if (acessos >= 3) return 0.05;
  return 0;
}
/** Valor do plano de equipe: mensal (por mês) ou anual (12 meses, com os 20% do anual). */
export function precoEquipe(plano: Plano, acessos: number, ciclo: Ciclo): { porAcessoMes: number; total: number; desconto: number } {
  const desc = descontoEquipe(acessos);
  const porAcessoMes = centavos(PLANOS[plano].mensal * (1 - desc) * (ciclo === "anual" ? 1 - DESCONTO_ANUAL : 1));
  return { porAcessoMes, total: centavos(porAcessoMes * acessos * (ciclo === "anual" ? 12 : 1)), desconto: desc };
}

/** No anual, a mensalidade tem 20% de desconto e o ano é pago de uma vez (à vista ou parcelado). */
export const DESCONTO_ANUAL = 0.2;

export const CONSULTORIA: Record<Modalidade, { nome: string; valor: number }> = {
  escrita: { nome: "Consultoria por escrito", valor: 390 },
  video: { nome: "Vídeo gravado", valor: 590 },
  reuniao: { nome: "Reunião ao vivo (60 min)", valor: 490 },
};

/** Desconto de assinante na consultoria. O Pro inclui ainda 1 consultoria por escrito por mês (ver franquiaPro). */
export const DESCONTO_CONSULTORIA: Record<string, number> = {
  basico: 0.1,
  premium: 0.15,
  pro: 0.3,
};

/** Análise de documento pelo agente (parecer técnico opinativo). */
export type DocAnalise = "edital" | "etp" | "tr" | "riscos" | "planilha" | "plano_trabalho" | "multiplos";
export const DOC_ANALISE: Record<DocAnalise, string> = {
  edital: "Edital", etp: "Estudo Técnico Preliminar", tr: "Termo de Referência", riscos: "Matriz de Riscos", planilha: "Planilha de custos",
  plano_trabalho: "Plano de trabalho", multiplos: "Até 3 documentos",
};
/** Documentos que o assinante pode enviar (até 3 por análise). formato: "pdf" (texto) ou "planilha" (Excel ou PDF). */
export const TIPOS_DOC_ANALISE: Record<string, { nome: string; formato: "pdf" | "planilha" }> = {
  etp: { nome: "Estudo Técnico Preliminar (ETP)", formato: "pdf" },
  tr: { nome: "Termo de Referência / Projeto Básico", formato: "pdf" },
  riscos: { nome: "Matriz de Riscos", formato: "pdf" },
  edital: { nome: "Edital (com minutas)", formato: "pdf" },
  direta: { nome: "Processo de contratação direta (dispensa ou inexigibilidade)", formato: "pdf" },
  memoria_calculo: { nome: "Memória de cálculo", formato: "planilha" },
  plano_trabalho: { nome: "Plano de trabalho", formato: "pdf" },
  planilha_mo: { nome: "Planilha de custos de mão de obra (IN 05/2017)", formato: "planilha" },
  planilha_obras: { nome: "Planilha orçamentária (obras e serviços de engenharia)", formato: "planilha" },
  planilha_parceria: { nome: "Planilha de custos da parceria (Lei 13.019)", formato: "planilha" },
};
export const MAX_DOCS_ANALISE = 3;
export const ANALISE_AVULSA = 290;
/** Não assinante: R$ 290 por análise. Básico 10% e Premium 15% de desconto; Pro: 8 por mês incluídas e, acima disso, 30% de desconto. */
export const DESCONTO_ANALISE: Record<string, number> = { basico: 0.1, premium: 0.15, pro: 0.3 };
export const FRANQUIA_PRO_MES = 8; // Pro individual: análises e elaborações somadas, por mês (horário de Brasília)
export const FRANQUIA_PRO_SEMANA = 2; // teste grátis de 7 dias
export const MAX_PAGINAS_ANALISE = 200; // por documento
export const MAX_PAGINAS_FRANQUIA = 300; // análise da franquia (Pro, teste e equipes): soma das páginas dos documentos

/** Elaboração de documento pelo agente (Lei 14.133/2021). Mesmo preço e descontos da análise; no Pro, entra na mesma
 *  franquia (8 por mês somando análises e elaborações; equipes: 6 por acesso por mês, somados). */
export const DOC_GERACAO: Record<string, string> = {
  etp: "Estudo Técnico Preliminar (ETP)", tr: "Termo de Referência", projeto_basico: "Projeto Básico",
  edital: "Edital (com as minutas)", direta: "Processo de contratação direta (dispensa ou inexigibilidade)", riscos: "Mapa de riscos",
  plano_trabalho: "Plano de trabalho do termo de colaboração (Lei 13.019/2014)",
};
// lei da contratação: cada documento existe só nos regimes em que a lei o prevê
export const REGIMES_GERACAO: Record<string, string[]> = {
  etp: ["lei-14133", "lei-13303"], tr: ["lei-14133", "lei-13303"], projeto_basico: ["lei-14133", "lei-13303"],
  edital: ["lei-14133", "lei-13303", "lei-13019"], direta: ["lei-14133", "lei-13303", "lei-13019"], riscos: ["lei-14133", "lei-13303"],
  plano_trabalho: ["lei-13019"],
};
export const MAX_RESPOSTAS_GERACAO = 60000; // caracteres do questionário

export function precoAnalise(planoVigente: string | null): number {
  const desconto = planoVigente ? DESCONTO_ANALISE[planoVigente] ?? 0 : 0;
  return centavos(ANALISE_AVULSA * (1 - desconto));
}

/** Início do mês corrente no horário de Brasília (UTC-3), para a franquia mensal do Pro. */
export function inicioMesBR(agora = Date.now()): Date {
  const d = new Date(agora - 3 * 3600000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 3));
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Preço de fundador (lançamento): 30% nos planos individuais para os primeiros 100 assinantes, travado enquanto a
 *  assinatura continuar ativa. Não se soma ao desconto do anual: no anual, o fundador paga 12 × a mensalidade de fundador. */
export const DESCONTO_FUNDADOR = 0.3;

export function precoPlano(plano: Plano, ciclo: Ciclo, fundador = false): number {
  const base = PLANOS[plano].mensal;
  if (fundador) {
    const mes = centavos(base * (1 - DESCONTO_FUNDADOR));
    return ciclo === "anual" ? centavos(mes * 12) : mes;
  }
  return ciclo === "anual" ? centavos(base * 12 * (1 - DESCONTO_ANUAL)) : centavos(base);
}

export function precoConsultoria(modalidade: Modalidade, planoVigente: string | null, franquiaLivre = false): number {
  if (franquiaLivre && planoVigente === "pro" && modalidade === "escrita") return 0;
  const desconto = planoVigente ? DESCONTO_CONSULTORIA[planoVigente] ?? 0 : 0;
  return centavos(CONSULTORIA[modalidade].valor * (1 - desconto));
}
