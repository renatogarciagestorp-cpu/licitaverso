/* Licitacon — entrega dos documentos gerados no site: caixa "Documento pronto" com Baixar e Salvar no Google Drive.
 * O site não guarda os documentos gerados: depois de fechar a caixa, eles ficam só no computador (se baixados) ou na
 * pasta do Google Drive da pessoa (se salvos).
 *
 * Uso: window.LV_ARQ.entregar(nome, blob)          → mostra a caixa (arquivos gerados juntos aparecem juntos)
 *      window.LV_ARQ.abrir({ extensoes, origem })  → { nome, blob } do computador ("computador") ou do Drive ("drive")
 *      window.LV_ARQ.driveAtivo()                  → true quando o Drive está configurado no config.js
 *
 * Google Drive: escopo drive.file (o site só enxerga os arquivos que ele mesmo grava e os que a pessoa escolhe na
 * janela do Google). Precisa, no config.js: googleClientId, googleApiKey e googleAppId (número do projeto). */
(function () {
  if (window.LV_ARQ) return;
  var ESCOPO = "https://www.googleapis.com/auth/drive.file";
  var PASTA_KEY = "lv-drive-pasta";
  var cfg = function () { return window.LICITAVERSO_CONFIG || {}; };
  var driveAtivo = function () { var c = cfg(); return !!(c.googleClientId && c.googleApiKey && c.googleAppId); };

  // ---------------------------------------------------------------- utilidades
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tamanho(n) { return n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1).replace(".", ",") + " MB"; }
  function lerPasta() { try { var p = JSON.parse(localStorage.getItem(PASTA_KEY) || "null"); return p && p.id ? p : null; } catch (e) { return null; } }
  function gravarPasta(p) { try { localStorage.setItem(PASTA_KEY, JSON.stringify(p)); } catch (e) {} }
  function carregar(src) {
    return new Promise(function (ok, falha) {
      if (document.querySelector('script[src="' + src + '"]')) { var t = setInterval(function () { if (src.indexOf("gsi") > 0 ? window.google && google.accounts : window.gapi) { clearInterval(t); ok(); } }, 50); setTimeout(function () { clearInterval(t); ok(); }, 8000); return; }
      var s = document.createElement("script"); s.src = src; s.async = true; s.onload = function () { ok(); }; s.onerror = function () { falha(new Error("google_indisponivel")); };
      document.head.appendChild(s);
    });
  }
  function baixar(nome, blob) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // ---------------------------------------------------------------- Google Drive
  var token = null, tokenAte = 0, cliente = null, pedidoToken = null, pickerPronto = null;
  function prepararGoogle() {
    if (!driveAtivo()) return Promise.resolve();
    return Promise.all([carregar("https://accounts.google.com/gsi/client"), carregar("https://apis.google.com/js/api.js")]).then(function () {
      if (!window.gapi || !window.google || !window.google.accounts) throw new Error("google_indisponivel");
      if (!pickerPronto) pickerPronto = new Promise(function (ok) { window.gapi.load("picker", { callback: ok }); });
      if (!cliente) cliente = window.google.accounts.oauth2.initTokenClient({ client_id: cfg().googleClientId, scope: ESCOPO, callback: function (r) {
        var p = pedidoToken; pedidoToken = null; if (!p) return;
        if (r && r.access_token) { token = r.access_token; tokenAte = Date.now() + ((r.expires_in || 3600) - 60) * 1000; p.ok(token); } else p.falha(new Error("google_negado"));
      }, error_callback: function () { var p = pedidoToken; pedidoToken = null; if (p) p.falha(new Error("google_negado")); } });
      return pickerPronto;
    });
  }
  // precisa ser chamado dentro do clique (o Google abre uma janela)
  function obterToken() {
    if (token && Date.now() < tokenAte) return Promise.resolve(token);
    return new Promise(function (ok, falha) { pedidoToken = { ok: ok, falha: falha }; cliente.requestAccessToken({ prompt: token ? "" : "consent" }); });
  }
  function picker(view, titulo) {
    return new Promise(function (ok) {
      var P = window.google.picker;
      var pk = new P.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg().googleApiKey).setAppId(String(cfg().googleAppId))
        .setLocale("pt-BR").setTitle(titulo).setCallback(function (d) {
          if (d.action === P.Action.PICKED) ok(d.docs && d.docs[0]); else if (d.action === P.Action.CANCEL) ok(null);
        }).build();
      pk.setVisible(true);
    });
  }
  function escolherPasta() {
    return obterToken().then(function () {
      var P = window.google.picker;
      var v = new P.DocsView(P.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes("application/vnd.google-apps.folder");
      return picker(v, "Escolha a pasta onde o Licitacon vai salvar seus documentos");
    }).then(function (doc) { if (!doc) return null; var p = { id: doc.id, nome: doc.name }; gravarPasta(p); return p; });
  }
  function criarPasta() {
    return obterToken().then(function (t) {
      return fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Licitacon", mimeType: "application/vnd.google-apps.folder" }) });
    }).then(function (r) { if (!r.ok) throw new Error("drive_" + r.status); return r.json(); })
      .then(function (j) { var p = { id: j.id, nome: j.name }; gravarPasta(p); return p; });
  }
  function enviarDrive(arq, pasta) {
    var meta = { name: arq.nome, parents: [pasta.id] }, fronteira = "lvarq" + Math.random().toString(36).slice(2);
    var corpo = new Blob(["--" + fronteira + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + fronteira +
      "\r\nContent-Type: " + (arq.blob.type || "application/octet-stream") + "\r\n\r\n", arq.blob, "\r\n--" + fronteira + "--"]);
    return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + fronteira }, body: corpo
    }).then(function (r) { if (r.status === 404) { try { localStorage.removeItem(PASTA_KEY); } catch (e) {} throw new Error("pasta_sumiu"); } if (!r.ok) throw new Error("drive_" + r.status); return r.json(); });
  }

  // ---------------------------------------------------------------- caixa "Documento pronto"
  var fila = [], caixa = null, montar = null, avisoFechar = false;
  function estilo() {
    if (document.getElementById("lvArqCss")) return;
    var s = el("style", { id: "lvArqCss" });
    s.textContent = "#lvArq{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:16px;background:rgba(6,18,25,.55);font:500 14.5px/1.5 Manrope,system-ui,sans-serif;color:#0A1F2A}" +
      "#lvArq .cx{background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(6,18,25,.4);width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:22px 22px 18px}" +
      "#lvArq h2{margin:0 0 4px;font-size:19px;letter-spacing:-.01em}#lvArq .sub{margin:0 0 14px;color:#5F7077;font-size:13.5px}" +
      "#lvArq ul{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px}#lvArq li{border:1px solid #E3E9E8;border-radius:12px;padding:10px 12px;display:grid;gap:4px}" +
      "#lvArq li b{font-size:14px;word-break:break-word}#lvArq li small{color:#5F7077;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}" +
      "#lvArq .ok{color:#0B7A50;font-weight:700}#lvArq .er{color:#B42318;font-weight:700}#lvArq li a{color:#0F6B7E;font-weight:700}" +
      "#lvArq .aviso{background:#FFF8EC;border:1px solid #F1D49A;border-radius:12px;padding:10px 12px;font-size:13.5px;margin:0 0 14px}" +
      "#lvArq .pasta{font-size:13px;color:#5F7077;margin:-4px 0 12px}#lvArq .pasta button{background:none;border:0;padding:0;color:#0F6B7E;font:700 13px Manrope,system-ui,sans-serif;cursor:pointer;text-decoration:underline}" +
      "#lvArq .acoes{display:flex;flex-wrap:wrap;gap:8px}#lvArq .acoes button{border-radius:11px;padding:10px 14px;font:800 14px Manrope,system-ui,sans-serif;cursor:pointer;border:1px solid #CBD6D4;background:#fff;color:#0A1F2A}" +
      "#lvArq .acoes .pri{background:#0FA36B;border-color:#0FA36B;color:#06251A}#lvArq .acoes .fim{margin-left:auto}#lvArq .acoes button:disabled{opacity:.55;cursor:default}" +
      "#lvArq .conf{border-top:1px solid #EDF1F0;margin-top:14px;padding-top:12px}#lvArq .conf p{margin:0 0 10px;font-weight:700}" +
      "@media (max-width:520px){#lvArq .acoes button{flex:1 1 100%}#lvArq .acoes .fim{margin-left:0}}";
    document.head.appendChild(s);
  }
  function feita(a) { return a.baixado || a.drive; }
  function render() {
    if (!caixa) return;
    var dr = driveAtivo(), pasta = lerPasta(), n = fila.length, ocupado = fila.some(function (a) { return a.enviando; });
    var h = '<div class="cx" role="dialog" aria-modal="true" aria-labelledby="lvArqTit">' +
      '<h2 id="lvArqTit">' + (n > 1 ? "Documentos prontos (" + n + ")" : "Documento pronto") + "</h2>" +
      '<p class="sub">' + (dr ? "Baixe para o seu computador, salve na sua pasta do Google Drive ou faça os dois." : "Baixe agora para o seu computador.") + "</p><ul>" +
      fila.map(function (a) {
        return "<li><b>" + esc(a.nome) + "</b><small><span>" + tamanho(a.blob.size) + "</span>" +
          (a.baixado ? '<span class="ok">✓ Baixado</span>' : "") +
          (a.enviando ? "<span>Salvando no Drive…</span>" : a.drive ? '<span class="ok">✓ No Google Drive</span>' + (a.link ? ' <a href="' + esc(a.link) + '" target="_blank" rel="noopener">Abrir no Drive</a>' : "") : "") +
          (a.erro ? '<span class="er">' + esc(a.erro) + "</span>" : "") + "</small></li>";
      }).join("") + "</ul>" +
      (dr ? '<p class="pasta">' + (pasta ? "Pasta do Drive: <b>" + esc(pasta.nome) + '</b> · <button type="button" data-a="pasta">trocar</button>' : "Na primeira vez, o Google pede sua permissão e você escolhe a pasta (ou o Licitacon cria a pasta \"Licitacon\" no seu Drive).") + "</p>" : "") +
      '<p class="aviso">O Licitacon não guarda ' + (n > 1 ? "estes documentos" : "este documento") + ". Depois de fechar esta janela, você só " + (n > 1 ? "os" : "o") + " encontra " +
      (dr ? "no seu computador, se baixou, ou na sua pasta do Google Drive, se salvou." : "no seu computador, se baixou.") + "</p>" +
      '<div class="acoes">' +
      (dr ? '<button type="button" class="pri" data-a="ambos"' + (ocupado ? " disabled" : "") + ">Baixar e salvar no Drive</button>" +
        '<button type="button" data-a="baixar">Só baixar</button><button type="button" data-a="drive"' + (ocupado ? " disabled" : "") + ">Só salvar no Drive</button>"
        : '<button type="button" class="pri" data-a="baixar">Baixar</button>') +
      '<button type="button" class="fim" data-a="fechar"' + (ocupado ? " disabled" : "") + ">Fechar</button></div>" +
      (avisoFechar ? '<div class="conf" role="alert"><p>' + (n > 1 ? "Alguns documentos não foram baixados nem salvos." : "Você ainda não baixou nem salvou.") + " Fechar mesmo assim? " + (n > 1 ? "Eles serão descartados." : "O documento será descartado.") + "</p>" +
        '<div class="acoes"><button type="button" data-a="voltar">Voltar</button><button type="button" data-a="descartar">Fechar e descartar</button></div></div>' : "") +
      "</div>";
    caixa.innerHTML = h;
  }
  function fechar() { if (caixa) caixa.remove(); caixa = null; fila = []; avisoFechar = false; document.removeEventListener("keydown", tecla); }
  function tecla(e) { if (e.key === "Escape") acao("fechar"); }
  function salvarNoDrive(lista) {
    var pend = lista.filter(function (a) { return !a.drive && !a.enviando; }); if (!pend.length) return Promise.resolve();
    return obterToken().then(function () { var p = lerPasta(); if (p) return p; return escolherOuCriar(); }).then(function (pasta) {
      if (!pasta) return;
      pend.forEach(function (a) { a.enviando = true; a.erro = ""; }); render();
      return Promise.all(pend.map(function (a) {
        return enviarDrive(a, pasta).then(function (j) { a.drive = true; a.link = j.webViewLink || ""; }).catch(function (e) {
          a.erro = e.message === "pasta_sumiu" ? "A pasta do Drive não foi encontrada. Escolha outra e tente de novo." : "Não foi possível salvar no Drive. Tente de novo.";
        }).then(function () { a.enviando = false; render(); });
      }));
    }).catch(function (e) {
      lista.forEach(function (a) { if (!a.drive) a.erro = e.message === "google_negado" ? "O Google não autorizou o acesso ao Drive." : "Não foi possível conectar ao Google Drive."; }); render();
    });
  }
  // sem pasta escolhida: pergunta se escolhe uma ou cria a "Licitacon"
  function escolherOuCriar() {
    return new Promise(function (ok) {
      var cx = caixa && caixa.querySelector(".cx"); if (!cx) return ok(null);
      var d = el("div", { class: "conf" }, '<p>Onde salvar no seu Google Drive?</p><div class="acoes"><button type="button" class="pri" data-p="criar">Criar a pasta "Licitacon"</button><button type="button" data-p="escolher">Escolher uma pasta</button></div>');
      cx.appendChild(d);
      d.onclick = function (e) {
        var b = e.target.closest("[data-p]"); if (!b) return; d.remove();
        (b.dataset.p === "criar" ? criarPasta() : escolherPasta()).then(ok, function () { ok(null); });
      };
    });
  }
  function acao(a) {
    if (a === "baixar" || a === "ambos") fila.forEach(function (x) { if (!x.baixado) { baixar(x.nome, x.blob); x.baixado = true; } });
    if (a === "drive" || a === "ambos") salvarNoDrive(fila);
    if (a === "pasta") { obterToken().then(escolherPasta).then(render, render); return; }
    if (a === "fechar") { if (fila.some(function (x) { return !feita(x); })) { avisoFechar = true; render(); return; } fechar(); return; }
    if (a === "voltar") { avisoFechar = false; render(); return; }
    if (a === "descartar") { fechar(); return; }
    avisoFechar = false; render();
  }
  function mostrar() {
    estilo();
    if (!caixa) {
      caixa = el("div", { id: "lvArq" }); document.body.appendChild(caixa);
      caixa.addEventListener("click", function (e) { var b = e.target.closest("[data-a]"); if (b && !b.disabled) acao(b.dataset.a); });
      document.addEventListener("keydown", tecla);
      if (driveAtivo()) prepararGoogle().catch(function () {});  // carrega antes do clique: a janela do Google precisa abrir no clique
    }
    render();
    var p = caixa.querySelector(".pri"); if (p) p.focus();
  }
  function entregar(nome, blob) {
    if (!(blob instanceof Blob)) blob = new Blob([blob]);
    fila.push({ nome: nome, blob: blob, baixado: false, drive: false });
    clearTimeout(montar); montar = setTimeout(mostrar, 120);  // documentos gerados pelo mesmo clique aparecem juntos
  }

  // ---------------------------------------------------------------- abrir um arquivo salvo (computador ou Drive)
  function abrirComputador(extensoes) {
    return new Promise(function (ok) {
      var i = el("input", { type: "file", accept: (extensoes || []).join(",") }); i.style.display = "none"; document.body.appendChild(i);
      i.onchange = function () { var f = i.files && i.files[0]; i.remove(); ok(f ? { nome: f.name, blob: f } : null); };
      i.click();
    });
  }
  function abrirDrive(mimes) {
    return prepararGoogle().then(obterToken).then(function () {
      var P = window.google.picker, pasta = lerPasta();
      // mostra todos os arquivos da pasta (com o filtro, o Google diria só "Não há documentos"); a escolha é conferida abaixo
      var v = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setMode(P.DocsViewMode.LIST);
      if (pasta) v.setParent(pasta.id);
      return picker(v, "Escolha a planilha em Excel (.xlsx) salva pelo Licitacon. Só arquivos Excel são aceitos");
    }).then(function (doc) {
      if (!doc) return null;
      var aceito = (mimes || []).indexOf(doc.mimeType) >= 0 || /\.xlsx$/i.test(doc.name || "");
      if (!aceito) throw new Error("so_excel");
      return fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(doc.id) + "?alt=media", { headers: { Authorization: "Bearer " + token } })
        .then(function (r) { if (!r.ok) throw new Error("drive_" + r.status); return r.blob(); }).then(function (b) { return { nome: doc.name, blob: b }; });
    });
  }
  function abrir(o) { o = o || {}; return o.origem === "drive" ? abrirDrive(o.mimes) : abrirComputador(o.extensoes); }

  window.LV_ARQ = { entregar: entregar, abrir: abrir, driveAtivo: driveAtivo, prepararDrive: prepararGoogle, pasta: lerPasta };
})();
