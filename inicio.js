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

  // IPCA acumulado de n meses a partir do mês ini ("aaaa-mm"), do indices.json (Banco Central, SGS 433)
  function ipcaPeriodo(ini, n) {
    return json("indices.json").then(function (d) {
      var s = d.series.ipca.mensal, a = +ini.slice(0, 4), m = +ini.slice(5), f = 1;
      for (var k = 0; k < n; k++) {
        var ch = a + "-" + (m < 10 ? "0" : "") + m;
        if (s[ch] == null) return null;
        f *= 1 + s[ch] / 100;
        m++; if (m > 12) { m = 1; a++; }
      }
      return (f - 1) * 100;
    });
  }

  // Gestão: linha do tempo de um contrato até o reajuste na anualidade (exemplo ilustrativo, índice real)
  function cenaGestao() {
    var c = el("div", "lvi-cena");
    var BASE = 48250;
    // posição na régua de 24 meses (mai/2025 a mai/2027)
    var MARCOS = [[0, "01/05/2025", "Orçamento estimado", "baixo ini"], [30.6, "12/12/2025", "Assinatura", "cima"], [50, "01/05/2026", "1º reajuste", "baixo rj"], [100, "01/05/2027", "Próxima anualidade", "cima fim fut"]];
    var HOJE = 76.1;
    c.innerHTML = '<div class="lvi-doc-cab"><b>Contrato 025/2025 · Limpeza</b><span class="lvi-selo">Linha do tempo</span></div>' +
      '<div class="lvi-lt"><i class="lvi-lt-trilho"><u></u></i>' +
      MARCOS.map(function (k) { return '<div class="lvi-mc ' + k[3] + '" style="left:' + k[0] + '%"><b></b><span>' + k[1] + "<small>" + k[2] + "</small></span></div>"; }).join("") +
      '<div class="lvi-hoje" style="left:' + HOJE + '%"><em>hoje</em></div></div>' +
      '<div class="lvi-rj"><div><small>Reajuste pelo IPCA · mai/2025 a abr/2026</small><b class="ind">+0,00%</b></div><div><small>Valor mensal do contrato</small><b class="val">' + brl(BASE) + "</b></div></div>" +
      '<div class="lvi-rj-pe"><span class="reg">✓ Registrado na linha do tempo</span><span class="prox">Próxima anualidade: 01/05/2027 · aviso por e-mail</span></div>';
    var fill = c.querySelector(".lvi-lt-trilho u"), mcs = c.querySelectorAll(".lvi-mc"), hoje = c.querySelector(".lvi-hoje");
    var rj = c.querySelector(".lvi-rj"), ind = c.querySelector(".lvi-rj .ind"), val = c.querySelector(".lvi-rj .val"), reg = c.querySelector(".reg"), prox = c.querySelector(".prox");
    var acum = null;
    var pronto = ipcaPeriodo("2025-05", 12).then(function (v) { acum = v; }).catch(function () { acum = null; });
    function ate(pos, dur) { return anima(fill, { scaleX: pos / 100 }, { duration: dur, ease: "easeInOut" }); }
    function marca(i) { mcs[i].classList.add("on"); return anima(mcs[i].querySelector("b"), { scale: [0.4, 1.25, 1] }, { duration: 0.45 }); }
    return {
      el: c, prompt: "Quando é o reajuste do contrato de limpeza?",
      inicio: function () {
        fill.style.transform = "scaleX(0)";
        Array.prototype.forEach.call(mcs, function (m) { m.classList.remove("on"); });
        hoje.style.opacity = "0"; rj.style.opacity = "0"; reg.style.opacity = "0"; prox.style.opacity = "0";
        ind.textContent = "+0,00%"; val.textContent = brl(BASE);
      },
      rodar: async function (vivo) {
        await pronto;
        await marca(0); if (!vivo()) return;
        await ate(MARCOS[1][0], 0.7); if (!vivo()) return;
        await marca(1); if (!vivo()) return;
        await ate(MARCOS[2][0], 0.55); if (!vivo()) return;
        marca(2);
        await anima(rj, { opacity: [0, 1], y: [10, 0] }, { duration: 0.35, ease: SUAVE });
        if (!vivo()) return;
        if (acum !== null) {
          try {
            await animate(0, 1, { duration: 1.1, ease: SUAVE, onUpdate: function (t) {
              ind.textContent = "+" + pct(acum * t); val.textContent = brl(BASE * (1 + acum * t / 100));
            } }).finished;
          } catch (e) { /* segue */ }
        } else { ind.textContent = "IPCA"; }
        if (!vivo()) return;
        await anima(reg, { opacity: [0, 1], x: [-8, 0] }, { duration: 0.3 });
        await ate(HOJE, 0.6); if (!vivo()) return;
        await anima(hoje, { opacity: [0, 1], y: [-6, 0] }, { duration: 0.3 });
        mcs[3].classList.add("on");
        anima(mcs[3].querySelector("b"), { scale: [1, 1.35, 1] }, { duration: 0.6 });
        await anima(prox, { opacity: [0, 1], x: [-8, 0] }, { duration: 0.35 });
      },
      final: function () {
        fill.style.transform = "scaleX(" + HOJE / 100 + ")";
        Array.prototype.forEach.call(mcs, function (m) { m.classList.add("on"); });
        hoje.style.opacity = ""; rj.style.opacity = ""; reg.style.opacity = ""; prox.style.opacity = "";
        if (acum !== null) { ind.textContent = "+" + pct(acum); val.textContent = brl(BASE * (1 + acum / 100)); }
      }
    };
  }

  function cenaBiblioteca() {
    var c = el("div", "lvi-cena");
    var filtros = ["Tribunais de Contas", "TCU", "2026", "Com link oficial"];
    c.innerHTML = '<div class="lvi-doc-cab"><b>Biblioteca Jurídica</b><span class="lvi-selo">Grátis</span></div>' +
      '<div class="lvi-filtros">' + filtros.map(function (f) { return "<span>" + f + "</span>"; }).join("") + "</div>" +
      '<div class="lvi-res-cab">Decisões recentes, conferidas na fonte oficial</div><div class="lvi-res"></div>';
    var chips = c.querySelectorAll(".lvi-filtros span"), res = c.querySelector(".lvi-res");
    var pronto = json("inicio-destaques.json").then(function (d) {
      var it = ((d && d.itens) || []).filter(function (x) { return /^TC/.test(x.orgao); }).slice(0, 3);
      res.innerHTML = it.map(function (x) {
        var cor = corOrgao(x.orgao);
        return '<div class="lvi-r"><span class="lvi-org" style="--o:' + cor[0] + ";--oc:" + cor[1] + '">' + esc(x.orgao) + "</span><div><b>" + esc(x.numero) + "</b><p>" + esc(x.titulo) + "</p></div><em>link oficial ↗</em></div>";
      }).join("");
    }).catch(function () { /* sem o arquivo, sem resultados */ });
    return {
      el: c, prompt: "Decisões recentes dos Tribunais de Contas",
      inicio: function () {
        Array.prototype.forEach.call(chips, function (x) { x.classList.remove("on"); });
        Array.prototype.forEach.call(res.children, function (r) { r.style.opacity = "0"; });
      },
      rodar: async function (vivo) {
        await pronto;
        Array.prototype.forEach.call(res.children, function (r) { r.style.opacity = "0"; });
        for (var i = 0; i < chips.length; i++) {
          chips[i].classList.add("on");
          anima(chips[i], { scale: [0.85, 1] }, { type: "spring", stiffness: 500, damping: 16 });
          await espera(260); if (!vivo()) return;
        }
        var rs = Array.prototype.slice.call(res.children);
        if (rs.length) await anima(rs, { opacity: [0, 1], y: [14, 0] }, { duration: 0.45, delay: M.stagger(0.18), ease: SUAVE });
        if (!vivo() || !rs.length) return;
        anima(rs[0].querySelector("em"), { scale: [1, 1.12, 1] }, { duration: 0.5 });
      },
      final: function () {
        Array.prototype.forEach.call(chips, function (x) { x.classList.add("on"); });
        Array.prototype.forEach.call(res.children, function (r) { r.style.opacity = ""; });
      }
    };
  }

  function cenaForum() {
    var c = el("div", "lvi-cena");
    c.innerHTML = '<div class="lvi-doc-cab"><b>Fórum · Reajuste e repactuação</b><span class="lvi-selo">Público e privado</span></div>' +
      '<div class="lvi-perg"><span class="lvi-av">AC</span><div><small>Agente de contratação · Prefeitura</small><b>A repactuação pode retroagir à data da nova convenção mesmo pedida depois?</b></div></div>' +
      '<div class="lvi-digit"><span class="lvi-av esp">✓</span>Especialista Licitacon está respondendo<i></i><i></i><i></i></div>' +
      '<div class="lvi-resp"><span class="lvi-oficial">✓ Resposta oficial</span><p>Sim, desde que o pedido venha antes da prorrogação ou do fim do contrato. Os efeitos financeiros contam da data-base da convenção…</p><small>Especialista Licitacon · com 3 decisões citadas</small></div>';
    var perg = c.querySelector(".lvi-perg"), dig = c.querySelector(".lvi-digit"), resp = c.querySelector(".lvi-resp"), selo = c.querySelector(".lvi-oficial");
    return {
      el: c, prompt: "A repactuação pode retroagir à data da convenção?",
      inicio: function () { perg.style.opacity = "0"; dig.style.opacity = "0"; resp.style.opacity = "0"; },
      rodar: async function (vivo) {
        await anima(perg, { opacity: [0, 1], y: [14, 0] }, { duration: 0.45, ease: SUAVE });
        if (!vivo()) return;
        await anima(dig, { opacity: [0, 1] }, { duration: 0.3 });
        await espera(1300); if (!vivo()) return;
        await anima(dig, { opacity: [1, 0] }, { duration: 0.2 });
        await anima(resp, { opacity: [0, 1], y: [18, 0], scale: [0.97, 1] }, { type: "spring", stiffness: 260, damping: 22 });
        if (!vivo()) return;
        anima(selo, { scale: [0.7, 1.12, 1] }, { duration: 0.5 });
      },
      final: function () { perg.style.opacity = ""; dig.style.opacity = "0"; resp.style.opacity = ""; }
    };
  }

  function cenaConsultoria() {
    var c = el("div", "lvi-cena");
    var mod = [["✎", "Consultoria por escrito", "até 5 dias úteis", "R$ 390"], ["▷", "Vídeo gravado", "até 7 dias úteis · até 20 min", "R$ 590"], ["◉", "Reunião ao vivo", "60 min · agendada em até 7 dias úteis", "R$ 490"]];
    c.innerHTML = '<div class="lvi-doc-cab"><b>Consultoria técnica</b><span class="lvi-selo">Especialista</span></div>' +
      '<div class="lvi-mods">' + mod.map(function (m) { return '<div class="lvi-mod"><i>' + m[0] + "</i><div><b>" + m[1] + "</b><small>" + m[2] + "</small></div><em>" + m[3] + "</em></div>"; }).join("") + "</div>" +
      '<div class="lvi-inclui">No Pro: 1 consultoria por escrito por mês incluída</div>' +
      '<div class="lvi-trilha"><span>Pedido enviado</span><span>Em análise</span><span>Relatório entregue</span><i><u></u></i></div>';
    var mods = c.querySelectorAll(".lvi-mod"), inclui = c.querySelector(".lvi-inclui"), etapas = c.querySelectorAll(".lvi-trilha span"), barra = c.querySelector(".lvi-trilha u");
    return {
      el: c, prompt: "Preciso de uma análise por escrito do meu caso",
      inicio: function () {
        Array.prototype.forEach.call(mods, function (m) { m.classList.remove("on"); m.style.opacity = "0"; });
        inclui.style.opacity = "0"; barra.style.transform = "scaleX(0)";
        Array.prototype.forEach.call(etapas, function (e) { e.classList.remove("on"); });
      },
      rodar: async function (vivo) {
        await anima(mods, { opacity: [0, 1], x: [-14, 0] }, { duration: 0.4, delay: M.stagger(0.12), ease: SUAVE });
        if (!vivo()) return;
        mods[0].classList.add("on");
        await anima(mods[0], { scale: [1, 1.03, 1] }, { duration: 0.4 });
        await anima(inclui, { opacity: [0, 1], y: [8, 0] }, { duration: 0.35 });
        if (!vivo()) return;
        etapas[0].classList.add("on");
        for (var i = 1; i < etapas.length; i++) {
          await anima(barra, { scaleX: [(i - 1) / 2, i / 2] }, { duration: 0.7, ease: SUAVE });
          if (!vivo()) return;
          etapas[i].classList.add("on");
        }
      },
      final: function () {
        Array.prototype.forEach.call(mods, function (m) { m.style.opacity = ""; }); mods[0].classList.add("on");
        inclui.style.opacity = ""; barra.style.transform = "";
        Array.prototype.forEach.call(etapas, function (e) { e.classList.add("on"); });
      }
    };
  }

  function cenaCursos() {
    var c = el("div", "lvi-cena");
    var cursos = [["Nova Lei de Licitações na prática", "24 h · Intermediário"], ["Gestão Contratual Sem Erros: reequilíbrios e repactuações", "12 h · Avançado"], ["Registro de preços e adesão a ata", "8 h · Avançado"]];
    c.innerHTML = '<div class="lvi-doc-cab"><b>Cursos · Renato Garcia</b><span class="lvi-selo">até 50% off no Pro</span></div>' +
      '<div class="lvi-player"><span class="lvi-play">▶</span><div><small>Assistindo</small><b></b></div><i><u></u></i></div>' +
      '<div class="lvi-cursos">' + cursos.map(function (k) { return '<div class="lvi-curso"><b>' + k[0] + "</b><small>" + k[1] + "</small></div>"; }).join("") + "</div>";
    var cards = c.querySelectorAll(".lvi-curso"), titulo = c.querySelector(".lvi-player b"), play = c.querySelector(".lvi-play"), barra = c.querySelector(".lvi-player u"), player = c.querySelector(".lvi-player");
    return {
      el: c, prompt: "Quero aprender reequilíbrio e repactuação",
      inicio: function () {
        Array.prototype.forEach.call(cards, function (k) { k.classList.remove("on"); k.style.opacity = "0"; });
        titulo.textContent = cursos[1][0]; barra.style.transform = "scaleX(0)"; player.style.opacity = "0";
      },
      rodar: async function (vivo) {
        await anima(cards, { opacity: [0, 1], y: [16, 0] }, { duration: 0.45, delay: M.stagger(0.12), ease: SUAVE });
        if (!vivo()) return;
        for (var i = 0; i < 2; i++) { cards[i].classList.add("on"); await espera(380); if (!vivo()) return; cards[i].classList.remove("on"); }
        cards[1].classList.add("on");
        await anima(player, { opacity: [0, 1], y: [-10, 0] }, { duration: 0.4, ease: SUAVE });
        if (!vivo()) return;
        anima(play, { scale: [1, 0.8, 1] }, { duration: 0.35 });
        await anima(barra, { scaleX: [0, 0.62] }, { duration: 1.6, ease: "linear" });
      },
      final: function () {
        Array.prototype.forEach.call(cards, function (k) { k.style.opacity = ""; }); cards[1].classList.add("on");
        barra.style.transform = "scaleX(0.62)"; player.style.opacity = "";
      }
    };
  }

  function montarDemo(caixa) {
    var cenas = [cenaParecer(), cenaElaborar(), cenaCalc(), cenaGestao(), cenaBiblioteca(), cenaForum(), cenaConsultoria(), cenaCursos()];
    var nomes = ["Parecerista", "Elaborador", "Calculadora", "Gestão", "Biblioteca", "Fórum", "Consultoria", "Cursos"];
    var icones = ["✦", "✎", "%", "▦", "⌕", "◍", "◈", "▤"];
    var jan = el("div", "lvi-jan");
    jan.innerHTML = '<div class="lvi-jan-barra"><i></i><i></i><i></i><span>Licitacon · painel</span><em class="lvi-vivo">ao vivo</em></div>' +
      '<div class="lvi-abas">' + nomes.map(function (n, i) { return '<span class="lvi-aba" title="' + n + '"><i>' + icones[i] + "</i><em>" + n + "</em></span>"; }).join("") + '<i class="lvi-aba-marca"></i></div>' +
      '<div class="lvi-corpo"></div><div class="lvi-campo"><span class="lvi-campo-txt"></span><i class="lvi-caret"></i><button type="button" class="lvi-campo-btn">↑</button></div>';
    var corpo = jan.querySelector(".lvi-corpo"), abas = jan.querySelectorAll(".lvi-aba"), marca = jan.querySelector(".lvi-aba-marca"), campo = jan.querySelector(".lvi-campo-txt");
    cenas.forEach(function (c) { corpo.appendChild(c.el); });
    caixa.appendChild(jan);
    // só a setinha é para leitores de tela; o resto da janela é ilustração
    ["lvi-jan-barra", "lvi-abas", "lvi-corpo", "lvi-campo-txt", "lvi-caret"].forEach(function (k) { var x = jan.querySelector("." + k); if (x) x.setAttribute("aria-hidden", "true"); });
    // a setinha leva à página da ferramenta que está na tela
    var PAGINAS_DEMO = ["agente", "elaborar", "calculadora", "gestao", "biblioteca", "forum", "consultoria", "cursos"];
    var NOMES_DEMO = ["O Parecerista", "O Elaborador", "a Calculadora", "a Gestão Contratual", "a Biblioteca Jurídica", "o Fórum", "a Consultoria", "os Cursos"];
    var seta = jan.querySelector(".lvi-campo-btn"), abaAtual = 0;
    function rotularSeta() { var r = "Abrir " + NOMES_DEMO[abaAtual]; seta.setAttribute("aria-label", r); seta.title = r; }
    rotularSeta();
    seta.addEventListener("click", function () { abrir(PAGINAS_DEMO[abaAtual]); });

    function marcarAba(i, instantaneo) {
      Array.prototype.forEach.call(abas, function (a, k) { a.classList.toggle("on", k === i); });
      abaAtual = i; rotularSeta();
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

  // ---------------------------------------------------------------- como funciona: passos + uma ilustração
  // Compacto, do tamanho de uma tela: a lista de passos à esquerda e uma ilustração à direita. Enquanto a
  // seção está à vista os passos avançam sozinhos (a barrinha mostra o tempo de cada um); clicar num passo
  // vai direto para ele. A rolagem da página nunca é segurada.
  function montarHist(sec) {
    var palco = sec.querySelector(".lvi-palco"), botoes = sec.querySelectorAll(".lvi-passo");
    if (!palco || botoes.length < 4) return;
    var barras = Array.prototype.map.call(botoes, function (b) { var i = el("i", "lvi-passo-barra"); b.appendChild(i); return i; });

    // etapa 1: os arquivos voam para a área, sobem (barra) e ganham o ✓; depois o regime é escolhido
    var ARQ = [["PDF", "", "Edital.pdf", "pregão eletrônico"], ["DOCX", "docx", "ETP.docx", "estudo técnico preliminar"], ["XLSX", "xlsx", "Planilha.xlsx", "custos e formação de preços"]];
    var e1 = el("div", "lvi-et");
    e1.innerHTML = '<div class="lvi-envio"><div class="lvi-zona"><div class="lvi-zona-txt"><div><div class="lvi-zona-ic">⇪</div><strong>Solte os documentos aqui</strong>PDF ou Excel · até 3 documentos</div></div>' +
      '<div class="lvi-fila">' + ARQ.map(function (a) {
        return '<div class="lvi-arq ' + a[1] + '"><i>' + a[0] + "</i><div>" + a[2] + "<small>" + a[3] + '</small><span class="lvi-up"><u></u></span></div><b class="lvi-ok">✓</b></div>';
      }).join("") + "</div></div>" +
      '<div class="lvi-regime"><small>Regime</small><span>Lei 14.133</span><span>Lei 13.303</span><span>Lei 13.019</span></div></div>';
    var zona = e1.querySelector(".lvi-zona"), zonaTxt = e1.querySelector(".lvi-zona-txt"), arqs = e1.querySelectorAll(".lvi-arq");
    var ups = e1.querySelectorAll(".lvi-up u"), oks = e1.querySelectorAll(".lvi-ok"), regime = e1.querySelector(".lvi-regime"), regs = e1.querySelectorAll(".lvi-regime span");
    var origem = [[-230, -110, -16], [240, -40, 12], [-210, 150, 10]];

    // etapa 2: a leitura marca as linhas, aponta os artigos e preenche a verificação ao lado
    var cl = [[94, 80, 66], [88, 72], [96, 84, 58], [90, 70], [92, 86, 62], [80, 68]];
    var NOTAS = { 2: ["alta", "art. 82, § 1º"], 4: ["media", "art. 86, § 8º"] };
    var CHECK = [["baixa", "Planejamento", "baixa"], ["ok", "Habilitação", "ok"], ["alta", "Julgamento", "alta"], ["media", "Adesão à ata", "média"]];
    var e2 = el("div", "lvi-et");
    e2.innerHTML = '<div class="lvi-leit"><div class="lvi-folha"><span class="lvi-cont">item 1 de 62</span><h4>Edital · condições de participação</h4>' +
      cl.map(function (l, i) {
        var n = NOTAS[i];
        return '<div class="cl' + (n ? " alvo" : "") + '"><em>' + (i + 7) + ".</em><div>" + l.map(function (w) { return '<span style="width:' + w + '%"></span>'; }).join("") + "</div>" +
          (n ? '<b class="lvi-nota ' + n[0] + '">' + n[1] + "</b>" : "") + "</div>";
      }).join("") + '<i class="lvi-feixe"></i></div>' +
      '<ul class="lvi-check">' + CHECK.map(function (k) { return '<li data-g="' + k[0] + '">' + k[1] + "<em>" + k[2] + "</em></li>"; }).join("") + "</ul></div>";
    var folha = e2.querySelector(".lvi-folha"), feixe = e2.querySelector(".lvi-feixe"), cont = e2.querySelector(".lvi-cont");
    var cls = e2.querySelectorAll(".cl"), alvos = e2.querySelectorAll(".cl.alvo"), notas = e2.querySelectorAll(".lvi-nota"), checks = e2.querySelectorAll(".lvi-check li");

    // etapa 3: gotas de luz correm das fontes até o edital, que pulsa e termina conferido
    var nos = [["Lei 14.133/2021", "texto da lei"], ["TCU", "acórdãos e súmulas"], ["Tribunais de Contas", "dos 26 estados e do DF"], ["STJ e STF", "temas e precedentes"], ["PGEs e TJs", "pareceres e decisões"], ["Roteiro Licitacon", "verificação item a item"]];
    var e3 = el("div", "lvi-et");
    e3.innerHTML = '<div class="lvi-rede">' + nos.map(function () { return '<i class="lvi-fio"></i><b class="lvi-gota"></b>'; }).join("") +
      '<div class="lvi-nucleo"><i class="lvi-onda"></i><div><i>§</i>Seu edital<small class="lvi-nuc-st">conferindo…</small></div></div>' +
      nos.map(function (n) { return '<div class="lvi-no">' + n[0] + "<small>" + n[1] + "</small></div>"; }).join("") + "</div>";
    var fios = e3.querySelectorAll(".lvi-fio"), gotas = e3.querySelectorAll(".lvi-gota"), nosEl = e3.querySelectorAll(".lvi-no");
    var onda = e3.querySelector(".lvi-onda"), nucSt = e3.querySelector(".lvi-nuc-st"), nucleo = e3.querySelector(".lvi-nucleo");

    // etapa 4: o parecer é gerado, os apontamentos entram, o PDF é baixado e o selo carimba
    var e4 = el("div", "lvi-et");
    e4.innerHTML = '<div class="lvi-par"><div class="lvi-par-cab"><i>✦</i><div><b>Parecer técnico</b><small class="lvi-par-st">Gerando o parecer…</small></div></div>' +
      '<div class="lvi-gerar"><u></u></div>' + achadosHtml() +
      '<div class="lvi-resumo"><span class="alta">1 alta</span><span class="media">1 média</span><span class="baixa">1 baixa</span></div>' +
      '<div class="lvi-par-pe"><span>Baixar em PDF</span><span>Abrir no Word</span></div></div>' +
      '<div class="lvi-carimbo">Com a lei e a juris&shy;prudência</div>';
    var par = e4.querySelector(".lvi-par"), parSt = e4.querySelector(".lvi-par-st"), gerar = e4.querySelector(".lvi-gerar u"), achs = e4.querySelectorAll(".lvi-ach");
    var resumo = e4.querySelector(".lvi-resumo"), pe = e4.querySelector(".lvi-par-pe"), pdf = e4.querySelector(".lvi-par-pe span"), carimbo = e4.querySelector(".lvi-carimbo");

    var etapas = [e1, e2, e3, e4];
    etapas.forEach(function (e) { palco.appendChild(e); });

    function posicionarRede() {
      var w = palco.clientWidth, h = palco.clientHeight, rx = Math.min(w * 0.36, 230), ry = Math.min(h * 0.36, 175);
      Array.prototype.forEach.call(nosEl, function (n, i) {
        var a = (i / nosEl.length) * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        // a etiqueta inteira dentro do quadro, com 8px de folga
        var nw = n.offsetWidth, nh = n.offsetHeight;
        var nx = Math.min(w / 2 - 8 - nw, Math.max(-w / 2 + 8, x - nw / 2)), ny = Math.min(h / 2 - 8 - nh, Math.max(-h / 2 + 8, y - nh / 2));
        n.dataset.x = nx; n.dataset.y = ny;
        var cx = nx + nw / 2, cy = ny + nh / 2, d = Math.sqrt(cx * cx + cy * cy);
        fios[i].style.width = d + "px"; fios[i].dataset.a = Math.atan2(cy, cx) * 180 / Math.PI;
        gotas[i].dataset.x = cx; gotas[i].dataset.y = cy;
      });
    }

    function faixa(q, ini, dur) { return Math.min(1, Math.max(0, (q - ini) / dur)); }
    function sai(t) { return 1 - Math.pow(1 - t, 3); }
    // aplica o estado de uma etapa com o avanço p (0 a 1) — chamado a cada quadro da animação do passo
    function pintar(i, p) {
      var q = Math.min(1, Math.max(0, p));
      if (i === 0) {
        zonaTxt.style.opacity = String(1 - faixa(q, 0, 0.15));
        Array.prototype.forEach.call(arqs, function (a, k) {
          var t = faixa(q, 0.04 + k * 0.1, 0.22), e = sai(t), o = origem[k];
          a.style.transform = "translate(" + o[0] * (1 - e) + "px," + o[1] * (1 - e) + "px) rotate(" + o[2] * (1 - e) + "deg)";
          a.style.opacity = String(Math.min(1, t * 2));
          var u = faixa(q, 0.38 + k * 0.1, 0.18);
          ups[k].style.transform = "scaleX(" + u + ")";
          oks[k].style.opacity = u >= 1 ? "1" : "0";
          oks[k].style.transform = "scale(" + (u >= 1 ? 1 : 0.4) + ")";
        });
        zona.classList.toggle("pronta", q > 0.72);
        regime.style.opacity = String(faixa(q, 0.7, 0.1));
        Array.prototype.forEach.call(regs, function (r, k) { r.classList.toggle("on", k === 0 && q > 0.84); });
      } else if (i === 1) {
        var hgt = folha.offsetHeight;
        feixe.style.transform = "translateY(" + (-46 + (hgt + 46) * q) + "px)";
        cont.textContent = "item " + Math.max(1, Math.round(62 * q)) + " de 62";
        Array.prototype.forEach.call(cls, function (c, k) { c.classList.toggle("lida", q > (k + 1) / (cls.length + 1)); });
        Array.prototype.forEach.call(alvos, function (a, k) {
          var t = faixa(q, 0.36 + k * 0.24, 0.08);
          a.style.setProperty("--alvo", t > 0 ? "1" : "0");
          notas[k].style.opacity = String(t);
          notas[k].style.transform = "scale(" + (0.6 + 0.4 * sai(t)) + ")";
        });
        Array.prototype.forEach.call(checks, function (c, k) { c.classList.toggle("feito", q > 0.22 + k * 0.2); });
      } else if (i === 2) {
        Array.prototype.forEach.call(nosEl, function (n, k) {
          var t = faixa(q, k * 0.06, 0.22), e = sai(t);
          n.style.transform = "translate(" + (+n.dataset.x * e) + "px," + (+n.dataset.y * e) + "px) scale(" + (0.6 + 0.4 * e) + ")";
          n.style.opacity = String(t);
          fios[k].style.transform = "rotate(" + fios[k].dataset.a + "deg) scaleX(" + e + ")";
          var vivo = q > 0.42 && q < 0.9, f = (((q - 0.42) / 0.48) * 2.4 + k * 0.17) % 1;
          gotas[k].style.opacity = vivo ? String(Math.sin(Math.PI * f)) : "0";
          gotas[k].style.transform = "translate(" + (+gotas[k].dataset.x * (1 - f)) + "px," + (+gotas[k].dataset.y * (1 - f)) + "px)";
        });
        var w = q > 0.42 ? ((q - 0.42) * 4) % 1 : 0;
        onda.style.opacity = q > 0.42 && q < 0.92 ? String(1 - w) : "0";
        onda.style.transform = "scale(" + (1 + w * 0.45) + ")";
        var feito = q > 0.88;
        nucSt.textContent = feito ? "✓ conferido" : "conferindo…";
        nucleo.classList.toggle("feito", feito);
      } else {
        par.style.transform = "translateY(" + 16 * (1 - sai(faixa(q, 0, 0.12))) + "px)";
        gerar.style.transform = "scaleX(" + faixa(q, 0.02, 0.26) + ")";
        parSt.textContent = q < 0.3 ? "Gerando o parecer…" : "Edital de pregão eletrônico · 3 apontamentos";
        Array.prototype.forEach.call(achs, function (a, k) {
          var t = faixa(q, 0.3 + k * 0.09, 0.12);
          a.style.opacity = String(t);
          a.style.transform = "translateX(" + -12 * (1 - sai(t)) + "px)";
        });
        resumo.style.opacity = String(faixa(q, 0.6, 0.08));
        pe.style.opacity = String(faixa(q, 0.64, 0.08));
        pdf.style.transform = "scale(" + (q > 0.74 && q < 0.8 ? 0.94 : 1) + ")";
        var baixou = q > 0.8;
        if (pdf.classList.contains("ok") !== baixou) { pdf.classList.toggle("ok", baixou); pdf.textContent = baixou ? "✓ PDF baixado" : "Baixar em PDF"; }
        var tc = faixa(q, 0.86, 0.1);
        carimbo.style.opacity = String(tc);
        carimbo.style.transform = "rotate(-12deg) scale(" + (1.6 - 0.6 * sai(tc)) + ")";
      }
    }

    var atual = -1, vez = 0, st = vigiar(sec), barraAnim = null;
    var DUR = [2.6, 3.2, 3, 3.4], PAUSA = 1.6;
    function mostrar(i) {
      Array.prototype.forEach.call(botoes, function (b, k) { b.classList.toggle("on", k === i); });
      function zerar() { barras.forEach(function (x, k) { if (k !== i) x.style.transform = "scaleX(0)"; }); }
      zerar(); requestAnimationFrame(zerar); // de novo no quadro seguinte: a barra interrompida pode gravar o último valor
      if (i === 2) posicionarRede();
      if (atual === i) return;
      var velha = etapas[atual], nova = etapas[i];
      if (velha) { velha.classList.remove("on"); if (!REDUZ) anima(velha, { opacity: [1, 0], scale: [1, 0.97] }, { duration: 0.3 }).then(function () { velha.style.transform = ""; velha.style.opacity = ""; }); }
      nova.classList.add("on");
      if (!REDUZ) anima(nova, { opacity: [0, 1], scale: [1.03, 1] }, { duration: 0.4, ease: SUAVE }).then(function () { nova.style.transform = ""; nova.style.opacity = ""; });
      atual = i;
    }
    posicionarRede();
    window.addEventListener("resize", function () { if (sec.isConnected && atual === 2) { posicionarRede(); pintar(2, 1); } });

    if (REDUZ) {
      etapas.forEach(function (e, i) { pintar(i, 1); });
      mostrar(3);
      Array.prototype.forEach.call(botoes, function (b, i) { b.addEventListener("click", function () { mostrar(i); }); });
      return;
    }
    async function tocar(i, t) {
      var vivo = function () { return t === vez && sec.isConnected; };
      if (!(await quandoVisivel(sec, st)) || !vivo()) return;
      if (barraAnim) { try { if (barraAnim.cancel) barraAnim.cancel(); else barraAnim.stop(); } catch (e) { /* segue */ } barraAnim = null; }
      pintar(i, 0);
      mostrar(i);
      try { barraAnim = animate(barras[i], { scaleX: [0, 1] }, { duration: DUR[i] + PAUSA, ease: "linear" }); } catch (e) { barraAnim = null; }
      try {
        await animate(0, 1, { duration: DUR[i], ease: "easeInOut", onUpdate: function (v) { if (vivo()) pintar(i, v); } }).finished;
      } catch (e) { /* segue */ }
      if (!vivo()) return;
      pintar(i, 1);
      await espera(PAUSA * 1000);
      if (!vivo()) return;
      ir((i + 1) % etapas.length);
    }
    function ir(i) { vez++; tocar(i, vez); }
    Array.prototype.forEach.call(botoes, function (b, i) { b.addEventListener("click", function () { ir(i); }); });
    etapas.forEach(function (e, i) { pintar(i, 0); });
    mostrar(0);
    ir(0);
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
