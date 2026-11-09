/* Licitacon — telas vivas da página inicial (GSAP). Estilos em inicio.css (bloco "telas vivas").
 *
 * Em cada seção marcada com data-lvui="…", o exemplo estático vira a própria ferramenta trabalhando sozinha:
 *   calculadora — troca o índice (IPCA, IGP-M, INCC, IPCA-E), o gráfico dos últimos 12 meses (série real de
 *                 indices.json) se transforma, o acumulado e o valor reajustado contam e a nota técnica sai em Excel e PDF
 *   elaborador  — o questionário vai sendo respondido e o ETP é redigido seção por seção, com a pesquisa de preços
 *                 do PNCP e do Compras.gov.br calculando a mediana; no fim, a minuta em Word e PDF
 *   gestao      — a carteira numa linha do tempo; a linha "hoje" anda, os prazos acendem e o aviso por e-mail sai
 *   comunidade  — chega uma pergunta ao fórum, o especialista responde com a resposta oficial e os votos sobem
 *
 * Regras: só anima transform e opacity; textos e números mudam no próprio nó de texto (nodeValue), sem criar nós, para
 * não acordar os observadores de página do site. A tela só monta quando chega perto, para quando sai da vista e tem um
 * botão "Pausar animação" (WCAG 2.2.2), que vale também para as cenas 3D e fica lembrado neste navegador.
 * Com "reduzir movimento" ou "economia de dados", cada tela aparece parada no quadro final. O GSAP é baixado só aqui.
 * Sem GSAP, o exemplo estático de antes continua no lugar.
 */
