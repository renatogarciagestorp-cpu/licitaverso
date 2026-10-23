// Gera acervo.json (formato "licitaverso-acervo" v1) a partir dos documentos do Acervo Licitaverso.
// Uso: node scripts/gerar-acervo.mjs <pasta-com-os-json-dos-documentos> [saida=acervo.json]
// Cada arquivo <id>.json da pasta é um documento da coleção "decisoes" (como gravado pelo ArtifactData com out_dir).
import fs from "fs"; import path from "path";
const LEGISLACAO=new Set(["Lei","Decreto","Norma (portaria, IN, resolução)"]);
const ORIENT=new Set(["Parecer/orientação","Resposta a consulta","Súmula/Enunciado","Boletim/informativo"]);

const natOf=d=>LEGISLACAO.has(d.tipo)?"legislacao":ORIENT.has(d.tipo)?"orientacoes":"decisoes";

const ESFERA={"TCU":"União","CGU":"União","STF":"União","STJ":"União","GOV-BR":"União","TCE-RJ":"Estado do RJ","PGE-RJ":"Estado do RJ","TJ-RJ":"Estado do RJ","GOV-RJ":"Estado do RJ","TCM-RJ":"Município do Rio de Janeiro"};

const ORG_NOME={"TCU":["BRASIL","Tribunal de Contas da União"],"CGU":["BRASIL","Controladoria-Geral da União"],"STF":["BRASIL","Supremo Tribunal Federal"],"STJ":["BRASIL","Superior Tribunal de Justiça"],
  "TCE-RJ":["RIO DE JANEIRO (Estado)","Tribunal de Contas do Estado do Rio de Janeiro"],"PGE-RJ":["RIO DE JANEIRO (Estado)","Procuradoria-Geral do Estado"],"TJ-RJ":["RIO DE JANEIRO (Estado)","Tribunal de Justiça"],"TCM-RJ":["RIO DE JANEIRO (Município)","Tribunal de Contas do Município do Rio de Janeiro"],"GOV-BR":["BRASIL",""],"GOV-RJ":["RIO DE JANEIRO (Estado)",""]};
const MESES=["jan.","fev.","mar.","abr.","maio","jun.","jul.","ago.","set.","out.","nov.","dez."];
const dAbnt=iso=>{if(!iso)return"";const[y,m,d]=iso.slice(0,10).split("-");return `${+d} ${MESES[+m-1]} ${y}`};
function tese(d){let t=d.resumo||d.titulo||"";for(const k of [" Publicado em:"," (Boletim"," (Informativo"," Decisões de 2026"," Informativo STF"]){const i=t.indexOf(k);if(i>40)t=t.slice(0,i)}return t.trim()}
function citacao(d,fmtc){
  const [ente,org]=ORG_NOME[d.orgao]||["",d.orgao];const rel=(d.relator||"").replace(/^(Min\.|Cons\.|Des\.)\s*/,"");
  const cargo=/^Cons\./.test(d.relator||"")?"Conselheiro":/^Des\./.test(d.relator||"")?"Desembargador(a)":/^Min/.test(d.relator||"")?"Ministro(a)":"";
  const num=d.numero||d.tipo;const hoje=dAbnt(new Date().toISOString());
  if(d._nat==="legislacao"&&fmtc==="abnt")return `${ente}. ${num}${d.titulo?". "+d.titulo.replace(/\.$/,""):""}. ${d.fonte_nome?d.fonte_nome+", ":""}${d.data?dAbnt(d.data)+". ":""}${d.fonte_url?`Disponível em: ${d.fonte_url}. Acesso em: ${hoje}.`:""}`.replace(/\s+/g," ").trim();
  if(fmtc==="curta")return `(${d.orgao}, ${num}${d.relator?", Rel. "+d.relator:""}${d.data?", j. "+fmt(d.data):""})`;
  if(fmtc==="peca")return `“${tese(d)}” (${d.orgao}, ${num}${d.relator?", Rel. "+d.relator:""}${d.data?", j. "+fmt(d.data):""}).`;
  return `${ente}. ${org}${d.colegiado?" ("+d.colegiado+")":""}. ${num}. ${rel?`Relator: ${cargo?cargo+" ":""}${rel}. `:""}${d.data?`Julgado em ${dAbnt(d.data)}. `:""}${d.fonte_nome?d.fonte_nome+". ":""}${d.fonte_url?`Disponível em: ${d.fonte_url}. Acesso em: ${hoje}.`:""}`.replace(/\s+/g," ").trim();
}

