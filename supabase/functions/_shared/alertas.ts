// Alertas da Biblioteca Jurídica: seleciona, no acervo (acervo-completo.json), os documentos novos que atendem aos filtros do alerta.
// Mesmas regras de filtro da página biblioteca.html (órgão, tipo de órgão, UF, tema, natureza e termo livre).

export type Alerta = { id: string; usuario_id: string; nome: string; tema?: string | null; orgao?: string | null; grupo?: string | null; uf?: string | null;
  termo?: string | null; natureza?: string | null; criado_em: string; ultimo_envio?: string | null };
export type Doc = { id: string; orgao?: string; tema?: string; tipo?: string; numero?: string; data?: string; titulo?: string; resumo?: string; tags?: string[];
  leis?: string[]; relator?: string; colegiado?: string; entidade?: string; capturado_em?: string; fonte_url?: string };

const LEGISLACAO = new Set(["Lei", "Decreto", "Norma (portaria, IN, resolução)"]);
const ORIENT = new Set(["Parecer/orientação", "Resposta a consulta", "Súmula/Enunciado", "Boletim/informativo"]);
export const naturezaDe = (d: Doc) => (LEGISLACAO.has(d.tipo || "") ? "legislacao" : ORIENT.has(d.tipo || "") ? "orientacoes" : "decisoes");
export const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// "TCE-RJ" → grupo TCE, UF RJ; "TCU" → grupo TCU, sem UF
// (como orgaos.js: GOV-BR é a União; GOV-XX são os governos estaduais, grupo GOV-UF)
export const grupoDe = (o = "") => (o === "GOV-BR" ? "GOV-BR" : o.startsWith("GOV-") ? "GOV-UF" : o.split("-")[0]);
export const ufDe = (o = "") => { const m = /-([A-Z]{2})$/.exec(o); return m && m[1] !== "BR" ? m[1] : ""; };

export function novosDoAlerta(a: Alerta, docs: Doc[]) {
  const desde = Date.parse(a.ultimo_envio || a.criado_em) || 0, q = norm(a.termo || "").trim();
  return docs.filter((d) => {
    const cap = Date.parse(d.capturado_em || "") || 0;
    if (cap <= desde) return false;
    if (a.orgao && d.orgao !== a.orgao) return false;
    if (a.grupo && grupoDe(d.orgao) !== a.grupo) return false;
    if (a.uf && ufDe(d.orgao) !== a.uf) return false;
    if (a.tema && d.tema !== a.tema) return false;
    if (a.natureza && naturezaDe(d) !== a.natureza) return false;
    if (q && !norm([d.titulo, d.resumo, d.numero, d.relator, d.colegiado, d.entidade, (d.tags || []).join(" "), (d.leis || []).join(" ")].join(" ")).includes(q)) return false;
    return true;
  }).sort((x, y) => String(y.data || "").localeCompare(String(x.data || "")));
}
