/* Licitacon — dicas ao passar o mouse nos painéis da Gestão Contratual (estilos em gestao.css).
 *
 * Os gráficos do painel já trazem o valor de cada marca no atributo title. Aqui esse texto vira uma dica escura
 * própria (aparece na hora, com o mouse ou o teclado) e, no gráfico de área, uma linha-guia acompanha o mês mais
 * próximo do cursor. A dica e a guia ficam no <body>, fora da árvore do runtime: nada dentro do painel é criado
 * ou removido. O title é só guardado em data-dica enquanto a dica própria está no ar (evita as duas ao mesmo tempo);
 * se o runtime atualizar o title, vale o novo.
 */
(function () {
  "use strict";
  var ZONA = "#dc-root .gx, #dc-root .gp-grade, #dc-root .ct-escuro";
  var dica = null, guia = null, alvo = null;

  function criar() {
    if (dica) return;
    dica = document.createElement("div"); dica.className = "gx-dica"; dica.setAttribute("role", "tooltip"); dica.id = "gx-dica";
    guia = document.createElement("div"); guia.className = "gx-guia"; guia.setAttribute("aria-hidden", "true");
    document.body.appendChild(guia); document.body.appendChild(dica);
  }
  function texto(el) {
    var t = el.getAttribute("title");
    if (t) { el.setAttribute("data-dica", t); el.removeAttribute("title"); }
    return el.getAttribute("data-dica") || "";
  }
  // "nov/26: R$ 1,06 mi · projeção" → rótulo pequeno + valor; os demais textos vão inteiros
  function montar(t) {
    dica.textContent = "";
    var i = t.indexOf(": ");
    if (i > 0 && i <= 18) {
      var r = document.createElement("small"); r.textContent = t.slice(0, i); dica.appendChild(r);
      var v = document.createElement("span"); v.textContent = t.slice(i + 2); dica.appendChild(v);
    } else dica.textContent = t;
  }
  function posicionar(x, y) {
    var w = dica.offsetWidth, h = dica.offsetHeight, L = x - w / 2, T = y - h - 12;
    L = Math.max(8, Math.min(window.innerWidth - w - 8, L));
    if (T < 8) T = y + 16;
    dica.style.left = L + "px"; dica.style.top = T + "px";
  }
  function mostrar(el, x, y) {
    var t = texto(el); if (!t) { esconder(); return; }
    criar();
    if (alvo !== el) { alvo = el; montar(t); }
    dica.classList.add("on");
    if (x == null) { var r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    posicionar(x, y);
  }
  function esconder() {
    if (dica) dica.classList.remove("on");
    if (guia) guia.style.display = "none";
    alvo = null;
  }
  function comDica(no) {
    while (no && no.nodeType === 1 && no !== document.body) {
      if ((no.hasAttribute("title") || no.hasAttribute("data-dica")) && no.closest(ZONA)) return no;
      no = no.parentNode;
    }
    return null;
  }
  // gráfico de área: o mês mais próximo do cursor, com a linha-guia
  function naArea(area, e) {
    var pts = area.querySelectorAll(".gx-hp"); if (!pts.length) return false;
    var melhor = null, dist = Infinity;
    for (var i = 0; i < pts.length; i++) { var r = pts[i].getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - e.clientX); if (d < dist) { dist = d; melhor = pts[i]; } }
    var rm = melhor.getBoundingClientRect(), ra = area.getBoundingClientRect(), svg = area.querySelector("svg"), rs = svg ? svg.getBoundingClientRect() : ra;
    mostrar(melhor, rm.left + rm.width / 2, rm.top + rm.height / 2);
    guia.style.display = "block"; guia.style.left = Math.round(rm.left + rm.width / 2) + "px"; guia.style.top = rs.top + "px"; guia.style.height = rs.height + "px";
    return true;
  }

  document.addEventListener("mousemove", function (e) {
    var t = e.target; if (!t || t.nodeType !== 1) return;
    var area = t.closest && t.closest("#dc-root .gx-area");
    if (area && naArea(area, e)) return;
    if (guia) guia.style.display = "none";
    var el = comDica(t);
    if (el) mostrar(el, e.clientX, e.clientY); else if (alvo) esconder();
  }, { passive: true });
  document.addEventListener("mouseleave", esconder);
  document.addEventListener("focusin", function (e) { var el = comDica(e.target); if (el) mostrar(el); else if (alvo) esconder(); });
  document.addEventListener("focusout", function () { if (alvo) esconder(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") esconder(); });
  window.addEventListener("scroll", function () { if (alvo) esconder(); }, { passive: true, capture: true });
  // toque: a dica aparece ao tocar na marca e some ao tocar fora
  document.addEventListener("touchstart", function (e) { var el = comDica(e.target); if (el) mostrar(el); else if (alvo) esconder(); }, { passive: true });
})();
