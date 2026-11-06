// Gestão Contratual: puxa os dados de um contrato publicado no PNCP (Portal Nacional de Contratações Públicas, Lei 14.133/2021, art. 174),
// para o assinante não digitar. Só para quem está logado. Sem custo: APIs públicas do PNCP.
// POST { link } (endereço do contrato no PNCP ou número de controle "CNPJ-2-SEQ/ANO")
//   ou { cnpj, numero, ano } (CNPJ do órgão, número do contrato e ano) -> { contrato | candidatos | erro }

import { clienteServico, CORS, erro, resposta, usuarioDaRequisicao, segredoConfere } from "../_shared/comum.ts";

const PNCP = "https://pncp.gov.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const so = (t: unknown) => String(t ?? "").replace(/\D/g, "");

async function obter(url: string, ms = 12000): Promise<any> {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
      if (r.status === 204 || r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (t === 1) throw e;
      await new Promise((ok) => setTimeout(ok, 1200));
    }
  }
}

// "1/2025", "001/2025", "Contrato nº 1/2025" → "1/2025" (para comparar números escritos de formas diferentes)
const numNorm = (t: unknown) => { const m = String(t ?? "").match(/(\d+)\D*(\d{4})?/); return m ? String(Number(m[1])) + (m[2] ? "/" + m[2] : "") : ""; };

const MOD: [RegExp, string][] = [[/preg/i, "pregao"], [/concorr/i, "concorrencia"], [/concurso/i, "concurso"], [/leil/i, "leilao"], [/di[aá]logo/i, "dialogo"],
  [/dispensa/i, "dispensa_valor"], [/inexig/i, "inexigibilidade"], [/credenciamento/i, "outra"]];

async function modalidadeDaCompra(controleCompra: string) {
  const m = /^(\d{14})-1-(\d+)\/(\d{4})$/.exec(String(controleCompra || ""));
  if (!m) return null;
  const c = await obter(`${PNCP}/api/consulta/v1/orgaos/${m[1]}/compras/${m[3]}/${Number(m[2])}`).catch(() => null);
  const nome = c && (c.modalidadeNome || (c.modalidade && c.modalidade.nome)) || "";
  const id = (MOD.find(([r]) => r.test(nome)) || [, ""])[1];
  return { nome, id, srp: !!(c && c.srp), amparo: c && c.amparoLegal ? c.amparoLegal.nome || "" : "" };
}

function mapear(x: any) {
  const cnpj = so(x?.orgaoEntidade?.cnpj), ano = x?.anoContrato, seq = x?.sequencialContrato;
  return {
    numero: String(x?.numeroContratoEmpenho || "").trim(), contratante: x?.orgaoEntidade?.razaoSocial || "", unidade: x?.unidadeOrgao?.nomeUnidade || "",
    uf: x?.unidadeOrgao?.ufSigla || "", municipio: x?.unidadeOrgao?.municipioNome || "",
    contratada: x?.nomeRazaoSocialFornecedor || "", cnpj_contratada: x?.niFornecedor || "", objeto: String(x?.objetoContrato || "").trim(),
    processo: x?.processo || "", assinatura: String(x?.dataAssinatura || "").slice(0, 10), inicio: String(x?.dataVigenciaInicio || "").slice(0, 10), fim: String(x?.dataVigenciaFim || "").slice(0, 10),
    valor_inicial: x?.valorInicial ?? null, valor_global: x?.valorGlobal ?? null, parcelas: x?.numeroParcelas ?? null, valor_parcela: x?.valorParcela ?? null,
    controle: x?.numeroControlePNCP || "", controle_compra: x?.numeroControlePncpCompra || "",
    link: cnpj && ano && seq ? `${PNCP}/app/contratos/${cnpj}/${ano}/${seq}` : "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não permitido", 405);
  const admin = clienteServico();
  if (!segredoConfere(req) && !(await usuarioDaRequisicao(req, admin))) return erro("Entre na sua conta para consultar o PNCP.", 401);
  const corpo = await req.json().catch(() => ({}));
  const link = String(corpo.link ?? "").trim();
  try {
    // 1) endereço do contrato no PNCP ou número de controle
    let m = /contratos\/(\d{14})\/(\d{4})\/(\d+)/.exec(link) || null, cnpj = "", ano = "", seq = "";
    if (m) { cnpj = m[1]; ano = m[2]; seq = m[3]; }
    else if ((m = /(\d{14})-2-(\d+)\/(\d{4})/.exec(link))) { cnpj = m[1]; seq = String(Number(m[2])); ano = m[3]; }
    if (cnpj) {
      const x = await obter(`${PNCP}/api/pncp/v1/orgaos/${cnpj}/contratos/${ano}/${seq}`);
      if (!x) return resposta({ erro: "Contrato não encontrado no PNCP com esse endereço. Confira o link." });
      const c = mapear(x);
      return resposta({ contrato: { ...c, modalidade: await modalidadeDaCompra(c.controle_compra) } });
    }
    if (link) return resposta({ erro: "Cole o endereço do contrato no PNCP (pncp.gov.br/app/contratos/...) ou o número de controle (CNPJ-2-sequencial/ano), ou informe o CNPJ do órgão, o número e o ano." });

    // 2) CNPJ do órgão + número do contrato + ano: procura nas publicações do ano (e do 1º trimestre do ano seguinte)
    const cnpjO = so(corpo.cnpj), anoC = String(corpo.ano ?? "").replace(/\D/g, "").slice(0, 4), numero = numNorm(corpo.numero);
    if (cnpjO.length !== 14 || anoC.length !== 4 || !numero) return resposta({ erro: "Informe o CNPJ do órgão (14 dígitos), o número do contrato e o ano." });
    const alvo = numero.split("/")[0], achados: any[] = [];
    const janelas = [[anoC + "0101", anoC + "1231"], [String(Number(anoC) + 1) + "0101", String(Number(anoC) + 1) + "0331"]];
    for (const [di, df] of janelas) {
      for (let pg = 1; pg <= 10; pg++) {
        const j = await obter(`${PNCP}/api/consulta/v1/contratos?dataInicial=${di}&dataFinal=${df}&cnpjOrgao=${cnpjO}&pagina=${pg}&tamanhoPagina=500`, 20000).catch(() => null);
        const lista = j && Array.isArray(j.data) ? j.data : [];
        for (const x of lista) {
          const n = numNorm(x.numeroContratoEmpenho);
          if (n.split("/")[0] === alvo && (!n.includes("/") || n.endsWith("/" + anoC) || String(x.anoContrato) === anoC)) achados.push(x);
        }
        if (!lista.length || (j.totalPaginas && pg >= j.totalPaginas)) break;
      }
      if (achados.length) break;
    }
    if (!achados.length) return resposta({ erro: "Nenhum contrato " + corpo.numero + " desse órgão foi encontrado no PNCP em " + anoC + ". Confira o CNPJ do órgão (o da entidade contratante) e o número, ou cole o link do contrato no PNCP." });
    const cands = achados.map(mapear);
    if (cands.length > 1) return resposta({ candidatos: cands.slice(0, 10) });
    return resposta({ contrato: { ...cands[0], modalidade: await modalidadeDaCompra(cands[0].controle_compra) } });
  } catch (e) {
    console.error("pncp-contrato", e);
    return resposta({ erro: "O PNCP não respondeu agora. Tente de novo em alguns minutos." });
  }
});
