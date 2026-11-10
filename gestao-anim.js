/* Licitacon — montagem animada dos painéis da Gestão Contratual (GSAP). Estilos em gestao.css.
 *
 * Na primeira vez que cada painel aparece (ao abrir a página ou trocar de aba), ele se monta: os cartões entram em
 * cascata, os números dos indicadores contam até o valor, as colunas e barras crescem e o mapa de prazos acende ladrilho
 * por ladrilho. Ao voltar a uma aba já vista, o painel aparece pronto: é uma tela de uso diário, e a animação repetida
 * atrasaria a leitura. Tudo curto (0,25 a 0,6 s) e com saída suave. Só anima transform e opacity (os cartões nunca
 * ficam "invisible": o foco do teclado não se perde).
 *
 * O runtime (React) é dono do texto dos números: a contagem escreve só no nó de texto que já existe (nodeValue), nunca
 * troca o elemento; se o React mudar o número no meio, a contagem para e o valor dele fica. Durante a contagem o
 * painel fica com aria-busy, para leitores de tela não lerem um valor no meio do caminho.
 * Os painéis da Gestão ficam fora do animacoes.js (lista FORA de lá): uma só biblioteca cuida de cada cartão.
 * Com "reduzir movimento" ou "economia de dados", nada se mexe. O GSAP é baixado só quando um painel aparece.
 */
