# Agente de IA do Licitacon — Fase 1 (método e base)

Objetivo: analisar ETP, TR, matriz de riscos, planilha de custos (dedicação exclusiva) e edital,
apontando falhas com fundamento legal exato, riscos de manter, dicas de melhoria e jurisprudência da Biblioteca.

| Pasta / arquivo | O que é |
|---|---|
| `normas/fontes.json` | normas da base e seus endereços oficiais |
| `normas/<id>.json` | texto oficial vigente, artigo por artigo (gerado por `scripts/agente/baixar-normas.py`) |
| `roteiros/lei-14133.json` | itens de verificação: o que conferir, fundamento, gravidade, risco, dica, termos de jurisprudência |
| `orientacoes-especialista.md` | orientações de calibração do especialista; entram em toda análise |
| `tipologias/lei-14133.json` | trilhas automáticas (estilo ALICE) |
| `relatorio/estrutura.md` | formato do resultado de uma análise |
| `relatorio/exemplo-analise.json` | exemplo fictício de resultado |

Scripts (`scripts/agente/`):
- `baixar-normas.py --arquivo pagina.html --id lei-14133` — lê a página do Planalto salva pelo navegador (o Planalto bloqueia servidores na nuvem).
- `conferir-roteiro.py` — confere se cada dispositivo citado nos roteiros existe no texto oficial.
- `gerar-relatorio.py analise.json relatorio.docx` — gera o relatório em Word.
- `roteiro-para-revisao.py` — gera o Word dos roteiros para revisão do especialista.

Base normativa: Leis 14.133, 13.303, 13.019, 10.192 e 4.320 carregadas em 28/10/2026 a partir das páginas do Planalto
salvas pelo navegador. Todas as citações dos roteiros conferidas contra o texto vigente (`conferir-roteiro.py`).
Pendência: a Lei 13.019 tem muitos artigos com redação antiga e nova na página; conferir a leitura antes de usar (Fase 4).

Escopo da fase de testes (decisão de 28/10/2026): somente a Lei 14.133/2021. As demais normas ficam na base para a ampliação futura.

Análise automática (Fase 2, desde 29/10/2026): `scripts/agente/analisar.py` com o Claude Sonnet 5.5
(chave no segredo ANTHROPIC_API_KEY). Workflow manual "Agente — analisar documento": recebe o link do PNCP e o tipo
de documento, baixa, analisa, gera o parecer (Word e PDF) e grava no ramo agente-testes. Fatos objetivos (contagem do
art. 183, dados do PNCP) são calculados por programa; trechos citados são conferidos literalmente; jurisprudência só entre
os candidatos da Biblioteca. Primeiro teste (Campo Maior): 191 s, US$ 0,49, todas as 8 falhas do gabarito encontradas.

Próximas etapas: base com as instruções normativas (IN 05/2017, 58/2022, 81/2022, 65/2021, 98/2022);
primeiras análises reais feitas em conjunto; depois o protótipo automático (Fase 2).

## Regimes, objetos e planilhas (etapa 3A, 30/10/2026)
- `analisar.py --regime lei-14133|lei-13303|lei-13019 --objeto obras --objeto mao-de-obra --anexo "tipo::nome::texto.txt"`.
- Roteiro do regime: `roteiros/<regime>.json` (enquanto não houver, usa o da 14.133 como base e o modelo adapta à lei do regime).
- Módulos por objeto: `roteiros/modulos/obras-engenharia.json` e `roteiros/modulos/mao-de-obra.json`, com fundamento por regime.
- Planilhas Excel: `scripts/agente/extrair-planilha.py` (valores + fórmulas por célula; recalcula pelo LibreOffice quando o arquivo não traz valores).
- `conferir-roteiro.py` confere roteiros e módulos contra o texto vigente das normas.

## Roteiros próprios e referência salarial (etapa 3B/3C, 30/10/2026)
- `roteiros/lei-13303.json` (44 itens) e `roteiros/lei-13019.json` (32 itens), na estrutura do roteiro da 14.133.
- Mão de obra: `extrair-postos.py` (Haiku lê a planilha: função, CBO, salário-base, jornada, custo total) → `salarios.py`
  (média do estado no salario.com.br, ajustada à jornada; acima de 5% = "acima") → `analisar.py --salarios`. Indicador de mercado, não normativo.
- Convenção coletiva entra como anexo `cct` (PDF/Word). Site: regime, perguntas iniciais (mão de obra exclusiva? obra?) e anexos obrigatórios.
