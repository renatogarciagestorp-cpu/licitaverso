/* Licitacon — assistente do site (sem custo de IA: respostas da base chatbot-base.js).
   Funciona no index.html e na biblioteca.html. Usa window.LV (licitaverso-auth.js) quando existe,
   para personalizar respostas, registrar perguntas sem resposta e encaminhar mensagens à equipe. */
(function () {
  if (window.LV_CHAT || /painel\.html/.test(location.pathname)) return;
  window.LV_CHAT = true;

  var CHAVE = "licitaverso:assistente";
  var ORIGEM = (document.currentScript && document.currentScript.src) || "";
  var BASE = null, ITENS = {}, sb = null, estado = { aberto: false, msgs: [] };

  // ------------------------------------------------------------ utilidades
  function ler() { try { var v = JSON.parse(sessionStorage.getItem(CHAVE) || "null"); if (v && Array.isArray(v.msgs)) estado = v; } catch (e) {} }
  function gravar() { try { estado.msgs = estado.msgs.slice(-40); sessionStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) {} }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"); }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%]+/g, " ").trim(); }
  var PARADAS = ("a o as os um uma uns umas de da do das dos e em no na nos nas para pra pro por com sem que se me meu minha meus minhas " +
    "eu voce vc ele ela isso isto esse essa este esta ao aos como qual quais quando onde porque por que ja nao sim mais muito tem ter " +
    "posso pode podem consigo quero queria gostaria preciso saber fazer ver veja olhar favor ola oi bom dia boa tarde noite obrigado obrigada duvida").split(" ");
  var PARA = {}; PARADAS.forEach(function (p) { PARA[p] = 1; });
  function raiz(w) { return w.length > 4 ? w.replace(/(oes|aes|ais|eis|res|ns|s)$/, "") : w; }
  function fichas(t) { return norm(t).split(" ").filter(function (w) { return w && !PARA[w]; }).map(raiz); }

  // ------------------------------------------------------------ busca na base
  // Cada palavra vale mais quanto mais rara ela é na base (palavras genéricas como "curso" pesam pouco).
  var IDF = {};
  function prepararBusca() {
    var df = {}, n = BASE.itens.length;
    BASE.itens.forEach(function (it) {
      var vistos = {};
      it._p.forEach(function (f) { vistos[f] = 0.5; }); // palavras do título da pergunta valem metade
      it._k.forEach(function (k) { k.f.forEach(function (f) { vistos[f] = 1; }); });
      it._peso = vistos;
      it._t = Object.keys(vistos);
      it._t.forEach(function (f) { df[f] = (df[f] || 0) + 1; });
    });
    Object.keys(df).forEach(function (f) { IDF[f] = Math.log(1 + n / df[f]); });
  }
  function casa(q, f) { if (q === f) return true; var c = q.length < f.length ? q : f, l = c === q ? f : q; return c.length >= 4 && l.indexOf(c) === 0; }
  function pontuar(pergunta) {
    var qn = " " + norm(pergunta) + " ", qf = fichas(pergunta), res = [];
    if (!qf.length) return res;
    var unicos = qf.filter(function (f, i) { return qf.indexOf(f) === i; });
    BASE.itens.forEach(function (it) {
      var s = 0, cobertos = 0;
      unicos.forEach(function (q) {
        var melhor = 0;
        // palavra igual vale inteira; palavra só parecida (ex.: "pergunta"/"perguntar") vale 70%
        it._t.forEach(function (f) { if (casa(q, f)) melhor = Math.max(melhor, (IDF[f] || 0) * it._peso[f] * (q === f ? 1 : 0.7)); });
        if (melhor) { s += melhor; cobertos++; }
      });
      // expressão inteira encontrada na pergunta (ex.: "qual o meu plano"): bônus pelo tamanho da expressão
      it._k.forEach(function (k) { var w = k.n.split(" ").length; if (w > 1 && qn.indexOf(" " + k.n + " ") >= 0) s += 0.5 * (w - 1) + 0.6; });
      if (cobertos && cobertos === unicos.length) s += 0.5; // a resposta cobre todas as palavras da pergunta
      if (s > 0) res.push({ it: it, s: s });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    return res;
  }

  // ------------------------------------------------------------ banco (opcional)
  function conectar() {
    if (!window.LV || !window.LV.pronto) return Promise.resolve(null);
    return window.LV.pronto.then(function (c) { sb = c; return c; }).catch(function () { return null; });
  }
  function registrar(dados) {
    conectar().then(function (c) {
      if (!c) return;
      c.from("chatbot_registros").insert(Object.assign({ pagina: (location.pathname.split("/").pop() || "index.html") + location.search.slice(0, 80) }, dados)).then(function () {}, function () {});
    });
  }
  function sessao() { return conectar().then(function (c) { return c ? c.auth.getSession().then(function (r) { return (r && r.data && r.data.session) || null; }) : null; }); }
  var NOMES = { basico: "Básico", premium: "Premium", pro: "Pro", teste: "Teste grátis" };
  function dinamico(tipo) {
    return sessao().then(function (s) {
      if (!s) return "Entre na sua conta para eu mostrar os dados do seu plano.";
      if (tipo === "cupom") {
        return sb.rpc("meu_cupom_curso").then(function (r) {
          return r && r.data ? "Seu cupom de assinante nos cursos é **" + r.data + "**." : "No momento sua conta não tem cupom de assinante ativo (é preciso um plano Básico, Premium ou Pro em vigor).";
        });
      }
      return Promise.all([sb.rpc("meu_plano"), sb.from("assinaturas").select("plano, fim").eq("status", "ativa").gt("fim", new Date().toISOString()).order("fim", { ascending: false }).limit(5)]).then(function (r) {
        var plano = r[0] && r[0].data, lista = (r[1] && r[1].data) || [];
        if (!plano) return "Sua conta está **sem plano ativo** no momento — a Biblioteca Jurídica continua liberada.";
        var a = lista.filter(function (x) { return x.plano === plano; })[0];
        var fim = a ? new Date(a.fim).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
        return "Seu plano atual é **" + (NOMES[plano] || plano) + "**" + (fim ? ", válido até **" + fim + "**." : ".");
      });
    }).catch(function () { return ""; });
  }

  // ------------------------------------------------------------ navegação
  function ir(a) {
    if (a.url) { window.open(a.url, "_blank", "noopener"); return; }
    if (a.ir === "biblioteca") { if (!/biblioteca\.html/.test(location.pathname)) location.href = "biblioteca.html"; else fechar(); return; }
    if (window.LV_NAV && /index\.html$|\/$/.test(location.pathname)) {
      window.LV_NAV(a.ir, { tab: a.tab, inst: a.inst });
      if (window.innerWidth < 640) fechar();
      return;
    }
    var q = "index.html?p=" + encodeURIComponent(a.ir) + (a.tab ? "&tab=" + encodeURIComponent(a.tab) : "") + (a.inst ? "&inst=" + encodeURIComponent(a.inst) : "");
    location.href = q;
  }

  // ------------------------------------------------------------ interface
  var css = "" +
    ".lvc-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;background:#0FA36B;color:#06251A;border:0;border-radius:999px;padding:13px 18px 13px 15px;font:700 15px/1 'IBM Plex Sans',-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 12px 30px rgba(8,24,33,.28);cursor:pointer;transition:bottom .2s}" +
    ".lvc-btn:hover{background:#14B978}.lvc-btn span{font-size:19px;line-height:1}" +
    ".lvc-btn:focus-visible,.lvc-p button:focus-visible,.lvc-p input:focus-visible,.lvc-p textarea:focus-visible,.lvc-p select:focus-visible{outline:3px solid #7FE3B6;outline-offset:2px}" +
    ".lvc-p{position:fixed;right:18px;bottom:18px;z-index:2147483001;width:390px;max-width:calc(100vw - 24px);height:min(640px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(6,18,25,.38);display:flex;flex-direction:column;overflow:hidden;font:400 14.5px/1.55 'IBM Plex Sans',-apple-system,Segoe UI,Roboto,sans-serif;color:#0B1F2A;text-align:left}" +
    ".lvc-p *{box-sizing:border-box}" +
    ".lvc-h{background:#0A1F2A;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;flex:none}" +
    ".lvc-h b{display:block;font-size:15.5px}.lvc-h small{display:block;color:#A9BEC6;font-size:12px}" +
    ".lvc-av{width:34px;height:34px;border-radius:10px;background:#0FA36B;color:#06251A;display:grid;place-items:center;font-weight:800;flex:none}" +
    ".lvc-x{margin-left:auto;background:rgba(255,255,255,.12);border:0;color:#fff;width:32px;height:32px;border-radius:9px;font-size:16px;cursor:pointer}.lvc-x:hover{background:rgba(255,255,255,.24)}" +
    ".lvc-m{flex:1;overflow-y:auto;padding:14px 14px 6px;background:#F6F8F7;display:flex;flex-direction:column;gap:10px}" +
    ".lvc-b{max-width:88%;padding:10px 13px;border-radius:14px;word-wrap:break-word}" +
    ".lvc-bot{background:#fff;border:1px solid #E3E9E8;border-top-left-radius:4px;align-self:flex-start}" +
    ".lvc-eu{background:#0A1F2A;color:#fff;border-top-right-radius:4px;align-self:flex-end}" +
    ".lvc-bot strong{color:#0B1F2A}" +
    ".lvc-ch{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:100%}" +
    ".lvc-ch button{background:#fff;border:1px solid #CFE0DC;color:#0F6B7E;border-radius:999px;padding:7px 12px;font:600 13px/1.25 inherit;cursor:pointer;text-align:left}" +
    ".lvc-ch button:hover{border-color:#0FA36B;background:#F1FBF6}" +
    ".lvc-ch button.lvc-ac{background:#0FA36B;border-color:#0FA36B;color:#06251A}.lvc-ch button.lvc-ac:hover{background:#14B978}" +
    ".lvc-fb{display:flex;gap:6px;align-items:center;font-size:12px;color:#7A8B91;align-self:flex-start}" +
    ".lvc-fb button{background:none;border:1px solid #DDE4E3;border-radius:8px;padding:3px 8px;cursor:pointer;font-size:13px}" +
    ".lvc-f{display:flex;gap:8px;padding:10px;border-top:1px solid #E3E9E8;background:#fff;flex:none}" +
    ".lvc-f input{flex:1;min-width:0;border:1px solid #DDE4E3;border-radius:11px;padding:11px 12px;font:inherit;color:#0B1F2A;background:#FBFCFC}" +
    ".lvc-f button{background:#0A1F2A;color:#fff;border:0;border-radius:11px;padding:0 15px;font:700 14px inherit;cursor:pointer}" +
    ".lvc-c{display:grid;gap:8px;background:#fff;border:1px solid #E3E9E8;border-radius:14px;padding:12px;align-self:stretch}" +
    ".lvc-c label{display:grid;gap:4px;font-size:12px;font-weight:700;color:#0F6B7E;text-transform:uppercase;letter-spacing:.04em}" +
    ".lvc-c input,.lvc-c textarea,.lvc-c select{border:1px solid #DDE4E3;border-radius:9px;padding:9px 10px;font:400 14px/1.4 inherit;color:#0B1F2A;text-transform:none;letter-spacing:0;background:#FBFCFC;width:100%}" +
    ".lvc-c .lvc-env{background:#0FA36B;color:#06251A;border:0;border-radius:10px;padding:11px;font:700 14px inherit;cursor:pointer}" +
    ".lvc-c .lvc-err{color:#8A1230;font-size:13px;font-weight:700;margin:0}" +
    ".lvc-rod{font-size:11.5px;color:#7A8B91;text-align:center;padding:0 10px 8px;background:#fff;flex:none}" +
    "@media (max-width:640px){.lvc-p{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;height:100dvh;border-radius:0}.lvc-btn{right:12px;bottom:12px;padding:12px 15px 12px 13px}.lvc-btn em{display:none}}" +
    ".lvc-btn[hidden],.lvc-p[hidden]{display:none!important}" +
    "@media print{.lvc-btn,.lvc-p{display:none!important}}";

  var btn, painel, lista, campo;
  function montar() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    btn = document.createElement("button");
    btn.className = "lvc-btn"; btn.type = "button"; btn.setAttribute("aria-label", "Abrir o assistente de dúvidas");
    btn.innerHTML = "<span aria-hidden='true'>💬</span><em style='font-style:normal'>Dúvidas?</em>";
    btn.onclick = abrir;
    document.body.appendChild(btn);
    setInterval(ajustarPosicao, 1500);
    if (estado.aberto) abrir();
  }
  function ajustarPosicao() {
    if (!btn) return;
    var banner = document.querySelector('[aria-label="Instalar o aplicativo"], [aria-label="Aviso de cookies"], [role="region"][aria-label*="ookies"]');
    var h = 0;
    if (banner) { var r = banner.getBoundingClientRect(); if (r.height && r.top < window.innerHeight) h = window.innerHeight - r.top + 8; }
    btn.style.bottom = (h ? h : (window.innerWidth <= 640 ? 12 : 18)) + "px";
  }

  function abrir() {
    estado.aberto = true; gravar();
    if (painel) { painel.hidden = false; btn.hidden = true; campo.focus(); return; }
    painel = document.createElement("section");
    painel.className = "lvc-p"; painel.setAttribute("role", "dialog"); painel.setAttribute("aria-label", "Assistente Licitacon");
    painel.innerHTML =
      "<div class='lvc-h'><span class='lvc-av' aria-hidden='true'>L</span><span><b>Assistente Licitacon</b><small>Respostas na hora, 24 horas por dia</small></span>" +
      "<button class='lvc-x' type='button' aria-label='Fechar o assistente'>✕</button></div>" +
      "<div class='lvc-m' aria-live='polite'></div>" +
      "<form class='lvc-f'><input type='text' maxlength='300' placeholder='Digite sua dúvida…' aria-label='Digite sua dúvida' autocomplete='off'><button type='submit'>Enviar</button></form>" +
      "<div class='lvc-rod'>Respostas automáticas · <button type='button' class='lvc-rec' style='background:none;border:0;color:#0F6B7E;text-decoration:underline;cursor:pointer;font:inherit'>recomeçar</button></div>";
    document.body.appendChild(painel);
    lista = painel.querySelector(".lvc-m"); campo = painel.querySelector("input");
    painel.querySelector(".lvc-x").onclick = fechar;
    painel.querySelector(".lvc-rec").onclick = function () { estado.msgs = []; gravar(); lista.innerHTML = ""; boasVindas(); };
    painel.querySelector("form").onsubmit = function (e) { e.preventDefault(); var t = campo.value.trim(); if (!t) return; campo.value = ""; perguntar(t); };
    painel.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    btn.hidden = true;
    if (estado.msgs.length) estado.msgs.forEach(function (m) { desenhar(m, true); }); else boasVindas();
    rolar(); campo.focus();
  }
  function fechar() { estado.aberto = false; gravar(); if (painel) painel.hidden = true; if (btn) { btn.hidden = false; btn.focus(); } }
  function rolar() { if (lista) lista.scrollTop = lista.scrollHeight; }

  // mensagens: {de:"bot"|"eu", t:texto, ch:[{t, id|acao}], fb:id, form:assunto}
  function falar(m) { estado.msgs.push(m); gravar(); desenhar(m); rolar(); }
  function desenhar(m) {
    if (m.t) { var b = document.createElement("div"); b.className = "lvc-b " + (m.de === "eu" ? "lvc-eu" : "lvc-bot"); b.innerHTML = fmt(m.t); lista.appendChild(b); }
    if (m.ch && m.ch.length) {
      var c = document.createElement("div"); c.className = "lvc-ch";
      m.ch.forEach(function (x) {
        var bt = document.createElement("button"); bt.type = "button"; bt.textContent = x.t;
        if (x.acao) bt.className = "lvc-ac";
        bt.onclick = function () { clicar(x); };
        c.appendChild(bt);
      });
      lista.appendChild(c);
    }
    if (m.fb) {
      var f = document.createElement("div"); f.className = "lvc-fb";
      f.innerHTML = "Ajudou? <button type='button' aria-label='Sim, ajudou'>👍</button><button type='button' aria-label='Não ajudou'>👎</button>";
      var bs = f.querySelectorAll("button");
      bs[0].onclick = function () { f.textContent = "Obrigado pelo retorno!"; registrar({ resposta_id: m.fb, util: true, pergunta: m.q || "" }); };
      bs[1].onclick = function () {
        f.textContent = "Obrigado — vamos melhorar esta resposta.";
        registrar({ resposta_id: m.fb, util: false, pergunta: m.q || "" });
        falar({ de: "bot", t: "Quer tentar com outras palavras ou prefere que eu encaminhe sua dúvida para a equipe?", ch: [{ t: "Escrever para a equipe", acao: { contato: "Suporte à conta" } }, { t: "Ver todos os temas", acao: { temas: true } }] });
      };
      lista.appendChild(f);
    }
    if (m.form) formulario(m.form, m.q);
  }

  function boasVindas() {
    falar({ de: "bot", t: "Olá! Sou o assistente do Licitacon. Escreva sua dúvida com suas palavras ou escolha um tema:", ch: BASE.temas.map(function (t) { return { t: t.t, tema: t.t }; }) });
  }
  function clicar(x) {
    if (x.tema) {
      var tema = BASE.temas.filter(function (t) { return t.t === x.tema; })[0];
      falar({ de: "eu", t: x.t });
      if (tema.ids.length === 1) { responder(ITENS[tema.ids[0]], x.t); return; }
      falar({ de: "bot", t: "Sobre **" + tema.t + "**, o que você quer saber?", ch: tema.ids.map(function (id) { return { t: ITENS[id].p, id: id }; }) });
      return;
    }
    if (x.id) { falar({ de: "eu", t: x.t }); responder(ITENS[x.id], x.t); return; }
    var a = x.acao || {};
    if (a.temas) { falar({ de: "bot", t: "Escolha um tema:", ch: BASE.temas.map(function (t) { return { t: t.t, tema: t.t }; }) }); return; }
    if (a.chat) { falar({ de: "eu", t: x.t }); responder(ITENS[a.chat], x.t); return; }
    if (a.contato) { falar({ de: "eu", t: x.t }); falar({ de: "bot", t: "Preencha e envie — a resposta chega no seu e-mail.", form: a.contato, q: ultimaPergunta() }); return; }
    if (a.ir || a.url) ir(a);
  }
  function ultimaPergunta() { return estado.digitada || ""; }

  function responder(it, q) {
    if (!it) return;
    var ch = (it.a || []).map(function (a) { return { t: a.t, acao: a.contato ? { contato: a.contato } : a }; });
    (it.rel || []).slice(0, 3).forEach(function (id) { if (ITENS[id]) ch.push({ t: ITENS[id].p, id: id }); });
    var msg = { de: "bot", t: it.r, ch: ch, fb: it.id, q: q };
    if (!it.dinamico) { falar(msg); return; }
    dinamico(it.dinamico).then(function (extra) { if (extra) msg.t = extra + "\n\n" + it.r; falar(msg); });
  }

  // Limites calibrados com a bateria de perguntas de teste
  var CERTEZA = 3.2, FOLGA = 1.12, MINIMO = 1.2;
  function decidir(r) {
    var m = r[0], seg = r[1];
    if (!m || m.s < MINIMO) return "nada";
    if (m.s >= CERTEZA && (!seg || m.s >= seg.s * FOLGA)) return "certo";
    return "duvida";
  }
  var SAUDACAO = /^(oi+|ola|ol[aá]|bom dia|boa tarde|boa noite|hey|e ai|tudo bem|opa)[\s!.?,]*$/i;
  var AGRADECE = /^(obrigad[oa]|valeu|vlw|brigad[oa]|ok|certo|entendi|perfeito|show|otimo|ótimo|beleza|blz|muito obrigad[oa])[\s!.?,]*$/i;
  function perguntar(t) {
    estado.digitada = t;
    falar({ de: "eu", t: t });
    var n = norm(t);
    if (SAUDACAO.test(n)) { falar({ de: "bot", t: "Olá! Como posso ajudar? Escreva sua dúvida ou escolha um tema:", ch: BASE.temas.map(function (x) { return { t: x.t, tema: x.t }; }) }); return; }
    if (AGRADECE.test(n)) { falar({ de: "bot", t: "Por nada! Se surgir outra dúvida, é só escrever aqui." }); return; }
    var r = pontuar(t);
    var melhor = r[0], modo = decidir(r);
    if (modo === "certo") {
      registrar({ pergunta: t.slice(0, 300), resposta_id: melhor.it.id });
      responder(melhor.it, t);
      return;
    }
    if (modo === "duvida") {
      registrar({ pergunta: t.slice(0, 300), resposta_id: "?" + melhor.it.id });
      falar({ de: "bot", t: "Não tenho certeza se entendi. Sua dúvida é sobre algum destes assuntos?",
        ch: r.slice(0, 4).map(function (x) { return { t: x.it.p, id: x.it.id }; }).concat([{ t: "Nenhum desses — falar com a equipe", acao: { contato: "Suporte à conta" } }]) });
      return;
    }
    registrar({ pergunta: t.slice(0, 300), resposta_id: "" });
    falar({ de: "bot", t: "Ainda não sei responder isso. Tente com outras palavras (por exemplo: \"como pagar com Pix\"), escolha um tema ou encaminhe sua dúvida para a equipe.",
      ch: [{ t: "Escrever para a equipe", acao: { contato: "Suporte à conta" } }, { t: "Ver todos os temas", acao: { temas: true } }] });
  }

  // ------------------------------------------------------------ formulário para a equipe
  var ASSUNTOS = ["Suporte à conta", "Assinatura e cobrança", "Privacidade (LGPD)", "Acessibilidade", "Correção na Biblioteca", "Parcerias"];
  function formulario(assunto, ultima) {
    var f = document.createElement("form"); f.className = "lvc-c";
    f.innerHTML =
      "<label>Seu nome<input name='nome' required maxlength='160' autocomplete='name'></label>" +
      "<label>Seu e-mail<input name='email' type='email' required maxlength='200' autocomplete='email'></label>" +
      "<label>Assunto<select name='assunto'>" + ASSUNTOS.map(function (a) { return "<option" + (a === assunto ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("") + "</select></label>" +
      "<label>Mensagem<textarea name='mensagem' rows='4' required maxlength='4000'></textarea></label>" +
      "<p class='lvc-err' hidden></p><button class='lvc-env' type='submit'>Enviar para a equipe</button>";
    if (ultima && !/^(escrever|falar|quero falar|nenhum|remarcar|pedir|relatar|informar|denunciar|cupom com problema)/i.test(ultima)) f.mensagem.value = ultima;
    sessao().then(function (s) {
      if (!s || !sb) return;
      if (!f.email.value) f.email.value = s.user.email || "";
      sb.from("perfis").select("nome").eq("id", s.user.id).maybeSingle().then(function (r) { if (r && r.data && r.data.nome && !f.nome.value) f.nome.value = r.data.nome; }, function () {});
    });
    f.onsubmit = function (e) {
      e.preventDefault();
      var err = f.querySelector(".lvc-err"), bt = f.querySelector(".lvc-env");
      var d = { nome: f.nome.value.trim(), email: f.email.value.trim(), assunto: f.assunto.value, mensagem: f.mensagem.value.trim() };
      function erro(m) { err.textContent = m; err.hidden = false; }
      if (d.nome.length < 2) return erro("Informe seu nome.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return erro("Confira o e-mail.");
      if (d.mensagem.length < 5) return erro("Escreva sua mensagem.");
      bt.disabled = true; bt.textContent = "Enviando…";
      conectar().then(function (c) {
        if (!c) throw new Error("sem conexão");
        return c.from("contatos").insert({ nome: d.nome, email: d.email, assunto: d.assunto, mensagem: d.mensagem, detalhes: { origem: "assistente", pagina: location.pathname.split("/").pop() + location.search } });
      }).then(function (r) {
        if (r && r.error) throw r.error;
        f.remove();
        falar({ de: "bot", t: "✓ Mensagem enviada! A equipe responde no e-mail **" + d.email + "**, em dias úteis. Enquanto isso, posso ajudar em mais alguma coisa?" });
      }).catch(function () { bt.disabled = false; bt.textContent = "Enviar para a equipe"; erro("Não foi possível enviar agora. Tente de novo em instantes ou use a página Fale Conosco."); });
    };
    lista.appendChild(f);
    setTimeout(function () { (f.nome.value ? f.mensagem : f.nome).focus(); }, 50);
  }

  // ------------------------------------------------------------ início
  function iniciar() {
    BASE = window.LV_CHAT_BASE;
    if (!BASE) return;
    BASE.itens.forEach(function (it) {
      ITENS[it.id] = it;
      it._k = (it.k || []).map(function (k) { return { n: norm(k), f: fichas(k) }; });
      it._p = fichas(it.p);
    });
    prepararBusca();
    ler();
    montar();
  }
  function carregarBase() {
    if (window.LV_CHAT_BASE) return iniciar();
    var s = document.createElement("script");
    s.src = (ORIGEM ? ORIGEM.replace(/chatbot\.js.*$/, "") : "") + "chatbot-base.js?v=" + ((ORIGEM.match(/[?&]v=([^&]+)/) || [])[1] || "1");
    s.onload = iniciar;
    document.head.appendChild(s);
  }
  window.LV_CHAT_PONTUAR = function (t) { var r = pontuar(t); return { modo: decidir(r), top: r.slice(0, 3).map(function (x) { return x.it.id + ":" + x.s.toFixed(2); }) }; };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", carregarBase); else carregarBase();
})();
