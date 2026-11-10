/* Licitacon — verificação contra robôs (Cloudflare Turnstile) no cadastro, no login e na recuperação de senha.
 * Uso: const token = await window.LV_CAPTCHA.token();  → texto do desafio, ou null se a verificação não estiver
 * configurada (config.js sem turnstileSiteKey). O Supabase confere o token no servidor quando a "Captcha protection"
 * está ligada (Authentication → Attack Protection). Cada token vale para uma única tentativa.
 * Na maioria das vezes o desafio é invisível; quando a Cloudflare desconfia, aparece uma caixinha para marcar. */
(function () {
  if (window.LV_CAPTCHA) return;
  var API = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  var carga = null, host = null, widget = null, pendente = null;

  function chave() { return (window.LICITAVERSO_CONFIG || {}).turnstileSiteKey || ""; }

  function carregar() {
    if (window.turnstile) return Promise.resolve();
    if (carga) return carga;
    carga = new Promise(function (ok, falha) {
      var s = document.createElement("script");
      s.src = API; s.async = true; s.defer = true;
      s.onload = function () { ok(); };
      s.onerror = function () { carga = null; falha(new Error("captcha_indisponivel")); };
      document.head.appendChild(s);
    });
    return carga;
  }

  // caixa fixa fora da árvore da página (que é redesenhada a cada mudança): só aparece quando há algo para marcar
  function caixa() {
    if (host) return host;
    host = document.createElement("div");
    host.id = "lvCaptcha";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-label", "Verificação de segurança");
    host.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;display:none;"
      + "background:#fff;border:1px solid #DDE4E3;border-radius:16px;box-shadow:0 30px 80px rgba(6,18,25,.38);padding:14px 16px 12px;"
      + "font:600 13.5px/1.4 Manrope,system-ui,sans-serif;color:#0A1F2A;text-align:center;max-width:calc(100vw - 32px)";
    host.innerHTML = '<div style="margin:0 0 8px">Confirme que você não é um robô</div><div id="lvCaptchaW"></div>';
    document.body.appendChild(host);
    return host;
  }
  function mostrar(sim) { if (host) host.style.display = sim ? "block" : "none"; }

  function terminar(erro, token) {
    var p = pendente; pendente = null;
    mostrar(false);
    if (!p) return;
    clearTimeout(p.relogio);
    if (erro) p.falha(erro); else p.ok(token);
  }

  function token() {
    if (!chave()) return Promise.resolve(null);
    if (pendente) return pendente.promessa;
    var p = {};
    p.promessa = new Promise(function (ok, falha) { p.ok = ok; p.falha = falha; });
    pendente = p;
    carregar().then(function () {
      caixa();
      if (widget === null) {
        widget = window.turnstile.render("#lvCaptchaW", {
          sitekey: chave(), execution: "execute", appearance: "interaction-only", language: "pt-br",
          callback: function (t) { terminar(null, t); },
          "error-callback": function () { terminar(new Error("captcha_falhou")); return true; },
          "expired-callback": function () { if (window.turnstile && widget !== null) window.turnstile.reset(widget); },
          "timeout-callback": function () { terminar(new Error("captcha_tempo")); },
          "before-interactive-callback": function () { mostrar(true); },
          "after-interactive-callback": function () { mostrar(false); }
        });
      } else {
        window.turnstile.reset(widget);  // token é de uso único
      }
      window.turnstile.execute(widget);
    }).catch(function (e) { terminar(e); });
    // sem resposta em 2 minutos (desafio abandonado ou bloqueado): libera o botão com aviso
    p.relogio = setTimeout(function () { terminar(new Error("captcha_tempo")); }, 120000);
    return p.promessa;
  }

  // mensagem para a pessoa, em português
  function mensagem(e) {
    var c = e && e.message;
    if (c === "captcha_indisponivel") return "Não foi possível carregar a verificação de segurança. Confira a conexão (ou um bloqueador de anúncios) e tente de novo.";
    if (c === "captcha_tempo") return "A verificação de segurança não foi concluída. Tente de novo.";
    return "A verificação de segurança falhou. Recarregue a página e tente de novo.";
  }

  window.LV_CAPTCHA = { token: token, mensagem: mensagem, ativo: function () { return !!chave(); } };
})();
