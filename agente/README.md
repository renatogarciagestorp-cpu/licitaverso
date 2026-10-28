# Agente de IA do Licitacon — Fase 1 (método e base)

Objetivo: analisar ETP, TR, matriz de riscos, planilha de custos (dedicação exclusiva) e edital,
apontando falhas com fundamento legal exato, riscos de manter, dicas de melhoria e jurisprudência da Biblioteca.

| Pasta / arquivo | O que é |
|---|---|
| `normas/fontes.json` | normas da base e seus endereços oficiais |
| `normas/<id>.json` | texto oficial vigente, artigo por artigo (gerado por `scripts/agente/baixar-normas.py`) |
| `roteiros/lei-14133.json` | itens de verificação: o que conferir, fundamento, gravidade, risco, dica, termos de jurisprudência |
| `relatorio/estrutura.md` | formato do resultado de uma análise |
| `relatorio/exemplo-analise.json` | exemplo fictício de resultado |

Scripts (`scripts/agente/`):
- `baixar-normas.py --arquivo pagina.html --id lei-14133` — lê a página do Planalto salva pelo navegador (o Planalto bloqueia servidores na nuvem).
- `conferir-roteiro.py` — confere se cada dispositivo citado nos roteiros existe no texto oficial.
- `gerar-relatorio.py analise.json relatorio.docx` — gera o relatório em Word.
- `roteiro-para-revisao.py` — gera o Word dos roteiros para revisão do especialista.

Próximas etapas: base com as instruções normativas (IN 05/2017, 58/2022, 81/2022, 65/2021, 98/2022);
primeiras análises reais feitas em conjunto; depois o protótipo automático (Fase 2).
