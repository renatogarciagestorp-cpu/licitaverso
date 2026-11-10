// Confere o Acervo (base do artifact) com o que o site publica e põe em acervo-novos/ só o que falta ou mudou.
// Rede de segurança das coletas: se uma delas gravou na base mas não conseguiu enviar ao site (GitHub recusou,
// a tarefa não tem passo de envio, a execução parou no meio), a reconciliação diária manda o documento depois.
//
// Uso: node scripts/sincronizar-acervo.mjs <pasta-da-copia>
//   <pasta-da-copia>/decisoes/<id>.json  e  <pasta-da-copia>/meta/<id>.json
//   (o formato que a ferramenta ArtifactData grava com out_dir ao listar as coleções "decisoes" e "meta").
// Saída: acervo-novos/<id>.json (decisões) e acervo-novos/_meta/<id>.json (situação das coletas), que a
// automação .github/workflows/acervo-mesclar.yml junta ao acervo do site quando chegam ao main.
import fs from "fs"; import path from "path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const copia = process.argv[2];
if (!copia || !fs.existsSync(path.join(copia, "decisoes"))) { console.error("Informe a pasta com as subpastas decisoes/ e meta/."); process.exit(1); }

const lerPasta = (p) => !fs.existsSync(p) ? new Map() : new Map(fs.readdirSync(p)
  .filter((f) => f.endsWith(".json") && !f.startsWith("."))
  .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(p, f), "utf8"))]));
// mesma comparação nos dois lados: chaves em ordem, sem id nem controle de versão
const chave = (o) => { const { id, version, _version, ...r } = o || {}; return JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]])); };

const base = lerPasta(path.join(copia, "decisoes")), baseMeta = lerPasta(path.join(copia, "meta"));
// uma cópia muito menor que o site indica leitura incompleta da base: não envia nada
const site = JSON.parse(fs.readFileSync(path.join(raiz, "acervo-completo.json"), "utf8"));
const noSite = new Map(site.decisoes), metaSite = new Map(site.meta || []);
if (base.size < noSite.size * 0.9) { console.error(`Cópia da base com ${base.size} documentos e site com ${noSite.size}: leitura incompleta, nada enviado.`); process.exit(2); }

const novos = path.join(raiz, "acervo-novos"), novosMeta = path.join(novos, "_meta");
const faltam = [], mudaram = [], metas = [];
for (const [id, d] of base) {
  if (!noSite.has(id)) faltam.push(id); else if (chave(d) !== chave(noSite.get(id))) mudaram.push(id); else continue;
  fs.mkdirSync(novos, { recursive: true });
  const { id: _i, version, _version, ...doc } = d;
  fs.writeFileSync(path.join(novos, id + ".json"), JSON.stringify(doc, null, 1));
}
for (const [id, m] of baseMeta) {
  if (chave(m) === chave(metaSite.get(id))) continue;
  fs.mkdirSync(novosMeta, { recursive: true });
  const { id: _i, version, _version, ...doc } = m;
  fs.writeFileSync(path.join(novosMeta, id + ".json"), JSON.stringify(doc, null, 1));
  metas.push(id);
}
const soNoSite = [...noSite.keys()].filter((id) => !base.has(id));
console.log(`Base: ${base.size} · site: ${noSite.size} · faltam no site: ${faltam.length} · mudaram: ${mudaram.length} · situação de coleta: ${metas.length}`
  + (soNoSite.length ? ` · só no site (mantidos): ${soNoSite.length}` : ""));
for (const id of faltam) console.log("falta:", id);
for (const id of mudaram) console.log("mudou:", id);
for (const id of metas) console.log("situação:", id);
