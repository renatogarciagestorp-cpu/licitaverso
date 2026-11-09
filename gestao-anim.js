/* Licitacon — montagem animada dos painéis da Gestão Contratual (GSAP). Estilos em gestao.css.
 *
 * Quando um painel aparece (ao abrir a página ou trocar de aba), ele se monta uma vez: os cartões entram em cascata,
 * os números dos indicadores contam até o valor, as colunas e barras crescem e o mapa de prazos acende ladrilho por
 * ladrilho. Só anima transform e opacity (e o texto dos números, que termina exatamente como o site escreveu).
 * Com "reduzir movimento", nada se mexe. Depois de animar, os estilos inline são limpos para não atrapalhar o site.
 */
(function () {
  "use strict";
  var G = window.gsap;
  if (!G || !window.MutationObserver) return;
  try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) { /* segue */ }

  var PAINEIS = "#dc-root .gx, #dc-root .gp-grade, #dc-root .gp-kpis, #dc-root .gp-acoes";
  var vistos = new WeakSet();
  function qa(raiz, s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); }

  // "R$ 28,02 mi", "12", "83,3%", "R$ 44.809,36/mês": conta o número e devolve o texto original no fim
  function contar(el) {
    var txt = el.textContent, m = txt.match(/-?\d{1,3}(\.\d{3})*(,\d+)?|-?\d+(,\d+)?/);
    if (!m) return null;
    var bruto = m[0], casas = (bruto.split(",")[1] || "").length, alvo = parseFloat(bruto.replace(/\./g, "").replace(",", "."));
    if (!isFinite(alvo) || alvo === 0) return null;
    var antes = txt.slice(0, m.index), depois = txt.slice(m.index + bruto.length), o = { v: 0 }, escrito = null;
    // se o site reescrever o número no meio (filtro trocado), a contagem para e não mexe mais nele
    var tw = G.to(o, {
      v: alvo, duration: 1.1, ease: "power2.out",
      onUpdate: function () {
        if (escrito !== null && el.textContent !== escrito) { tw.kill(); return; }
        escrito = antes + o.v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + depois;
        el.textContent = escrito;
      },
      onComplete: function () { if (el.textContent === escrito) el.textContent = txt; }
    });
    return tw;
  }

  function montar(p) {
    if (vistos.has(p)) return;
    vistos.add(p);
    var cartoes = qa(p, ":scope > .gx-head > .gx-hd, :scope > .gx-c, :scope > .gp-card, :scope > .gp-kpi, :scope > .gp-acoes-l > *");
    if (p.classList.contains("gp-acoes")) cartoes = [p];
    var colunas = qa(p, ".gx-col-b > i"), barrasX = qa(p, ".gx-sl-b > i, .gx-fu-b > i, .gx-hbr-b > i, .gp-bar > i, .gp-qual-b > i, .gp-lim-b > i");
    var ladrilhos = qa(p, ".gx-cel:not(.fora)"), linhas = qa(p, ".gx-ln"), numeros = qa(p, ".gx-hd > b, .gp-kpi b, .gx-ros-g b");
    var tl = G.timeline({ defaults: { ease: "power3.out" }, onComplete: function () { G.set([].concat(cartoes, colunas, barrasX, ladrilhos), { clearProps: "transform,opacity,visibility" }); } });
    if (cartoes.length) tl.from(cartoes, { autoAlpha: 0, y: 14, duration: 0.55, stagger: 0.045 }, 0);
    if (colunas.length) tl.from(colunas, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.8, stagger: 0.035 }, 0.25);
    if (barrasX.length) tl.from(barrasX, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.9, stagger: 0.02 }, 0.3);
    if (ladrilhos.length) tl.from(ladrilhos, { autoAlpha: 0, scale: 0.6, duration: 0.35, stagger: { each: 0.006, from: "start" } }, 0.35);
    linhas.forEach(function (l) {
      var n = 0;
      try { n = l.getTotalLength(); } catch (e) { n = 0; }
      if (!n) return;
      tl.fromTo(l, { strokeDasharray: n, strokeDashoffset: n }, { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0.3);
    });
    numeros.forEach(function (b) { var t = contar(b); if (t) tl.add(t, 0.15); });
  }

  function varrer() {
    Array.prototype.forEach.call(document.querySelectorAll(PAINEIS), function (p) {
      if (vistos.has(p)) return;
      if (p.closest("#lvc-captura, [aria-hidden='true']")) { vistos.add(p); return; } // cópia que vira PDF: sempre inteira
      // só monta quando o painel está perto da tela (abas longas: o resto monta ao rolar)
      if (!window.IntersectionObserver) { montar(p); return; }
      vistos.add(p);
      var io = new IntersectionObserver(function (es) {
        if (!es[es.length - 1].isIntersecting) return;
        io.disconnect();
        vistos.delete(p);
        montar(p);
      }, { rootMargin: "0px 0px -60px 0px" });
      io.observe(p);
    });
  }
  var agendado = false;
  new MutationObserver(function () {
    if (agendado) return;
    agendado = true;
    setTimeout(function () { agendado = false; varrer(); }, 60);
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) varrer();
})();
