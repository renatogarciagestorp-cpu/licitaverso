/* Licitacon — telas vivas da página inicial (GSAP). Estilos em inicio.css (bloco "telas vivas").
 *
 * Em cada seção marcada com data-lvui="…", o exemplo estático vira a própria ferramenta trabalhando sozinha:
 *   calculadora — troca o índice (IPCA, IGP-M, INCC, IPCA-E), o gráfico de 12 meses se transforma, o acumulado e o
 *                 valor reajustado contam e a nota técnica sai em Excel e PDF
 *   elaborador  — o questionário vai sendo respondido e o ETP é redigido seção por seção, com a pesquisa de preços
 *                 do PNCP e do Compras.gov.br calculando a mediana; no fim, a minuta em Word e PDF
 *   gestao      — a carteira numa linha do tempo; a linha "hoje" anda, os prazos mudam de cor e o aviso por e-mail sai
 *   comunidade  — chega uma pergunta ao fórum, o especialista responde com a resposta oficial e os votos sobem
 * Só anima transform e opacity (e textos/números). Fora da tela, a animação para. Com "reduzir movimento", cada tela
 * aparece parada no quadro final. Sem GSAP, o exemplo estático de antes continua no lugar.
 */
(function () {
  "use strict";
  var G = window.gsap;
  if (!G) return;
  var REDUZ = false;
  try { REDUZ = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* segue */ }

  function brl(v) { return "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function pct(v, c) { return v.toFixed(c == null ? 2 : c).replace(".", ",") + "%"; }
  function q(raiz, s) { return raiz.querySelector(s); }
  function qa(raiz, s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); }
  // número que conta: anima um objeto e escreve o texto formatado
  function contar(tl, el, de, ate, fmt, dur, pos) {
    var o = { v: de };
    tl.to(o, { v: ate, duration: dur || 0.9, ease: "power2.out", onUpdate: function () { el.textContent = fmt(o.v); } }, pos);
  }
  // texto que é digitado
  function digitar(tl, el, texto, dur, pos) {
    var o = { n: 0 };
    tl.to(o, { n: texto.length, duration: dur, ease: "none", onUpdate: function () { el.textContent = texto.slice(0, Math.round(o.n)); } }, pos);
  }
  function janela(titulo, sub, corpo) {
    return '<div class="lvu-jan"><div class="lvu-barra"><span class="lvu-pts" aria-hidden="true"><i></i><i></i><i></i></span><b>' + titulo +
      '</b><span class="lvu-sub">' + sub + '</span><span class="lvu-ilus">Exemplo ilustrativo</span></div><div class="lvu-corpo">' + corpo + "</div></div>";
  }

  // ------------------------------------------------------------------ Calculadora
  var INDICES = [
    ["IPCA", [0.42, 0.31, 0.38, 0.43, 0.26, 0.24, 0.21, 0.44, 0.48, 0.56, 0.62, 0.39]],
    ["IGP-M", [0.12, 0.08, 0.35, 0.5, 0.21, 0.4, 0.05, 0.3, 0.6, 0.42, 0.2, 0.15]],
    ["INCC", [0.4, 0.35, 0.5, 0.6, 0.52, 0.38, 0.41, 0.45, 0.36, 0.47, 0.44, 0.43]],
    ["IPCA-E", [0.38, 0.33, 0.36, 0.4, 0.3, 0.28, 0.25, 0.4, 0.45, 0.5, 0.55, 0.4]]
  ];
  var MESES = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set"];
  function acumulado(m) { return (m.reduce(function (f, v) { return f * (1 + v / 100); }, 1) - 1) * 100; }
  function montarCalculadora(raiz) {
    var BASE = 6630, MAX = 0.7;
    var abas = INDICES.map(function (x, i) { return '<button type="button" tabindex="-1" class="lvu-seg' + (i ? "" : " on") + '">' + x[0] + "</button>"; }).join("");
    var barras = MESES.map(function (m, i) { return '<div class="lvu-col"><span class="lvu-bar' + (i === 11 ? " atual" : "") + '"><i></i></span><small>' + m + "</small></div>"; }).join("");
    raiz.innerHTML = janela("Reajuste por índice", "Contrato 052/2025 · Transporte escolar",
      '<div class="lvu-segs" aria-hidden="true"><span class="lvu-seg-ind"></span>' + abas + "</div>" +
      '<div class="lvu-kpis"><div><small>Acumulado em 12 meses</small><b class="lvu-acum">0,00%</b><em class="lvu-fonte">IBGE · série oficial</em></div>' +
      '<div><small>Valor reajustado</small><b class="lvu-novo">' + brl(BASE) + '</b><em>de ' + brl(BASE) + "/mês</em></div></div>" +
      '<div class="lvu-graf"><span class="lvu-media"><em>média</em></span>' + barras + "</div>" +
      '<div class="lvu-pe"><span class="lvu-chip">Anualidade conferida · art. 25, § 7º</span><span class="lvu-doc">Nota técnica · Excel · PDF</span><span class="lvu-carimbo">Calculado</span></div>');
    var bars = qa(raiz, ".lvu-bar i"), segs = qa(raiz, ".lvu-seg"), ind = q(raiz, ".lvu-seg-ind"), acum = q(raiz, ".lvu-acum"), novo = q(raiz, ".lvu-novo"), media = q(raiz, ".lvu-media"), fonte = q(raiz, ".lvu-fonte");
    var carimbo = q(raiz, ".lvu-carimbo"), doc = q(raiz, ".lvu-doc");
    G.set(bars, { scaleY: 0, transformOrigin: "50% 100%" });
    function posInd(i) { var s = segs[i]; return { x: s.offsetLeft, width: s.offsetWidth }; }
    var tl = G.timeline({ repeat: -1, repeatDelay: 0.6, defaults: { ease: "power3.out" } });
    var antes = 0, valorAntes = BASE;
    INDICES.forEach(function (ix, k) {
      var a = acumulado(ix[1]), media12 = ix[1].reduce(function (s, v) { return s + v; }, 0) / 12, valor = BASE * (1 + a / 100);
      var rot = "i" + k;
      tl.addLabel(rot);
      tl.call(function () { segs.forEach(function (s, j) { s.classList.toggle("on", j === k); }); fonte.textContent = (k === 1 ? "FGV" : k === 2 ? "FGV" : "IBGE") + " · série oficial"; }, null, rot);
      tl.to(ind, { x: function () { return posInd(k).x; }, width: function () { return posInd(k).width; }, duration: 0.45 }, rot);
      tl.to(bars, { scaleY: function (i) { return Math.max(0.04, ix[1][i] / MAX); }, duration: 0.8, stagger: 0.03 }, rot + "+=0.1");
      tl.to(media, { y: function () { var h = media.parentNode.clientHeight - 22; return -h * (media12 / MAX); }, duration: 0.8 }, rot + "+=0.1");
      contar(tl, acum, antes, a, function (v) { return pct(v); }, 0.9, rot + "+=0.2");
      contar(tl, novo, valorAntes, valor, brl, 0.9, rot + "+=0.2");
      if (k === INDICES.length - 1) {
        tl.fromTo(doc, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4 }, rot + "+=1.0");
        tl.fromTo(carimbo, { autoAlpha: 0, scale: 1.8, rotation: -14 }, { autoAlpha: 1, scale: 1, rotation: -8, duration: 0.45, ease: "back.out(2)" }, rot + "+=1.3");
        tl.to([doc, carimbo], { autoAlpha: 0, duration: 0.3 }, rot + "+=3.4");
      } else tl.to({}, { duration: 1.6 });
      antes = a; valorAntes = valor;
    });
    tl.set(doc, { autoAlpha: 0 }, 0); tl.set(carimbo, { autoAlpha: 0 }, 0);
    return { tl: tl, fim: function () { tl.progress(0.97).pause(); } };
  }

  // ------------------------------------------------------------------ Elaborador
  function montarElaborador(raiz) {
    var perguntas = ["Qual é a necessidade?", "Há contratação anterior?", "Quantidade estimada", "Pesquisa de preços", "Parcelar o objeto?"];
    var precos = [["PNCP", "Pregão 41/2026 · Município de Lavras", "R$ 1.249,00"], ["PNCP", "Pregão 12/2026 · IF Sudeste MG", "R$ 1.284,00"], ["Compras.gov.br", "Ata 88/2025 · UFJF", "R$ 1.310,50"]];
    raiz.innerHTML = janela("Estudo Técnico Preliminar", "Minuta · Lei 14.133/2021",
      '<div class="lvu-elab"><ol class="lvu-quest">' + perguntas.map(function (p) { return '<li><i aria-hidden="true"></i>' + p + "</li>"; }).join("") + "</ol>" +
      '<div class="lvu-folha"><div class="lvu-sec"><b>1. Descrição da necessidade</b><p class="lvu-dig1"></p><span class="lvu-cita">art. 18, § 1º, I</span></div>' +
      '<div class="lvu-sec"><b>4. Estimativa do valor</b><div class="lvu-tab">' + precos.map(function (r) { return '<div class="lvu-tr"><span class="lvu-fonte-t">' + r[0] + "</span><span>" + r[1] + "</span><em>" + r[2] + "</em></div>"; }).join("") +
      '<div class="lvu-tr lvu-med"><span>Mediana</span><span></span><em class="lvu-mediana">R$ 0,00</em></div></div></div></div></div>' +
      '<div class="lvu-pe"><span class="lvu-tabs-doc"><b>ETP</b><span>TR</span><span>Projeto Básico</span></span><span class="lvu-doc">Word · PDF</span><span class="lvu-carimbo">Minuta pronta</span></div>');
    var itens = qa(raiz, ".lvu-quest li"), dig = q(raiz, ".lvu-dig1"), cita = q(raiz, ".lvu-cita"), linhas = qa(raiz, ".lvu-tr:not(.lvu-med)"), med = q(raiz, ".lvu-med"), mediana = q(raiz, ".lvu-mediana");
    var secs = qa(raiz, ".lvu-sec"), doc = q(raiz, ".lvu-doc"), carimbo = q(raiz, ".lvu-carimbo");
    var texto = "Contratação de 40 notebooks para as escolas da rede municipal, em substituição aos equipamentos com mais de seis anos de uso.";
    var tl = G.timeline({ repeat: -1, repeatDelay: 1.4, defaults: { ease: "power3.out" } });
    tl.set(itens, { className: "" }).set(secs, { autoAlpha: 0, y: 8 }).set([cita, med, doc, carimbo], { autoAlpha: 0 }).set(linhas, { autoAlpha: 0, x: -10 }).call(function () { dig.textContent = ""; mediana.textContent = "R$ 0,00"; });
    itens.forEach(function (li, i) { tl.call(function () { li.className = "ok"; }, null, 0.3 + i * 0.32); });
    tl.to(secs[0], { autoAlpha: 1, y: 0, duration: 0.4 }, 0.6);
    digitar(tl, dig, texto, 2.2, 0.9);
    tl.to(cita, { autoAlpha: 1, duration: 0.3 }, 3.1);
    tl.to(secs[1], { autoAlpha: 1, y: 0, duration: 0.4 }, 3.4);
    tl.to(linhas, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.35 }, 3.7);
    tl.to(med, { autoAlpha: 1, duration: 0.3 }, 4.9);
    contar(tl, mediana, 0, 1284, brl, 0.8, 4.9);
    tl.to(doc, { autoAlpha: 1, duration: 0.3 }, 5.9);
    tl.fromTo(carimbo, { autoAlpha: 0, scale: 1.8, rotation: -14 }, { autoAlpha: 1, scale: 1, rotation: -8, duration: 0.45, ease: "back.out(2)" }, 6.2);
    tl.to({}, { duration: 2.2 });
    tl.to([secs, doc, carimbo], { autoAlpha: 0, duration: 0.35 });
    return { tl: tl, fim: function () { tl.progress(0.82).pause(); } };
  }

  // ------------------------------------------------------------------ Gestão Contratual
  function montarGestao(raiz) {
    var M = ["nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out"];
    // [contrato, início (mês 0..11), fim, cor, marco (mês), rótulo do marco]
    var C = [["018/2024 · Vigilância", 0, 1.0, "venc", 0.6, "Prorrogação"], ["025/2025 · Limpeza", 0, 12, "vig", 3.2, "Repactuação"], ["052/2025 · Transporte", 0, 12, "vig", 3.5, "Reajuste"], ["044/2025 · Merenda", 0, 1.5, "venc", 1.2, "Fim da vigência"]];
    var linhas = C.map(function (c) {
      return '<div class="lvu-gl"><span class="lvu-gn">' + c[0] + '</span><span class="lvu-gt"><i class="lvu-gb ' + c[3] + '" style="left:' + (c[1] / 12 * 100) + "%;width:" + ((c[2] - c[1]) / 12 * 100) + '%"></i>' +
        '<i class="lvu-gm" style="left:' + (c[4] / 12 * 100) + '%"></i><span class="lvu-gtag" style="left:' + (c[4] / 12 * 100) + '%">' + c[5] + "</span></span></div>";
    }).join("");
    raiz.innerHTML = janela("Carteira de contratos", "Prefeitura Municipal · 12 contratos",
      '<div class="lvu-kpis lvu-k3"><div><small>Valor mensal</small><b class="lvu-k1">R$ 0</b></div><div><small>Vencendo</small><b class="lvu-k2">0</b><em>em 60 dias</em></div><div><small>Acréscimos (art. 125)</small><b class="lvu-k3n">0%</b><span class="lvu-lim"><i></i></span></div></div>' +
      '<div class="lvu-gantt"><div class="lvu-gcab"><span></span><span class="lvu-gmeses">' + M.map(function (m) { return "<small>" + m + "</small>"; }).join("") + "</span></div>" + linhas +
      '<span class="lvu-hoje" aria-hidden="true"><b>hoje</b></span></div>' +
      '<div class="lvu-toast"><b>Aviso enviado por e-mail</b><span class="lvu-toast-t">Prorrogação da Vigilância: iniciar o termo aditivo.</span></div>');
    var k1 = q(raiz, ".lvu-k1"), k2 = q(raiz, ".lvu-k2"), k3 = q(raiz, ".lvu-k3n"), lim = q(raiz, ".lvu-lim i"), bars = qa(raiz, ".lvu-gb"), marcos = qa(raiz, ".lvu-gm"), tags = qa(raiz, ".lvu-gtag"), hoje = q(raiz, ".lvu-hoje"), toast = q(raiz, ".lvu-toast"), toastT = q(raiz, ".lvu-toast-t");
    var trilho = q(raiz, ".lvu-gt");
    var tl = G.timeline({ repeat: -1, repeatDelay: 0.8, defaults: { ease: "power3.out" } });
    tl.set(bars, { scaleX: 0, transformOrigin: "0 50%" }).set(marcos, { scale: 0 }).set(tags, { autoAlpha: 0, y: 4 }).set(toast, { autoAlpha: 0, y: 14 }).set(lim, { scaleX: 0, transformOrigin: "0 50%" }).set(hoje, { x: 0 });
    tl.to(bars, { scaleX: 1, duration: 0.8, stagger: 0.12 }, 0.2);
    tl.to(marcos, { scale: 1, duration: 0.35, stagger: 0.1, ease: "back.out(2.5)" }, 0.8);
    contar(tl, k1, 0, 1.07, function (v) { return "R$ " + v.toFixed(2).replace(".", ",") + " mi"; }, 1, 0.3);
    contar(tl, k2, 0, 2, function (v) { return String(Math.round(v)); }, 0.8, 0.3);
    contar(tl, k3, 0, 18, function (v) { return Math.round(v) + "%"; }, 1, 0.3);
    tl.to(lim, { scaleX: 0.72, duration: 1 }, 0.3);
    var X = function (m) { return function () { return trilho.clientWidth * m / 12; }; };
    var avisos = [[0, "Prorrogação da Vigilância: iniciar o termo aditivo."], [3, "Fim da vigência da Merenda: decidir a nova contratação."], [1, "Repactuação da Limpeza: nova convenção coletiva."], [2, "Reajuste do Transporte: anualidade em 15/02."]];
    var ordem = [[0.6, 0], [1.2, 3], [3.2, 1], [3.5, 2]];
    var t = 1.4;
    ordem.forEach(function (o, j) {
      tl.to(hoje, { x: X(o[0]), duration: j ? 0.9 : 1.1, ease: "power1.inOut" }, t);
      tl.to(tags[o[1]], { autoAlpha: 1, y: 0, duration: 0.3 }, t + 0.8);
      tl.to(marcos[o[1]], { scale: 1.5, duration: 0.2, yoyo: true, repeat: 1 }, t + 0.8);
      tl.call(function () { toastT.textContent = avisos[o[1]][1]; }, null, t + 0.9);
      tl.fromTo(toast, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.35 }, t + 0.9);
      tl.to(toast, { autoAlpha: 0, y: 8, duration: 0.25 }, t + 2.0);
      t += 1.5;
    });
    tl.to({}, { duration: 0.6 });
    return { tl: tl, fim: function () { tl.progress(0.36).pause(); } };
  }

  // ------------------------------------------------------------------ Comunidade
  function montarComunidade(raiz) {
    raiz.innerHTML = janela("Fórum · Reajuste e repactuação", "Setor público e privado",
      '<div class="lvu-perg"><span class="lvu-av">AC</span><div><small>Agente de contratação · Prefeitura</small><b>A repactuação pode retroagir à data da nova convenção, mesmo pedida depois?</b>' +
      '<span class="lvu-meta"><em class="lvu-nresp">0 respostas</em><em class="lvu-votos">0 votos</em></span></div></div>' +
      '<div class="lvu-dig"><span class="lvu-av lvu-av-esp">LC</span><span class="lvu-pontinhos" aria-hidden="true"><i></i><i></i><i></i></span><small>Especialista Licitacon está respondendo</small></div>' +
      '<div class="lvu-resp"><span class="lvu-selo">Resposta oficial</span><p class="lvu-resp-t"></p><small>Especialista Licitacon · com 3 decisões citadas</small></div>' +
      '<div class="lvu-pe lvu-pe-esq"><span class="lvu-chip">Curso: Repactuação na prática</span><span class="lvu-chip">Consultoria em vídeo</span></div>');
    var nresp = q(raiz, ".lvu-nresp"), votos = q(raiz, ".lvu-votos"), dig = q(raiz, ".lvu-dig"), resp = q(raiz, ".lvu-resp"), respT = q(raiz, ".lvu-resp-t"), chips = qa(raiz, ".lvu-pe .lvu-chip"), perg = q(raiz, ".lvu-perg"), selo = q(raiz, ".lvu-selo");
    var texto = "Sim, desde que o pedido venha antes da prorrogação ou do fim do contrato. Os efeitos financeiros contam da data-base da convenção.";
    var tl = G.timeline({ repeat: -1, repeatDelay: 1.6, defaults: { ease: "power3.out" } });
    tl.set([dig, resp].concat(chips), { autoAlpha: 0, y: 10 }).set(perg, { autoAlpha: 0, y: 12 }).call(function () { respT.textContent = ""; nresp.textContent = "0 respostas"; votos.textContent = "0 votos"; });
    tl.to(perg, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.2);
    contar(tl, nresp, 0, 11, function (v) { return Math.round(v) + " respostas"; }, 1.4, 0.8);
    tl.to(dig, { autoAlpha: 1, y: 0, duration: 0.35 }, 1.2);
    tl.to(dig, { autoAlpha: 0, duration: 0.25 }, 2.6);
    tl.to(resp, { autoAlpha: 1, y: 0, duration: 0.45 }, 2.7);
    tl.fromTo(selo, { scale: 1.6, rotation: -10 }, { scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2)" }, 2.8);
    digitar(tl, respT, texto, 2.4, 3.0);
    tl.call(function () { nresp.textContent = "12 respostas"; }, null, 3.0);
    contar(tl, votos, 0, 24, function (v) { return Math.round(v) + " votos"; }, 1.2, 4.6);
    tl.to(chips, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.15 }, 5.4);
    tl.to({}, { duration: 2.4 });
    tl.to([perg, resp].concat(chips), { autoAlpha: 0, duration: 0.35 });
    return { tl: tl, fim: function () { tl.progress(0.9).pause(); } };
  }

  var MONTA = { calculadora: montarCalculadora, elaborador: montarElaborador, gestao: montarGestao, comunidade: montarComunidade };
  function montar(alvo) {
    var tipo = alvo.getAttribute("data-lvui"), f = MONTA[tipo];
    if (!f) return;
    var tela = document.createElement("div");
    tela.className = "lvu lvu-" + tipo;
    tela.setAttribute("role", "img");
    var cartao = alvo.querySelector(".lvh-art-doc, .lvh-demo");
    tela.setAttribute("aria-label", cartao && cartao.getAttribute("aria-label") ? cartao.getAttribute("aria-label") : "Exemplo animado da ferramenta");
    alvo.insertBefore(tela, alvo.firstChild);
    var r;
    try { r = f(tela); } catch (e) { tela.remove(); if (window.console) console.warn("inicio-ui", e); return; }
    alvo.classList.add("lvu-on");
    if (REDUZ) { r.fim(); return; }
    r.tl.pause();
    if (!window.IntersectionObserver) { r.tl.play(); return; }
    new IntersectionObserver(function (es) {
      if (!tela.isConnected) { r.tl.kill(); return; }
      if (es[es.length - 1].isIntersecting) r.tl.play(); else r.tl.pause();
    }, { rootMargin: "40px 0px" }).observe(tela);
  }
  function varrer() {
    Array.prototype.forEach.call(document.querySelectorAll("#dc-root [data-lvui]:not([data-lvui-ok])"), function (x) {
      x.setAttribute("data-lvui-ok", "1");
      montar(x);
    });
  }
  var agendado = false;
  new MutationObserver(function () {
    if (agendado) return;
    agendado = true;
    Promise.resolve().then(function () { agendado = false; varrer(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) varrer();
})();
