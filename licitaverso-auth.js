/* Licitaverso — conexão com o Supabase, compartilhada por index.html, biblioteca.html e painel.html.
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
      var fontes = c.supabaseJs ? [c.supabaseJs].concat(CDNS) : CDNS;
      for (var i = 0; i < fontes.length; i++) {
        try { await carregar(fontes[i]); break; } catch (e) { if (i === fontes.length - 1) throw e; }
      }
    }
    return window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "licitaverso-auth" }
    });
  })().catch(function (e) {
    console.error("[Licitaverso] Não foi possível conectar ao Supabase:", e);
    return null;
  });

  window.LV = {
    pronto: pronto,
    base: base,
    sessao: function () {
      return pronto.then(function (sb) {
        if (!sb) return null;
        return sb.auth.getSession().then(function (r) { return (r && r.data && r.data.session) || null; });
      });
    }
  };
})();
