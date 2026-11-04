/* Licitacon — gestão dos acessos de um plano de equipe (empresa ou órgão), para o gestor indicado na contratação. */
(function () {
  if (window.LV_EQUIPE) return;
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  async function abrir(aoMudar) {
    var sb = await window.LV.pronto; if (!sb) return;
    var fundo = el("div", "position:fixed;inset:0;background:rgba(6,20,27,.72);z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Manrope,-apple-system,Segoe UI,sans-serif");
    var cx = el("div", "background:#fff;color:#0A1F2A;border-radius:14px;max-width:560px;width:100%;padding:24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:92vh;overflow:auto");
    fundo.appendChild(cx); document.body.appendChild(fundo);
    fundo.addEventListener("click", function (e) { if (e.target === fundo) fechar(); });
    function fechar() { fundo.remove(); if (aoMudar) aoMudar(); }
    async function desenhar(org, msg) {
      if (!org) { var r = await sb.rpc("minha_organizacao"); org = r.data; }
      if (!org || !org.gestor) { cx.innerHTML = "<p>Somente o gestor da equipe gerencia os acessos.</p>"; return; }
      var livres = org.acessos - org.usados;
      cx.innerHTML = "<h2 style='margin:0 0 4px;font-size:20px'>Acessos da equipe</h2>" +
        "<p style='margin:0;color:#55666D;font-size:14px'>" + esc(org.nome) + " · " + org.usados + " de " + org.acessos + " acessos em uso. Cada acesso é de uma pessoa (e-mail); não compartilhe senhas. A pessoa entra no site com esse e-mail (cadastro gratuito ou Google).</p>";
      var lista = el("div", "margin-top:14px;border:1px solid #E6EBEA;border-radius:10px");
      (org.membros || []).forEach(function (m) {
        var lin = el("div", "display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #EEF2F1;font-size:14px");
        lin.innerHTML = "<div style='flex:1;min-width:0'><b>" + esc(m.nome || m.email) + "</b>" + (m.nome ? "<br><span style='color:#7A8B91;font-size:12.5px'>" + esc(m.email) + "</span>" : "") +
          (m.cadastrado ? "" : "<br><span style='color:#B26B00;font-size:12.5px'>ainda não criou a conta no site</span>") + "</div>" +
          (m.papel === "gestor" ? "<span style='font-size:12px;font-weight:700;color:#0F6B7E'>GESTOR</span>" : "");
        if (m.papel !== "gestor") {
          var b = el("button", "background:#fff;border:1px solid #E7C9D2;color:#8A1230;border-radius:8px;padding:7px 10px;font:600 13px inherit;cursor:pointer", "Retirar");
          b.onclick = async function () { if (!confirm("Retirar o acesso de " + m.email + "?")) return; var r = await sb.rpc("org_definir_membro", { p_email: m.email, p_incluir: false }); desenhar(r.error ? null : r.data, r.error ? r.error.message : "Acesso retirado."); };
          lin.appendChild(b);
        }
        lista.appendChild(lin);
      });
      cx.appendChild(lista);
      var linha = el("div", "display:flex;gap:8px;margin-top:14px;flex-wrap:wrap");
      var inp = el("input", "flex:1;min-width:200px;padding:10px;border:1px solid #C9D3D2;border-radius:9px;font:15px inherit"); inp.type = "email"; inp.placeholder = livres > 0 ? "e-mail da pessoa" : "todos os acessos em uso";
      inp.disabled = livres <= 0;
      var add = el("button", "background:#0FA36B;color:#06251A;border:0;border-radius:9px;padding:10px 14px;font:700 14px inherit;cursor:pointer", "Incluir acesso"); add.disabled = livres <= 0;
      add.onclick = async function () { var r = await sb.rpc("org_definir_membro", { p_email: inp.value, p_incluir: true }); desenhar(r.error ? null : r.data, r.error ? r.error.message : "Acesso incluído. Avise a pessoa para entrar no site com esse e-mail."); };
      linha.appendChild(inp); linha.appendChild(add); cx.appendChild(linha);
      if (msg) cx.appendChild(el("p", "margin:10px 0 0;font-size:13.5px;color:" + (/inclu|retirad/i.test(msg) ? "#0A7A50" : "#8A1230"), esc(msg)));
      cx.appendChild(el("p", "margin:12px 0 0;font-size:12.5px;color:#7A8B91", "Precisa de mais acessos ou trocar o gestor? Fale com o Licitacon pelo Fale conosco."));
      var f = el("button", "margin-top:12px;background:#fff;border:1px solid #DDE4E3;color:#3D5058;border-radius:9px;padding:10px 14px;font:600 14px inherit;cursor:pointer", "Fechar");
      f.onclick = fechar; cx.appendChild(f);
    }
    desenhar(null);
  }
  window.LV_EQUIPE = { abrir: abrir };
})();
