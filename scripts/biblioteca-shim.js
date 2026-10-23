/* Faz a página do Acervo Licitaverso funcionar no site público, sem o Claude:
   - "decisoes" e "meta" vêm de acervo-completo.json (atualizado nos dias úteis);
   - anotações, marcadores e dossiês ficam guardados no navegador de cada visitante (localStorage);
   - recursos que dependem do Claude (perguntar ao acervo, síntese, minuta, conferência de divergência) ficam ocultos. */
(function(){
  const DATA_URL = "acervo-completo.json?v=" + Date.now();
  let carga = null;
  const carregar = () => carga || (carga = fetch(DATA_URL, {cache:"no-store"}).then(r => { if(!r.ok) throw new Error(r.status); return r.json(); }));
  const snap = rows => ({ docs: rows.map(([id, d]) => ({ id, data: () => d })) });
  const LS = "licitaverso:";
  const ler = p => { try { return JSON.parse(localStorage.getItem(LS + p) || "{}"); } catch(e) { return {}; } };
  const gravar = (p, o) => { try { localStorage.setItem(LS + p, JSON.stringify(o)); } catch(e) {} };
  const ouvintes = {};
  const avisar = p => (ouvintes[p] || []).forEach(cb => cb(snap(Object.entries(ler(p)))));
  function colecao(p){
    if (p === "decisoes" || p === "meta") {
      return {
        onSnapshot(cb, err){ carregar().then(j => cb(snap(p === "decisoes" ? j.decisoes : (j.meta || [])))).catch(e => err && err(e)); return () => {}; },
        doc(){ const nega = async () => { throw {code:"not_writer"}; }; return { set: nega, update: nega, delete: nega }; }
      };
    }
    return {
      onSnapshot(cb){ (ouvintes[p] = ouvintes[p] || []).push(cb); cb(snap(Object.entries(ler(p)))); return () => {}; },
      doc(id){ return {
        async set(d){ const o = ler(p); o[id] = JSON.parse(JSON.stringify(d)); gravar(p, o); avisar(p); },
        async update(d){ const o = ler(p); o[id] = Object.assign({}, o[id] || {}, JSON.parse(JSON.stringify(d))); gravar(p, o); avisar(p); },
        async delete(){ const o = ler(p); delete o[id]; gravar(p, o); avisar(p); },
        async get(){ const o = ler(p); return { exists: id in o, data: () => o[id] }; }
      }; }
    };
  }
  const usuario = { canEdit: async () => false, isOwner: async () => false, id: async () => "visitante", can: () => false };
  const downloads = { async save({filename, data}){
    const blob = data instanceof Blob ? data : new Blob([data], {type: /\.json$/.test(filename) ? "application/json" : /\.csv$/.test(filename) ? "text/csv" : "text/markdown"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } };
  window.claude = { use: async n => n === "db" ? { collection: colecao } : n === "user" ? usuario : n === "downloads" ? downloads : null };
})();
