/* Bateria de perguntas do assistente (chatbot.js + chatbot-base.js).
   Uso: na raiz do site, rode um servidor (python3 -m http.server 8765) e depois
   node scripts/testes/chatbot/testar.js [http://localhost:8765]
   Confere: 1) cada pergunta da base leva à própria resposta; 2) as perguntas de perguntas.json
   levam à resposta esperada (modo "certo") ou, quando marcadas com "duvida", oferecem a resposta entre as opções. */
const { chromium } = require("playwright");
const path = require("path");
const casos = require(path.join(__dirname, "perguntas.json"));
(async () => {
  const url = (process.argv[2] || "http://localhost:8765") + "/index.html";
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("licitaverso:cookies", "essenciais"); } catch (e) {} });
  await p.goto(url, { waitUntil: "load" });
  await p.waitForFunction(() => window.LV_CHAT_PONTUAR && window.LV_CHAT_BASE, null, { timeout: 15000 });
  const r = await p.evaluate((casos) => {
    const B = window.LV_CHAT_BASE, falhas = [];
    let ok1 = 0, ok2 = 0;
    // a mesma resposta não pode aparecer duas vezes, e os temas só apontam para respostas existentes
    const ids = {}; B.itens.forEach((it) => { if (ids[it.id]) falhas.push("id repetido: " + it.id); ids[it.id] = 1; });
    B.temas.forEach((t) => t.ids.forEach((id) => { if (!ids[id]) falhas.push("tema " + t.id + " aponta para " + id + ", que não existe"); }));
    B.itens.forEach((it) => (it.rel || []).forEach((id) => { if (!ids[id]) falhas.push(it.id + ".rel aponta para " + id + ", que não existe"); }));
    B.itens.forEach((it) => (it.a || []).forEach((a) => { if (a.chat && !ids[a.chat]) falhas.push(it.id + ".a aponta para " + a.chat + ", que não existe"); }));
    B.itens.forEach((it) => {
      const x = window.LV_CHAT_PONTUAR(it.p);
      if (x.modo === "certo" && x.top[0].split(":")[0] === it.id) ok1++; else falhas.push("base: \"" + it.p + "\" → " + x.modo + " " + x.top.join(" "));
    });
    casos.forEach((c) => {
      const x = window.LV_CHAT_PONTUAR(c.q), top = x.top.map((s) => s.split(":")[0]);
      const passou = c.modo === "duvida" ? (x.modo !== "nada" && top.indexOf(c.id) >= 0) : (x.modo === "certo" && top[0] === c.id);
      if (passou) ok2++; else falhas.push("nova: \"" + c.q + "\" (esperado " + c.id + ") → " + x.modo + " " + x.top.join(" "));
    });
    return { base: ok1 + "/" + B.itens.length, novas: ok2 + "/" + casos.length, falhas };
  }, casos);
  console.log("Perguntas da base:", r.base, "| Perguntas novas:", r.novas);
  r.falhas.forEach((f) => console.log("  ✗", f));
  await b.close();
  process.exit(r.falhas.length ? 1 : 0);
})();
