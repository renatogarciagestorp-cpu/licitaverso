// Resumo mensal da carteira de contratos (Gestão Contratual), enviado por e-mail no início de cada mês.
// Função pura: recebe os contratos e os registros da linha do tempo de um assinante e devolve o assunto e os blocos do e-mail.
// As regras seguem as do Painel da Organização no site (situação, anualidade, valor vigente).

type Contrato = { id: string; numero: string; contratante?: string | null; contratada?: string | null; data_proposta?: string | null; inicio?: string | null;
  assinatura?: string | null; fim?: string | null; valor_inicial?: number | string | null; periodicidade?: string | null; mao_obra?: boolean | null;
  data_base_cct?: string | null; fiscal?: string | null; essencial?: boolean | null };
type Evento = { contrato_id: string; tipo: string; data: string; valor_novo?: number | string | null; novo_fim?: string | null; valor_penalidade?: number | string | null };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, "");
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mesN = (iso?: string | null) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ""); return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null; };
const mesTxt = (n: number) => String(n % 12 + 1).padStart(2, "0") + "/" + Math.floor(n / 12);
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

// mês de referência em Brasília (UTC−3): "AAAA-MM"
export function mesReferencia(agoraMs: number) { const d = new Date(agoraMs - 3 * 3600000); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
export function diaBrasilia(agoraMs: number) { return new Date(agoraMs - 3 * 3600000).getUTCDate(); }

export function montarResumo(contratos: Contrato[], eventos: Record<string, Evento[]>, empresa: boolean, agoraMs: number) {
  const hoje = new Date(agoraMs - 3 * 3600000), agoraN = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
  const antN = agoraN - 1, nomeAnt = MESES[antN % 12] + " de " + Math.floor(antN / 12), nomeAt = MESES[agoraN % 12];
  const parte = (c: Contrato) => esc((empresa ? c.contratante : c.contratada) || "não informado");
  const ident = (c: Contrato) => `<strong>Contrato ${esc(c.numero)}</strong> · ${parte(c)}`;
  const L = contratos.map((c) => {
    const evs = (eventos[c.id] || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    let valor = c.valor_inicial != null && c.valor_inicial !== "" ? Number(c.valor_inicial) : null, fim = c.fim || null, ultReaj: string | null = null;
    for (const e of evs) { if (e.valor_novo != null && e.valor_novo !== "" && e.tipo !== "reequilibrio_fato") valor = Number(e.valor_novo); if (e.novo_fim && (!fim || e.novo_fim > fim)) fim = e.novo_fim; if (e.tipo === "reajuste") ultReaj = e.data; }
    const fimN = mesN(fim), base = mesN(ultReaj) ?? mesN(c.data_proposta), direito = base != null ? base + 12 : null;
    const sit = fimN == null ? "sem" : fimN < agoraN ? "exp" : fimN - agoraN + 1 <= 4 ? "ven" : "vig";
    return { c, evs, valor, fim, fimN, direito, sit, pend: direito != null && direito <= agoraN && sit !== "exp", mensal: c.periodicidade === "mensal" };
  });
  const n = L.length, ativos = L.filter((x) => x.sit !== "exp");
  const cnt = { vig: 0, ven: 0, exp: 0, sem: 0 } as Record<string, number>; L.forEach((x) => cnt[x.sit]++);
  const mensal = ativos.filter((x) => x.mensal && x.valor != null).reduce((a, x) => a + (x.valor as number), 0);
  const pend = L.filter((x) => x.pend).sort((a, b) => (a.direito as number) - (b.direito as number));

  // movimento do mês anterior
  const mov = { reajuste: 0, repactuacao: 0, revisao: 0, aditivo_valor: 0, prorrogacao: 0, ocorrencia: 0, penalidade: 0 } as Record<string, number>; let multas = 0;
  L.forEach((x) => x.evs.forEach((e) => { if (mesN(e.data) !== antN) return;
    if (e.tipo === "reequilibrio_trib" || e.tipo === "reequilibrio_fato") mov.revisao++;
    else if (["advertencia", "multa", "impedimento", "inidoneidade"].includes(e.tipo)) { mov.penalidade++; if (e.tipo === "multa") multas += Number(e.valor_penalidade) || 0; }
    else if (e.tipo in mov) mov[e.tipo]++; }));
  const movRot: [string, string, string][] = [["reajuste", "reajuste", "reajustes"], ["repactuacao", "repactuação", "repactuações"], ["revisao", "reequilíbrio", "reequilíbrios"],
    ["aditivo_valor", "aditivo de valor", "aditivos de valor"], ["prorrogacao", "prorrogação", "prorrogações"], ["ocorrencia", "ocorrência", "ocorrências"], ["penalidade", empresa ? "penalidade recebida" : "penalidade aplicada", empresa ? "penalidades recebidas" : "penalidades aplicadas"]];
  const movTxt = movRot.filter(([k]) => mov[k]).map(([k, um, v]) => mov[k] + " " + (mov[k] === 1 ? um : v));

  // o que fazer neste mês
  const itens: { prio: number; ord: number; t: string }[] = [];
  pend.forEach((x) => itens.push({ prio: (x.direito as number) < agoraN ? 0 : 1, ord: x.direito as number,
    t: `${ident(x.c)}: ${empresa ? "peça o reajuste" : "reajuste"} com anualidade desde <strong>${mesTxt(x.direito as number)}</strong>${empresa ? "." : " ainda não registrado."}` }));
  L.filter((x) => x.direito != null && !x.pend && x.sit !== "exp").forEach((x) => { let d = x.direito as number; while (d < agoraN) d += 12;
    if (d === agoraN) itens.push({ prio: 1, ord: d, t: `${ident(x.c)}: completa a anualidade em <strong>${mesTxt(d)}</strong>; ${empresa ? "prepare o pedido de reajuste" : "prepare o cálculo do reajuste"}.` }); });
  L.filter((x) => x.sit === "ven").forEach((x) => { if (!x.fim) return;
    itens.push({ prio: x.fimN! - agoraN <= 1 ? 0 : 1, ord: x.fimN!, t: `${ident(x.c)}: vigência até <strong>${dataBR(String(x.fim))}</strong>${x.c.essencial && !empresa ? " (serviço essencial)" : ""}; ${empresa ? "negocie a renovação com o órgão." : "o termo aditivo de prorrogação precisa estar assinado antes do fim."}` }); });
  L.forEach((x) => { const db = /^(\d{2})\/(\d{2})$/.exec(x.c.data_base_cct || ""); if (x.c.mao_obra && db && x.sit !== "exp" && Number(db[2]) - 1 === agoraN % 12)
    itens.push({ prio: 2, ord: agoraN, t: `${ident(x.c)}: data-base da convenção coletiva em <strong>${db[1]}/${db[2]}</strong>; ${empresa ? "prepare o pedido de repactuação" : "acompanhe a repactuação"}.` }); });
  itens.sort((a, b) => a.prio - b.prio || a.ord - b.ord);
  const semFiscal = empresa ? 0 : ativos.filter((x) => !String(x.c.fiscal || "").trim()).length;

  // blocos do e-mail (HTML simples, compatível com os leitores de e-mail)
  const kpi = (rot: string, v: string, cor = "#0B1F2A") => `<td style="width:50%;padding:6px"><div style="border:1px solid #E3E9E8;border-radius:12px;padding:12px 14px;background:#F8FBFA"><div style="font-size:12px;color:#6A7B82;text-transform:uppercase;letter-spacing:.04em;font-weight:bold">${rot}</div><div style="font-size:22px;font-weight:bold;color:${cor};margin-top:4px">${v}</div></div></td>`;
  const tabela = `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 6px"><tr>${kpi("Contratos vigentes", String(cnt.vig + cnt.ven) + " de " + n)}${kpi("Vencem em até 4 meses", String(cnt.ven), cnt.ven ? "#B7791F" : "#0B1F2A")}</tr><tr>${kpi(empresa ? "Receita mensal atual" : "Gasto mensal atual", brl(mensal))}${kpi(empresa ? "Reajustes a pedir" : "Reajustes pendentes", String(pend.length), pend.length ? "#C24A43" : "#0B1F2A")}</tr></table>`;
  const lista = (arr: string[]) => `<ul style="margin:0 0 14px;padding-left:18px">${arr.map((t) => `<li style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#3D5058">${t}</li>`).join("")}</ul>`;
  const paragrafos: string[] = [];
  paragrafos.push(`Este é o resumo de <strong>${nomeAnt}</strong> da sua carteira na Gestão Contratual.`);
  paragrafos.push(tabela);
  paragrafos.push(`<strong>Movimento em ${MESES[antN % 12]}:</strong> ${movTxt.length ? movTxt.join(", ") + (multas ? ` (multas de ${brl(multas)})` : "") + "." : "nenhum registro na linha do tempo."}`);
  const mostrar = itens.slice(0, 8);
  paragrafos.push(`<strong>Para ${nomeAt}:</strong>` + (mostrar.length ? "" : " nenhuma providência pendente. Os prazos estão em dia."));
  if (mostrar.length) paragrafos.push(lista(mostrar.map((i) => i.t)) + (itens.length > 8 ? `<span style="font-size:13px;color:#6A7B82">E mais ${itens.length - 8} ${itens.length - 8 === 1 ? "item" : "itens"} no painel.</span>` : ""));
  if (semFiscal) paragrafos.push(`<span style="font-size:13px;color:#8A6100">${semFiscal} ${semFiscal === 1 ? "contrato vigente está" : "contratos vigentes estão"} sem fiscal informado no cadastro.</span>`);
  const assunto = `Resumo de ${nomeAnt} da sua carteira de contratos` + (itens.length ? ` · ${itens.length} ${itens.length === 1 ? "providência" : "providências"} para ${nomeAt}` : "");
  return { assunto, titulo: `Resumo de ${nomeAnt}`, paragrafos, providencias: itens.length };
}
