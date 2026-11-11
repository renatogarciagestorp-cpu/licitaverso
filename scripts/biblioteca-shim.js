/* Faz a página do Acervo Licitacon funcionar no site público, sem o Claude:
   - "decisoes" e "meta" vêm de acervo-completo.json (atualizado automaticamente);
   - com as contas ativas (config.js preenchido), a Biblioteca é para quem tem conta (gratuita, sem plano) e as
     anotações, marcadores, dossiês e preferências ficam salvos na conta da pessoa (Supabase),
     disponíveis em qualquer aparelho; sem contas, ficam no navegador (localStorage);
   - recursos que dependem do Claude (perguntar ao acervo, síntese, minuta, conferência de divergência) ficam ocultos. */
(function(){
  const DATA_URL = "acervo-completo.json"; // revalidado pelo navegador (cache "no-cache"): só baixa de novo se mudou
  let carga = null;
  const carregar = () => carga || (carga = fetch(DATA_URL, {cache:"no-cache"}).then(r => { if(!r.ok) throw new Error(r.status); return r.json(); }));
  const snap = rows => ({ docs: rows.map(([id, d]) => ({ id, data: () => d })) });
  const LS = "licitaverso:";
  const ler = p => { try { return JSON.parse(localStorage.getItem(LS + p) || "{}"); } catch(e) { return {}; } };
  const gravar = (p, o) => { try { localStorage.setItem(LS + p, JSON.stringify(o)); } catch(e) {} };
  const copia = d => JSON.parse(JSON.stringify(d));

  // ---- conta (Supabase) ------------------------------------------------------
  const LV = window.LV;
  const contas = LV ? LV.pronto : Promise.resolve(null);
  const sessao = contas.then(sb => sb ? sb.auth.getSession().then(r => (r && r.data && r.data.session) || null) : null).catch(() => null);
  // A Biblioteca é gratuita para quem tem conta (sem plano pago). Sem sessão, a página mostra a apresentação e os
  // botões de criar conta e entrar; o acervo fica oculto. Enquanto a sessão é conferida, o acervo não aparece.
  // Sem as contas configuradas (config.js vazio, como na demonstração local), a página continua aberta.
  const raizDoc = document.documentElement;
  raizDoc.classList.add("lv-verificando");
  const estilo = document.createElement("style");
  estilo.textContent = "html.lv-verificando body>.wrap{visibility:hidden}"
    + "html.lv-portao body>.wrap{display:none!important}"
    + "#lvPortao{margin-left:calc(-1*max(16px,env(safe-area-inset-left,0px)));margin-right:calc(-1*max(16px,env(safe-area-inset-right,0px)));background:#0F3431;color:#E6F1ED;font:400 16px/1.6 Manrope,system-ui,sans-serif;padding:72px 20px 88px}"
    + "#lvPortao .in{max-width:760px;margin:0 auto}"
    + "#lvPortao h1{font:800 clamp(30px,5vw,46px)/1.12 Manrope,system-ui,sans-serif;letter-spacing:-.02em;color:#fff;margin:0 0 16px}"
    + "#lvPortao p{margin:0 0 14px;max-width:62ch;color:#C3D9D3}"
    + "#lvPortao ul{list-style:none;margin:26px 0 30px;padding:0;display:grid;gap:12px}"
    + "#lvPortao li{display:grid;grid-template-columns:22px 1fr;gap:10px;color:#E6F1ED}"
    + "#lvPortao li::before{content:'';width:9px;height:9px;margin-top:9px;border-radius:50%;background:#6FE0AE}"
    + "#lvPortao .ac{display:flex;flex-wrap:wrap;gap:12px;align-items:center}"
    + "#lvPortao a.pri{background:#0FA36B;color:#04261A;border-radius:12px;padding:13px 20px;font-weight:800;text-decoration:none}"
    + "#lvPortao a.pri:hover{background:#14B978}"
    + "#lvPortao a.sec{color:#fff;font-weight:700;text-decoration:underline;text-underline-offset:4px;padding:13px 6px}"
    + "#lvPortao a:focus-visible{outline:3px solid #6FE0AE;outline-offset:3px}"
    + "#lvPortao small{display:block;margin-top:22px;color:#9FBDB4;font-size:13.5px}"
    + "#lvPortao button.pri{border:0;font:inherit;background:#0FA36B;color:#04261A;border-radius:12px;padding:13px 20px;font-weight:800;cursor:pointer}"
    + "#lvPortao button.pri:hover{background:#14B978}#lvPortao button:focus-visible{outline:3px solid #6FE0AE;outline-offset:3px}";
  document.head.appendChild(estilo);
  const liberar = () => { raizDoc.classList.remove("lv-verificando", "lv-portao"); const q = document.getElementById("lvPortao"); if (q) q.remove(); };
  const quandoPronto = (fn) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn();
  // painel no lugar do acervo (apresentação para quem não entrou, ou aviso de que a conta ainda está sendo conferida)
  const painel = (tipo, html) => quandoPronto(() => {
    raizDoc.classList.remove("lv-verificando");
    raizDoc.classList.add("lv-portao");
    let d = document.getElementById("lvPortao");
    if (d && d.dataset.tipo === tipo) return;
    if (!d) {
      d = document.createElement("section");
      d.id = "lvPortao"; d.setAttribute("aria-labelledby", "lvPortaoTit"); d.setAttribute("aria-live", "polite");
      const barra = document.querySelector(".lvbar");
      if (barra && barra.parentNode) barra.parentNode.insertBefore(d, barra.nextSibling); else document.body.prepend(d);
    }
    d.dataset.tipo = tipo;
    d.innerHTML = html;
    const b = d.querySelector("[data-recarregar]");
    if (b) b.onclick = () => location.reload();
  });
  // link direto para um item (#it-<id>, vindo da faixa da página inicial): guardado para depois do login
  try { if (/^#it-/.test(location.hash)) sessionStorage.setItem("lv-bib-ir", location.hash); } catch (e) {}
  const portao = () => painel("portao", '<div class="in"><h1 id="lvPortaoTit">A Biblioteca Jurídica é gratuita para quem tem conta.</h1>'
    + '<p>Crie sua conta grátis, sem cartão e sem plano, para pesquisar decisões e normas sobre licitações e contratos das fontes oficiais de todo o país.</p>'
    + '<ul><li>TCU, CGU, STF, STJ, tribunais de contas, tribunais de justiça e procuradorias dos estados, além de leis e decretos.</li>'
    + '<li>Filtros por órgão, tema, tipo, lei, artigo e período, com a citação pronta em ABNT ou para a peça.</li>'
    + '<li>Anotações, marcadores e dossiês salvos na sua conta, em qualquer aparelho.</li></ul>'
    + '<div class="ac"><a class="pri" href="index.html?p=cadastro&amp;volta=biblioteca">Criar conta grátis</a>'
    + '<a class="sec" href="index.html?p=login&amp;volta=biblioteca">Já tenho conta: entrar</a></div>'
    + '<small>A coleta nas fontes oficiais é automática.</small></div>');
  const aguardando = (falhou) => painel(falhou ? "falha" : "aguardando", '<div class="in"><h1 id="lvPortaoTit">'
    + (falhou ? "Não conseguimos conferir sua conta agora." : "Conferindo sua conta…") + '</h1>'
    + '<p>' + (falhou ? "Pode ser a conexão. Confira a internet e tente de novo." : "A conexão está lenta. O acervo abre assim que a conferência terminar.") + '</p>'
    + '<div class="ac"><button class="pri" type="button" data-recarregar>Tentar de novo</button>'
    + '<a class="sec" href="index.html?p=login&amp;volta=biblioteca">Entrar de novo</a></div></div>');
  let decidido = false;
  Promise.all([contas, sessao]).then(([sb, s]) => {
    decidido = true;
    // sem cliente: só libera se as contas não estão configuradas (demonstração local); configuradas e sem cliente
    // é falha ao carregar o login, e o acervo continua fechado
    const cfg = window.LICITAVERSO_CONFIG || {};
    if (!sb) { if (cfg.supabaseUrl && cfg.supabaseAnonKey) aguardando(true); else liberar(); return; }
    if (s) liberar(); else portao();
  }).catch(() => { decidido = true; aguardando(true); });
  // conferência demorada: avisa e espera (o acervo não é liberado sem a conta)
  setTimeout(() => { if (!decidido) aguardando(false); }, 8000);

  // Coleção pessoal guardada no Supabase (tabela biblioteca_pessoal), com cache local
  function colecaoNaConta(sb, uid){
    const ouvintes = [];
    let cache = null;
    const avisar = () => ouvintes.forEach(cb => cb(snap(Object.entries(cache || {}))));
    const carregarCache = async () => {
      if (cache) return cache;
      const { data, error } = await sb.from("biblioteca_pessoal").select("chave, dados").limit(5000);
      if (error) throw error;
      cache = {};
      (data || []).forEach(r => { cache[r.chave] = r.dados; });
      // Primeiro acesso logado: leva o que estava salvo só neste navegador para a conta
      const locais = Object.entries(ler("data/users/visitante"));
      if (!(data || []).length && locais.length) {
        const linhas = locais.map(([chave, dados]) => ({ chave, dados }));
        const r = await sb.from("biblioteca_pessoal").upsert(linhas, { onConflict: "usuario_id,chave" });
        if (!r.error) locais.forEach(([k, v]) => { cache[k] = v; });
      }
      return cache;
    };
    const salvar = async (id, d) => {
      const { error } = await sb.from("biblioteca_pessoal").upsert({ chave: id, dados: d }, { onConflict: "usuario_id,chave" });
      if (error) throw error;
      (await carregarCache())[id] = d; avisar();
    };
    return {
      onSnapshot(cb, err){ ouvintes.push(cb); carregarCache().then(() => cb(snap(Object.entries(cache)))).catch(e => err && err(e)); return () => {}; },
      doc(id){ return {
        async set(d){ await salvar(id, copia(d)); },
        async update(d){ const c = await carregarCache(); await salvar(id, Object.assign({}, c[id] || {}, copia(d))); },
        async delete(){ const { error } = await sb.from("biblioteca_pessoal").delete().eq("chave", id); if (error) throw error; const c = await carregarCache(); delete c[id]; avisar(); },
        async get(){ const c = await carregarCache(); return { exists: id in c, data: () => c[id] }; }
      }; }
    };
  }

  // Coleção pessoal guardada só neste navegador (modo demonstração)
  function colecaoLocal(p){
    const ouvintes = [];
    const avisar = () => ouvintes.forEach(cb => cb(snap(Object.entries(ler(p)))));
    return {
      onSnapshot(cb){ ouvintes.push(cb); cb(snap(Object.entries(ler(p)))); return () => {}; },
      doc(id){ return {
        async set(d){ const o = ler(p); o[id] = copia(d); gravar(p, o); avisar(); },
        async update(d){ const o = ler(p); o[id] = Object.assign({}, o[id] || {}, copia(d)); gravar(p, o); avisar(); },
        async delete(){ const o = ler(p); delete o[id]; gravar(p, o); avisar(); },
        async get(){ const o = ler(p); return { exists: id in o, data: () => o[id] }; }
      }; }
    };
  }

  const colecoesNaConta = {};
  function colecao(p){
    if (p === "decisoes" || p === "meta") {
      return {
        onSnapshot(cb, err){ carregar().then(j => cb(snap(p === "decisoes" ? j.decisoes : (j.meta || [])))).catch(e => err && err(e)); return () => {}; },
        doc(){ const nega = async () => { throw {code:"not_writer"}; }; return { set: nega, update: nega, delete: nega }; }
      };
    }
    const m = /^data\/users\/(.+)$/.exec(p);
    if (m && m[1] !== "visitante" && colecoesNaConta[m[1]]) return colecoesNaConta[m[1]];
    return colecaoLocal(p);
  }

  const usuario = {
    canEdit: async () => false, isOwner: async () => false, can: () => false,
    id: async () => {
      const [sb, s] = await Promise.all([contas, sessao]);
      if (sb && s && s.user) {
        colecoesNaConta[s.user.id] = colecoesNaConta[s.user.id] || colecaoNaConta(sb, s.user.id);
        return s.user.id;
      }
      return "visitante";
    }
  };
  const downloads = { async save({filename, data}){
    const blob = data instanceof Blob ? data : new Blob([data], {type: /\.json$/.test(filename) ? "application/json" : /\.csv$/.test(filename) ? "text/csv" : "text/markdown"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } };
  window.claude = { use: async n => n === "db" ? { collection: colecao } : n === "user" ? usuario : n === "downloads" ? downloads : null };

  // Barra do site: troca "Entrar / Cadastre-se" por "Minha conta / Sair" quando logado
  function ajustarBarra(s){
    const entrar = document.getElementById("lvEntrar"), cad = document.getElementById("lvCadastro");
    const conta = document.getElementById("lvConta"), sair = document.getElementById("lvSair");
    if (!entrar) return;
    const logado = !!s;
    entrar.hidden = logado; cad.hidden = logado; conta.hidden = !logado; sair.hidden = !logado;
    sair.onclick = async (e) => { e.preventDefault(); const sb = await contas; if (sb) await sb.auth.signOut(); location.href = "index.html"; };
  }
  sessao.then(s => quandoPronto(() => ajustarBarra(s)));
})();
