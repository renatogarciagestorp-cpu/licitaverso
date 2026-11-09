// Gera inicio3d.js na raiz do site a partir de src/inicio3d.js, com só as partes do Three.js que as cenas usam.
// Uso: cd scripts/3d && npm install && npm run montar
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
const r = await build({
  entryPoints: [path.join(raiz, "src/inicio3d.js")],
  outfile: path.join(raiz, "inicio3d.js"),
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  nodePaths: [path.join(aqui, "node_modules")],
  legalComments: "eof",
  banner: { js: "/* Licitacon — cenas 3D da página inicial. Gerado por scripts/3d/montar.mjs a partir de src/inicio3d.js; não edite aqui. Inclui Three.js (MIT, threejs.org). */" },
  metafile: true
});
const kb = Object.values(r.metafile.outputs)[0].bytes / 1024;
console.log("inicio3d.js:", kb.toFixed(0), "KB");
