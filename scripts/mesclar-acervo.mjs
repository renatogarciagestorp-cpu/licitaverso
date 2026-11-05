// Junta ao acervo do site os documentos novos deixados pelas coletas em acervo-novos/<id>.json
// (o mesmo objeto gravado na coleção "decisoes" do Acervo; aceita também {id, data}).
// Valida cada um (órgão do catálogo, número, título e fonte oficial), regenera acervo.json e
// acervo-completo.json com scripts/gerar-acervo.mjs e move os recusados para acervo-recusados/.
// Uso: node scripts/mesclar-acervo.mjs   (rodado pela automação .github/workflows/acervo-mesclar.yml)
import fs from "fs"; import path from "path"; import os from "os"; import { execFileSync } from "child_process";
import "../orgaos.js";
const ORG = globalThis.LV_ORG;
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pastaNovos = path.join(raiz, "acervo-novos"), pastaRec = path.join(raiz, "acervo-recusados");
const arquivos = fs.existsSync(pastaNovos) ? fs.readdirSync(pastaNovos).filter((f) => f.endsWith(".json")) : [];
if (!arquivos.length) { console.log("Nada novo em acervo-novos/."); process.exit(0); }

const completo = JSON.parse(fs.readFileSync(path.join(raiz, "acervo-completo.json"), "utf8"));
const docs = new Map(completo.decisoes.map(([id, d]) => [id, d]));
const oficial = (u) => { try { const h = new URL(u).hostname.toLowerCase(); return /\.(gov\.br|tc\.br|jus\.br|leg\.br)$/.test(h); } catch (e) { return false; } };
const conhecido = (o) => { try { const i = ORG.info(o); return !!(i && i.grupo); } catch (e) { return false; } };
let novos = 0, atualizados = 0; const recusados = [];
for (const f of arquivos) {
  const p = path.join(pastaNovos, f);
  let o; try { o = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { recusados.push([f, "JSON inválido"]); continue; }
  const id = String((o && o.id && o.data ? o.id : f.slice(0, -5)) || "").trim();
  const d = o && o.id && o.data ? o.data : { ...o }; delete d.id;
  const falta = !/^[a-z0-9][a-z0-9-]{2,180}$/.test(id) ? "id inválido" : !conhecido(d.orgao) ? "órgão fora do catálogo: " + d.orgao
    : !String(d.numero || "").trim() ? "sem número" : !String(d.titulo || "").trim() ? "sem título" : !oficial(d.fonte_url) ? "fonte não oficial" : "";
  if (falta) { recusados.push([f, falta]); continue; }
  if (docs.has(id)) atualizados++; else novos++;
  docs.set(id, d);
}
// pastas temporárias no formato de gerar-acervo.mjs
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acervo-"));
fs.mkdirSync(path.join(tmp, "decisoes")); fs.mkdirSync(path.join(tmp, "meta"));
for (const [id, d] of docs) fs.writeFileSync(path.join(tmp, "decisoes", id + ".json"), JSON.stringify(d));
for (const [id, m] of completo.meta || []) fs.writeFileSync(path.join(tmp, "meta", id + ".json"), JSON.stringify(m));
execFileSync("node", [path.join(raiz, "scripts", "gerar-acervo.mjs"), path.join(tmp, "decisoes"), path.join(raiz, "acervo.json"), path.join(tmp, "meta")], { stdio: "inherit" });
// limpa a pasta de entrada; recusados ficam para conferência
if (recusados.length) fs.mkdirSync(pastaRec, { recursive: true });
for (const f of arquivos) {
  const r = recusados.find((x) => x[0] === f);
  if (r) fs.renameSync(path.join(pastaNovos, f), path.join(pastaRec, f)); else fs.unlinkSync(path.join(pastaNovos, f));
}
if (recusados.length) fs.appendFileSync(path.join(pastaRec, "LEIA.txt"), recusados.map(([f, m]) => new Date().toISOString().slice(0, 10) + " " + f + ": " + m).join("\n") + "\n");
const resumo = `${docs.size} itens (${novos} novos, ${atualizados} atualizados${recusados.length ? ", " + recusados.length + " recusados" : ""})`;
fs.writeFileSync(path.join(os.tmpdir(), "acervo-resumo.txt"), resumo);
console.log(resumo); recusados.forEach(([f, m]) => console.log("recusado:", f, "-", m));
