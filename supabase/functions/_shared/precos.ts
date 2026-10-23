// Tabela de preços do Licitaverso — a única fonte de verdade para cobrança.
// O site mostra os mesmos valores (src/site.html), mas quem decide o preço
// cobrado é sempre esta função, no servidor.

export type Plano = "basico" | "premium" | "pro";
export type Ciclo = "mensal" | "anual";
export type Modalidade = "escrita" | "video" | "reuniao";

export const PLANOS: Record<Plano, { nome: string; mensal: number }> = {
  basico: { nome: "Básico", mensal: 89.9 },
  premium: { nome: "Premium", mensal: 149.9 },
  pro: { nome: "Pro", mensal: 399.9 },
};

/** No anual, a mensalidade tem 20% de desconto e o ano é pago de uma vez (à vista ou parcelado). */
export const DESCONTO_ANUAL = 0.2;

export const CONSULTORIA: Record<Modalidade, { nome: string; valor: number }> = {
  escrita: { nome: "Consultoria por escrito", valor: 500 },
  video: { nome: "Vídeo gravado", valor: 900 },
  reuniao: { nome: "Reunião ao vivo", valor: 1500 },
};

/** Desconto de assinante na consultoria; no Pro ela é incluída. */
export const DESCONTO_CONSULTORIA: Record<string, number> = {
  basico: 0.1,
  premium: 0.15,
  pro: 1,
};

const centavos = (v: number) => Math.round(v * 100) / 100;

export function precoPlano(plano: Plano, ciclo: Ciclo): number {
  const base = PLANOS[plano].mensal;
  return ciclo === "anual" ? centavos(base * 12 * (1 - DESCONTO_ANUAL)) : centavos(base);
}

export function precoConsultoria(modalidade: Modalidade, planoVigente: string | null): number {
  const desconto = planoVigente ? DESCONTO_CONSULTORIA[planoVigente] ?? 0 : 0;
  return centavos(CONSULTORIA[modalidade].valor * (1 - desconto));
}
