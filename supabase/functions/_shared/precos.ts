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
export type DocAnalise = "edital" | "etp" | "tr" | "riscos" | "planilha" | "plano_trabalho";
export const DOC_ANALISE: Record<DocAnalise, string> = {
  edital: "Edital", etp: "Estudo Técnico Preliminar", tr: "Termo de Referência", riscos: "Matriz de Riscos", planilha: "Planilha de custos",
  plano_trabalho: "Plano de trabalho",
};
export const ANALISE_AVULSA = 147;
/** Desconto na avulsa: Básico 10%, Premium 15%; Pro paga 30% a menos a partir da 3ª análise da semana. */
export const DESCONTO_ANALISE: Record<string, number> = { basico: 0.1, premium: 0.15, pro: 0.3 };
export const FRANQUIA_PRO_SEMANA = 2;
export const MAX_PAGINAS_ANALISE = 200;

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

export function precoPlano(plano: Plano, ciclo: Ciclo): number {
  const base = PLANOS[plano].mensal;
  return ciclo === "anual" ? centavos(base * 12 * (1 - DESCONTO_ANUAL)) : centavos(base);
}

export function precoConsultoria(modalidade: Modalidade, planoVigente: string | null, franquiaLivre = false): number {
  if (franquiaLivre && planoVigente === "pro" && modalidade === "escrita") return 0;
  const desconto = planoVigente ? DESCONTO_CONSULTORIA[planoVigente] ?? 0 : 0;
  return centavos(CONSULTORIA[modalidade].valor * (1 - desconto));
}
