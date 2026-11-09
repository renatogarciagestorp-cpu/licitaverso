/* Licitacon — animações do site com Motion (vendor/motion-12.23.12.js, API em window.Motion).
 *
 * O site é montado pelo runtime do Claude Design: cada página aparece e some inteira. Em vez de mexer em cada
 * página, este arquivo observa o que entra na tela e anima por fora:
 *   - topo de cada página: o título (h1) e o que está ao lado dele entram em cascata;
 *   - cartões e blocos: sobem e aparecem quando chegam à tela durante a rolagem;
 *   - botões: leve "aperto" ao tocar;
 *   - barra fina no topo mostrando o quanto da página já foi lido.
 * Só anima transform e opacity. Quem pediu ao sistema "reduzir movimento" não vê nenhuma animação.
 * Depois de cada entrada o estilo inline é limpo, para não anular os efeitos de hover do CSS.
 */
(function () {
  "use strict";
  var M = window.Motion;
  if (!M || !M.animate || !M.inView || !window.MutationObserver) return;
  try {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch (e) { /* segue */ }

  var animate = M.animate, inView = M.inView;
  var SUAVE = [0.22, 1, 0.36, 1];

  // Cartões: sobem com uma leve escala.
  var CARTOES = [
    ".lvh-top-card", ".lvh-free-card", ".lvh-calc4 > button", ".lvh-ban-3 > button", ".lvh-bd-item", ".lvh-bd-mais",
    ".lvh-bd-nums > div", ".lvh-pa-3 > div", ".lvh-ticket",
    ".lvp-cards > *", ".lvp-faq-item", ".lva-card", ".lve-tri-card", ".lvf-tema-c", ".lvf-q-c",
    ".gp-card", ".gx-card", ".gcl-card", ".gcs-c", ".ct-kpi", ".lvc-kpi", ".pp-kpi", ".ptp-c",
    "[style*='grid-template-columns: repeat(auto-fit'] > *"
  ];
  // Blocos maiores: só sobem e aparecem.
  var BLOCOS = [
    ".lvh-ban-txt", ".lvh-art", ".lvh-bd-top > div", ".lvh-bd-dif", ".lvh-final-in > *:not(.lvh-free)",
    ".lvp-equipes", ".lvp-bloco", ".lmo-bloco", ".lve-bloco"
  ];
  var SEL_CARTAO = CARTOES.join(",");
  var SEL = CARTOES.concat(BLOCOS).join(",");
  // Nunca anima aqui dentro: cabeçalho fixo, menus, janelas e o quadro que vira imagem no PDF.
  var FORA = "header, nav, [role='dialog'], #lvc-captura, .lvh-demo, .lvi-topo, .lvi-faixa, .lvi-frase-sec, .lvi-hist, .lvi-vit, .lvh-art-secoes";

  var vistos = new WeakSet();
  var pendentes = new Set();
  var ultimaTroca = performance.now(); // o primeiro carregamento conta como troca de página
  var JANELA = 1500; // ms depois de trocar de página em que o que já está na tela ainda anima

  function marcarTroca() { ultimaTroca = performance.now(); }
  ["pushState", "replaceState"].forEach(function (k) {
    var orig = history[k];
    if (typeof orig !== "function") return;
    history[k] = function () { var r = orig.apply(this, arguments); if (k === "pushState") marcarTroca(); return r; };
  });
  window.addEventListener("popstate", marcarTroca);

  function limpar(el) {
    el.style.opacity = "";
    el.style.transform = "";
    pendentes.delete(el);
  }

  function revelarTudo() { pendentes.forEach(limpar); }
  window.addEventListener("beforeprint", revelarTudo);

  // Rolagem com salto (barra arrastada, tecla End, link para âncora): o que ficou para trás sem animar aparece direto.
  var conferindo = false;
  window.addEventListener("scroll", function () {
    if (conferindo || !pendentes.size) return;
    conferindo = true;
    setTimeout(function () {
      conferindo = false;
      pendentes.forEach(function (el) {
        if (!el.isConnected) pendentes.delete(el);
        else if (el.style.opacity === "0" && el.getBoundingClientRect().bottom < 0) limpar(el);
      });
    }, 120);
  }, { passive: true });

  // Elementos que entram na tela no mesmo quadro saem em cascata, na ordem do documento.
  var fila = [], agendado = false;
  function enfileirar(el) {
    fila.push(el);
    if (agendado) return;
    agendado = true;
    // setTimeout e requestAnimationFrame, o que vier primeiro: sem quadros (aba em segundo plano) o lote sai mesmo assim
    var feito = false;
    function vez() { if (!feito) { feito = true; lote(); } }
    requestAnimationFrame(vez);
    setTimeout(vez, 50);
    function lote() {
      var itens = fila.splice(0);
      agendado = false;
      itens.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
      itens.forEach(function (el, i) {
        if (!el.isConnected) { pendentes.delete(el); return; }
        var cartao = el.matches(SEL_CARTAO);
        var quadro = cartao
          ? { opacity: [0, 1], y: [18, 0], scale: [0.96, 1] }
          : { opacity: [0, 1], y: [24, 0] };
        var dur = cartao ? 0.42 : 0.55, atraso = Math.min(i, 8) * 0.06;
        try {
          animate(el, quadro, { duration: dur, delay: atraso, ease: SUAVE })
            .finished.then(function () { limpar(el); }, function () { limpar(el); });
        } catch (e) { limpar(el); }
        // rede de segurança: se a animação não terminar (navegador sem quadros), o elemento aparece mesmo assim
        setTimeout(function () { if (pendentes.has(el)) limpar(el); }, (dur + atraso) * 1000 + 1200);
      });
    }
  }

  function preparar(el) {
    if (vistos.has(el)) return;
    vistos.add(el);
    if (el.closest(FORA)) return;
    var r = el.getBoundingClientRect();
    var naTela = r.bottom > 0 && r.top < window.innerHeight && (r.width || r.height);
    // Atualizações dentro da mesma página (filtros, formulários) não animam o que já está à vista.
    if (naTela && performance.now() - ultimaTroca > JANELA) return;
    el.style.opacity = "0";
    pendentes.add(el);
    var entrou = false;
    var parar = inView(el, function () {
      if (entrou) return;
      entrou = true;
      if (parar) parar();
      enfileirar(el);
    }, { margin: "0px 0px -8% 0px" });
    // o que já está à vista aparece de qualquer jeito se o navegador não avisar a entrada na tela
    if (naTela) setTimeout(function () { if (!entrou && pendentes.has(el)) { entrou = true; if (parar) parar(); limpar(el); } }, 2500);
  }

  // Topo de página: o h1 e o que está ao lado dele. Um irmão que contém cartões fica de fora (os cartões animam sozinhos).
  function topo(h1) {
    var pai = h1.parentElement;
    if (!pai || h1.closest(FORA)) return [];
    return Array.prototype.filter.call(pai.children, function (f) {
      return !f.matches(SEL) && !f.querySelector(SEL) && f.tagName !== "SCRIPT" && f.tagName !== "STYLE";
    });
  }

  function coletar(no, saida) {
    if (no.nodeType !== 1) return;
    if (no.matches("h1")) topo(no).forEach(function (x) { saida.push(x); });
    if (no.matches(SEL)) saida.push(no);
    if (!no.firstElementChild) return;
    Array.prototype.forEach.call(no.querySelectorAll("h1"), function (h) { topo(h).forEach(function (x) { saida.push(x); }); });
    Array.prototype.forEach.call(no.querySelectorAll(SEL), function (x) { saida.push(x); });
  }

  function processar(nos) {
    var alvos = [];
    nos.forEach(function (n) { coletar(n, alvos); });
    if (!alvos.length) return;
    var conjunto = new Set(alvos);
    alvos.forEach(function (el) {
      // só a página montada (#dc-root); o modelo cru do runtime é copiado depois, com o estilo que tiver
      if (!el.closest("#dc-root")) return;
      // um bloco dentro de outro que também vai animar: anima só o de fora
      var p = el.parentElement;
      while (p) { if (conjunto.has(p) || pendentes.has(p)) return; p = p.parentElement; }
      preparar(el);
    });
  }

  new MutationObserver(function (lista) {
    var nos = [];
    lista.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) nos.push(n); }); });
    if (nos.length) processar(nos);
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) processar([document.body]);

  // Aperto ao tocar em botões e cartões clicáveis.
  var APERTA = "button.lvh-btn, .lvh-btn-sec, .lvp-cta, .lvh-ticket-btn, .lvh-top-card, .lvh-free-card, .lvh-calc4 > button, .lvh-ban-3 > button, .lvh-bd-mais";
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(APERTA);
    if (!b || b.disabled || pendentes.has(b)) return;
    animate(b, { scale: 0.97 }, { duration: 0.12, ease: "easeOut" });
    function soltar() {
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      animate(b, { scale: 1 }, { type: "spring", stiffness: 520, damping: 28 })
        .finished.then(function () { b.style.transform = ""; });
    }
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }, { passive: true });

  // Barra de leitura no topo da página.
  function barra() {
    if (!M.scroll || document.getElementById("lv-progresso")) return;
    var b = document.createElement("div");
    b.id = "lv-progresso";
    b.setAttribute("aria-hidden", "true");
    b.style.cssText = "position:fixed;top:0;left:0;right:0;height:3px;background:#0FA36B;transform-origin:0 50%;transform:scaleX(0);z-index:2147483000;pointer-events:none";
    document.body.appendChild(b);
    M.scroll(animate(b, { scaleX: [0, 1] }, { ease: "linear" }));
  }
  if (document.body) barra(); else document.addEventListener("DOMContentLoaded", barra);

  window.LV_ANIM = { revelarTudo: revelarTudo };
})();
