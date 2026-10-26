/* Faz a página do Acervo Licitacon funcionar no site público, sem o Claude:
   - "decisoes" e "meta" vêm de acervo-completo.json (atualizado nos dias úteis);
   - com as contas ativas (config.js preenchido), a Biblioteca exige login e as anotações,
     marcadores, dossiês e preferências ficam salvos na conta da pessoa (Supabase),
     disponíveis em qualquer aparelho; sem contas, ficam no navegador (localStorage);
   - recursos que dependem do Claude (perguntar ao acervo, síntese, minuta, conferência de divergência) ficam ocultos. */
(function(){
  const DATA_URL = "acervo-completo.json?v=" + Date.now();
  let carga = null;
  const carregar = () => carga || (carga = fetch(DATA_URL, {cache:"no-store"}).then(r => { if(!r.ok) throw new Error(r.status); return r.json(); }));
  const snap = rows => ({ docs: rows.map(([id, d]) => ({ id, data: () => d })) });
  const LS = "licitaverso:";
  const ler = p => { try { return JSON.parse(localStorage.getItem(LS + p) || "{}"); } catch(e) { return {}; } };
  const gravar = (p, o) => { try { localStorage.setItem(LS + p, JSON.stringify(o)); } catch(e) {} };
  const copia = d => JSON.parse(JSON.stringify(d));

  // ---- conta (Supabase) ------------------------------------------------------
  const LV = window.LV;
  const contas = LV ? LV.pronto : Promise.resolve(null);
  const sessao = contas.then(sb => sb ? sb.auth.getSession().then(r => (r && r.data && r.data.session) || null) : null).catch(() => null);
  // Com contas ativas, a Biblioteca é exclusiva para quem tem cadastro
  Promise.all([contas, sessao]).then(([sb, s]) => {
    if (sb && !s) location.replace("index.html?p=login&volta=biblioteca");
  });

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
  const quandoPronto = f => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", f) : f();
  sessao.then(s => quandoPronto(() => ajustarBarra(s)));
})();
