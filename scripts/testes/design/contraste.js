// varre o texto visível de cada página e lista o que fica abaixo de 4,5:1 (texto pequeno) ou 3:1 (grande)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LICITAVERSO_CONFIG={supabaseUrl:"",supabaseAnonKey:""};' }));
  await p.addInitScript(() => { try { localStorage.setItem('licitaverso:cookies', 'essenciais'); } catch (e) {} });
  
  const total = {};
  for (const pg of ['', 'planos', 'forum', 'cursos', 'consultoria', 'agente', 'elaborar', 'precos', 'calculadora', 'gestao', 'contratos', 'login', 'cadastro', 'institucional', 'conta']) {
    await p.goto('http://localhost:8765/index.html' + (pg ? '?p=' + pg : ''), { waitUntil: 'load' }); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const rgba = (s) => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
      const fundo = (el) => { let cor = [255, 255, 255], pilha = []; for (let e = el; e; e = e.parentElement) { const st = getComputedStyle(e); if (st.backgroundImage && st.backgroundImage !== 'none') return null; const c = rgba(st.backgroundColor); if ((c[3] === undefined ? 1 : c[3]) > 0) { pilha.push(c); if ((c[3] === undefined ? 1 : c[3]) >= 1) break; } } pilha.reverse().forEach((c) => { const a = c[3] === undefined ? 1 : c[3]; cor = cor.map((v, i) => v * (1 - a) + c[i] * a); }); return cor; };
      const out = {}; const w = document.createTreeWalker(document.querySelector('#dc-root'), NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.trim(); if (t.length < 2) continue; const el = n.parentElement, st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || !el.offsetParent || Number(st.opacity) < 0.9) continue;
        const bg = fundo(el); if (!bg) continue; const fg = rgba(st.color); if ((fg[3] === undefined ? 1 : fg[3]) < 1) continue;
        const a = lum(fg), b2 = lum(bg), cr = (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05), px = parseFloat(st.fontSize), grande = px >= 24 || (px >= 18.66 && Number(st.fontWeight) >= 700);
        if (cr < (grande ? 3 : 4.5)) { const k = st.color + ' sobre rgb(' + bg.map(Math.round).join(', ') + ')'; (out[k] = out[k] || { n: 0, cr: cr.toFixed(2), ex: t.slice(0, 40), cls: (el.className || el.tagName).toString().slice(0, 30) }).n++; } }
      return out; });
    Object.entries(r).forEach(([k, v]) => { (total[k] = total[k] || { n: 0, cr: v.cr, ex: v.ex, cls: v.cls, pgs: [] }); total[k].n += v.n; total[k].pgs.push(pg || 'home'); });
  }
  const lista = Object.entries(total).sort((a, b) => b[1].n - a[1].n);
  console.log('combinações abaixo do mínimo:', lista.length, '| ocorrências:', lista.reduce((a, x) => a + x[1].n, 0));
  lista.slice(0, 22).forEach(([k, v]) => console.log(String(v.n).padStart(4), v.cr, k, '|', v.cls, '|', v.ex, '|', v.pgs.slice(0, 4).join(',')));
  await b.close();
})();
