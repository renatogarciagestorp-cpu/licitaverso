/* Licitacon — assistente do site (sem custo de IA: respostas da base chatbot-base.js).
   Funciona no index.html e na biblioteca.html. Usa window.LV (licitaverso-auth.js) quando existe,
   para personalizar respostas, registrar perguntas sem resposta e encaminhar mensagens à equipe.
   Classes com prefixo "lvq-" (o site já usa "lvc-" na Calculadora e nas telas da página inicial). */
(function () {
  if (window.LV_CHAT || /painel\.html/.test(location.pathname)) return;
  window.LV_CHAT = true;

  var CHAVE = "licitaverso:assistente";
  var ORIGEM = (document.currentScript && document.currentScript.src) || "";
  var BASE = null, ITENS = {}, TEMAS = {}, sb = null, estado = { aberto: false, msgs: [] };
  var REDUZ = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ utilidades
  function ler() { try { var v = JSON.parse(sessionStorage.getItem(CHAVE) || "null"); if (v && Array.isArray(v.msgs)) estado = v; } catch (e) {} }
  function gravar() { try { estado.msgs = estado.msgs.slice(-40); sessionStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) {} }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function negrito(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }
  // Texto da base → parágrafos e listas de verdade ("•" vira lista simples; "1." vira passo numerado)
  function fmt(t) {
    var out = [], lista = null, tipo = "";
    function fechaLista() { if (lista) { out.push("<" + tipo + ">" + lista.join("") + "</" + tipo + ">"); lista = null; } }
    String(t || "").split("\n").forEach(function (l) {
      var m = l.match(/^\s*[•\-]\s+(.*)$/), n = l.match(/^\s*\d+[.)]\s+(.*)$/);
      var novo = m ? "ul" : n ? "ol" : "";
      if (novo) {
        if (lista && tipo !== novo) fechaLista();
        if (!lista) { lista = []; tipo = novo; }
        lista.push("<li>" + negrito((m || n)[1]) + "</li>");
        return;
      }
      fechaLista();
      if (l.trim()) out.push("<p>" + negrito(l) + "</p>");
    });
    fechaLista();
    return out.join("");
  }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%]+/g, " ").trim(); }
  var PARADAS = ("a o as os um uma uns umas de da do das dos e em no na nos nas para pra pro por com sem que se me meu minha meus minhas " +
    "eu voce vc ele ela isso isto esse essa este esta ao aos como qual quais quando onde porque por que ja nao sim mais muito tem ter " +
    "posso pode podem consigo quero queria gostaria preciso saber fazer ver veja olhar favor ola oi bom dia boa tarde noite obrigado obrigada duvida").split(" ");
  var PARA = {}; PARADAS.forEach(function (p) { PARA[p] = 1; });
  function raiz(w) { return w.length > 4 ? w.replace(/(oes|aes|ais|eis|res|ns|s)$/, "") : w; }
  function fichas(t) { return norm(t).split(" ").filter(function (w) { return w && !PARA[w]; }).map(raiz); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // ------------------------------------------------------------ página atual
  function paginaAtual() {
    if (/biblioteca\.html/.test(location.pathname)) return "biblioteca";
    var p = new URLSearchParams(location.search).get("p");
    return p || "home";
  }
  function temaDaPagina() {
    var p = paginaAtual();
    var t = BASE.temas.filter(function (x) { return (x.pags || []).indexOf(p) >= 0; })[0];
    return t || null;
  }

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
    var tp = temaDaPagina();
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
      // desempate leve a favor do assunto da página aberta
      if (s > 0 && tp && tp.ids.indexOf(it.id) >= 0) s += 0.15;
      if (s > 0) res.push({ it: it, s: s });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    return res;
  }
  // Marca no título da pergunta as palavras que coincidem com o que a pessoa digitou
  function marcar(texto, consulta) {
    var qf = fichas(consulta);
    return String(texto).split(/(\s+)/).map(function (w) {
      if (/^\s+$/.test(w)) return w;
      var f = fichas(w)[0];
      // para marcar, aceita também variações da mesma palavra ("reajustar" e "reajuste")
      var bate = f && qf.some(function (q) { return casa(q, f) || (q.length >= 6 && f.length >= 6 && q.slice(0, 6) === f.slice(0, 6)); });
      return bate ? "<mark>" + esc(w) + "</mark>" : esc(w);
    }).join("");
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
        if (!plano) return "Sua conta está **sem plano ativo** no momento. A Biblioteca Jurídica continua liberada.";
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
      window.LV_NAV(a.ir, { tab: a.tab, inst: a.inst, f: a.f });
      if (window.innerWidth < 640) fechar();
      return;
    }
    location.href = "index.html?p=" + encodeURIComponent(a.ir) + (a.tab ? "&tab=" + encodeURIComponent(a.tab) : "") +
      (a.inst ? "&inst=" + encodeURIComponent(a.inst) : "") + (a.f ? "&f=" + encodeURIComponent(a.f) : "");
  }

  // ------------------------------------------------------------ estilo
  var css = "" +
    ".lvq-btn,.lvq-p{--q-floresta:#0F3431;--q-navy:#0A1F2A;--q-verde:#0FA36B;--q-verde-esc:#0B7A52;--q-menta:#6FE0AE;--q-papel:#F4F6F5;--q-tinta:#0F2A27;--q-mudo:#5B6F6A;--q-linha:#E3E9E7;--q-marca:#D5F2E4;" +
    "font-family:Manrope,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}" +
    ".lvq-p *,.lvq-p *::before,.lvq-p *::after{box-sizing:border-box}" +
    ".lvq-p button,.lvq-p input,.lvq-p textarea,.lvq-p select{font-family:inherit;font-size:inherit;line-height:inherit;letter-spacing:normal;text-transform:none;margin:0;box-shadow:none;min-height:0}" +
    ".lvq-p button{cursor:pointer}" +
    ".lvq-btn:focus-visible,.lvq-p button:focus-visible,.lvq-p input:focus-visible,.lvq-p textarea:focus-visible,.lvq-p select:focus-visible{outline:3px solid var(--q-menta);outline-offset:2px}" +
    ".lvq-p .lvq-sug li[aria-selected=true]{outline:2px solid var(--q-verde);outline-offset:-2px}" +

    /* botão flutuante */
    ".lvq-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:10px;background:var(--q-floresta);color:#fff;border:1px solid rgba(111,224,174,.35);border-radius:999px;padding:8px 18px 8px 8px;font-weight:700;font-size:14.5px;line-height:1;box-shadow:0 14px 34px rgba(6,18,25,.32);cursor:pointer;transition:bottom .2s,transform .18s ease-out,background .18s}" +
    ".lvq-btn:hover{background:#13403C}.lvq-btn:active{transform:scale(.97)}" +
    ".lvq-btn i{position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--q-verde);color:#04261A}" +
    ".lvq-btn i::after{content:'';position:absolute;right:0;top:0;width:9px;height:9px;border-radius:50%;background:var(--q-menta);border:2px solid var(--q-floresta)}" +
    ".lvq-btn svg{width:18px;height:18px}" +
    ".lvq-btn em{font-style:normal;white-space:nowrap}" +

    /* painel */
    ".lvq-p{position:fixed;right:18px;bottom:18px;z-index:2147483001;width:404px;max-width:calc(100vw - 24px);height:min(680px,calc(100vh - 36px));background:#fff;border-radius:20px;box-shadow:0 30px 80px rgba(6,18,25,.38),0 0 0 1px rgba(15,52,49,.08);display:flex;flex-direction:column;overflow:hidden;font-size:14.5px;line-height:1.55;color:var(--q-tinta);text-align:left;transform-origin:100% 100%}" +
    ".lvq-p.lvq-entra{animation:lvq-abre .22s cubic-bezier(.2,.8,.2,1)}" +
    "@keyframes lvq-abre{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}" +

    /* cabeçalho */
    ".lvq-h{background:var(--q-floresta);color:#fff;padding:14px 12px 14px 16px;display:flex;align-items:center;gap:11px;flex:none}" +
    ".lvq-av{position:relative;width:36px;height:36px;border-radius:11px;background:var(--q-verde);color:#04261A;display:grid;place-items:center;font-weight:800;font-size:16px;flex:none}" +
    ".lvq-h-t{min-width:0}.lvq-h-t b{display:block;font-size:15.5px;line-height:1.25}" +
    ".lvq-h-t small{display:flex;align-items:center;gap:6px;color:#B5CEC6;font-size:12.5px;line-height:1.3}" +
    ".lvq-h-t small::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--q-menta);flex:none}" +
    ".lvq-h-a{margin-left:auto;display:flex;gap:4px}" +
    ".lvq-p .lvq-ic{width:34px;height:34px;border-radius:10px;border:0;background:transparent;color:#D6E6E1;display:grid;place-items:center;padding:0}" +
    ".lvq-p .lvq-ic:hover{background:rgba(255,255,255,.1);color:#fff}.lvq-ic svg{width:18px;height:18px}" +

    /* conversa */
    ".lvq-m{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 14px 10px;background:var(--q-papel);display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}" +
    ".lvq-novo{animation:lvq-surge .2s ease-out both}" +
    "@keyframes lvq-surge{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
    ".lvq-eu{align-self:flex-end;max-width:85%;background:var(--q-floresta);color:#fff;padding:9px 13px;border-radius:14px 14px 4px 14px;word-wrap:break-word}" +
    ".lvq-r{align-self:stretch;background:#fff;border:1px solid var(--q-linha);border-left:3px solid var(--q-verde);border-radius:4px 14px 14px 4px;padding:12px 14px 12px 13px}" +
    ".lvq-r h3{margin:0 0 6px;font-size:14.5px;line-height:1.35;font-weight:800;color:var(--q-floresta)}" +
    ".lvq-r p{margin:0 0 8px}.lvq-r p:last-child{margin-bottom:0}" +
    ".lvq-r ul,.lvq-r ol{margin:2px 0 8px;padding:0 0 0 20px}.lvq-r li{margin:3px 0;padding-left:2px}.lvq-r li::marker{color:var(--q-verde-esc);font-weight:800}" +
    ".lvq-r strong{color:var(--q-floresta);font-weight:800}" +
    ".lvq-nota{align-self:flex-start;max-width:92%;color:var(--q-tinta);padding:2px 2px}" +
    ".lvq-nota p{margin:0}" +

    /* ações e relacionadas */
    ".lvq-ac{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}" +
    ".lvq-p .lvq-ac button{border-radius:10px;padding:8px 13px;font-weight:700;font-size:13.5px;line-height:1.25;border:1px solid var(--q-linha);background:#fff;color:var(--q-floresta);text-align:left}" +
    ".lvq-p .lvq-ac button:hover{border-color:var(--q-verde);background:#F1FBF6}" +
    ".lvq-p .lvq-ac button.lvq-pri{background:var(--q-verde);border-color:var(--q-verde);color:#04261A}" +
    ".lvq-p .lvq-ac button.lvq-pri:hover{background:#14B978;border-color:#14B978}" +
    ".lvq-rel{margin:12px 0 0;padding:10px 0 0;border-top:1px solid var(--q-linha);list-style:none}" +
    ".lvq-rel>span{display:block;font-size:12.5px;color:var(--q-mudo);margin-bottom:2px}" +
    ".lvq-p .lvq-rel button{display:block;width:100%;border:0;background:none;padding:6px 0;color:var(--q-verde-esc);font-weight:700;font-size:13.5px;line-height:1.35;text-align:left}" +
    ".lvq-p .lvq-rel button:hover{text-decoration:underline}" +
    ".lvq-fb{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12.5px;color:var(--q-mudo)}" +
    ".lvq-p .lvq-fb button{border:1px solid var(--q-linha);background:#fff;border-radius:8px;padding:3px 10px;font-size:12.5px;font-weight:700;color:var(--q-tinta)}" +
    ".lvq-p .lvq-fb button:hover{border-color:var(--q-verde)}" +

    /* tela inicial */
    ".lvq-ini{display:flex;flex-direction:column;gap:18px;padding:4px 2px 6px}" +
    ".lvq-ini h2{margin:0;font-size:19px;line-height:1.25;font-weight:800;color:var(--q-floresta);letter-spacing:-.01em}" +
    ".lvq-ini h2+p{margin:4px 0 0;color:var(--q-mudo);font-size:13.5px}" +
    ".lvq-sec>span{display:block;font-size:12.5px;font-weight:700;color:var(--q-mudo);margin:0 0 6px}" +
    ".lvq-qs{background:#fff;border:1px solid var(--q-linha);border-radius:14px;overflow:hidden}" +
    ".lvq-p .lvq-qs button{display:flex;align-items:center;gap:10px;width:100%;border:0;border-top:1px solid var(--q-linha);background:#fff;padding:11px 13px;font-weight:600;font-size:14px;line-height:1.35;color:var(--q-tinta);text-align:left}" +
    ".lvq-p .lvq-qs button:first-child{border-top:0}" +
    ".lvq-p .lvq-qs button:hover{background:#F1FBF6}" +
    ".lvq-qs button::after{content:'';margin-left:auto;flex:none;width:7px;height:7px;border-right:2px solid var(--q-verde);border-top:2px solid var(--q-verde);transform:rotate(45deg)}" +
    ".lvq-temas{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--q-linha);border:1px solid var(--q-linha);border-radius:14px;overflow:hidden}" +
    ".lvq-p .lvq-temas button{border:0;background:#fff;padding:11px 12px;text-align:left;display:flex;flex-direction:column;gap:1px;min-height:58px}" +
    ".lvq-p .lvq-temas button:hover{background:#F1FBF6}" +
    ".lvq-temas b{font-size:13.5px;line-height:1.3;color:var(--q-floresta);font-weight:800}" +
    ".lvq-temas small{font-size:12px;line-height:1.35;color:var(--q-mudo)}" +
    ".lvq-temas button.lvq-aqui{background:#EAF7F0}" +
    ".lvq-p .lvq-equipe{align-self:flex-start;border:0;background:none;padding:2px 0;color:var(--q-verde-esc);font-weight:700;font-size:13.5px;text-decoration:underline;text-underline-offset:3px}" +

    /* digitando */
    ".lvq-dig{align-self:flex-start;display:flex;gap:4px;padding:10px 12px;background:#fff;border:1px solid var(--q-linha);border-radius:12px}" +
    ".lvq-dig i{width:6px;height:6px;border-radius:50%;background:var(--q-verde);animation:lvq-pulso 1s infinite ease-in-out}" +
    ".lvq-dig i:nth-child(2){animation-delay:.15s}.lvq-dig i:nth-child(3){animation-delay:.3s}" +
    "@keyframes lvq-pulso{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}" +

    /* campo e sugestões ao digitar */
    ".lvq-pe{position:relative;flex:none;background:#fff;border-top:1px solid var(--q-linha)}" +
    ".lvq-sug{position:absolute;left:10px;right:10px;bottom:calc(100% + 6px);margin:0;padding:6px;list-style:none;background:#fff;border:1px solid var(--q-linha);border-radius:14px;box-shadow:0 18px 40px rgba(6,18,25,.18);max-height:260px;overflow-y:auto}" +
    ".lvq-sug>span{display:block;padding:4px 8px 6px;font-size:12px;color:var(--q-mudo)}" +
    ".lvq-sug li{display:flex;flex-direction:column;gap:1px;padding:8px 10px;border-radius:9px;cursor:pointer;font-size:14px;line-height:1.35;color:var(--q-tinta)}" +
    ".lvq-sug li small{font-size:12px;color:var(--q-mudo)}" +
    ".lvq-sug li:hover,.lvq-sug li[aria-selected=true]{background:#F1FBF6}" +
    ".lvq-sug mark{background:var(--q-marca);color:inherit;border-radius:3px;padding:0 1px;font-weight:700}" +
    ".lvq-f{display:flex;gap:8px;align-items:center;padding:10px}" +
    ".lvq-p .lvq-f input{flex:1;min-width:0;width:auto;border:1px solid #CFDAD6;border-radius:12px;padding:11px 13px;font-size:15px;color:var(--q-tinta);background:#FBFCFC;outline:none}" +
    ".lvq-p .lvq-f input:focus{border-color:var(--q-verde);background:#fff;box-shadow:inset 0 0 0 1px var(--q-verde)}" +
    ".lvq-p .lvq-env{flex:none;width:44px;height:44px;border:0;border-radius:12px;background:var(--q-verde);color:#04261A;display:grid;place-items:center;padding:0}" +
    ".lvq-p .lvq-env:hover{background:#14B978}.lvq-env svg{width:20px;height:20px}" +
    ".lvq-rod{font-size:11.5px;line-height:1.4;color:var(--q-mudo);text-align:center;padding:0 12px 9px}" +

    /* formulário para a equipe */
    ".lvq-c{display:grid;gap:10px;background:#fff;border:1px solid var(--q-linha);border-radius:14px;padding:14px;align-self:stretch}" +
    ".lvq-c label{display:grid;gap:4px;font-size:13px;font-weight:700;color:var(--q-floresta)}" +
    ".lvq-p .lvq-c input,.lvq-p .lvq-c textarea,.lvq-p .lvq-c select{width:100%;border:1px solid #CFDAD6;border-radius:10px;padding:9px 11px;font-size:15px;font-weight:400;line-height:1.4;color:var(--q-tinta);background:#FBFCFC}" +
    ".lvq-p .lvq-c textarea{resize:vertical}" +
    ".lvq-p .lvq-c .lvq-envf{background:var(--q-verde);color:#04261A;border:0;border-radius:11px;padding:11px;font-weight:800;font-size:14px}" +
    ".lvq-p .lvq-c .lvq-envf:disabled{opacity:.6;cursor:default}" +
    ".lvq-c .lvq-err{color:#A3242F;font-size:13px;font-weight:700;margin:0}" +

    "@media (max-width:640px){.lvq-p{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;height:100dvh;border-radius:0;padding-bottom:env(safe-area-inset-bottom)}" +
    ".lvq-h{padding-top:max(14px,env(safe-area-inset-top))}.lvq-btn{right:12px;bottom:12px;padding:8px}.lvq-btn em{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.lvq-p.lvq-entra,.lvq-novo,.lvq-dig i{animation:none}.lvq-m{scroll-behavior:auto}.lvq-btn{transition:none}}" +
    /* o site arredonda e afasta toda janela [role=dialog] no celular: aqui não */
    ".lvq-p[role=dialog]{padding:0!important}.lvq-p[role=dialog]>div,.lvq-p[role=dialog]>header{border-radius:0!important}" +
    "@media (max-width:640px){.lvq-p[role=dialog]{padding-bottom:env(safe-area-inset-bottom)!important}}" +
    ".lvq-btn[hidden],.lvq-p[hidden]{display:none!important}" +
    "@media print{.lvq-btn,.lvq-p{display:none!important}}";

  var SVG = {
    balao: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z'/></svg>",
    fechar: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg>",
    inicio: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M3 11.5L12 4l9 7.5'/><path d='M5.5 10v9.5h13V10'/></svg>",
    enviar: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M5 12h14M13 6l6 6-6 6'/></svg>"
  };

  // ------------------------------------------------------------ montagem
  var btn, painel, lista, campo, sug, sugItens = [], sugAtivo = -1;
  function rotuloBotao() {
    var t = temaDaPagina();
    return t && t.curto ? "Dúvidas sobre " + t.curto + "?" : "Dúvidas?";
  }
  function montar() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    btn = el("button", "lvq-btn");
    btn.type = "button"; btn.setAttribute("aria-label", "Abrir o assistente de dúvidas"); btn.setAttribute("aria-haspopup", "dialog");
    btn.innerHTML = "<i>" + SVG.balao + "</i><em></em>";
    btn.querySelector("em").textContent = rotuloBotao();
    btn.onclick = abrir;
    document.body.appendChild(btn);
    setInterval(ajustarPosicao, 700);
    // O site troca de página sem recarregar: atualiza o rótulo do botão
    window.addEventListener("popstate", function () { if (btn) btn.querySelector("em").textContent = rotuloBotao(); });
    if (estado.aberto) abrir(true);
  }
  var ultimaUrl = location.search;
  function ajustarPosicao() {
    if (!btn) return;
    if (location.search !== ultimaUrl) { ultimaUrl = location.search; btn.querySelector("em").textContent = rotuloBotao(); }
    // Esconde o botão enquanto uma janela do site (pagamento, denúncia, consultoria…) estiver aberta
    var modal = document.querySelector('[aria-modal="true"]:not(.lvq-p)');
    btn.style.visibility = modal ? "hidden" : "";
    var banner = document.querySelector('[aria-label="Instalar o aplicativo"], [aria-label="Aviso de cookies"], [role="region"][aria-label*="ookies"]');
    var h = 0;
    if (banner) { var r = banner.getBoundingClientRect(); if (r.height && r.top < window.innerHeight) h = window.innerHeight - r.top + 8; }
    btn.style.bottom = (h ? h : (window.innerWidth <= 640 ? 12 : 18)) + "px";
  }
  function telaCheia() { return window.matchMedia && window.matchMedia("(max-width: 640px)").matches; }

  function abrir(silencioso) {
    estado.aberto = true; gravar();
    if (!painel) criarPainel();
    painel.hidden = false; btn.hidden = true;
    painel.setAttribute("aria-modal", telaCheia() ? "true" : "false");
    if (!REDUZ && silencioso !== true) { painel.classList.remove("lvq-entra"); void painel.offsetWidth; painel.classList.add("lvq-entra"); }
    if (estado.msgs.length) rolar(true); else lista.scrollTop = 0;
    if (silencioso !== true || !telaCheia()) campo.focus({ preventScroll: true });
  }
  function criarPainel() {
    painel = el("section", "lvq-p");
    painel.setAttribute("role", "dialog"); painel.setAttribute("aria-labelledby", "lvq-tit"); painel.hidden = true;
    painel.innerHTML =
      "<header class='lvq-h'><span class='lvq-av' aria-hidden='true'>L</span>" +
      "<span class='lvq-h-t'><b id='lvq-tit'>Assistente Licitacon</b><small>Responde na hora, a qualquer hora</small></span>" +
      "<span class='lvq-h-a'><button class='lvq-ic lvq-ini-b' type='button' aria-label='Voltar ao início do assistente' title='Início'>" + SVG.inicio + "</button>" +
      "<button class='lvq-ic lvq-x' type='button' aria-label='Fechar o assistente' title='Fechar'>" + SVG.fechar + "</button></span></header>" +
      "<div class='lvq-m' role='log' aria-live='polite' aria-relevant='additions'></div>" +
      "<div class='lvq-pe'><ul class='lvq-sug' id='lvq-sug' role='listbox' aria-label='Perguntas parecidas' hidden></ul>" +
      "<form class='lvq-f'><input type='text' maxlength='300' placeholder='Escreva sua dúvida' aria-label='Escreva sua dúvida' autocomplete='off' enterkeyhint='send'" +
      " role='combobox' aria-autocomplete='list' aria-expanded='false' aria-controls='lvq-sug'>" +
      "<button class='lvq-env' type='submit' aria-label='Enviar pergunta'>" + SVG.enviar + "</button></form>" +
      "<div class='lvq-rod'>Respostas automáticas, com a base do site</div></div>";
    document.body.appendChild(painel);
    lista = painel.querySelector(".lvq-m"); campo = painel.querySelector("input"); sug = painel.querySelector(".lvq-sug");
    painel.querySelector(".lvq-x").onclick = fechar;
    painel.querySelector(".lvq-ini-b").onclick = recomecar;
    painel.querySelector("form").onsubmit = function (e) {
      e.preventDefault();
      if (sugAtivo >= 0 && sugItens[sugAtivo]) { escolherSugestao(sugItens[sugAtivo]); return; }
      var t = campo.value.trim(); if (!t) return; campo.value = ""; fecharSug(); perguntar(t);
    };
    campo.addEventListener("input", agendarSug);
    campo.addEventListener("keydown", teclasSug);
    campo.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement !== campo) fecharSug(); }, 150); });
    painel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (!sug.hidden) { fecharSug(); return; } fechar(); return; }
      if (e.key === "Tab" && telaCheia()) prenderFoco(e);
    });
    redesenharTudo();
  }
  function prenderFoco(e) {
    var f = Array.prototype.filter.call(painel.querySelectorAll("button, input, textarea, select, [tabindex]"), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) return;
    var pri = f[0], ult = f[f.length - 1];
    if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
  }
  function fechar() { estado.aberto = false; gravar(); fecharSug(); if (painel) painel.hidden = true; if (btn) { btn.hidden = false; btn.focus(); } }
  function rolar(instante) {
    if (!lista) return;
    if (instante) { var sbh = lista.style.scrollBehavior; lista.style.scrollBehavior = "auto"; lista.scrollTop = lista.scrollHeight; lista.style.scrollBehavior = sbh; return; }
    lista.scrollTop = lista.scrollHeight;
  }
  // Leva o topo da última resposta para perto do topo da conversa (respostas longas começam visíveis)
  function mostrar(no) {
    if (!lista || !no) return;
    // mantém à vista a pergunta da pessoa logo acima da resposta, quando couber
    var ant = no.previousElementSibling, ancora = ant && ant.classList.contains("lvq-eu") ? ant : no;
    var topo = lista.getBoundingClientRect().top;
    var alvo = lista.scrollTop + ancora.getBoundingClientRect().top - topo - 12;
    if (no.getBoundingClientRect().bottom - ancora.getBoundingClientRect().top > lista.clientHeight - 24) alvo = lista.scrollTop + no.getBoundingClientRect().top - topo - 12;
    lista.scrollTop = Math.max(0, alvo);
  }
  function recomecar() { estado.msgs = []; gravar(); redesenharTudo(); lista.scrollTop = 0; campo.focus(); }
  function redesenharTudo() {
    lista.innerHTML = "";
    if (!estado.msgs.length) { lista.appendChild(telaInicial()); return; }
    estado.msgs.forEach(function (m, i) { desenhar(m, true, i === estado.msgs.length - 1); });
  }

  // ------------------------------------------------------------ tela inicial
  function botaoPergunta(id) {
    var it = ITENS[id]; if (!it) return null;
    var b = el("button"); b.type = "button"; b.textContent = it.p;
    b.onclick = function () { abrirResposta(it, it.p); };
    return b;
  }
  function telaInicial() {
    var w = el("div", "lvq-ini");
    var t = temaDaPagina();
    w.appendChild(el("div", "", "<h2>Como posso ajudar?</h2><p>Escreva com suas palavras ou escolha um assunto. As perguntas parecidas aparecem enquanto você digita.</p>"));
    var ids = (t ? t.ids : (BASE.inicio || [])).slice(0, 4);
    if (ids.length) {
      var s = el("div", "lvq-sec"); s.appendChild(el("span", "", t ? "Sobre " + esc(t.curto || t.t) : "Perguntas frequentes"));
      var qs = el("div", "lvq-qs"); ids.forEach(function (id) { var b = botaoPergunta(id); if (b) qs.appendChild(b); });
      s.appendChild(qs); w.appendChild(s);
    }
    var s2 = el("div", "lvq-sec"); s2.appendChild(el("span", "", "Assuntos"));
    var g = el("div", "lvq-temas");
    BASE.temas.forEach(function (tm) {
      var b = el("button", t && t.id === tm.id ? "lvq-aqui" : "", "<b>" + esc(tm.t) + "</b>" + (tm.d ? "<small>" + esc(tm.d) + "</small>" : ""));
      b.type = "button";
      if (t && t.id === tm.id) b.setAttribute("aria-current", "page");
      b.onclick = function () { abrirTema(tm); };
      g.appendChild(b);
    });
    s2.appendChild(g); w.appendChild(s2);
    var eq = el("button", "lvq-equipe"); eq.type = "button"; eq.textContent = "Prefiro escrever para a equipe";
    eq.onclick = function () { falar({ de: "eu", t: "Quero falar com a equipe" }); falar({ de: "bot", nota: "Preencha e envie. A resposta chega no seu e-mail, em dias úteis.", form: "Suporte à conta" }); };
    w.appendChild(eq);
    return w;
  }

  // ------------------------------------------------------------ mensagens
  // {de:"eu", t} | {de:"bot", id, titulo, t, ac:[], rel:[], fb, q} | {de:"bot", nota, ch:[{t,id|tema|acao}], form}
  function falar(m, atraso) {
    var ini = lista.querySelector(".lvq-ini"); if (ini) ini.remove();
    estado.msgs.push(m); gravar();
    if (!atraso || REDUZ) { var n = desenhar(m); m.de === "bot" ? mostrar(n) : rolar(); return; }
    var d = el("div", "lvq-dig", "<i></i><i></i><i></i>"); d.setAttribute("aria-hidden", "true");
    lista.appendChild(d); rolar();
    setTimeout(function () { d.remove(); var n = desenhar(m); mostrar(n); }, atraso);
  }
  function desenhar(m, antigo, ultimo) {
    var no;
    if (m.de === "eu") { no = el("div", "lvq-eu"); no.textContent = m.t; }
    else if (m.titulo || m.id) no = cartaoResposta(m);
    else {
      no = el("div", "lvq-nota", m.nota ? fmt(m.nota) : "");
      if (m.ch && m.ch.length) no.appendChild(listaEscolhas(m.ch));
    }
    if (!antigo) no.classList.add("lvq-novo");
    lista.appendChild(no);
    if (m.form && (!antigo || ultimo)) formulario(m.form, m.q);
    return no;
  }
  function listaEscolhas(ch) {
    var qs = el("div", "lvq-qs"); qs.style.marginTop = "8px";
    ch.forEach(function (x) {
      var b = el("button"); b.type = "button"; b.textContent = x.t;
      b.onclick = function () { clicar(x); };
      qs.appendChild(b);
    });
    return qs;
  }
  function cartaoResposta(m) {
    var c = el("article", "lvq-r");
    c.innerHTML = "<h3>" + esc(m.titulo) + "</h3>" + fmt(m.t);
    if (m.ac && m.ac.length) {
      var ac = el("div", "lvq-ac");
      m.ac.forEach(function (a, i) {
        var b = el("button", i === 0 ? "lvq-pri" : ""); b.type = "button"; b.textContent = a.t;
        b.onclick = function () {
          if (a.contato) { falar({ de: "eu", t: a.t }); falar({ de: "bot", nota: "Preencha e envie. A resposta chega no seu e-mail, em dias úteis.", form: a.contato, q: estado.digitada || "" }); return; }
          if (a.chat) { var it = ITENS[a.chat]; if (it) abrirResposta(it, a.t); return; }
          ir(a);
        };
        ac.appendChild(b);
      });
      c.appendChild(ac);
    }
    if (m.rel && m.rel.length) {
      var r = el("div", "lvq-rel"); r.appendChild(el("span", "", "Veja também"));
      m.rel.forEach(function (id) { var b = botaoPergunta(id); if (b) r.appendChild(b); });
      c.appendChild(r);
    }
    if (m.fb) {
      var f = el("div", "lvq-fb");
      if (m.av) f.textContent = m.av === "s" ? "Obrigado pelo retorno." : "Obrigado. Vamos melhorar esta resposta.";
      else {
        f.innerHTML = "<span>Esta resposta ajudou?</span><button type='button'>Sim</button><button type='button'>Não</button>";
        var bs = f.querySelectorAll("button");
        bs[0].onclick = function () { m.av = "s"; gravar(); f.textContent = "Obrigado pelo retorno."; registrar({ resposta_id: m.fb, util: true, pergunta: m.q || "" }); };
        bs[1].onclick = function () {
          m.av = "n"; gravar(); f.textContent = "Obrigado. Vamos melhorar esta resposta.";
          registrar({ resposta_id: m.fb, util: false, pergunta: m.q || "" });
          falar({ de: "bot", nota: "Quer tentar com outras palavras ou prefere que eu encaminhe sua dúvida para a equipe?", ch: [{ t: "Escrever para a equipe", acao: { contato: "Suporte à conta" } }, { t: "Ver os assuntos", acao: { inicio: true } }] });
        };
      }
      c.appendChild(f);
    }
    return c;
  }

  function abrirTema(tm) {
    falar({ de: "eu", t: tm.t });
    if (tm.ids.length === 1) { responder(ITENS[tm.ids[0]], tm.t); return; }
    falar({ de: "bot", nota: "Sobre **" + tm.t + "**, o que você quer saber?", ch: tm.ids.filter(function (id) { return ITENS[id]; }).map(function (id) { return { t: ITENS[id].p, id: id }; }) }, 260);
  }
  function abrirResposta(it, rotulo) { falar({ de: "eu", t: rotulo || it.p }); responder(it, rotulo || it.p); }
  function clicar(x) {
    if (x.tema) { abrirTema(TEMAS[x.tema]); return; }
    if (x.id) { abrirResposta(ITENS[x.id], x.t); return; }
    var a = x.acao || {};
    if (a.inicio) { recomecar(); return; }
    if (a.contato) { falar({ de: "eu", t: x.t }); falar({ de: "bot", nota: "Preencha e envie. A resposta chega no seu e-mail, em dias úteis.", form: a.contato, q: estado.digitada || "" }); return; }
    if (a.ir || a.url) ir(a);
  }

  function responder(it, q) {
    if (!it) return;
    var msg = { de: "bot", id: it.id, titulo: it.p, t: it.r, ac: it.a || [], rel: (it.rel || []).filter(function (id) { return ITENS[id]; }).slice(0, 3), fb: it.id, q: q };
    if (!it.dinamico) { falar(msg, 380); return; }
    dinamico(it.dinamico).then(function (extra) { if (extra) msg.t = extra + "\n" + it.r; falar(msg, 200); });
  }

  // Limites calibrados com a bateria de perguntas de teste (scripts/testes/chatbot)
  var CERTEZA = 3.2, FOLGA = 1.12, MINIMO = 1.2;
  function decidir(r) {
    var m = r[0], seg = r[1];
    if (!m || m.s < MINIMO) return "nada";
    if (m.s >= CERTEZA && (!seg || m.s >= seg.s * FOLGA)) return "certo";
    return "duvida";
  }
  var SAUDACAO = /^(oi+|ola|bom dia|boa tarde|boa noite|hey|e ai|tudo bem|opa)( tudo bem)?$/;
  var AGRADECE = /^(obrigad[oa]|valeu|vlw|brigad[oa]|ok|certo|entendi|perfeito|show|otimo|beleza|blz|muito obrigad[oa])$/;
  function perguntar(t) {
    estado.digitada = t;
    falar({ de: "eu", t: t });
    var n = norm(t);
    if (SAUDACAO.test(n)) { falar({ de: "bot", nota: "Olá! Escreva sua dúvida ou escolha um assunto.", ch: BASE.temas.slice(0, 6).map(function (x) { return { t: x.t, tema: x.id }; }) }, 260); return; }
    if (AGRADECE.test(n)) { falar({ de: "bot", nota: "Por nada! Se surgir outra dúvida, é só escrever aqui." }, 200); return; }
    var r = pontuar(t);
    var melhor = r[0], modo = decidir(r);
    if (modo === "certo") {
      registrar({ pergunta: t.slice(0, 300), resposta_id: melhor.it.id });
      responder(melhor.it, t);
      return;
    }
    if (modo === "duvida") {
      registrar({ pergunta: t.slice(0, 300), resposta_id: "?" + melhor.it.id });
      falar({ de: "bot", nota: "Não tenho certeza se entendi. É sobre um destes assuntos?",
        ch: r.slice(0, 4).map(function (x) { return { t: x.it.p, id: x.it.id }; }).concat([{ t: "Nenhum desses: escrever para a equipe", acao: { contato: "Suporte à conta" } }]) }, 300);
      return;
    }
    registrar({ pergunta: t.slice(0, 300), resposta_id: "" });
    falar({ de: "bot", nota: "Ainda não sei responder isso. Tente com outras palavras (por exemplo: \"como pagar com Pix\"), veja os assuntos ou encaminhe sua dúvida para a equipe.",
      ch: [{ t: "Escrever para a equipe", acao: { contato: "Suporte à conta" } }, { t: "Ver os assuntos", acao: { inicio: true } }] }, 300);
  }

  // ------------------------------------------------------------ sugestões enquanto digita
  var tSug = 0;
  function agendarSug() { clearTimeout(tSug); tSug = setTimeout(atualizarSug, 90); }
  function atualizarSug() {
    var q = campo.value.trim();
    if (q.length < 3 || !fichas(q).length) { fecharSug(); return; }
    var r = pontuar(q).filter(function (x) { return x.s >= 0.9; }).slice(0, 5);
    if (!r.length) { fecharSug(); return; }
    sugItens = r.map(function (x) { return x.it; }); sugAtivo = -1;
    sug.innerHTML = "<span aria-hidden='true'>Perguntas parecidas na base</span>";
    sugItens.forEach(function (it, i) {
      var tm = BASE.temas.filter(function (t) { return t.ids.indexOf(it.id) >= 0; })[0];
      var li = el("li", "", "<span>" + marcar(it.p, q) + "</span>" + (tm ? "<small>" + esc(tm.t) + "</small>" : ""));
      li.id = "lvq-s" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
      li.addEventListener("mousedown", function (e) { e.preventDefault(); });
      li.onclick = function () { escolherSugestao(it); };
      sug.appendChild(li);
    });
    sug.hidden = false; campo.setAttribute("aria-expanded", "true"); campo.removeAttribute("aria-activedescendant");
  }
  function fecharSug() {
    if (!sug) return;
    sug.hidden = true; sug.innerHTML = ""; sugItens = []; sugAtivo = -1;
    campo.setAttribute("aria-expanded", "false"); campo.removeAttribute("aria-activedescendant");
  }
  function marcarAtivo(i) {
    var lis = sug.querySelectorAll("li");
    sugAtivo = i;
    Array.prototype.forEach.call(lis, function (li, k) { li.setAttribute("aria-selected", k === i ? "true" : "false"); });
    if (i >= 0 && lis[i]) { campo.setAttribute("aria-activedescendant", lis[i].id); lis[i].scrollIntoView({ block: "nearest" }); }
    else campo.removeAttribute("aria-activedescendant");
  }
  function teclasSug(e) {
    if (sug.hidden || !sugItens.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); marcarAtivo(sugAtivo + 1 >= sugItens.length ? 0 : sugAtivo + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcarAtivo(sugAtivo <= 0 ? sugItens.length - 1 : sugAtivo - 1); }
  }
  function escolherSugestao(it) {
    var digitado = campo.value.trim();
    campo.value = ""; fecharSug();
    estado.digitada = digitado;
    registrar({ pergunta: digitado.slice(0, 300), resposta_id: "~" + it.id });
    abrirResposta(it, it.p);
    campo.focus();
  }

  // ------------------------------------------------------------ formulário para a equipe
  var ASSUNTOS = ["Suporte à conta", "Assinatura e cobrança", "Privacidade (LGPD)", "Acessibilidade", "Correção na Biblioteca", "Parcerias"];
  function formulario(assunto, ultima) {
    var f = el("form", "lvq-c lvq-novo");
    f.innerHTML =
      "<label>Seu nome<input name='nome' required maxlength='160' autocomplete='name'></label>" +
      "<label>Seu e-mail<input name='email' type='email' required maxlength='200' autocomplete='email'></label>" +
      "<label>Assunto<select name='assunto'>" + ASSUNTOS.map(function (a) { return "<option" + (a === assunto ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("") + "</select></label>" +
      "<label>Mensagem<textarea name='mensagem' rows='4' required maxlength='4000'></textarea></label>" +
      "<p class='lvq-err' role='alert' hidden></p><button class='lvq-envf' type='submit'>Enviar para a equipe</button>";
    if (ultima && !/^(escrever|falar|quero falar|nenhum|remarcar|pedir|relatar|informar|denunciar|cupom com problema)/i.test(ultima)) f.mensagem.value = ultima;
    sessao().then(function (s) {
      if (!s || !sb) return;
      if (!f.email.value) f.email.value = s.user.email || "";
      sb.from("perfis").select("nome").eq("id", s.user.id).maybeSingle().then(function (r) { if (r && r.data && r.data.nome && !f.nome.value) f.nome.value = r.data.nome; }, function () {});
    });
    f.onsubmit = function (e) {
      e.preventDefault();
      var err = f.querySelector(".lvq-err"), bt = f.querySelector(".lvq-envf");
      var d = { nome: f.nome.value.trim(), email: f.email.value.trim(), assunto: f.assunto.value, mensagem: f.mensagem.value.trim() };
      function erro(m) { err.textContent = m; err.hidden = false; }
      if (d.nome.length < 2) return erro("Informe seu nome.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return erro("Confira o e-mail: falta o @ ou o domínio.");
      if (d.mensagem.length < 5) return erro("Escreva sua mensagem.");
      bt.disabled = true; bt.textContent = "Enviando…";
      conectar().then(function (c) {
        if (!c) throw new Error("sem conexão");
        return c.from("contatos").insert({ nome: d.nome, email: d.email, assunto: d.assunto, mensagem: d.mensagem, detalhes: { origem: "assistente", pagina: location.pathname.split("/").pop() + location.search } });
      }).then(function (r) {
        if (r && r.error) throw r.error;
        f.remove();
        falar({ de: "bot", nota: "Mensagem enviada. A equipe responde no e-mail **" + d.email + "**, em dias úteis." });
      }).catch(function () { bt.disabled = false; bt.textContent = "Enviar para a equipe"; erro("A mensagem não foi enviada. Tente de novo em instantes ou use a página Fale Conosco."); });
    };
    lista.appendChild(f);
    setTimeout(function () { mostrar(f); (f.nome.value ? f.mensagem : f.nome).focus({ preventScroll: true }); }, 50);
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
    BASE.temas.forEach(function (t) { TEMAS[t.id] = t; });
    prepararBusca();
    ler();
    // conversas antigas (formato anterior) não são compatíveis: começa do zero
    if (estado.msgs.some(function (m) { return m.de === "bot" && m.t && !m.titulo && !m.nota; })) estado.msgs = [];
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