(function () {
  "use strict";
  if (!window.MutationObserver) return;
  var mm = null, REDUZ = false, POUPA = false;
  try { mm = matchMedia("(prefers-reduced-motion: reduce)"); REDUZ = mm.matches; } catch (e) { /* segue */ }
  try { POUPA = !!(navigator.connection && navigator.connection.saveData); } catch (e) { /* segue */ }

  // ---------------------------------------------------------------- pausa (compartilhada com as cenas 3D)
  var CHAVE = "lv-anim-pausa";
  function pausado() { try { return localStorage.getItem(CHAVE) === "1"; } catch (e) { return false; } }
  function pausar(v) {
    try { if (v) localStorage.setItem(CHAVE, "1"); else localStorage.removeItem(CHAVE); } catch (e) { /* segue */ }
    window.dispatchEvent(new CustomEvent("lv-pausa", { detail: v }));
  }
  window.LV_PAUSA = { pausado: pausado, pausar: pausar };

  // ---------------------------------------------------------------- utilidades
  function brl(v) { return "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function pct(v, c) { return v.toFixed(c == null ? 2 : c).replace(".", ",") + "%"; }
  function q(raiz, s) { return raiz.querySelector(s); }
  function qa(raiz, s) { return Array.prototype.slice.call(raiz.querySelectorAll(s)); }
  // escreve no nó de texto que o elemento já tem (cria um só uma vez)
  function txt(el, s) {
    var n = el.firstChild;
    if (!n || n.nodeType !== 3 || n.nextSibling) { el.textContent = ""; n = el.appendChild(document.createTextNode("")); }
    if (n.nodeValue !== s) n.nodeValue = s;
  }
  function contar(G, tl, el, de, ate, fmt, dur, pos) {
    var o = { v: de };
    tl.to(o, { v: ate, duration: dur || 0.9, ease: "power2.out", onUpdate: function () { txt(el, fmt(o.v)); } }, pos);
  }
  function digitar(G, tl, el, texto, dur, pos) {
    var o = { n: 0 };
    tl.to(o, { n: texto.length, duration: dur, ease: "none", onUpdate: function () { txt(el, texto.slice(0, Math.round(o.n))); } }, pos);
  }
  function janela(titulo, sub, corpo) {
    return '<div class="lvu-barra"><span class="lvu-pts"><i></i><i></i><i></i></span><b>' + titulo +
      '</b><span class="lvu-sub">' + sub + '</span><span class="lvu-ilus">Exemplo ilustrativo</span></div><div class="lvu-corpo">' + corpo + "</div>";
  }

  // GSAP sob demanda (o mesmo arquivo do gestao-anim.js; quem pedir primeiro baixa)
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
  var indices = null;
  function comIndices() {
    if (!indices) indices = fetch("indices.json", { cache: "force-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return indices;
  }

  // ------------------------------------------------------------------ Calculadora
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var SERIES = [["ipca", "IPCA"], ["igpm", "IGP-M"], ["incc", "INCC"], ["ipca_e", "IPCA-E"]];
  // reserva, se indices.json não carregar: rótulo deixa claro que são valores ilustrativos
  var RESERVA = { ipca: [0.42, 0.31, 0.38, 0.43, 0.26, 0.24, 0.21, 0.44, 0.48, 0.56, 0.62, 0.39], igpm: [0.12, 0.08, 0.35, 0.5, 0.21, 0.4, 0.05, 0.3, 0.6, 0.42, 0.2, 0.15],
    incc: [0.4, 0.35, 0.5, 0.6, 0.52, 0.38, 0.41, 0.45, 0.36, 0.47, 0.44, 0.43], ipca_e: [0.38, 0.33, 0.36, 0.4, 0.3, 0.28, 0.25, 0.4, 0.45, 0.5, 0.55, 0.4] };
  function dadosIndices(d) {
    try {
      var s = d.series, meses = Object.keys(s.ipca.mensal).filter(function (m) { return SERIES.every(function (x) { return s[x[0]] && s[x[0]].mensal[m] != null; }); }).sort().slice(-12);
      if (meses.length < 12) throw new Error("curto");
      return { reais: true, rotulos: meses.map(function (m) { return MESES[Number(m.slice(5, 7)) - 1]; }),
        ate: MESES[Number(meses[11].slice(5, 7)) - 1] + "/" + meses[11].slice(0, 4),
        series: SERIES.map(function (x) { return { nome: x[1], fonte: s[x[0]].fonte || "", v: meses.map(function (m) { return Number(s[x[0]].mensal[m]); }) }; }) };
    } catch (e) {
      return { reais: false, rotulos: ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set"], ate: "",
        series: SERIES.map(function (x) { return { nome: x[1], fonte: "valores ilustrativos", v: RESERVA[x[0]] }; }) };
    }
  }
  function acumulado(m) { return (m.reduce(function (f, v) { return f * (1 + v / 100); }, 1) - 1) * 100; }
  function montarCalculadora(G, tela, D) {
    var BASE = 6630, MAX = Math.max(0.3, Math.max.apply(null, D.series.map(function (s) { return Math.max.apply(null, s.v.map(Math.abs)); })) * 1.08);
    var abas = D.series.map(function (x, i) { return '<span class="lvu-seg' + (i ? "" : " on") + '">' + x.nome + "</span>"; }).join("");
    var barras = D.rotulos.map(function (m, i) { return '<div class="lvu-col"><span class="lvu-bar' + (i === 11 ? " atual" : "") + '"><i></i></span><small>' + m + "</small></div>"; }).join("");
    tela.innerHTML = janela("Reajuste por índice", "Contrato 052/2025 · Transporte escolar",
      '<div class="lvu-segs"><span class="lvu-seg-ind"></span>' + abas + "</div>" +
      '<div class="lvu-kpis"><div><small>Acumulado em 12 meses' + (D.ate ? " até " + D.ate : "") + '</small><b class="lvu-acum">0,00%</b><em class="lvu-fonte">' + D.series[0].fonte + "</em></div>" +
      '<div><small>Valor reajustado</small><b class="lvu-novo">' + brl(BASE) + '</b><em>de ' + brl(BASE) + "/mês</em></div></div>" +
      '<div class="lvu-graf"><span class="lvu-media"><em>média</em></span>' + barras + "</div>" +
      '<div class="lvu-pe"><span class="lvu-chip">Anualidade conferida · art. 25, § 7º</span><span class="lvu-doc">Nota técnica · Excel · PDF</span><span class="lvu-carimbo">Calculado</span></div>');
    var bars = qa(tela, ".lvu-bar i"), segs = qa(tela, ".lvu-seg"), ind = q(tela, ".lvu-seg-ind"), acum = q(tela, ".lvu-acum"), novo = q(tela, ".lvu-novo"), media = q(tela, ".lvu-media"), fonte = q(tela, ".lvu-fonte");
    var carimbo = q(tela, ".lvu-carimbo"), doc = q(tela, ".lvu-doc"), graf = q(tela, ".lvu-graf");
    G.set(bars, { scaleY: 0, transformOrigin: "50% 100%" });
    G.set(ind, { transformOrigin: "0 50%" });
    var tl = G.timeline({ repeat: -1, repeatDelay: 0.6, defaults: { ease: "power3.out" } });
    tl.set([doc, carimbo], { autoAlpha: 0 }, 0);
    var ult = D.series[D.series.length - 1], antes = acumulado(ult.v), valorAntes = BASE * (1 + antes / 100);
    txt(acum, pct(antes)); txt(novo, brl(valorAntes));
    D.series.forEach(function (s, k) {
      var a = acumulado(s.v), med = s.v.reduce(function (t, v) { return t + v; }, 0) / 12, valor = BASE * (1 + a / 100), rot = "i" + k;
      tl.addLabel(rot);
      tl.call(function () { segs.forEach(function (x, j) { x.classList.toggle("on", j === k); }); txt(fonte, s.fonte); bars.forEach(function (b, i) { b.parentNode.classList.toggle("neg", s.v[i] < 0); }); }, null, rot);
      // o indicador da aba anda e muda de largura só com transform (largura base: 100px)
      tl.to(ind, { x: function () { return segs[k].offsetLeft; }, scaleX: function () { return segs[k].offsetWidth / 100; }, duration: 0.45 }, rot);
      tl.to(bars, { scaleY: function (i) { return Math.max(0.04, Math.abs(s.v[i]) / MAX); }, duration: 0.8, stagger: 0.03 }, rot + "+=0.1");
      tl.to(media, { y: function () { return -(graf.clientHeight - 16) * (Math.max(0, med) / MAX); }, duration: 0.8 }, rot + "+=0.1");
      contar(G, tl, acum, antes, a, function (v) { return pct(v); }, 0.9, rot + "+=0.2");
      contar(G, tl, novo, valorAntes, valor, brl, 0.9, rot + "+=0.2");
      if (k === D.series.length - 1) {
        tl.fromTo(doc, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4 }, rot + "+=1.0");
        tl.fromTo(carimbo, { autoAlpha: 0, scale: 1.8, rotation: -14 }, { autoAlpha: 1, scale: 1, rotation: -8, duration: 0.45, ease: "back.out(2)" }, rot + "+=1.3");
        tl.to([doc, carimbo], { autoAlpha: 0, duration: 0.3 }, rot + "+=3.4");
      } else tl.to({}, { duration: 1.6 });
      antes = a; valorAntes = valor;
    });
    return { tl: tl, quadroFinal: 0.97 };
  }

  // ------------------------------------------------------------------ Elaborador
  function montarElaborador(G, tela) {
    var perguntas = ["Qual é a necessidade?", "Há contratação anterior?", "Quantidade estimada", "Pesquisa de preços", "Parcelar o objeto?"];
    var precos = [["PNCP", "Pregão 41/2026 · Município de Lavras", "R$ 1.249,00"], ["PNCP", "Pregão 12/2026 · IF Sudeste MG", "R$ 1.284,00"], ["Compras.gov.br", "Ata 88/2025 · UFJF", "R$ 1.310,50"]];
    tela.innerHTML = janela("Estudo Técnico Preliminar", "Minuta · Lei 14.133/2021",
      '<div class="lvu-elab"><ol class="lvu-quest">' + perguntas.map(function (p) { return "<li><i></i>" + p + "</li>"; }).join("") + "</ol>" +
      '<div class="lvu-folha"><div class="lvu-sec"><b>1. Descrição da necessidade</b><p class="lvu-dig1"></p><span class="lvu-cita">art. 18, § 1º, I</span></div>' +
      '<div class="lvu-sec"><b>4. Estimativa do valor</b><div class="lvu-tab">' + precos.map(function (r) { return '<div class="lvu-tr"><span class="lvu-fonte-t">' + r[0] + "</span><span>" + r[1] + "</span><em>" + r[2] + "</em></div>"; }).join("") +
      '<div class="lvu-tr lvu-med"><span>Mediana</span><span></span><em class="lvu-mediana">R$ 0,00</em></div></div></div></div></div>' +
      '<div class="lvu-pe"><span class="lvu-tabs-doc"><b>ETP</b><span>TR</span><span>Projeto Básico</span></span><span class="lvu-doc">Word · PDF</span><span class="lvu-carimbo">Minuta pronta</span></div>');
    var itens = qa(tela, ".lvu-quest li"), dig = q(tela, ".lvu-dig1"), cita = q(tela, ".lvu-cita"), linhas = qa(tela, ".lvu-tr:not(.lvu-med)"), med = q(tela, ".lvu-med"), mediana = q(tela, ".lvu-mediana");
    var secs = qa(tela, ".lvu-sec"), doc = q(tela, ".lvu-doc"), carimbo = q(tela, ".lvu-carimbo");
    var texto = "Contratação de 40 notebooks para as escolas da rede municipal, em substituição aos equipamentos com mais de seis anos de uso.";
    var tl = G.timeline({ repeat: -1, repeatDelay: 1.4, defaults: { ease: "power3.out" } });
    tl.call(function () { itens.forEach(function (li) { li.className = ""; }); txt(dig, ""); txt(mediana, "R$ 0,00"); }, null, 0)
      .set(secs, { autoAlpha: 0, y: 8 }, 0).set([cita, med, doc, carimbo], { autoAlpha: 0 }, 0).set(linhas, { autoAlpha: 0, x: -10 }, 0);
    itens.forEach(function (li, i) { tl.call(function () { li.className = "ok"; }, null, 0.3 + i * 0.32); });
    tl.to(secs[0], { autoAlpha: 1, y: 0, duration: 0.4 }, 0.6);
    digitar(G, tl, dig, texto, 2.2, 0.9);
    tl.to(cita, { autoAlpha: 1, duration: 0.3 }, 3.1);
    tl.to(secs[1], { autoAlpha: 1, y: 0, duration: 0.4 }, 3.4);
    tl.to(linhas, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.35 }, 3.7);
    tl.to(med, { autoAlpha: 1, duration: 0.3 }, 4.9);
    contar(G, tl, mediana, 0, 1284, brl, 0.8, 4.9);
    tl.to(doc, { autoAlpha: 1, duration: 0.3 }, 5.9);
    tl.fromTo(carimbo, { autoAlpha: 0, scale: 1.8, rotation: -14 }, { autoAlpha: 1, scale: 1, rotation: -8, duration: 0.45, ease: "back.out(2)" }, 6.2);
    tl.to({}, { duration: 2.2 });
    tl.to([secs, doc, carimbo], { autoAlpha: 0, duration: 0.35 });
    return { tl: tl, quadroFinal: 0.82 };
  }

  // ------------------------------------------------------------------ Gestão Contratual
  function montarGestao(G, tela) {
    var M = ["nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out"];
    // [contrato, início (mês 0..11), fim, situação, marco (mês), rótulo do marco]
    var C = [["018/2024 · Vigilância", 0, 1.0, "venc", 0.6, "Prorrogação"], ["025/2025 · Limpeza", 0, 12, "vig", 3.2, "Repactuação"], ["052/2025 · Transporte", 0, 12, "vig", 3.5, "Reajuste"], ["044/2025 · Merenda", 0, 1.5, "venc", 1.2, "Fim da vigência"]];
    var linhas = C.map(function (c) {
      return '<div class="lvu-gl"><span class="lvu-gn">' + c[0] + '</span><span class="lvu-gt"><i class="lvu-gb ' + c[3] + '" style="left:' + (c[1] / 12 * 100) + "%;width:" + ((c[2] - c[1]) / 12 * 100) + '%"></i>' +
        '<i class="lvu-gm" style="left:' + (c[4] / 12 * 100) + '%"></i><span class="lvu-gtag" style="left:' + (c[4] / 12 * 100) + '%">' + c[5] + "</span></span></div>";
    }).join("");
    tela.innerHTML = janela("Carteira de contratos", "Prefeitura Municipal · 4 de 12 contratos",
      '<div class="lvu-kpis lvu-k3"><div><small>Valor mensal</small><b class="lvu-k1">R$ 0</b></div><div><small>Vencendo</small><b class="lvu-k2">0</b><em>em 60 dias</em></div><div><small>Acréscimos (art. 125)</small><b class="lvu-k3n">0%</b><span class="lvu-lim"><i></i></span></div></div>' +
      '<div class="lvu-gantt"><div class="lvu-gcab"><span></span><span class="lvu-gmeses">' + M.map(function (m) { return "<small>" + m + "</small>"; }).join("") + "</span></div>" + linhas +
      '<span class="lvu-hoje"><b>hoje</b></span></div>' +
      '<div class="lvu-toast"><b>Aviso enviado por e-mail</b><span class="lvu-toast-t">Prorrogação da Vigilância: iniciar o termo aditivo.</span></div>');
    var k1 = q(tela, ".lvu-k1"), k2 = q(tela, ".lvu-k2"), k3 = q(tela, ".lvu-k3n"), lim = q(tela, ".lvu-lim i"), bars = qa(tela, ".lvu-gb"), marcos = qa(tela, ".lvu-gm"), tags = qa(tela, ".lvu-gtag"), hoje = q(tela, ".lvu-hoje"), toast = q(tela, ".lvu-toast"), toastT = q(tela, ".lvu-toast-t");
    var trilho = q(tela, ".lvu-gt");
    var tl = G.timeline({ repeat: -1, repeatDelay: 0.8, defaults: { ease: "power3.out" } });
    tl.set(bars, { scaleX: 0, transformOrigin: "0 50%" }).set(marcos, { scale: 0 }).set(tags, { autoAlpha: 0, y: 4 }).set(toast, { autoAlpha: 0, y: 14 }).set(lim, { scaleX: 0, transformOrigin: "0 50%" }).set(hoje, { x: 0 });
    tl.to(bars, { scaleX: 1, duration: 0.8, stagger: 0.12 }, 0.2);
    tl.to(marcos, { scale: 1, duration: 0.35, stagger: 0.1, ease: "back.out(2.5)" }, 0.8);
    contar(G, tl, k1, 0, 1.07, function (v) { return "R$ " + v.toFixed(2).replace(".", ",") + " mi"; }, 1, 0.3);
    contar(G, tl, k2, 0, 2, function (v) { return String(Math.round(v)); }, 0.8, 0.3);
    contar(G, tl, k3, 0, 18, function (v) { return Math.round(v) + "%"; }, 1, 0.3);
    tl.to(lim, { scaleX: 0.72, duration: 1 }, 0.3);
    var X = function (m) { return function () { return trilho.clientWidth * m / 12; }; };
    var avisos = ["Prorrogação da Vigilância: iniciar o termo aditivo.", "Repactuação da Limpeza: nova convenção coletiva.", "Reajuste do Transporte: anualidade em 15/02.", "Fim da vigência da Merenda: decidir a nova contratação."];
    var ordem = [[0.6, 0], [1.2, 3], [3.2, 1], [3.5, 2]], t = 1.4;
    ordem.forEach(function (o, j) {
      tl.to(hoje, { x: X(o[0]), duration: j ? 0.9 : 1.1, ease: "power1.inOut" }, t);
      tl.to(tags[o[1]], { autoAlpha: 1, y: 0, duration: 0.3 }, t + 0.8);
      tl.to(marcos[o[1]], { scale: 1.5, duration: 0.2, yoyo: true, repeat: 1 }, t + 0.8);
      tl.call(function () { txt(toastT, avisos[o[1]]); }, null, t + 0.9);
      tl.fromTo(toast, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.35 }, t + 0.9);
      tl.to(toast, { autoAlpha: 0, y: 8, duration: 0.25 }, t + 3.3);
      t += 2.6;
    });
    tl.to({}, { duration: 0.6 });
    return { tl: tl, quadroFinal: 0.36 };
  }

  // ------------------------------------------------------------------ Comunidade
  function montarComunidade(G, tela) {
    tela.innerHTML = janela("Fórum · Reajuste e repactuação", "Setor público e privado",
      '<div class="lvu-perg"><span class="lvu-av">AC</span><div><small>Agente de contratação · Prefeitura</small><b>A repactuação pode retroagir à data da nova convenção, mesmo pedida depois?</b>' +
      '<span class="lvu-meta"><em class="lvu-nresp">0 respostas</em><em class="lvu-votos">0 votos</em></span></div></div>' +
      '<div class="lvu-pilha"><div class="lvu-dig"><span class="lvu-av lvu-av-esp">LC</span><span class="lvu-pontinhos"><i></i><i></i><i></i></span><small>Especialista Licitacon está respondendo</small></div>' +
      '<div class="lvu-resp"><span class="lvu-selo">Resposta oficial</span><p class="lvu-resp-t"></p><small>Especialista Licitacon · com 3 decisões citadas</small></div></div>' +
      '<div class="lvu-pe lvu-pe-esq"><span class="lvu-chip">Curso: Repactuação na prática</span><span class="lvu-chip">Consultoria em vídeo</span></div>');
    var nresp = q(tela, ".lvu-nresp"), votos = q(tela, ".lvu-votos"), dig = q(tela, ".lvu-dig"), resp = q(tela, ".lvu-resp"), respT = q(tela, ".lvu-resp-t"), chips = qa(tela, ".lvu-pe .lvu-chip"), perg = q(tela, ".lvu-perg"), selo = q(tela, ".lvu-selo");
    var texto = "Sim, desde que o pedido venha antes da prorrogação ou do fim do contrato. Os efeitos financeiros contam da data-base da convenção.";
    var tl = G.timeline({ repeat: -1, repeatDelay: 1.6, defaults: { ease: "power3.out" } });
    tl.set([dig, resp].concat(chips), { autoAlpha: 0, y: 10 }, 0).set(perg, { autoAlpha: 0, y: 12 }, 0)
      .call(function () { txt(respT, ""); txt(nresp, "0 respostas"); txt(votos, "0 votos"); }, null, 0);
    tl.to(perg, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.2);
    contar(G, tl, nresp, 0, 11, function (v) { return Math.round(v) + " respostas"; }, 1.4, 0.8);
    tl.to(dig, { autoAlpha: 1, y: 0, duration: 0.35 }, 1.2);
    tl.to(dig, { autoAlpha: 0, duration: 0.25 }, 2.6);
    tl.to(resp, { autoAlpha: 1, y: 0, duration: 0.45 }, 2.7);
    tl.fromTo(selo, { scale: 1.6, rotation: -10 }, { scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2)" }, 2.8);
    digitar(G, tl, respT, texto, 2.4, 3.0);
    tl.call(function () { txt(nresp, "12 respostas"); }, null, 3.0);
    contar(G, tl, votos, 0, 24, function (v) { return Math.round(v) + " votos"; }, 1.2, 4.6);
    tl.to(chips, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.15 }, 5.4);
    tl.to({}, { duration: 5 });
    tl.to([perg, resp].concat(chips), { autoAlpha: 0, duration: 0.35 });
    return { tl: tl, quadroFinal: 0.9 };
  }

  var MONTA = { calculadora: montarCalculadora, elaborador: montarElaborador, gestao: montarGestao, comunidade: montarComunidade };
  var ROTULOS = {
    calculadora: "Animação: reajuste de um contrato pelo IPCA, IGP-M, INCC e IPCA-E dos últimos 12 meses, com o acumulado, o valor reajustado e a nota técnica em Excel e PDF.",
    elaborador: "Animação: o questionário é respondido e o Estudo Técnico Preliminar é redigido seção por seção, com a pesquisa de preços no PNCP e no Compras.gov.br e a minuta em Word e PDF.",
    gestao: "Animação: a carteira de contratos numa linha do tempo, com os prazos de prorrogação, repactuação e reajuste e o aviso enviado por e-mail.",
    comunidade: "Animação: uma pergunta chega ao fórum e o especialista responde com a resposta oficial, que recebe votos e indica curso e consultoria."
  };

  // ---------------------------------------------------------------- montagem, pausa e limpeza
  var telas = []; // { raiz, tl, io, ro, quadroFinal, botao }
  function aplicarPausa(t) {
    var p = pausado() || REDUZ || POUPA;
    if (t.botao) {
      t.botao.setAttribute("aria-pressed", pausado() ? "true" : "false");
      t.botao.setAttribute("aria-label", pausado() ? "Retomar animação" : "Pausar animação");
      t.botao.title = pausado() ? "Retomar animação" : "Pausar animação";
      t.raiz.classList.toggle("lvu-parado", p);
    }
    if (!t.tl) return;
    if (REDUZ || POUPA) { t.tl.progress(t.quadroFinal).pause(); return; }
    if (p || !t.visivel) t.tl.pause(); else t.tl.play();
  }
  window.addEventListener("lv-pausa", function () { telas.forEach(aplicarPausa); });
  if (mm && mm.addEventListener) mm.addEventListener("change", function (e) { REDUZ = e.matches; telas.forEach(aplicarPausa); });

  function preparar(alvo) {
    var tipo = alvo.getAttribute("data-lvui");
    if (!MONTA[tipo]) return;
    var raiz = document.createElement("div");
    raiz.className = "lvu lvu-" + tipo;
    var botao = document.createElement("button");
    botao.type = "button";
    botao.className = "lvu-pausa";
    botao.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path class="p" d="M5 3.5v9M11 3.5v9"/><path class="r" d="M5 3.2l8 4.8-8 4.8z"/></svg>';
    botao.addEventListener("click", function () { pausar(!pausado()); });
    var tela = document.createElement("div");
    tela.className = "lvu-jan";
    tela.setAttribute("role", "img");
    tela.setAttribute("aria-label", ROTULOS[tipo]);
    raiz.appendChild(botao);
    raiz.appendChild(tela);
    var t = { alvo: alvo, raiz: raiz, tela: tela, botao: botao, tipo: tipo, tl: null, visivel: false, montando: false };
    telas.push(t);
    if (!window.IntersectionObserver) { t.visivel = true; montar(t); return; }
    // só monta quando chega perto; depois, pausa fora da vista
    t.io = new IntersectionObserver(function (es) {
      t.visivel = es[es.length - 1].isIntersecting;
      if (t.visivel && !t.tl) montar(t); else aplicarPausa(t);
    }, { rootMargin: "200px 0px" });
    t.io.observe(alvo);
  }
  function montar(t) {
    if (t.montando) return;
    t.montando = true;
    Promise.all([comGsap(), t.tipo === "calculadora" ? comIndices() : null]).then(function (r) {
      var G = r[0];
      if (!t.alvo.isConnected) return;
      var res;
      try {
        res = MONTA[t.tipo](G, t.tela, t.tipo === "calculadora" ? dadosIndices(r[1]) : null);
      } catch (e) { if (window.console) console.warn("inicio-ui", e); return; }
      t.alvo.insertBefore(t.raiz, t.alvo.firstChild);
      t.alvo.classList.add("lvu-on");
      t.tl = res.tl; t.quadroFinal = res.quadroFinal;
      // quem já deixou pausado vê a tela completa, parada; ao retomar, segue dali
      if (pausado()) t.tl.progress(t.quadroFinal);
      t.tl.pause();
      // depois de mudar o tamanho (girar o celular), as posições calculadas são refeitas
      if (window.ResizeObserver) {
        var espera = 0, w0 = 0;
        t.ro = new ResizeObserver(function (es) {
          var w = Math.round(es[0].contentRect.width);
          if (!w0) { w0 = w; return; }
          if (w === w0) return;
          w0 = w;
          clearTimeout(espera);
          espera = setTimeout(function () { if (t.tl) { var p = t.tl.progress(); t.tl.invalidate().progress(p); } }, 150);
        });
        t.ro.observe(t.raiz);
      }
      aplicarPausa(t);
    }, function () { /* sem GSAP: fica o exemplo estático */ });
  }
  function limpar() {
    telas = telas.filter(function (t) {
      if (t.alvo.isConnected) return true;
      if (t.tl) t.tl.kill();
      if (t.io) t.io.disconnect();
      if (t.ro) t.ro.disconnect();
      return false;
    });
  }
  function varrer() {
    limpar();
    Array.prototype.forEach.call(document.querySelectorAll("#dc-root [data-lvui]:not([data-lvui-ok])"), function (x) {
      x.setAttribute("data-lvui-ok", "1");
      preparar(x);
    });
  }
  // só elemento novo interessa (o runtime trocando a página); texto que muda é ignorado
  function temElementoNovo(lista) {
    for (var i = 0; i < lista.length; i++) {
      var m = lista[i];
      if (m.removedNodes.length) return true;
      for (var j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].nodeType === 1) return true;
    }
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