const fmt=d=>{if(!d)return"";const[y,m,dd]=d.split("-");return `${dd}/${m}/${y}`};

const LEIS_CONHECIDAS={"14.133/2021":"Lei 14.133/2021 (Licitações)","8.666/1993":"Lei 8.666/1993","13.303/2016":"Lei 13.303/2016 (Estatais)","12.846/2013":"Lei 12.846/2013 (Anticorrupção)","10.520/2002":"Lei 10.520/2002 (Pregão)","8.987/1995":"Lei 8.987/1995 (Concessões)","11.079/2004":"Lei 11.079/2004 (PPP)","12.527/2011":"Lei 12.527/2011 (LAI)","8.429/1992":"Lei 8.429/1992 (Improbidade)","101/2000":"LC 101/2000 (LRF)","123/2006":"LC 123/2006 (ME/EPP)"};
function leisDe(d){
  const txt=[d.titulo,d.resumo,d.numero,(d.tags||[]).join(" "),(d.leis||[]).join(" ")].join(" ");
  const out=new Set(d.leis||[]);
  const re=/\b(?:Lei|LC|Lei Complementar)\s*(?:n[º°o.]*\s*)?(\d{1,2}\.?\d{3}|\d{2,3})(?:\s*\/\s*(\d{2,4}))?/gi;let m;
  while((m=re.exec(txt))){let n=m[1];if(/^\d{4,5}$/.test(n))n=n.replace(/(\d+)(\d{3})$/,"$1.$2");let y=m[2]||"";if(y.length===2)y=(+y>30?"19":"20")+y;
    const key=Object.keys(LEIS_CONHECIDAS).find(k=>k.startsWith(n+"/")&&(!y||k.endsWith(y)));
    out.add(key?LEIS_CONHECIDAS[key]:`Lei ${n}${y?"/"+y:""}`)}
  if(/nova lei de licita/i.test(txt))out.add(LEIS_CONHECIDAS["14.133/2021"]);
  if(/lei das estatais/i.test(txt))out.add(LEIS_CONHECIDAS["13.303/2016"]);
  if(/lei anticorrup/i.test(txt))out.add(LEIS_CONHECIDAS["12.846/2013"]);
  if(/\bLRF\b|responsabilidade fiscal/i.test(txt))out.add(LEIS_CONHECIDAS["101/2000"]);
  if(/\bart\.?\s*\d+[^.]*\b(CF|Constitui)/i.test(txt)||/\bCF\b/.test(txt))out.add("Constituição Federal");
  return [...out];
}

function itemPlataforma(d){return {id:d.id,orgao:d.orgao,esfera:ESFERA[d.orgao]||"",uf:ESFERA[d.orgao]==="União"?"":"RJ",municipio:d.orgao==="TCM-RJ"?"Rio de Janeiro":"",
  natureza:d._nat,tipo:d.tipo,numero:d.numero||"",colegiado:d.colegiado||"",relator:d.relator||"",data:d.data||"",tema:d.tema,titulo:d.titulo,tese:tese(d),
  tags:d.tags||[],legislacao:d._leis,fonte_nome:d.fonte_nome||"",fonte_url:d.fonte_url||"",verificado_em:(d.capturado_em||"").slice(0,10),citacao_abnt:citacao(d,"abnt")}}

const dir=process.argv[2]; const saida=process.argv[3]||"acervo.json";
if(!dir){console.error("Informe a pasta com os documentos.");process.exit(1)}
const docs=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>{const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));const x={id:f.slice(0,-5),...d};x._leis=leisDe(x);x._nat=natOf(x);return x});
if(docs.length<100){console.error("Poucos documentos ("+docs.length+"); abortando para não publicar um acervo incompleto.");process.exit(2)}
const itens=docs.sort((a,b)=>(b.data||"").localeCompare(a.data||"")||a.id.localeCompare(b.id)).map(itemPlataforma);
fs.writeFileSync(saida,JSON.stringify({formato:"licitaverso-acervo",versao:1,gerado_em:new Date().toISOString(),total:itens.length,itens}));
console.log(itens.length+" itens gravados em "+saida);
