# Licitaverso

Site do Licitaverso, publicado pelo GitHub Pages.

- `index.html` — o site (protótipo feito no Claude Design). A **Biblioteca Jurídica** lê os dados de `acervo.json`.
- `acervo.json` — cópia do Acervo Licitaverso (decisões, súmulas, consultas e normas de TCU, TCE-RJ, TCM-RJ, CGU, STF, STJ, PGE-RJ, TJ-RJ e normas federais e do RJ), no formato `licitaverso-acervo` versão 1.
- `scripts/gerar-acervo.mjs` — gera o `acervo.json` a partir dos documentos do acervo.

## Atualização automática

Nos dias úteis, depois da coleta, uma tarefa agendada do Claude lê o acervo, roda o script e grava o novo `acervo.json` aqui. O GitHub Pages republica o site sozinho.

Para atualizar à mão: `node scripts/gerar-acervo.mjs <pasta-com-os-documentos> acervo.json`.
