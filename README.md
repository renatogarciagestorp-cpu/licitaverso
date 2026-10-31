# Licitacon

Site do Licitacon, publicado pelo GitHub Pages.

- `index.html` — o site (protótipo feito no Claude Design). O menu **Biblioteca Jurídica** abre `biblioteca.html`.
- `biblioteca.html` — a Biblioteca Jurídica: a própria página do Acervo Licitacon (mesmo layout e funções), lendo `acervo-completo.json`. Anotações, marcadores e dossiês ficam no navegador de cada visitante. Recursos que dependem do Claude (perguntar ao acervo, síntese, minuta) ficam ocultos. Gerada por `scripts/montar-biblioteca.py` a partir da página do acervo + `scripts/biblioteca-shim.js`.
- `acervo-completo.json` — documentos do acervo e situação das coletas, usados por `biblioteca.html`.
- `acervo.json` — cópia do Acervo Licitacon (decisões, súmulas, consultas e normas do TCU, CGU, STF, STJ, Tribunais de Contas dos estados e do DF, TCMs, PGEs e TJs, e normas federais e estaduais), no formato `licitaverso-acervo` versão 1.
- `orgaos.js` — catálogo dos órgãos (código, grupo, UF, esfera e nome oficial), usado pela biblioteca e pelo gerador.
- `scripts/gerar-acervo.mjs` — gera o `acervo.json` a partir dos documentos do acervo.

## Atualização automática

Nos dias úteis, depois da coleta, uma tarefa agendada do Claude lê o acervo, roda o script e grava o novo `acervo.json` aqui. O GitHub Pages republica o site sozinho.

Para atualizar à mão: `node scripts/gerar-acervo.mjs <pasta-decisoes> acervo.json <pasta-meta>` (gera `acervo.json` e `acervo-completo.json`).
