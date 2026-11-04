/* Licitacon — conexão com o Supabase, compartilhada por index.html, biblioteca.html e painel.html.
   Expõe window.LV:
     LV.pronto   → Promise que resolve com o cliente Supabase (ou null em modo demonstração)
     LV.sessao() → Promise com a sessão atual (ou null)
     LV.base()   → endereço da pasta do site (para links de retorno) */
(function () {
  if (window.LV) return;
  var VERSAO = "2.118.0";
  var CDNS = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@" + VERSAO + "/dist/umd/supabase.js",
    "https://unpkg.com/@supabase/supabase-js@" + VERSAO + "/dist/umd/supabase.js"
  ];

  function carregar(src) {
    return new Promise(function (ok, falha) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = function () { falha(new Error("não carregou " + src)); };
      document.head.appendChild(s);
    });
  }

  function base() {
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  }

  var pronto = (async function () {
    if (!window.LICITAVERSO_CONFIG) {
      try { await carregar(base() + "config.js?v=" + Date.now()); } catch (e) { /* sem config = demonstração */ }
    }
    var c = window.LICITAVERSO_CONFIG || {};
    if (!c.supabaseUrl || !c.supabaseAnonKey) return null;
    if (!(window.supabase && window.supabase.createClient)) {
      // primeiro a cópia local (mesma origem, sem depender de CDN de terceiros); os CDNs ficam só de reserva
      var fontes = [base() + "vendor/supabase-js-" + VERSAO + ".js"].concat(c.supabaseJs ? [c.supabaseJs] : [], CDNS);
      for (var i = 0; i < fontes.length; i++) {
        try { await carregar(fontes[i]); break; } catch (e) { if (i === fontes.length - 1) throw e; }
      }
    }
    return window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "licitaverso-auth" }
    });
  })().catch(function (e) {
    console.error("[Licitacon] Não foi possível conectar ao Supabase:", e);
    return null;
  });

  // Medição de visitas: só com o consentimento "todos" e fora do painel administrativo.
  var analiseCarregada = false;
  function analise() {
    if (analiseCarregada || /painel\.html/.test(location.pathname)) return;
    var consentimento = null;
    try { consentimento = localStorage.getItem("licitaverso:cookies"); } catch (e) {}
    if (consentimento !== "todos") return;
    var token = (window.LICITAVERSO_CONFIG || {}).cloudflareAnalytics;
    if (!token) return;
    analiseCarregada = true;
    var s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: token }));
    document.head.appendChild(s);
  }
  pronto.then(analise);

  // ------------------------------------------------------------------ verificação em duas etapas (aplicativo autenticador)
  // Obrigatória para a conta administradora; opcional para assinantes (Minha conta → Privacidade → Verificação em duas etapas).
  var mfaAberto = false;
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function modal(titulo, fechavel) {
    var fundo = el("div", "position:fixed;inset:0;background:rgba(6,20,27,.72);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Manrope,-apple-system,Segoe UI,sans-serif");
    var cx = el("div", "background:#fff;color:#0A1F2A;border-radius:14px;max-width:420px;width:100%;padding:24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:92vh;overflow:auto");
    cx.appendChild(el("h2", "margin:0 0 6px;font-size:20px;line-height:1.25", titulo));
    var corpo = el("div", "font-size:14px;line-height:1.55;color:#3D5058");
    cx.appendChild(corpo); fundo.appendChild(cx); document.body.appendChild(fundo); mfaAberto = true;
    function fechar() { fundo.remove(); mfaAberto = false; }
    if (fechavel) fundo.addEventListener("click", function (ev) { if (ev.target === fundo) fechar(); });
    return { corpo: corpo, fechar: fechar };
  }
  function botao(txt, principal) {
    return el("button", "font:600 14px/1 inherit;padding:11px 16px;border-radius:9px;cursor:pointer;margin:12px 8px 0 0;" +
      (principal ? "background:#0FA36B;color:#06251A;border:1px solid #0FA36B" : "background:#fff;color:#3D5058;border:1px solid #DDE4E3"), txt);
  }
  function campoCodigo() {
    var i = el("input", "width:100%;box-sizing:border-box;font:700 22px/1.2 Manrope,system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.3em;text-align:center;padding:10px;border:1px solid #C9D3D2;border-radius:9px;margin-top:12px");
    i.inputMode = "numeric"; i.autocomplete = "one-time-code"; i.maxLength = 6; i.placeholder = "000000";
    i.addEventListener("input", function () { i.value = i.value.replace(/\D/g, "").slice(0, 6); });
    return i;
  }
  function aviso() { return el("div", "color:#8A1230;font-size:13px;margin-top:8px;min-height:18px"); }
  async function sair(sb) { try { await sb.auth.signOut(); } catch (e) {} location.href = base() + "index.html"; }
  async function souAdmin(sb, uid) {
    try { var r = await sb.from("perfis").select("admin").eq("id", uid).maybeSingle(); return !!(r.data && r.data.admin); } catch (e) { return false; }
  }

  // pede o código de 6 dígitos de quem já tem a verificação ativa
  function pedirCodigo(sb, fator) {
    if (mfaAberto) return;
    var m = modal("Verificação em duas etapas", false);
    m.corpo.appendChild(el("p", "margin:0", "Digite o código de 6 dígitos que aparece no seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy…)."));
    var i = campoCodigo(), av = aviso(), ok = botao("Confirmar", true), sai = botao("Sair da conta");
    m.corpo.appendChild(i); m.corpo.appendChild(av); m.corpo.appendChild(ok); m.corpo.appendChild(sai);
    m.corpo.appendChild(el("p", "margin:14px 0 0;font-size:12.5px;color:#7A8B91", "Perdeu o acesso ao aplicativo? Escreva para a equipe do Licitacon pelo Fale conosco, com o e-mail da conta, para remover a verificação depois de confirmarmos sua identidade."));
    async function confirmar() {
      if (i.value.length !== 6) { av.textContent = "O código tem 6 dígitos."; return; }
      ok.disabled = true; av.textContent = "";
      var r = await sb.auth.mfa.challengeAndVerify({ factorId: fator.id, code: i.value });
      if (r.error) { ok.disabled = false; av.textContent = "Código inválido ou expirado. Confira a hora do celular e tente de novo."; i.value = ""; i.focus(); return; }
      location.reload();
    }
    ok.onclick = confirmar; i.addEventListener("keydown", function (e) { if (e.key === "Enter") confirmar(); });
    sai.onclick = function () { sair(sb); };
    setTimeout(function () { i.focus(); }, 50);
  }

  // cadastra o aplicativo autenticador (obrigatório = sem botão de cancelar)
  async function cadastrar(sb, obrigatorio) {
    if (mfaAberto) return;
    var m = modal(obrigatorio ? "Ative a verificação em duas etapas" : "Verificação em duas etapas", !obrigatorio);
    m.corpo.appendChild(el("p", "margin:0", obrigatorio
      ? "A conta de administração do Licitacon exige um código do aplicativo autenticador a cada acesso. Ative agora para continuar."
      : "Proteja sua conta: além da senha, o login passa a pedir um código do seu aplicativo autenticador."));
    var area = el("div", "margin-top:10px", "Preparando…"); m.corpo.appendChild(area);
    try {
      var lf = await sb.auth.mfa.listFactors();
      var pend = ((lf.data && lf.data.all) || []).filter(function (f) { return f.status !== "verified"; });
      for (var k = 0; k < pend.length; k++) await sb.auth.mfa.unenroll({ factorId: pend[k].id });
    } catch (e) {}
    var en = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Aplicativo " + new Date().toISOString().slice(0, 10) });
    if (en.error || !en.data) { area.innerHTML = "Não foi possível iniciar agora (" + (en.error ? en.error.message : "erro") + "). Tente de novo mais tarde."; var f0 = botao("Fechar"); f0.onclick = m.fechar; if (!obrigatorio) area.appendChild(f0); return; }
    area.innerHTML = "";
    area.appendChild(el("p", "margin:0 0 6px", "<b>1.</b> Instale um aplicativo autenticador no celular e leia o QR code:"));
    var qr = el("img", "display:block;width:190px;height:190px;margin:6px auto;border:1px solid #E6ECEB;border-radius:8px");
    qr.alt = "QR code da verificação em duas etapas"; qr.src = en.data.totp.qr_code; area.appendChild(qr);
    area.appendChild(el("p", "margin:4px 0 0;font-size:12.5px;color:#7A8B91;word-break:break-all", "Sem câmera? Digite esta chave no aplicativo: <code>" + en.data.totp.secret + "</code>"));
    area.appendChild(el("p", "margin:12px 0 0", "<b>2.</b> Digite o código de 6 dígitos que o aplicativo mostrar:"));
    var i = campoCodigo(), av = aviso(), ok = botao("Ativar", true);
    area.appendChild(i); area.appendChild(av); area.appendChild(ok);
    var outro = botao(obrigatorio ? "Sair da conta" : "Cancelar"); area.appendChild(outro);
    outro.onclick = async function () { if (obrigatorio) { sair(sb); return; } try { await sb.auth.mfa.unenroll({ factorId: en.data.id }); } catch (e) {} m.fechar(); };
    async function ativar() {
      if (i.value.length !== 6) { av.textContent = "O código tem 6 dígitos."; return; }
      ok.disabled = true; av.textContent = "";
      var r = await sb.auth.mfa.challengeAndVerify({ factorId: en.data.id, code: i.value });
      if (r.error) { ok.disabled = false; av.textContent = "Código inválido. Confira se o celular está com a hora certa e tente de novo."; i.value = ""; i.focus(); return; }
      area.innerHTML = "<p style='margin:0;color:#0A7A50;font-weight:600'>Pronto! A verificação em duas etapas está ativa.</p><p style='margin:8px 0 0'>Nos próximos acessos, depois da senha, o site vai pedir o código do aplicativo. Guarde o aplicativo no celular; se trocar de aparelho, transfira as contas do autenticador antes.</p>";
      var f = botao("Continuar", true); f.onclick = function () { location.reload(); }; area.appendChild(f);
    }
    ok.onclick = ativar; i.addEventListener("keydown", function (e) { if (e.key === "Enter") ativar(); });
  }

  // confere a sessão: pede o código se a conta já tem verificação; exige cadastro se for administradora
  async function conferirMfa() {
    var sb = await pronto; if (!sb || !sb.auth.mfa) return;
    var r = await sb.auth.getSession(); var sess = r && r.data && r.data.session; if (!sess) return;
    var nivel = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    var d = (nivel && nivel.data) || {};
    if (d.currentLevel === "aal2") return;
    var lf = await sb.auth.mfa.listFactors();
    var ativos = (lf.data && lf.data.totp || []).filter(function (f) { return f.status === "verified"; });
    if (ativos.length) { pedirCodigo(sb, ativos[0]); return; }
    if (await souAdmin(sb, sess.user.id)) cadastrar(sb, true);
  }
  pronto.then(function (sb) {
    if (!sb) return;
    conferirMfa();
    sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_IN" || ev === "MFA_CHALLENGE_VERIFIED") setTimeout(conferirMfa, 300); });
  });

  // tela "gerenciar" para a área do assinante
  async function gerenciar() {
    var sb = await pronto; if (!sb) return;
    var r = await sb.auth.getSession(); var sess = r && r.data && r.data.session;
    if (!sess) { location.href = base() + "index.html?p=login&volta=conta"; return; }
    var lf = await sb.auth.mfa.listFactors();
    var ativos = (lf.data && lf.data.totp || []).filter(function (f) { return f.status === "verified"; });
    if (!ativos.length) { cadastrar(sb, false); return; }
    var admin = await souAdmin(sb, sess.user.id);
    var m = modal("Verificação em duas etapas", true);
    m.corpo.appendChild(el("p", "margin:0", "<b style='color:#0A7A50'>Ativa.</b> Cada login pede, além da senha, o código do seu aplicativo autenticador." +
      (admin ? " Para a conta de administração ela é obrigatória e não pode ser desativada." : "")));
    var av = aviso(); m.corpo.appendChild(av);
    if (!admin) {
      var des = botao("Desativar"); m.corpo.appendChild(des);
      des.onclick = async function () {
        if (!confirm("Desativar a verificação em duas etapas? Sua conta voltará a depender só da senha.")) return;
        for (var k = 0; k < ativos.length; k++) {
          var u = await sb.auth.mfa.unenroll({ factorId: ativos[k].id });
          if (u.error) { av.textContent = "Para desativar, entre de novo confirmando o código do aplicativo e tente outra vez."; return; }
        }
        m.corpo.innerHTML = "<p style='margin:0'>Verificação em duas etapas desativada.</p>";
        var f = botao("Fechar", true); f.onclick = m.fechar; m.corpo.appendChild(f);
      };
    }
    var fe = botao("Fechar", !!admin); fe.onclick = m.fechar; m.corpo.appendChild(fe);
  }

  window.LV = {
    pronto: pronto,
    analise: analise,
    base: base,
    mfa: { gerenciar: gerenciar, conferir: conferirMfa },
    sessao: function () {
      return pronto.then(function (sb) {
        if (!sb) return null;
        return sb.auth.getSession().then(function (r) { return (r && r.data && r.data.session) || null; });
      });
    }
  };
})();
