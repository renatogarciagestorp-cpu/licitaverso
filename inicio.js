/* Licitacon — página inicial animada, com Motion (window.Motion). Estilos em inicio.css.
 *
 * A página é montada pelo runtime do Claude Design. A marcação traz espaços vazios com data-lvi="…" e este
 * arquivo os preenche quando aparecem (e de novo se a pessoa sai e volta para o início):
 *   demo    — janela do topo que troca sozinha entre Parecerista, Elaborador, Calculadora e Gestão
 *   faixa   — decisões reais recentes do acervo (inicio-destaques.json), rolando sem parar
 *   fontes  — órgãos e normas, rolando no sentido contrário
 *   frase   — frase grande que acende palavra por palavra com a rolagem
 *   hist    — "Como funciona O Parecerista", preso na tela enquanto os passos avançam com a rolagem
 *   vitrine — leque com as ferramentas: passa sozinho, dá para arrastar e tocar para abrir
 *   data-lv3d — cenas 3D (Three.js) de cada ferramenta, em inicio3d.js, baixado só quando a primeira chega perto
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

  // Gestão: painel da carteira de contratos (exemplo ilustrativo), como o Painel da Organização do site
  function cenaGestao() {
    var c = el("div", "lvi-cena");
    var KPI = [["12", "contratos"], ["R$ 8,4 mi", "por ano"], ["3", "prazos em 60 dias"]];
    var SIT = [["v", "Vigentes", 9], ["a", "Vencendo", 2], ["x", "Vencidos", 1]];
    var PRAZOS = [["01/12", "Reajuste pela anualidade", "Vigilância · 018/2024", "rj"], ["15/12", "Repactuação · nova convenção", "Limpeza · 025/2025", "rp"], ["20/01", "Iniciar a prorrogação", "Manutenção predial · 007/2023", "pr"]];
    c.innerHTML = '<div class="lvi-doc-cab"><b>Painel da Organização</b><span class="lvi-selo">Carteira</span></div>' +
      '<div class="lvi-kpis">' + KPI.map(function (k) { return "<div><b>" + k[0] + "</b><small>" + k[1] + "</small></div>"; }).join("") + "</div>" +
      '<div class="lvi-sits">' + SIT.map(function (s) { return '<div class="lvi-sit ' + s[0] + '"><span>' + s[1] + '</span><i><u style="width:' + (s[2] / 12 * 100).toFixed(1) + '%"></u></i><b>' + s[2] + "</b></div>"; }).join("") + "</div>" +
      '<div class="lvi-prz-cab">Próximos prazos</div><div class="lvi-przs">' +
      PRAZOS.map(function (p) { return '<div class="lvi-prz ' + p[3] + '"><span>' + p[0] + "</span><div><b>" + p[1] + "</b><small>" + p[2] + "</small></div></div>"; }).join("") +
      '</div><div class="lvi-email">✉ Aviso enviado por e-mail · reajuste da Vigilância</div>';
    var kpis = c.querySelectorAll(".lvi-kpis > div"), barras = c.querySelectorAll(".lvi-sit u"), nums = c.querySelectorAll(".lvi-sit b");
    var przs = c.querySelectorAll(".lvi-prz"), email = c.querySelector(".lvi-email");
    return {
      el: c, prompt: "Quais prazos da carteira vencem nos próximos 60 dias?",
      inicio: function () {
        Array.prototype.forEach.call(kpis, function (k) { k.style.opacity = "0"; });
        Array.prototype.forEach.call(barras, function (b) { b.style.transform = "scaleX(0)"; });
        Array.prototype.forEach.call(nums, function (n) { n.style.opacity = "0"; });
        Array.prototype.forEach.call(przs, function (p) { p.style.opacity = "0"; p.classList.remove("on"); });
        email.style.opacity = "0";
      },
      rodar: async function (vivo) {
        await anima(kpis, { opacity: [0, 1], y: [10, 0] }, { duration: 0.4, delay: M.stagger(0.12), ease: SUAVE });
        if (!vivo()) return;
        anima(nums, { opacity: [0, 1] }, { duration: 0.3, delay: M.stagger(0.15, { startDelay: 0.4 }) });
        await anima(barras, { scaleX: [0, 1] }, { duration: 0.8, delay: M.stagger(0.15), ease: SUAVE });
        if (!vivo()) return;
        await anima(przs, { opacity: [0, 1], x: [-14, 0] }, { duration: 0.4, delay: M.stagger(0.2), ease: SUAVE });
        if (!vivo()) return;
        przs[0].classList.add("on");
        anima(przs[0], { scale: [1, 1.03, 1] }, { duration: 0.45 });
        await anima(email, { opacity: [0, 1], y: [10, 0] }, { type: "spring", stiffness: 300, damping: 22 });
      },
      final: function () {
        Array.prototype.forEach.call(kpis, function (k) { k.style.opacity = ""; });
        Array.prototype.forEach.call(barras, function (b) { b.style.transform = ""; });
        Array.prototype.forEach.call(nums, function (n) { n.style.opacity = ""; });
        Array.prototype.forEach.call(przs, function (p) { p.style.opacity = ""; }); przs[0].classList.add("on");
        email.style.opacity = "";
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

    // etapa 1: os arquivos voam para a área, sobem (barra) e ganham o ✓; o regime é escolhido e "Analisar" é pressionado
    var ARQ = [["PDF", "", "Edital.pdf", "pregão eletrônico · 2,4 MB"], ["DOCX", "docx", "ETP.docx", "estudo técnico preliminar · 860 KB"], ["XLSX", "xlsx", "Planilha.xlsx", "custos e formação de preços · 310 KB"]];
    var e1 = el("div", "lvi-et");
    e1.innerHTML = '<div class="lvi-envio"><div class="lvi-zona"><div class="lvi-zona-txt"><div><div class="lvi-zona-ic">⇪</div><strong>Solte os documentos aqui</strong>PDF ou Excel · até 3 documentos</div></div>' +
      '<div class="lvi-fila">' + ARQ.map(function (a) {
        return '<div class="lvi-arq ' + a[1] + '"><i>' + a[0] + "</i><div>" + a[2] + "<small>" + a[3] + '</small><span class="lvi-up"><u></u></span></div><b class="lvi-ok">✓</b></div>';
      }).join("") + "</div></div>" +
      '<div class="lvi-regime"><small>Regime</small><span>Lei 14.133</span><span>Lei 13.303</span><span>Lei 13.019</span></div>' +
      '<div class="lvi-analisar">Analisar 3 documentos <span>→</span></div></div>';
    var zona = e1.querySelector(".lvi-zona"), zonaTxt = e1.querySelector(".lvi-zona-txt"), arqs = e1.querySelectorAll(".lvi-arq");
    var ups = e1.querySelectorAll(".lvi-up u"), oks = e1.querySelectorAll(".lvi-ok"), regime = e1.querySelector(".lvi-regime"), regs = e1.querySelectorAll(".lvi-regime span");
    var analisar = e1.querySelector(".lvi-analisar");
    var origem = [[-230, -110, -16], [240, -40, 12], [-210, 150, 10]];

    // etapa 2: o edital com texto de verdade; o feixe lê, o marca-texto destaca o trecho e o comentário aparece na margem
    var CL = [
      ["7.1", "Poderão participar empresas do ramo pertinente ao objeto.", null],
      ["7.4", "O julgamento será por |lote único|, reunindo os 32 itens do registro de preços.", ["alta", "Alta", "Sem a justificativa do art. 82, § 1º"]],
      ["8.2", "Será admitida a adesão à ata por |órgãos federais e estaduais|.", ["media", "Média", "Adesão federal vedada (art. 86, § 8º)"]],
      ["9.1", "As quantidades foram estimadas no ETP de |12/03/2026|, anexo II.", ["baixa", "Baixa", "Data diverge do ETP"]],
      ["10.3", "A impugnação segue o art. 164 da Lei 14.133/2021.", null]
    ];
    var e2 = el("div", "lvi-et");
    e2.innerHTML = '<div class="lvi-ed"><div class="lvi-ed-cab"><b>Edital · pregão eletrônico</b><span class="lvi-ed-cont">item 1 de 62</span></div>' +
      CL.map(function (k) {
        var p = k[1].split("|"), txt = esc(p[0]) + (p.length > 1 ? '<mark><i></i><span>' + esc(p[1]) + "</span></mark>" + esc(p[2]) : "");
        return '<div class="lvi-ed-l"><em>' + k[0] + "</em><p>" + txt + "</p>" +
          (k[2] ? '<div class="lvi-ed-com ' + k[2][0] + '"><b>' + k[2][1] + "</b>" + esc(k[2][2]) + "</div>" : "<div></div>") + "</div>";
      }).join("") + '<i class="lvi-feixe"></i></div>';
    var ed = e2.querySelector(".lvi-ed"), edFeixe = e2.querySelector(".lvi-feixe"), edCont = e2.querySelector(".lvi-ed-cont");
    var edLinhas = e2.querySelectorAll(".lvi-ed-l"), edMarcas = e2.querySelectorAll(".lvi-ed-l mark"), edComs = e2.querySelectorAll(".lvi-ed-com");

    // etapa 3: quadro de provas — a cláusula ao lado da lei, da súmula e do roteiro, cada um conferido, e o veredito
    var FONTES = [
      ["Lei 14.133/2021 · art. 82, § 1º", "Menor preço por grupo de itens só quando demonstrada a inviabilidade da adjudicação por item e a vantagem técnica e econômica."],
      ["TCU · Súmula 247", "Adjudicação por item é a regra quando o objeto é divisível, sem prejuízo para o conjunto."],
      ["Roteiro Licitacon", "Parcelamento do objeto: justificativa no ETP e no edital."]
    ];
    var e3 = el("div", "lvi-et");
    e3.innerHTML = '<div class="lvi-ev"><div class="lvi-ev-cl"><small>Cláusula 7.4 do edital</small><p>O julgamento será por <mark><i></i><span>lote único</span></mark>, reunindo os 32 itens do registro de preços.</p></div>' +
      '<div class="lvi-ev-fontes">' + FONTES.map(function (f) { return '<div class="lvi-ev-f"><i class="lvi-ev-fio"></i><small>' + f[0] + "</small><p>" + f[1] + "</p><em>✓ conferido</em></div>"; }).join("") + "</div>" +
      '<div class="lvi-ev-ver"><b>Gravidade alta</b> falta a justificativa do art. 82, § 1º</div></div>';
    var evCl = e3.querySelector(".lvi-ev-cl"), evMarca = e3.querySelector(".lvi-ev-cl mark i"), evFs = e3.querySelectorAll(".lvi-ev-f");
    var evFios = e3.querySelectorAll(".lvi-ev-fio"), evOks = e3.querySelectorAll(".lvi-ev-f em"), evVer = e3.querySelector(".lvi-ev-ver");

    // etapa 4: o parecer sendo escrito, rolando dentro da folha; depois saem o PDF e o DOCX e o selo carimba
    var e4 = el("div", "lvi-et");
    e4.innerHTML = '<div class="lvi-pt"><div class="lvi-pt-folha"><div class="lvi-pt-rolo">' +
      '<div class="lvi-pt-b"><h5>Parecer técnico</h5><small>Edital de pregão eletrônico · Lei 14.133/2021</small></div>' +
      '<div class="lvi-pt-b"><h6>1. Relatório</h6><p>Análise do edital, do ETP e da planilha enviados, item a item, com o roteiro de verificação do Licitacon.</p></div>' +
      '<div class="lvi-pt-b"><h6>2. Análise</h6></div>' +
      '<div class="lvi-pt-b lvi-pt-ap alta"><b>2.1 Julgamento por lote · gravidade alta</b><p>Fundamento: Lei 14.133/2021, art. 82, § 1º; TCU, Súmula 247.</p><p>Providência: justificar o lote no ETP ou adjudicar por item.</p></div>' +
      '<div class="lvi-pt-b lvi-pt-ap media"><b>2.2 Adesão à ata · gravidade média</b><p>Fundamento: art. 86, § 8º.</p><p>Providência: excluir a adesão por órgãos federais.</p></div>' +
      '<div class="lvi-pt-b lvi-pt-ap baixa"><b>2.3 Data do ETP · gravidade baixa</b><p>Providência: corrigir a data no item 9.1.</p></div>' +
      '<div class="lvi-pt-b"><h6>3. Conclusão</h6><p>O edital pode seguir depois das providências indicadas. O parecer é opinativo: a decisão é sua.</p></div>' +
      '</div></div><div class="lvi-pt-arqs"><span class="pdf"><i>PDF</i>Parecer.pdf<small>✓ pronto</small></span><span class="doc"><i>DOCX</i>Parecer.docx<small>✓ pronto</small></span></div>' +
      '<div class="lvi-carimbo">Com a lei e a juris&shy;prudência</div></div>';
    var ptFolha = e4.querySelector(".lvi-pt-folha"), ptRolo = e4.querySelector(".lvi-pt-rolo"), ptBs = e4.querySelectorAll(".lvi-pt-b");
    var ptArqs = e4.querySelectorAll(".lvi-pt-arqs > span"), carimbo = e4.querySelector(".lvi-carimbo");

    var etapas = [e1, e2, e3, e4];
    etapas.forEach(function (e) { palco.appendChild(e); });

    // no computador, o palco inclina um pouco seguindo o mouse
    if (!REDUZ && matchMedia("(hover: hover) and (min-width: 981px)").matches) {
      palco.addEventListener("pointermove", function (e) {
        var r = palco.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
        animate(palco, { rotateY: dx * 6, rotateX: -dy * 5, transformPerspective: 1400 }, { type: "spring", stiffness: 140, damping: 20 });
      });
      palco.addEventListener("pointerleave", function () { animate(palco, { rotateY: 0, rotateX: 0, transformPerspective: 1400 }, { type: "spring", stiffness: 140, damping: 20 }); });
    }

    function faixa(q, ini, dur) { return Math.min(1, Math.max(0, (q - ini) / dur)); }
    function sai(t) { return 1 - Math.pow(1 - t, 3); }
    // aplica o estado de uma etapa com o avanço p (0 a 1) — chamado a cada quadro da animação do passo
    function pintar(i, p) {
      var q = Math.min(1, Math.max(0, p));
      if (i === 0) {
        zonaTxt.style.opacity = String(1 - faixa(q, 0, 0.12));
        Array.prototype.forEach.call(arqs, function (a, k) {
          var t = faixa(q, 0.03 + k * 0.09, 0.2), e = sai(t), o = origem[k];
          a.style.transform = "translate(" + o[0] * (1 - e) + "px," + o[1] * (1 - e) + "px) rotate(" + o[2] * (1 - e) + "deg)";
          a.style.opacity = String(Math.min(1, t * 2));
          var u = faixa(q, 0.32 + k * 0.09, 0.16);
          ups[k].style.transform = "scaleX(" + u + ")";
          oks[k].style.opacity = u >= 1 ? "1" : "0";
          oks[k].style.transform = "scale(" + (u >= 1 ? 1 : 0.4) + ")";
        });
        zona.classList.toggle("pronta", q > 0.62);
        regime.style.opacity = String(faixa(q, 0.62, 0.08));
        Array.prototype.forEach.call(regs, function (r, k) { r.classList.toggle("on", k === 0 && q > 0.72); });
        var ta = faixa(q, 0.78, 0.08);
        analisar.style.opacity = String(ta);
        analisar.style.transform = "translateY(" + 8 * (1 - sai(ta)) + "px) scale(" + (q > 0.9 && q < 0.96 ? 0.95 : 1) + ")";
        analisar.classList.toggle("on", q > 0.9);
      } else if (i === 1) {
        var topo = edLinhas[0].offsetTop, fim = edLinhas[edLinhas.length - 1].offsetTop + edLinhas[edLinhas.length - 1].offsetHeight;
        var y = topo - 20 + (fim - topo + 20) * faixa(q, 0.05, 0.75);
        edFeixe.style.transform = "translateY(" + y + "px)";
        edFeixe.style.opacity = q > 0.03 && q < 0.85 ? "1" : "0";
        edCont.textContent = "item " + Math.max(1, Math.round(62 * faixa(q, 0.05, 0.75))) + " de 62";
        Array.prototype.forEach.call(edLinhas, function (l) {
          var meio = l.offsetTop + l.offsetHeight / 2;
          l.classList.toggle("lida", y > meio);
        });
        Array.prototype.forEach.call(edLinhas, function (l) {
          var mk = l.querySelector("mark i"), cm = l.querySelector(".lvi-ed-com");
          if (!mk) return;
          var base = (l.offsetTop + l.offsetHeight / 2 - topo + 20) / (fim - topo + 20) * 0.75 + 0.05;
          var tm = faixa(q, base, 0.07), tc = faixa(q, base + 0.04, 0.08);
          mk.style.transform = "scaleX(" + tm + ")";
          cm.style.opacity = String(tc);
          cm.style.transform = "translateX(" + 12 * (1 - sai(tc)) + "px)";
        });
      } else if (i === 2) {
        var tcl = faixa(q, 0, 0.1);
        evCl.style.opacity = String(tcl);
        evCl.style.transform = "translateY(" + 10 * (1 - sai(tcl)) + "px)";
        evMarca.style.transform = "scaleX(" + faixa(q, 0.1, 0.1) + ")";
        Array.prototype.forEach.call(evFs, function (f, k) {
          var t = faixa(q, 0.2 + k * 0.17, 0.12), e = sai(t);
          f.style.opacity = String(t);
          f.style.transform = "translateX(" + 22 * (1 - e) + "px)";
          evFios[k].style.transform = "scaleX(" + e + ")";
          var to = faixa(q, 0.3 + k * 0.17, 0.06);
          evOks[k].style.opacity = String(to);
          evOks[k].style.transform = "scale(" + (0.6 + 0.4 * sai(to)) + ")";
          f.classList.toggle("ok", to >= 1);
        });
        var tv = faixa(q, 0.8, 0.1);
        evVer.style.opacity = String(tv);
        evVer.style.transform = "scale(" + (0.9 + 0.1 * sai(tv)) + ")";
      } else {
        Array.prototype.forEach.call(ptBs, function (b, k) {
          var t = faixa(q, 0.02 + k * 0.075, 0.08);
          b.style.opacity = String(t);
          b.style.transform = "translateY(" + 8 * (1 - sai(t)) + "px)";
        });
        var sobra = Math.max(0, ptRolo.scrollHeight - ptFolha.clientHeight + 16);
        ptRolo.style.transform = "translateY(" + -sobra * sai(faixa(q, 0.2, 0.42)) + "px)";
        Array.prototype.forEach.call(ptArqs, function (a, k) {
          var t = faixa(q, 0.7 + k * 0.07, 0.1), e = sai(t);
          a.style.opacity = String(t);
          a.style.transform = "translateY(" + 18 * (1 - e) + "px) scale(" + (0.85 + 0.15 * e) + ")";
          a.classList.toggle("ok", t >= 1);
        });
        var tc = faixa(q, 0.88, 0.08);
        carimbo.style.opacity = String(tc);
        carimbo.style.transform = "rotate(-12deg) scale(" + (1.6 - 0.6 * sai(tc)) + ")";
      }
    }

    var atual = -1, vez = 0, st = vigiar(sec), barraAnim = null;
    var DUR = [3, 3.8, 3.6, 4], PAUSA = 1.9;
    function mostrar(i) {
      Array.prototype.forEach.call(botoes, function (b, k) { b.classList.toggle("on", k === i); });
      function zerar() { barras.forEach(function (x, k) { if (k !== i) x.style.transform = "scaleX(0)"; }); }
      zerar(); requestAnimationFrame(zerar); // de novo no quadro seguinte: a barra interrompida pode gravar o último valor
      if (atual === i) return;
      var velha = etapas[atual], nova = etapas[i];
      if (velha) { velha.classList.remove("on"); if (!REDUZ) anima(velha, { opacity: [1, 0], scale: [1, 0.97] }, { duration: 0.3 }).then(function () { velha.style.transform = ""; velha.style.opacity = ""; }); }
      nova.classList.add("on");
      if (!REDUZ) anima(nova, { opacity: [0, 1], scale: [1.03, 1] }, { duration: 0.4, ease: SUAVE }).then(function () { nova.style.transform = ""; nova.style.opacity = ""; });
      atual = i;
    }
    window.addEventListener("resize", function () { if (sec.isConnected && atual >= 0) pintar(atual, 1); });

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

    // Leque: o cartão da frente fica reto no centro; os vizinhos se abrem para os lados, um pouco inclinados e
    // mais ao fundo. "ang" anda em graus (passo = um cartão) para o arrasto e a mola seguirem contínuos.
    var esp = 200, ang = 0, vel = 0, arrastando = false, moveu = 0, ultX = 0, frente = -1, foco = null, st = vigiar(palco), animAng = null, girando = false;
    var VISIVEIS = 3.4;
    function medir() {
      var w = cartoes[0].offsetWidth || 220, W = palco.offsetWidth || 1000;
      esp = Math.min(w * 1.04, Math.max(w * 0.6, (W - w) / 6));
    }
    function pintar() {
      var melhor = 99, mi = 0;
      cartoes.forEach(function (c, i) {
        var d = ((i * passo + ang) % 360 + 540) % 360 - 180;
        d = d / passo;
        var ad = Math.abs(d), lado = d < 0 ? -1 : 1, giro = Math.min(ad, 1) * 26;
        var x = lado * (Math.min(ad, 1) * esp * 1.08 + Math.max(0, ad - 1) * esp * 0.9);
        c.style.transform = "translate3d(" + x.toFixed(1) + "px,0," + (-ad * 90).toFixed(1) + "px) rotateY(" + (-lado * giro).toFixed(2) + "deg) scale(" + (1 - Math.min(ad, 3) * 0.05).toFixed(3) + ")";
        var op = ad > VISIVEIS ? 0 : ad > VISIVEIS - 0.8 ? (VISIVEIS - ad) / 0.8 : 1;
        c.style.opacity = op >= 1 ? "" : op.toFixed(3);
        c.style.filter = ad < 0.05 ? "" : "brightness(" + (1 - Math.min(ad, 3) * 0.17).toFixed(3) + ")";
        c.style.zIndex = String(100 - Math.round(ad * 10));
        c.style.visibility = op <= 0 ? "hidden" : "";
        c.tabIndex = ad < 0.5 ? 0 : -1;
        if (ad < melhor) { melhor = ad; mi = i; }
      });
      if (mi !== frente) { frente = mi; rotulo.textContent = FERRAMENTAS[mi][2]; }
    }
    function girarPara(i) {
      var alvo = -i * passo, d = ((alvo - ang) % 360 + 540) % 360 - 180;
      if (animAng) animAng.stop();
      if (REDUZ) { ang += d; pintar(); return; }
      girando = true; vel = 0;
      animAng = animate(ang, ang + d, { type: "spring", stiffness: 110, damping: 20, onUpdate: function (v) { ang = v; pintar(); }, onComplete: function () { girando = false; ultimo = Date.now(); } });
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
      var da = dx / esp * passo;
      ang += da; vel = da; pintar();
    });
    function soltar() {
      if (!arrastando) return;
      arrastando = false;
      if (moveu > 8) {
        // segue o embalo e para no cartão mais próximo
        var fim = ang + vel * 8, i = Math.round(-fim / passo);
        girarPara(((i % n) + n) % n);
      }
    }
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    cartoes.forEach(function (c, i) {
      c.addEventListener("click", function (e) {
        if (moveu > 8) { e.preventDefault(); return; }
        if (i === frente) abrir(FERRAMENTAS[i][4]); else girarPara(i);
      });
      c.addEventListener("focus", function () { foco = i; if (i !== frente) girarPara(i); });
      c.addEventListener("blur", function () { foco = null; });
    });
    ctl.querySelectorAll("button")[0].addEventListener("click", function () { girarPara((frente - 1 + n) % n); });
    ctl.querySelectorAll("button")[1].addEventListener("click", function () { girarPara((frente + 1) % n); });
    palco.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); girarPara((frente - 1 + n) % n); cartoes[(frente - 1 + n) % n].focus(); }
      if (e.key === "ArrowRight") { e.preventDefault(); girarPara((frente + 1) % n); cartoes[(frente + 1) % n].focus(); }
    });
    var parado = false, ultimo = Date.now();
    palco.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") parado = true; });
    palco.addEventListener("pointerleave", function () { parado = false; ultimo = Date.now(); });
    if (REDUZ) return;
    // passa sozinho para o próximo cartão a cada 3,5 s (parado com o mouse em cima, no arrasto ou com o foco do teclado)
    (function laco() {
      if (!palco.isConnected) return;
      var livre = st.vis && !document.hidden && !arrastando && foco === null && !girando && !parado;
      if (!livre) ultimo = Date.now();
      else if (Date.now() - ultimo > 3500) { ultimo = Date.now(); girarPara((frente + 1) % n); }
      setTimeout(laco, 250);
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
    Array.prototype.forEach.call(document.querySelectorAll("#dc-root [data-lv3d]:not([data-lv3d-ok])"), function (x) {
      x.setAttribute("data-lv3d-ok", "1");
      vigiar3d(x);
    });
  }

  // ---------------------------------------------------------------- cenas 3D (inicio3d.js, com Three.js)
  // O pacote 3D só é baixado quando a primeira cena chega perto da tela, e nunca com "economia de dados".
  var pacote3d = null;
  function vigiar3d(alvo) {
    try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) { /* segue */ }
    if (!window.IntersectionObserver) return;
    var io = new IntersectionObserver(function (es) {
      if (!es[es.length - 1].isIntersecting) return;
      io.disconnect();
      if (!pacote3d) pacote3d = import("./inicio3d.js?v=3").catch(function (e) { if (window.console) console.warn("inicio3d", e); return null; });
      pacote3d.then(function (m) { if (m && alvo.isConnected) m.montar(alvo, alvo.getAttribute("data-lv3d")); });
    }, { rootMargin: "700px 0px" });
    io.observe(alvo);
  }
  var agendado = false;
  new MutationObserver(function () {
    if (agendado) return;
    agendado = true;
    Promise.resolve().then(function () { agendado = false; varrer(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) varrer();
})();