(function () {
  "use strict";
  if (!window.MutationObserver) return;
  try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) { /* segue */ }
  try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) { /* segue */ }

  var PAINEIS = "#dc-root .gx, #dc-root .gp-grade, #dc-root .gp-acoes";
  var vistos = new WeakSet(), vigias = [], ativas = [], formatos = {}, jaMontados = new Set();
  // o runtime recria o painel a cada troca de aba: a assinatura (títulos dos cartões) diz se aquela aba já se montou
  function assinatura(p) {
    return qa(p, ".gx-t, .gp-card > h3").slice(0, 4).map(function (e) { return e.textContent.trim(); }).join("|") || null;
  }
  function qa(raiz, s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); }

  // GSAP sob demanda (o mesmo arquivo do inicio-ui.js; quem pedir primeiro baixa)
  function comGsap() {
    if (window.gsap) return Promise.resolve(window.gsap);
    if (!window.__lvGsap) window.__lvGsap = new Promise(function (ok, erro) {
      var s = document.createElement("script");
      s.src = "vendor/gsap-3.15.1.min.js";
      s.onload = function () { if (window.gsap) ok(window.gsap); else erro(new Error("gsap")); };
      s.onerror = erro;
      document.head.appendChild(s);
    });
    return window.__lvGsap;
  }

  // o único nó de texto não vazio dentro do elemento (o runtime põe o valor num nó de texto, às vezes dentro de um span)
  function noDeTexto(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, achado = null;
    while ((n = w.nextNode())) { if (n.nodeValue.trim()) { if (achado) return null; achado = n; } }
    return achado;
  }
  function formato(casas, grupos) {
    var k = casas + (grupos ? "g" : "");
    return formatos[k] || (formatos[k] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: grupos }));
  }
  // "R$ 28,02 mi", "12", "83,3%", "R$ 44.809,36/mês", "2026": conta o número e devolve o texto original no fim
  function contar(G, el) {
    var no = noDeTexto(el);
    if (!no) return null;
    var txt = no.nodeValue, m = txt.match(/-?\d+(?:\.\d{3})*(?:,\d+)?/);
    if (!m) return null;
    var bruto = m[0], casas = (bruto.split(",")[1] || "").length, f = formato(casas, bruto.indexOf(".") >= 0);
    var alvo = parseFloat(bruto.replace(/\./g, "").replace(",", "."));
    if (!isFinite(alvo) || alvo === 0) return null;
    var antes = txt.slice(0, m.index), depois = txt.slice(m.index + bruto.length), o = { v: 0 }, escrito = txt;
    var tw = G.to(o, {
      v: alvo, duration: 0.6, ease: "power2.out",
      onUpdate: function () {
        if (!no.isConnected || no.nodeValue !== escrito) { tw.kill(); return; } // o React mudou o valor: ele manda
        escrito = antes + f.format(o.v) + depois;
        no.nodeValue = escrito;
      },
      onComplete: function () { if (no.nodeValue === escrito) no.nodeValue = txt; }
    });
    return tw;
  }

  function montar(G, p) {
    var cartoes = p.classList.contains("gp-acoes") ? [p] : qa(p, ":scope > .gx-head > .gx-hd, :scope > .gx-c, :scope > .gp-card");
    var colunas = qa(p, ".gx-col-b > i"), barrasX = qa(p, ".gx-sl-b > i, .gx-fu-b > i, .gx-hbr-b > i, .gp-bar > i, .gp-qual-b > i, .gp-lim-b > i");
    var ladrilhos = qa(p, ".gx-cel:not(.fora)"), linhas = qa(p, ".gx-ln"), numeros = qa(p, ".gx-hd > b, .gx-ros-g b");
    var todos = [].concat(cartoes, colunas, barrasX, ladrilhos);
    // com o foco do teclado já lá dentro, não mexe em nada
    if (document.activeElement && p.contains(document.activeElement) && document.activeElement !== document.body) return;
    var chave = assinatura(p);
    if (chave) { if (jaMontados.has(chave)) return; jaMontados.add(chave); }
    var tl;
    var fim = function () {
      G.set(todos, { clearProps: "transform,opacity" });
      p.removeAttribute("aria-busy");
      var i = ativas.indexOf(tl); if (i >= 0) ativas.splice(i, 1);
    };
    try {
      tl = G.timeline({ defaults: { ease: "power3.out" }, onComplete: fim });
      ativas.push(tl);
      if (cartoes.length) tl.from(cartoes, { opacity: 0, y: 10, duration: 0.32, stagger: 0.03 }, 0);
      if (colunas.length) tl.from(colunas, { scaleY: 0, transformOrigin: "50% 100%", duration: 0.45, stagger: 0.02 }, 0.12);
      if (barrasX.length) tl.from(barrasX, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.5, stagger: 0.012 }, 0.14);
      if (ladrilhos.length) tl.from(ladrilhos, { opacity: 0, scale: 0.85, duration: 0.25, stagger: 0.004 }, 0.16);
      linhas.forEach(function (l) {
        var n = 0;
        try { n = l.getTotalLength(); } catch (e) { n = 0; }
        if (n) tl.fromTo(l, { strokeDasharray: n, strokeDashoffset: n }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" }, 0.12);
      });
      var contagens = numeros.map(function (b) { return contar(G, b); }).filter(Boolean);
      if (contagens.length) { p.setAttribute("aria-busy", "true"); contagens.forEach(function (t) { tl.add(t, 0.08); }); }
    } catch (e) {
      // se algo falhar, nada pode ficar escondido
      if (tl) tl.kill();
      G.set(todos, { clearProps: "all" });
      p.removeAttribute("aria-busy");
      if (window.console) console.warn("gestao-anim", e);
    }
  }

  function naTela(p) {
    var r = p.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || 0) - 40;
  }
  function varrer() {
    // painéis removidos pelo runtime antes de aparecer: solta o vigia
    vigias = vigias.filter(function (v) { if (v.p.isConnected) return true; v.io.disconnect(); return false; });
    Array.prototype.forEach.call(document.querySelectorAll(PAINEIS), function (p) {
      if (vistos.has(p) || p.closest("[aria-hidden='true']")) return;
      vistos.add(p);
      comGsap().then(function (G) {
        if (!p.isConnected) return;
        // já na tela: monta na hora; senão, quando chegar perto
        if (naTela(p) || !window.IntersectionObserver) { montar(G, p); return; }
        var v = { p: p, io: new IntersectionObserver(function (es) {
          if (!es[es.length - 1].isIntersecting) return;
          v.io.disconnect();
          vigias = vigias.filter(function (x) { return x !== v; });
          montar(G, p);
        }, { rootMargin: "0px 0px -60px 0px" }) };
        vigias.push(v);
        v.io.observe(p);
      }, function () { /* sem GSAP: o painel fica como o site desenhou */ });
    });
  }
  // impressão no meio da montagem: termina tudo antes
  window.addEventListener("beforeprint", function () { ativas.slice().forEach(function (tl) { tl.progress(1); }); });

  // só interessa elemento novo na página (o runtime trocando a página ou a aba); texto que muda é ignorado
  function temElementoNovo(lista) {
    for (var i = 0; i < lista.length; i++) for (var j = 0; j < lista[i].addedNodes.length; j++) if (lista[i].addedNodes[j].nodeType === 1) return true;
    return false;
  }
  var agendado = false;
  new MutationObserver(function (lista) {
    if (agendado || !temElementoNovo(lista)) return;
    agendado = true;
    Promise.resolve().then(function () { agendado = false; varrer(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) varrer();
})();
