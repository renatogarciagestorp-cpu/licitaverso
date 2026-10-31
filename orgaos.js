/* Catálogo de órgãos do acervo (Biblioteca Jurídica e gerador do acervo.json).
   Fonte única: a página (biblioteca.html) carrega este arquivo, e scripts/gerar-acervo.mjs o importa.
   Grupos: TCU, TCE (Tribunais de Contas dos Estados e do DF), TCM (Tribunais de Contas dos Municípios), CGU, STF, STJ,
   PGE (Procuradorias-Gerais dos Estados e do DF), TJ (Tribunais de Justiça), GOV-BR (normas federais), GOV-UF (normas estaduais). */
(function (g) {
  const UFS = [["AC","Acre"],["AL","Alagoas"],["AP","Amapá"],["AM","Amazonas"],["BA","Bahia"],["CE","Ceará"],["DF","Distrito Federal"],
    ["ES","Espírito Santo"],["GO","Goiás"],["MA","Maranhão"],["MT","Mato Grosso"],["MS","Mato Grosso do Sul"],["MG","Minas Gerais"],
    ["PA","Pará"],["PB","Paraíba"],["PR","Paraná"],["PE","Pernambuco"],["PI","Piauí"],["RJ","Rio de Janeiro"],["RN","Rio Grande do Norte"],
    ["RS","Rio Grande do Sul"],["RO","Rondônia"],["RR","Roraima"],["SC","Santa Catarina"],["SP","São Paulo"],["SE","Sergipe"],["TO","Tocantins"]];
  const NOME_UF = Object.fromEntries(UFS);
  const ENTE = uf => uf === "DF" ? "DISTRITO FEDERAL" : NOME_UF[uf].toUpperCase() + " (Estado)";
  const DE = uf => ({ AC: "do", AL: "de", AP: "do", AM: "do", BA: "da", CE: "do", DF: "do", ES: "do", GO: "de", MA: "do", MT: "de", MS: "de",
    MG: "de", PA: "do", PB: "da", PR: "do", PE: "de", PI: "do", RJ: "do", RN: "do", RS: "do", RO: "de", RR: "de", SC: "de", SP: "de",
    SE: "de", TO: "do" })[uf] + " " + NOME_UF[uf];
  const O = {};
  const add = (id, grupo, esfera, uf, ente, nome, municipio) => { O[id] = { id, grupo, esfera, uf, ente, nome, municipio: municipio || "" }; };
  add("TCU", "TCU", "União", "", "BRASIL", "Tribunal de Contas da União");
  add("CGU", "CGU", "União", "", "BRASIL", "Controladoria-Geral da União");
  add("STF", "STF", "União", "", "BRASIL", "Supremo Tribunal Federal");
  add("STJ", "STJ", "União", "", "BRASIL", "Superior Tribunal de Justiça");
  add("GOV-BR", "GOV-BR", "União", "", "BRASIL", "");
  for (const [uf] of UFS) {
    if (uf === "DF") {
      add("TCDF", "TCE", "Estadual", "DF", ENTE(uf), "Tribunal de Contas do Distrito Federal");
      add("PGDF", "PGE", "Estadual", "DF", ENTE(uf), "Procuradoria-Geral do Distrito Federal");
      add("TJDFT", "TJ", "Estadual", "DF", ENTE(uf), "Tribunal de Justiça do Distrito Federal e dos Territórios");
    } else {
      add("TCE-" + uf, "TCE", "Estadual", uf, ENTE(uf), "Tribunal de Contas do Estado " + DE(uf));
      add("PGE-" + uf, "PGE", "Estadual", uf, ENTE(uf), "Procuradoria-Geral do Estado");
      add("TJ-" + uf, "TJ", "Estadual", uf, ENTE(uf), "Tribunal de Justiça do Estado " + DE(uf));
    }
    add("GOV-" + uf, "GOV-UF", "Estadual", uf, ENTE(uf), "");
  }
  // Tribunais de Contas municipais: dos Municípios de São Paulo e do Rio de Janeiro (capitais) e dos Municípios de GO, BA e PA (estaduais)
  add("TCM-SP", "TCM", "Municipal", "SP", "SÃO PAULO (Município)", "Tribunal de Contas do Município de São Paulo", "São Paulo");
  add("TCM-RJ", "TCM", "Municipal", "RJ", "RIO DE JANEIRO (Município)", "Tribunal de Contas do Município do Rio de Janeiro", "Rio de Janeiro");
  add("TCM-GO", "TCM", "Municipal", "GO", ENTE("GO"), "Tribunal de Contas dos Municípios do Estado de Goiás");
  add("TCM-BA", "TCM", "Municipal", "BA", ENTE("BA"), "Tribunal de Contas dos Municípios do Estado da Bahia");
  add("TCM-PA", "TCM", "Municipal", "PA", ENTE("PA"), "Tribunal de Contas dos Municípios do Estado do Pará");

  const GRUPOS = [["TCU", "TCU"], ["TCE", "TCEs e TCDF"], ["TCM", "TCMs"], ["CGU", "CGU"], ["STF", "STF"], ["STJ", "STJ"],
    ["PGE", "PGEs e PGDF"], ["TJ", "TJs"], ["GOV-BR", "Normas federais"], ["GOV-UF", "Normas estaduais"]];
  const ordemGrupo = Object.fromEntries(GRUPOS.map(([k], i) => [k, i]));
  const ORGAOS = Object.keys(O).sort((a, b) => ordemGrupo[O[a].grupo] - ordemGrupo[O[b].grupo] || O[a].uf.localeCompare(O[b].uf) || a.localeCompare(b));
  const info = id => O[id] || { id, grupo: "", esfera: "", uf: "", ente: "", nome: id, municipio: "" };
  const rotulo = id => id === "GOV-BR" ? "Normas federais" : (/^GOV-/.test(id) ? "Normas " + id.slice(4) : id);
  g.LV_ORG = { UFS, NOME_UF, ORGAOS, GRUPOS, ESFERAS: ["União", "Estadual", "Municipal"], info, rotulo };
})(typeof window !== "undefined" ? window : globalThis);
