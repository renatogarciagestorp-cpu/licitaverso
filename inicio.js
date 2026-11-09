/* Licitacon — página inicial animada, com Motion (window.Motion). Estilos em inicio.css.
 *
 * A página é montada pelo runtime do Claude Design. A marcação traz espaços vazios com data-lvi="…" e este
 * arquivo os preenche quando aparecem (e de novo se a pessoa sai e volta para o início):
 *   demo    — janela do topo que troca sozinha entre Parecerista, Elaborador, Calculadora e Gestão
 *   faixa   — decisões reais recentes do acervo (inicio-destaques.json), rolando sem parar
 *   fontes  — órgãos e normas, rolando no sentido contrário
 *   frase   — frase grande que acende palavra por palavra com a rolagem
 *   hist    — "Como funciona O Parecerista", preso na tela enquanto os passos avançam com a rolagem
 *   vitrine — anel 3D com as ferramentas: gira sozinho, dá para arrastar e tocar para abrir
 * Também conta os números e enche as barras dos exemplos das seções.
 * Só anima transform e opacity. Com "reduzir movimento", mostra tudo parado e completo.
 */
(function () {
  "use strict";
  var M = window.Motion;
  if (!M || !M.animate) return;
  var animate = M.animate, inView = M.inView, scroll = M.scroll;
  var REDUZ = false;
  try { REDUZ = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* segue */ }
  var SUAVE = [0.22, 1, 0.36, 1];

  // ---------------------------------------------------------------- utilidades
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function brl(v) { return "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function pct(v, casas) { return v.toFixed(casas == null ? 2 : casas).replace(".", ",") + "%"; }
  function numBR(t) {
    var m = String(t).match(/-?[\d.]+(,\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }
  function anima(alvo, quadro, op) {
    try { return animate(alvo, quadro, op).finished; } catch (e) { return Promise.resolve(); }
  }
  // Visível na tela e aba aberta: os laços só andam assim (economiza bateria no celular).
  function vigiar(alvo) {
    var st = { vis: false };
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { st.vis = es[es.length - 1].isIntersecting; }).observe(alvo);
    } else st.vis = true;
    return st;
  }
  async function quandoVisivel(alvo, st) {
    while (alvo.isConnected && (!st.vis || document.hidden)) await espera(250);
    return alvo.isConnected;
  }
  function uma(alvo, fn, op) {
    if (REDUZ || !inView) { fn(); return; }
    var feito = false;
    var parar = inView(alvo, function () { if (feito) return; feito = true; if (parar) parar(); fn(); }, op || { amount: 0.4 });
  }

  // Conta um número no próprio nó de texto (o runtime continua dono do elemento).
  function contar(alvo, formato, dur) {
    var no = alvo.firstChild;
    if (!no || no.nodeType !== 3) return;
    var final = no.nodeValue, v = numBR(final);
    if (v === null || REDUZ) return;
    var fmt = formato || function (x) { return Math.round(x).toLocaleString("pt-BR"); };
    var escrito = fmt(0);
    no.nodeValue = escrito;
    uma(alvo, function () {
      try {
        animate(0, v, { duration: dur || 1.4, ease: SUAVE, onUpdate: function (x) {
          if (no.nodeValue !== escrito) return; // o site trocou o valor: não mexe mais
          escrito = fmt(x); no.nodeValue = escrito;
        } }).finished.then(function () { if (no.nodeValue === escrito) no.nodeValue = final; });
      } catch (e) { no.nodeValue = final; }
    });
  }

  // Uma vez por quadro enquanto a página rola, medindo a posição real: a página muda de altura depois de
  // montada (a faixa de decisões chega depois), então nada de posições guardadas.
  function rolagem(fn, alvo) {
    var pendente = false;
    function vez() {
      pendente = false;
      if (!alvo.isConnected) { window.removeEventListener("scroll", pede); window.removeEventListener("resize", pede); return; }
      fn();
    }
    function pede() { if (!pendente) { pendente = true; requestAnimationFrame(vez); } }
    window.addEventListener("scroll", pede, { passive: true });
    window.addEventListener("resize", pede);
    fn();
  }

  // ---------------------------------------------------------------- dados
  var cacheJson = {};
  function json(url) {
    if (!cacheJson[url]) cacheJson[url] = fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
    return cacheJson[url];
  }
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function ipca12() {
    return json("indices.json").then(function (d) {
      var s = d.series.ipca.mensal, ch = Object.keys(s).sort().slice(-12);
      var fator = ch.reduce(function (f, k) { return f * (1 + s[k] / 100); }, 1);
      return { meses: ch.map(function (k) { return { rot: MESES[+k.slice(5) - 1], v: s[k] }; }), acum: (fator - 1) * 100, ate: ch[ch.length - 1] };
    });
  }

  // ---------------------------------------------------------------- topo: entrada
  function partirPalavras(alvo, classe) {
    var lista = [];
    Array.prototype.slice.call(alvo.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment();
        n.nodeValue.split(/(\s+)/).forEach(function (p) {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          var w = el("span", classe.caixa), s = el("span", classe.item);
          s.textContent = p; w.appendChild(s); frag.appendChild(w); lista.push(s);
        });
        alvo.replaceChild(frag, n);
      } else if (n.nodeType === 1) {
        lista = lista.concat(partirPalavras(n, classe));
      }
    });
    return lista;
  }

  function montarTopo(topo) {
    var h1 = topo.querySelector(".lvh-top-h1");
    var txt = topo.querySelector(".lvi-hero-txt");
    var cartoes = topo.querySelectorAll(".lvh-top-card");
    if (REDUZ || !h1 || !txt) return;
    var palavras = partirPalavras(h1, { caixa: "lvi-palavra", item: "" });
    var outros = Array.prototype.filter.call(txt.children, function (c) { return c !== h1; });
    palavras.forEach(function (p) { p.style.transform = "translateY(105%)"; });
    outros.forEach(function (o) { o.style.opacity = "0"; });
    Array.prototype.forEach.call(cartoes, function (c) { c.style.opacity = "0"; });
    function limpa(lst) { lst.forEach(function (x) { x.style.transform = ""; x.style.opacity = ""; }); }
    anima(palavras, { y: ["105%", "0%"] }, { duration: 0.75, delay: M.stagger(0.045, { startDelay: 0.1 }), ease: SUAVE }).then(function () { limpa(palavras); });
    anima(outros, { opacity: [0, 1], y: [18, 0] }, { duration: 0.6, delay: M.stagger(0.12, { startDelay: 0.45 }), ease: SUAVE }).then(function () { limpa(outros); });
    var cs = Array.prototype.slice.call(cartoes);
    anima(cs, { opacity: [0, 1], y: [22, 0], scale: [0.96, 1] }, { duration: 0.55, delay: M.stagger(0.06, { startDelay: 0.9 }), ease: SUAVE }).then(function () { limpa(cs); });
    setTimeout(function () { limpa(palavras); limpa(outros); limpa(cs); }, 4000); // rede de segurança
  }

  // ---------------------------------------------------------------- topo: janela com 4 cenas
  var ACHADOS = [
    ["alta", "Alta", "Julgamento por lote em registro de preços sem a justificativa do art. 82, § 1º."],
    ["media", "Média", "Ata municipal admitindo adesão de órgãos federais e estaduais (art. 86, § 8º)."],
    ["baixa", "Baixa", "Erro material na data do planejamento das quantidades."]
  ];
  function achadosHtml() {
    return ACHADOS.map(function (a) { return '<div class="lvi-ach ' + a[0] + '"><b>' + a[1] + "</b><span>" + esc(a[2]) + "</span></div>"; }).join("");
  }

  function cenaParecer() {
    var c = el("div", "lvi-cena");
    var larg = [92, 78, 86, 64, 90, 72, 58];
    c.innerHTML = '<div class="lvi-doc-cab"><b>Edital · pregão eletrônico</b><span class="lvi-selo">Lei 14.133</span></div>' +
      '<div class="lvi-linhas">' + larg.map(function (w) { return '<span style="width:' + w + '%"></span>'; }).join("") + '<i class="lvi-feixe"></i></div>' +
      '<div class="lvi-achados">' + achadosHtml() + "</div>";
    var linhas = c.querySelectorAll(".lvi-linhas > span"), feixe = c.querySelector(".lvi-feixe"), achs = c.querySelectorAll(".lvi-ach");
    return {
      el: c, prompt: "Analise o edital do pregão e aponte os riscos",
      inicio: function () {
        Array.prototype.forEach.call(linhas, function (l) { l.classList.remove("marca"); l.style.transform = "scaleX(0)"; });
        Array.prototype.forEach.call(achs, function (a) { a.style.opacity = "0"; });
        feixe.style.opacity = "0";
      },
      rodar: async function (vivo) {
        await anima(linhas, { scaleX: [0, 1] }, { duration: 0.5, delay: M.stagger(0.05), ease: SUAVE });
        if (!vivo()) return;
        feixe.style.opacity = "1";
        var alt = feixe.parentNode.offsetHeight;
        setTimeout(function () { linhas[1].classList.add("marca"); }, 450);
        setTimeout(function () { linhas[4].classList.add("marca"); }, 900);
        await anima(feixe, { y: [-34, alt] }, { duration: 1.3, ease: "easeInOut" });
        feixe.style.opacity = "0";
        if (!vivo()) return;
        await anima(achs, { opacity: [0, 1], y: [12, 0], scale: [0.97, 1] }, { delay: M.stagger(0.35), type: "spring", stiffness: 260, damping: 22 });
      },
      final: function () { Array.prototype.forEach.call(linhas, function (l) { l.style.transform = ""; }); Array.prototype.forEach.call(achs, function (a) { a.style.opacity = ""; }); }
    };
  }

  function cenaElaborar() {
    var c = el("div", "lvi-cena");
    var secoes = ["Descrição da necessidade", "Requisitos da contratação", "Estimativa das quantidades", "Estimativa do valor", "Justificativa do parcelamento"];
    c.innerHTML = '<div class="lvi-doc-cab"><b>Estudo Técnico Preliminar</b><span class="lvi-selo">Minuta</span></div>' +
      '<ol class="lvi-secoes">' + secoes.map(function (s, i) { return "<li><i>" + (i + 1) + "</i><span>" + s + "</span><em>pronto</em></li>"; }).join("") + "</ol>" +
      '<div class="lvi-escrita"><small>Redigindo · estimativa do valor</small><span></span></div>';
    var lis = c.querySelectorAll(".lvi-secoes li"), alvo = c.querySelector(".lvi-escrita span");
    var texto = "Pesquisa no PNCP e no Compras.gov.br: 12 preços encontrados, mediana de R$ 1.284,00. Exemplo ilustrativo.";
    return {
      el: c, prompt: "Elabore o ETP da contratação de serviços de limpeza",
      inicio: function () { Array.prototype.forEach.call(lis, function (l) { l.className = ""; }); alvo.textContent = ""; },
      rodar: async function (vivo) {
        for (var i = 0; i < 3; i++) {
          lis[i].className = "ativo"; await espera(380); if (!vivo()) return;
          lis[i].className = "ok"; anima(lis[i].querySelector("i"), { scale: [0.6, 1] }, { type: "spring", stiffness: 500, damping: 18 });
        }
        lis[3].className = "ativo";
        for (var k = 1; k <= texto.length; k += 2) { alvo.textContent = texto.slice(0, k); await espera(22); if (!vivo()) return; }
        alvo.textContent = texto;
        lis[3].className = "ok"; lis[4].className = "ativo";
      },
      final: function () { Array.prototype.forEach.call(lis, function (l, i) { l.className = i < 4 ? "ok" : "ativo"; }); alvo.textContent = texto; }
    };
  }

  function cenaCalc() {
    var c = el("div", "lvi-cena");
    c.innerHTML = '<div class="lvi-doc-cab"><b>Reajuste por índice · IPCA</b><span class="lvi-selo">Índice oficial</span></div>' +
      '<div class="lvi-graf"></div><div class="lvi-nums"><div class="dest"><small>IPCA acumulado em 12 meses</small><b>–</b></div><div><small>Valor do posto reajustado</small><b>–</b></div></div>' +
      '<div class="lvi-fonte">Carregando o índice…</div>';
    var graf = c.querySelector(".lvi-graf"), bs = c.querySelectorAll(".lvi-nums b"), fonte = c.querySelector(".lvi-fonte");
    var BASE = 6952.66, dados = null;
    var pronto = ipca12().then(function (d) {
      dados = d;
      var mx = Math.max.apply(null, d.meses.map(function (m) { return Math.abs(m.v); })) || 1;
      graf.innerHTML = d.meses.map(function (m) {
        var h = Math.max(4, Math.abs(m.v) / mx * 100);
        return '<div><i class="' + (m.v < 0 ? "neg" : "") + '" style="height:' + h.toFixed(1) + '%"></i><small>' + m.rot + "</small></div>";
      }).join("");
      fonte.textContent = "IPCA (IBGE) · Banco Central do Brasil, SGS 433 · até " + MESES[+d.ate.slice(5) - 1] + "/" + d.ate.slice(0, 4) + " · valor do posto ilustrativo";
    }).catch(function () { fonte.textContent = "Exemplo ilustrativo"; });
    return {
      el: c, prompt: "Reajuste o contrato pelo IPCA dos últimos 12 meses",
      inicio: function () {
        Array.prototype.forEach.call(graf.querySelectorAll("i"), function (i) { i.style.transform = "scaleY(0)"; });
        bs[0].textContent = "0,00%"; bs[1].textContent = brl(BASE);
      },
      rodar: async function (vivo) {
        await pronto;
        if (!vivo()) return;
        var barras = graf.querySelectorAll("i");
        if (barras.length) await anima(barras, { scaleY: [0, 1] }, { duration: 0.55, delay: M.stagger(0.06), ease: SUAVE });
        if (!vivo() || !dados) return;
        var a = dados.acum;
        try {
          await animate(0, 1, { duration: 1.3, ease: SUAVE, onUpdate: function (t) {
            bs[0].textContent = pct(a * t); bs[1].textContent = brl(BASE * (1 + a * t / 100));
          } }).finished;
        } catch (e) { /* segue */ }
      },
      final: function () {
        Array.prototype.forEach.call(graf.querySelectorAll("i"), function (i) { i.style.transform = ""; });
        if (dados) { bs[0].textContent = pct(dados.acum); bs[1].textContent = brl(BASE * (1 + dados.acum / 100)); }
      }
    };
  }

  function cenaGestao() {
    var c = el("div", "lvi-cena");
    var cts = [["v", "Vigente", "Contrato 025/2025 · Limpeza", "até 12/12/2027", 56], ["a", "Vencendo", "Contrato 031/2024 · Vigilância", "faltam 2 meses", 93], ["x", "Vencido", "Contrato 007/2023 · Impressão", "encerrado", 100]];
    c.innerHTML = '<div class="lvi-doc-cab"><b>Meus contratos</b><span class="lvi-selo">3 contratos</span></div>' +
      cts.map(function (k) { return '<div class="lvi-ct ' + k[0] + '"><div><small>' + k[1] + "</small><b>" + k[2] + "</b></div><span>" + k[3] + '</span><i><u style="--p:' + k[4] + '%"></u></i></div>'; }).join("") +
      '<div class="lvi-aviso"><span>!</span><div><b>Iniciar a prorrogação do Contrato 031/2024</b>Aviso por e-mail · faltam 2 meses para o fim da vigência</div></div>';
    var linhas = c.querySelectorAll(".lvi-ct"), barras = c.querySelectorAll(".lvi-ct u"), aviso = c.querySelector(".lvi-aviso");
    return {
      el: c, prompt: "Quais prazos dos meus contratos vencem este ano?",
      inicio: function () {
        Array.prototype.forEach.call(linhas, function (l) { l.style.opacity = "0"; });
        Array.prototype.forEach.call(barras, function (b) { b.style.transform = "scaleX(0)"; });
        aviso.style.opacity = "0";
      },
      rodar: async function (vivo) {
        await anima(linhas, { opacity: [0, 1], x: [-14, 0] }, { duration: 0.45, delay: M.stagger(0.12), ease: SUAVE });
        if (!vivo()) return;
        await anima(barras, { scaleX: [0, 1] }, { duration: 0.9, delay: M.stagger(0.15), ease: SUAVE });
        if (!vivo()) return;
        await anima(aviso, { opacity: [0, 1], y: [30, 0] }, { type: "spring", stiffness: 300, damping: 22 });
      },
      final: function () {
        Array.prototype.forEach.call(linhas, function (l) { l.style.opacity = ""; });
        Array.prototype.forEach.call(barras, function (b) { b.style.transform = ""; });
        aviso.style.opacity = "";
      }
    };
  }

  function montarDemo(caixa) {
    var cenas = [cenaParecer(), cenaElaborar(), cenaCalc(), cenaGestao()];
    var nomes = ["Parecerista", "Elaborador", "Calculadora", "Gestão"];
    var jan = el("div", "lvi-jan");
    jan.innerHTML = '<div class="lvi-jan-barra"><i></i><i></i><i></i><span>Licitacon · painel</span><em class="lvi-vivo">ao vivo</em></div>' +
      '<div class="lvi-abas">' + nomes.map(function (n) { return '<span class="lvi-aba">' + n + "</span>"; }).join("") + '<i class="lvi-aba-marca"></i></div>' +
      '<div class="lvi-corpo"></div><div class="lvi-campo"><span class="lvi-campo-txt"></span><i class="lvi-caret"></i><b class="lvi-campo-btn">↑</b></div>';
    var corpo = jan.querySelector(".lvi-corpo"), abas = jan.querySelectorAll(".lvi-aba"), marca = jan.querySelector(".lvi-aba-marca"), campo = jan.querySelector(".lvi-campo-txt");
    cenas.forEach(function (c) { corpo.appendChild(c.el); });
    caixa.appendChild(jan);

    function marcarAba(i, instantaneo) {
      Array.prototype.forEach.call(abas, function (a, k) { a.classList.toggle("on", k === i); });
      var a = abas[i];
      var q = { x: a.offsetLeft, scaleX: a.offsetWidth };
      if (instantaneo || REDUZ) { marca.style.transform = "translateX(" + q.x + "px) scaleX(" + q.scaleX + ")"; return; }
      anima(marca, q, { type: "spring", stiffness: 380, damping: 32 });
    }

    if (REDUZ) {
      cenas[0].el.classList.add("on"); cenas[0].final(); campo.textContent = cenas[0].prompt; marcarAba(0, true);
      return;
    }

    // entrada da janela
    jan.style.opacity = "0";
    anima(jan, { opacity: [0, 1], y: [40, 0], scale: [0.94, 1], rotateX: [12, 0] }, { duration: 1, delay: 0.35, ease: SUAVE }).then(function () { jan.style.opacity = ""; });

    // inclinação acompanhando o mouse
    var topo = caixa.closest(".lvi-topo");
    if (topo && matchMedia("(hover: hover) and (min-width: 981px)").matches) {
      topo.addEventListener("pointermove", function (e) {
        var r = jan.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
        animate(jan, { rotateY: dx * 10, rotateX: -dy * 8 }, { type: "spring", stiffness: 120, damping: 20 });
      });
      topo.addEventListener("pointerleave", function () { animate(jan, { rotateY: 0, rotateX: 0 }, { type: "spring", stiffness: 120, damping: 20 }); });
    }

    var st = vigiar(jan), vez = 0, atual = -1;
    async function rodar(i, t) {
      var vivo = function () { return t === vez && jan.isConnected; };
      if (!(await quandoVisivel(jan, st)) || !vivo()) return;
      marcarAba(i);
      var nova = cenas[i], velha = atual >= 0 && atual !== i ? cenas[atual] : null;
      nova.inicio();
      if (velha) {
        anima(velha.el, { opacity: [1, 0], y: [0, -10] }, { duration: 0.3 }).then(function () { velha.el.classList.remove("on"); velha.el.style.transform = ""; velha.el.style.opacity = ""; });
      }
      atual = i;
      nova.el.classList.add("on");
      anima(nova.el, { opacity: [0, 1], y: [12, 0] }, { duration: 0.45, ease: SUAVE }).then(function () { nova.el.style.opacity = ""; nova.el.style.transform = ""; });
      campo.textContent = "";
      for (var k = 1; k <= nova.prompt.length; k++) { campo.textContent = nova.prompt.slice(0, k); await espera(26); if (!vivo()) return; }
      await espera(250);
      if (!vivo()) return;
      anima(jan.querySelector(".lvi-campo-btn"), { scale: [1, 0.85, 1] }, { duration: 0.3 });
      await nova.rodar(vivo);
      if (!vivo()) return;
      await espera(2400);
      if (!vivo() || !(await quandoVisivel(jan, st))) return;
      ir((i + 1) % cenas.length);
    }
    function ir(i) { vez++; rodar(i, vez); }
    Array.prototype.forEach.call(abas, function (a, i) { a.addEventListener("click", function () { ir(i); }); });
    requestAnimationFrame(function () { marcarAba(0, true); ir(0); });
  }

  // ---------------------------------------------------------------- faixa de decisões e de fontes
  var CORES = { TCU: ["rgba(63,212,154,.18)", "#6FE0AE"], STF: ["rgba(91,192,218,.18)", "#8AD4EA"], STJ: ["rgba(91,192,218,.18)", "#8AD4EA"], CGU: ["rgba(186,148,255,.18)", "#CDB4FF"] };
  function corOrgao(o) {
    if (CORES[o]) return CORES[o];
    if (/^TC/.test(o)) return ["rgba(242,181,68,.16)", "#F7C76A"];
    if (/^PGE/.test(o)) return ["rgba(186,148,255,.18)", "#CDB4FF"];
    return ["rgba(255,255,255,.10)", "#E2EEEA"];
  }
  function trilho(caixa, itens, porItem) {
    var dentro = el("div", "lvi-trilho-in");
    dentro.innerHTML = itens + itens; // duas cópias: o laço não tem emenda
    dentro.style.setProperty("--dur", porItem + "s");
    caixa.appendChild(dentro);
  }
  function montarFaixa(caixa) {
    json("inicio-destaques.json").then(function (d) {
      var it = (d && d.itens) || [];
      if (!it.length) { caixa.style.display = "none"; return; }
      var html = it.map(function (x) {
        var c = corOrgao(x.orgao);
        return '<article class="lvi-dec"><div class="lvi-dec-top"><span class="lvi-org" style="--o:' + c[0] + ";--oc:" + c[1] + '">' + esc(x.orgao) + "</span>" +
          "<span>" + esc(x.tipo) + "</span><em>" + esc(x.data) + "</em></div><b>" + esc(x.numero) + "</b><p>" + esc(x.titulo) + "</p><small>" + esc(x.tema) + "</small></article>";
      }).join("");
      trilho(caixa, html, it.length * 5.5);
    }).catch(function () { caixa.style.display = "none"; });
  }
  function montarFontes(caixa) {
    var orgaos = ["TCU", "CGU", "STF", "STJ", "TCE-SP", "TCE-RJ", "TCE-MG", "TCE-RS", "TCE-PR", "TCE-BA", "TCM-SP", "TCM-RJ", "PGE-SP", "PGE-BA", "TJ-RJ"];
    var normas = ["Lei 14.133/2021", "Lei 13.303/2016", "Lei 13.019/2014", "IN SEGES/ME 65/2021", "IN 05/2017", "LC 214/2025"];
    var html = "", k = 0;
    orgaos.forEach(function (o, i) {
      html += '<span class="lvi-chip org">' + o + "</span>";
      if (i % 3 === 2 && k < normas.length) html += '<span class="lvi-chip">' + normas[k++] + "</span>";
    });
    trilho(caixa, html, 45);
  }

  // ---------------------------------------------------------------- frase que acende com a rolagem
  function montarFrase(p) {
    var palavras = partirPalavras(p, { caixa: "", item: "lvi-p" });
    if (REDUZ || !scroll) { palavras.forEach(function (w) { w.style.opacity = "1"; }); return; }
    var n = palavras.length, ult = -1;
    rolagem(function () {
      if (!p.isConnected) return;
      var r = p.getBoundingClientRect(), ini = innerHeight * 0.85, fim = innerHeight * 0.5 - r.height;
      var prog = Math.min(1, Math.max(0, (ini - r.top) / (ini - fim)));
      var k = prog * (n + 2);
      if (Math.abs(k - ult) < 0.02) return;
      ult = k;
      for (var i = 0; i < n; i++) palavras[i].style.opacity = String(0.14 + 0.86 * Math.min(1, Math.max(0, k - i)));
    }, p);
  }

  // ---------------------------------------------------------------- história presa na tela
  function montarHist(sec) {
    var palco = sec.querySelector("[data-lvi=palco]"), ol = sec.querySelector(".lvi-passos");
    var lis = sec.querySelectorAll(".lvi-passos li");
    if (!palco || !ol || !lis.length) return;
    palco.setAttribute("data-lvi-ok", "1");
    var prog = el("i", "lvi-passos-prog"); ol.appendChild(prog);

    // etapa 1: arquivos
    var e1 = el("div", "lvi-et");
    e1.innerHTML = '<div class="lvi-zona"><div><div class="lvi-zona-ic">⇪</div><strong>Solte os documentos aqui</strong>Edital, ETP, TR, matriz de riscos ou planilhas</div></div>' +
      '<div class="lvi-arq"><i>PDF</i><div>Edital.pdf<small>pregão eletrônico</small></div></div>' +
      '<div class="lvi-arq docx"><i>DOCX</i><div>ETP.docx<small>estudo técnico preliminar</small></div></div>' +
      '<div class="lvi-arq xlsx"><i>XLSX</i><div>Planilha.xlsx<small>custos e formação de preços</small></div></div>';
    var arqs = e1.querySelectorAll(".lvi-arq"), zonaTxt = e1.querySelector(".lvi-zona > div");
    var origem = [[-170, -150, -14], [175, -120, 10], [-150, 150, 8]];
    // etapa 2: leitura
    var e2 = el("div", "lvi-et");
    var cl = [[94, 80, 66], [88, 72], [96, 84, 58], [90, 70], [92, 86, 62], [80, 68]];
    e2.innerHTML = '<div class="lvi-folha"><span class="lvi-cont">item 1 de 62</span><h4>Edital · condições de participação</h4>' +
      cl.map(function (l, i) { return '<div class="cl' + (i === 2 || i === 4 ? " alvo" : "") + '"><em>' + (i + 7) + ".</em><div>" + l.map(function (w) { return '<span style="width:' + w + '%"></span>'; }).join("") + "</div></div>"; }).join("") +
      '<i class="lvi-feixe"></i></div>';
    var folha = e2.querySelector(".lvi-folha"), feixe = e2.querySelector(".lvi-feixe"), cont = e2.querySelector(".lvi-cont"), alvos = e2.querySelectorAll(".cl.alvo");
    // etapa 3: lei e jurisprudência
    var e3 = el("div", "lvi-et");
    var nos = [["Lei 14.133/2021", "texto da lei"], ["TCU", "acórdãos e súmulas"], ["Tribunais de Contas", "dos 26 estados e do DF"], ["STJ e STF", "temas e precedentes"], ["PGEs e TJs", "pareceres e decisões"], ["Roteiro Licitacon", "verificação item a item"]];
    e3.innerHTML = '<div class="lvi-rede">' + nos.map(function () { return '<i class="lvi-fio"></i>'; }).join("") +
      '<div class="lvi-nucleo"><div><i>§</i>Seu edital</div></div>' +
      nos.map(function (n) { return '<div class="lvi-no">' + n[0] + "<small>" + n[1] + "</small></div>"; }).join("") + "</div>";
    var fios = e3.querySelectorAll(".lvi-fio"), nosEl = e3.querySelectorAll(".lvi-no");
    // etapa 4: parecer
    var e4 = el("div", "lvi-et");
    e4.innerHTML = '<div class="lvi-par"><div class="lvi-par-cab"><i>✦</i><div><b>Parecer técnico</b><small>Edital de pregão eletrônico · 3 apontamentos</small></div></div>' +
      achadosHtml() + '<div class="lvi-par-pe"><span>Baixar em PDF</span><span>Abrir no Word</span></div></div><div class="lvi-carimbo">Com a lei e a juris&shy;prudência</div>';
    var achs = e4.querySelectorAll(".lvi-ach"), carimbo = e4.querySelector(".lvi-carimbo"), par = e4.querySelector(".lvi-par");
    var etapas = [e1, e2, e3, e4];
    etapas.forEach(function (e) { palco.appendChild(e); });

    function posicionarRede() {
      var w = palco.clientWidth, h = palco.clientHeight, rx = Math.min(w * 0.36, 230), ry = Math.min(h * 0.36, 175);
      Array.prototype.forEach.call(nosEl, function (n, i) {
        var a = (i / nosEl.length) * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        n.dataset.x = x - n.offsetWidth / 2; n.dataset.y = y - n.offsetHeight / 2;
        var f = fios[i], d = Math.sqrt(x * x + y * y);
        f.style.width = d + "px"; f.dataset.a = Math.atan2(y, x) * 180 / Math.PI;
      });
    }

    // aplica o estado de uma etapa com o avanço p (0 a 1) dentro dela — chamado a cada quadro da rolagem
    function pintar(i, p) {
      var q = Math.min(1, Math.max(0, p));
      if (i === 0) {
        Array.prototype.forEach.call(arqs, function (a, k) {
          var t = Math.min(1, Math.max(0, (q - k * 0.18) / 0.5)), o = origem[k], e = 1 - Math.pow(1 - t, 3);
          a.style.transform = "translate(" + (o[0] * (1 - e) + (k - 1) * 18) + "px," + (o[1] * (1 - e) + (k - 1) * 46) + "px) rotate(" + (o[2] * (1 - e)) + "deg) scale(" + (1.08 - 0.08 * e) + ")";
          a.style.opacity = String(Math.min(1, t * 2.5));
        });
        zonaTxt.style.opacity = String(Math.max(0, 1 - q * 1.6));
      } else if (i === 1) {
        var hgt = folha.offsetHeight;
        feixe.style.transform = "translateY(" + (-46 + (hgt + 46) * q) + "px)";
        cont.textContent = "item " + Math.max(1, Math.round(62 * q)) + " de 62";
        Array.prototype.forEach.call(alvos, function (a, k) { a.style.setProperty("--alvo", q > 0.35 + k * 0.25 ? "1" : "0"); });
      } else if (i === 2) {
        Array.prototype.forEach.call(nosEl, function (n, k) {
          var t = Math.min(1, Math.max(0, (q - k * 0.1) / 0.35)), e = 1 - Math.pow(1 - t, 3);
          n.style.transform = "translate(" + (+n.dataset.x * e) + "px," + (+n.dataset.y * e) + "px) scale(" + (0.6 + 0.4 * e) + ")";
          n.style.opacity = String(t);
          fios[k].style.transform = "rotate(" + fios[k].dataset.a + "deg) scaleX(" + e + ")";
        });
      } else {
        par.style.transform = "translateY(" + (20 * (1 - Math.min(1, q * 3))) + "px)";
        Array.prototype.forEach.call(achs, function (a, k) { var t = Math.min(1, Math.max(0, (q - 0.1 - k * 0.15) / 0.2)); a.style.opacity = String(t); a.style.transform = "translateX(" + (-12 * (1 - t)) + "px)"; });
        var tc = Math.min(1, Math.max(0, (q - 0.6) / 0.15));
        carimbo.style.opacity = String(tc);
        carimbo.style.transform = "rotate(-12deg) scale(" + (1.6 - 0.6 * tc) + ")";
      }
    }

    var atual = -1;
    function mostrar(i) {
      if (i === atual) return;
      var velha = etapas[atual], nova = etapas[i];
      Array.prototype.forEach.call(lis, function (l, k) { l.classList.toggle("on", k === i); l.classList.toggle("feito", k < i); });
      if (velha) { velha.classList.remove("on"); anima(velha, { opacity: [1, 0], scale: [1, 0.96] }, { duration: 0.3 }).then(function () { velha.style.transform = ""; velha.style.opacity = ""; }); }
      nova.classList.add("on");
      if (i === 2) posicionarRede();
      anima(nova, { opacity: [0, 1], scale: [1.04, 1] }, { duration: 0.45, ease: SUAVE }).then(function () { nova.style.transform = ""; nova.style.opacity = ""; });
      atual = i;
    }

    if (REDUZ || !scroll) {
      Array.prototype.forEach.call(lis, function (l) { l.classList.add("on"); });
      e4.classList.add("on"); pintar(3, 1);
      return;
    }
    posicionarRede();
    window.addEventListener("resize", function () { if (palco.isConnected) posicionarRede(); });
    mostrar(0); pintar(0, 0);
    rolagem(function () {
      if (!palco.isConnected) return;
      var r = sec.getBoundingClientRect(), p = -r.top / Math.max(1, r.height - innerHeight);
      var x = Math.min(0.9999, Math.max(0, p)) * 4, i = Math.floor(x);
      mostrar(i);
      pintar(i, (x - i) / 0.85);
      prog.style.transform = "scaleY(" + Math.min(1, Math.max(0, p) * 1.05) + ")";
    }, sec);
  }

  // ---------------------------------------------------------------- vitrine 3D
  var FERRAMENTAS = [
    ["✦", "Agente de IA", "O Parecerista", "Parecer técnico sobre edital, ETP, TR e planilhas, com a lei e a jurisprudência.", "agente"],
    ["✎", "Agente de IA", "O Elaborador", "ETP, TR e Projeto Básico em Word e PDF, com pesquisa de preços no PNCP.", "elaborar"],
    ["◎", "Planejamento", "Pesquisa de preços", "Estimativa do valor com as fontes, o tratamento estatístico e a fundamentação.", "precos"],
    ["%", "Calculadora", "Reajuste e planilhas", "Reajuste por índice, planilhas da IN 05/2017, repactuação e reequilíbrio.", "calculadora"],
    ["▦", "Gestão Contratual", "Seus contratos", "Linha do tempo, prazos de reajuste e prorrogação e avisos por e-mail.", "gestao"],
    ["⌕", "Grátis", "Biblioteca Jurídica", "TCU, Tribunais de Contas, PGEs e TJs de todo o país, com link oficial.", "biblioteca"],
    ["◍", "Comunidade", "Fórum por tema", "Dúvidas respondidas pelo especialista, setor público e privado.", "forum"],
    ["◈", "Especialista", "Consultoria", "Por escrito, em vídeo ou ao vivo, com desconto de assinante.", "consultoria"],
    ["▤", "Capacitação", "Cursos", "Cursos práticos de licitações e contratos, até 50% off no Pro.", "cursos"]
  ];
  function abrir(pagina) {
    if (window.LV_NAV) window.LV_NAV(pagina);
    else location.href = pagina === "biblioteca" ? "biblioteca.html" : "?p=" + pagina;
  }
  function montarVitrine(palco) {
    var n = FERRAMENTAS.length, passo = 360 / n;
    var anel = el("div", "lvi-anel");
    var cartoes = FERRAMENTAS.map(function (f, i) {
      var b = el("button", "lvi-vc");
      b.type = "button";
      b.setAttribute("aria-label", f[2] + ": " + f[3]);
      b.innerHTML = "<i aria-hidden='true'>" + f[0] + "</i><small>" + f[1] + "</small><b>" + f[2] + "</b><p>" + f[3] + "</p><em>Abrir →</em>";
      anel.appendChild(b);
      return b;
    });
    palco.appendChild(anel);
    var ctl = el("div", "lvi-vit-ctl");
    ctl.innerHTML = '<button type="button" aria-label="Ferramenta anterior">←</button><span aria-live="polite"></span><button type="button" aria-label="Próxima ferramenta">→</button>';
    palco.parentNode.appendChild(ctl);
    var rotulo = ctl.querySelector("span");

    var raio = 0, ang = 0, vel = 0, arrastando = false, moveu = 0, ultX = 0, frente = -1, foco = null, st = vigiar(palco), animAng = null, girando = false;
    function medir() { var w = cartoes[0].offsetWidth || 220; raio = Math.round((w / 2) / Math.tan(Math.PI / n) * 1.12); }
    function pintar() {
      anel.style.transform = "translateZ(" + -raio + "px) rotateY(" + ang + "deg)";
      var melhor = -2, mi = 0;
      cartoes.forEach(function (c, i) {
        var a = (i * passo + ang) * Math.PI / 180, f = Math.cos(a);
        c.style.transform = "rotateY(" + i * passo + "deg) translateZ(" + raio + "px)";
        c.style.opacity = String(0.35 + 0.65 * Math.max(0, f));
        if (f > melhor) { melhor = f; mi = i; }
      });
      if (mi !== frente) { frente = mi; rotulo.textContent = FERRAMENTAS[mi][2]; }
    }
    function girarPara(i) {
      var alvo = -i * passo, d = ((alvo - ang) % 360 + 540) % 360 - 180;
      if (animAng) animAng.stop();
      if (REDUZ) { ang += d; pintar(); return; }
      girando = true; vel = 0;
      animAng = animate(ang, ang + d, { type: "spring", stiffness: 90, damping: 18, onUpdate: function (v) { ang = v; pintar(); }, onComplete: function () { girando = false; } });
    }
    medir(); pintar();
    window.addEventListener("resize", function () { if (palco.isConnected) { medir(); pintar(); } });

    palco.addEventListener("pointerdown", function (e) {
      arrastando = true; moveu = 0; ultX = e.clientX; vel = 0;
      if (animAng) animAng.stop();
      girando = false;
    });
    window.addEventListener("pointermove", function (e) {
      if (!arrastando) return;
      var dx = e.clientX - ultX; ultX = e.clientX; moveu += Math.abs(dx);
      ang += dx * 0.32; vel = dx * 0.32; pintar();
    });
    window.addEventListener("pointerup", function () { arrastando = false; });
    window.addEventListener("pointercancel", function () { arrastando = false; });
    cartoes.forEach(function (c, i) {
      c.addEventListener("click", function (e) {
        if (moveu > 8) { e.preventDefault(); return; }
        if (i === frente) abrir(FERRAMENTAS[i][4]); else girarPara(i);
      });
      c.addEventListener("focus", function () { foco = i; girarPara(i); });
      c.addEventListener("blur", function () { foco = null; });
    });
    ctl.querySelectorAll("button")[0].addEventListener("click", function () { girarPara((frente - 1 + n) % n); });
    ctl.querySelectorAll("button")[1].addEventListener("click", function () { girarPara((frente + 1) % n); });
    var parado = false;
    palco.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") parado = true; });
    palco.addEventListener("pointerleave", function () { parado = false; });
    if (REDUZ) return;
    (function laco() {
      if (!palco.isConnected) return;
      if (st.vis && !document.hidden && !arrastando && foco === null && !girando) {
        if (Math.abs(vel) > 0.05) { ang += vel; vel *= 0.94; } else if (!parado) ang -= 0.09;
        pintar();
      }
      requestAnimationFrame(laco);
    })();
  }

  // ---------------------------------------------------------------- exemplos das seções: números e barras
  function montarExemplos(raiz) {
    Array.prototype.forEach.call(raiz.querySelectorAll(".lvh-art-tab > div > b"), function (b) { contar(b, brl, 1.2); });
    Array.prototype.forEach.call(raiz.querySelectorAll(".lvh-bd-nums > div > strong"), function (s) { contar(s, null, 1.6); });
    var preco = raiz.querySelector(".lvh-art-preco-v b");
    if (preco) contar(preco, brl, 1.2);
    Array.prototype.forEach.call(raiz.querySelectorAll(".lvh-gc"), function (g) {
      var barras = g.querySelectorAll(".lvh-gc-c i");
      if (REDUZ || !barras.length) return;
      Array.prototype.forEach.call(barras, function (b) { b.style.transformOrigin = "0 50%"; b.style.transform = "scaleX(0)"; });
      uma(g, function () {
        anima(barras, { scaleX: [0, 1] }, { duration: 1, delay: M.stagger(0.15, { startDelay: 0.2 }), ease: SUAVE })
          .then(function () { Array.prototype.forEach.call(barras, function (b) { b.style.transform = ""; }); });
      });
    });
    Array.prototype.forEach.call(raiz.querySelectorAll(".lvh-art-secoes"), function (ol) {
      var lis = ol.querySelectorAll("li");
      if (REDUZ || !lis.length) return;
      Array.prototype.forEach.call(lis, function (l) { l.style.opacity = "0"; });
      uma(ol, function () {
        anima(lis, { opacity: [0, 1], x: [-10, 0] }, { duration: 0.4, delay: M.stagger(0.12, { startDelay: 0.2 }), ease: SUAVE })
          .then(function () { Array.prototype.forEach.call(lis, function (l) { l.style.opacity = ""; l.style.transform = ""; }); });
      });
    });
  }

  // ---------------------------------------------------------------- montagem quando a página aparece
  // Só dentro de #dc-root: antes de montar a página, o runtime deixa o modelo cru no documento e depois o copia;
  // mexer no modelo faria a cópia nascer marcada como "já montada" (e invisível).
  var MONTA = { demo: montarDemo, faixa: montarFaixa, fontes: montarFontes, frase: montarFrase, hist: montarHist, vitrine: montarVitrine };
  function varrer() {
    Array.prototype.forEach.call(document.querySelectorAll("#dc-root .lvi-topo:not([data-lvi-ok])"), function (t) {
      t.setAttribute("data-lvi-ok", "1");
      try { montarTopo(t); } catch (e) { /* segue */ }
      var pag = t.parentNode;
      try { montarExemplos(pag || document); } catch (e) { /* segue */ }
    });
    Array.prototype.forEach.call(document.querySelectorAll("#dc-root [data-lvi]:not([data-lvi-ok])"), function (x) {
      var f = MONTA[x.getAttribute("data-lvi")];
      x.setAttribute("data-lvi-ok", "1");
      if (f) { try { f(x); } catch (e) { if (window.console) console.warn("inicio.js", e); } }
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
