# Sistema de design do Licitacon

Fonte única dos padrões visuais do site. Os valores estão em [`sistema.css`](sistema.css) (variáveis `--lv-…`);
este arquivo explica quando usar cada um. Regra geral: **estilo novo usa as variáveis, nunca um valor escrito à mão.**

## Auditoria (10/11/2026)

**Páginas revistas:** 15 · **Nota (estimativa pela tabela abaixo):** 58/100 antes → 74/100 depois desta rodada

| Categoria | Antes | Depois | Situação |
|---|---|---|---|
| Tokens definidos em um lugar | nenhum (`:root` vazio) | 60 variáveis em `sistema.css` | feito |
| Cinzas de texto | 9 tons, 5 deles abaixo de 4,5:1 | 3 tons (tinta, texto, mudo), todos AA | feito |
| Texto abaixo do contraste mínimo | 145 usos no código de cinzas abaixo de 4,5:1 | 0 na varredura das 15 páginas | feito |
| Azul-escuro da marca | 2 valores quase iguais (`#0B1F2A`, `#0A1F2A`) | 1 | feito |
| Raios de canto | 22 valores | 15 (escala de 6 + exceções) | parcial |
| Título da página (h1) | 3 pesos, 6 tamanhos, 2 margens esquerdas | 1 peso, 1 escala, 1 coluna | feito |
| Rótulos em MAIÚSCULAS | 124 | 78 (ficam siglas, situações e cabeçalhos de tabela) | parcial |
| Cores distintas no modelo | 391 | 378 | pendente: cauda longa de cores únicas |
| Tamanhos de letra distintos | 40 | 40 | pendente |
| Sombras distintas | 81 | 81 | pendente |
| `style=""` na marcação | 1.188 | 1.188 | pendente: migrar para classes |

### Próximas ações, por impacto
1. Tamanhos de letra: reduzir os 40 valores à escala de 8 passos (exige conferir tabelas e etiquetas uma a uma).
2. Sombras: trocar as 81 variações pelos 3 níveis de elevação.
3. Biblioteca (`biblioteca.html`) tem estilos próprios e ainda não usa `sistema.css`.
4. Migrar os `style=""` mais repetidos para classes (botões e cartões primeiro).
5. Ícones: trocar os emojis e símbolos de texto (🔔, 🏆, ✎, ▷) por um conjunto único de ícones em SVG.

## Tokens

### Cor
| Token | Valor | Uso |
|---|---|---|
| `--lv-floresta` | `#0F3431` | fundo escuro da página inicial, botão do assistente, aba ativa |
| `--lv-navy` | `#0A1F2A` | barra do topo, rodapé |
| `--lv-verde` | `#0FA36B` | ação principal (texto `--lv-sobre-verde` por cima) |
| `--lv-verde-escuro` | `#0A7A50` | verde como **texto** em fundo claro |
| `--lv-menta` | `#6FE0AE` | destaque e anel de foco em fundo escuro |
| `--lv-petroleo` | `#0F6B7E` | links e rótulos de campo |
| `--lv-tinta` / `--lv-texto` / `--lv-mudo` | `#0A1F2A` / `#3D5058` / `#5F7077` | título · corpo · apoio (16,7:1 · 8,4:1 · 5,2:1 sobre branco) |
| `--lv-papel` / `--lv-preenchimento` / `--lv-linha` | `#F6F8F7` / `#EEF2F1` / `#E3E9E8` | fundo de página · trilhos e campos · bordas |
| `--lv-ok` / `--lv-atencao` / `--lv-erro` (+ `-fundo`) | `#0A7A50` / `#8A5A0E` / `#B8433A` | situação; sempre com rótulo ou ícone |

- O verde da marca (`#0FA36B`) **não** serve de cor de texto em fundo claro (3,2:1): use `--lv-verde-escuro`.
- Texto sobre o verde da marca é escuro (`--lv-sobre-verde`), nunca branco.
- `--lv-mudo` é para fundo claro. Em fundo escuro, o texto de apoio é `--lv-sobre-escuro`.
- Gráficos têm paleta própria e validada (ver `reviews/audit-plan-full.md` e `GX_PALETA` no modelo).

### Tipografia
Uma família (Manrope). Escala: nota 12 · apoio 13 · corpo 14,5 · lead 16,5 · h3 18 · h2 24 · título da página
`clamp(30px, 1,5vw + 20px, 42px)` · vitrine (só a página inicial) até 58px.
Título de página: peso 700, entrelinha 1,1, espaçamento −0,025em, `text-wrap: balance`. Parágrafo: no máximo ~75 caracteres por linha.

### Raio, elevação, espaço, movimento
- Raio: 6 (etiqueta) · 10 (campo) · 12 (botão) · 16 (cartão) · 20 (painel, janela) · 999 (pílula).
- Elevação: `--lv-s-1` (linha de base), `--lv-s-2` (cartão), `--lv-s-3` (janela sobre a página).
- Espaço: múltiplos de 4 (`--lv-e-1` a `--lv-e-8`: 4, 8, 12, 16, 24, 32, 48, 64).
- Movimento: 0,15s com `--lv-curva`; só `transform` e `opacity`; respeitar "reduzir movimento".
- Coluna: `--lv-coluna` (1240px), a mesma da barra do topo, em todas as páginas.

## Componentes

### Cabeçalho da página
Linha da seção (opcional, caixa normal, verde-escuro) → **um** `h1` → parágrafo de apresentação → ações.
Classes: seção `lvx-ph`, título `lva-h1` (ou `h1` simples dentro de `lvx-ph`), texto `lva-lead`.

| Faça | Não faça |
|---|---|
| Alinhar à coluna de 1240px | Criar uma largura própria para a página |
| Título como frase, em caixa normal | Destacar uma palavra do título com outra cor |
| Uma ação principal (verde) e, no máximo, uma secundária | Dois botões verdes lado a lado |

### Botão
| Variante | Quando | Aparência |
|---|---|---|
| Principal | a ação da tela ("Pagar", "Criar um documento") | fundo `--lv-verde`, texto `--lv-sobre-verde`, raio 12 |
| Secundária | alternativa à principal | fundo branco, borda `--lv-linha-forte`, texto `--lv-tinta` |
| Escura | ação dentro de lista ou barra de filtros ("+ Perguntar") | fundo `--lv-navy`, texto branco |
| Texto | ação de baixo peso ("Limpar filtros") | sem fundo, cor `--lv-petroleo` |

Estados: hover clareia o fundo; foco com anel de 3px (verde em fundo claro, menta em fundo escuro); desativado com 60% de opacidade e sem cursor de clique; carregando troca o texto ("Enviando…") e desativa.
O texto do botão diz o que acontece ("Salvar alterações"), e o aviso depois usa a mesma palavra ("Alterações salvas").

### Campo de formulário
Rótulo acima, em caixa normal, 13px/700, cor `--lv-petroleo`; campo com raio 10, borda `--lv-linha-forte`, fundo `#FBFCFC`;
texto de exemplo em `--lv-mudo`; ajuda abaixo em 12px `--lv-mudo`. Erro: mensagem com `role="alert"` dizendo o que
corrigir ("Confira o e-mail: falta o @ ou o domínio"), nunca só a borda vermelha.

### Cartão
Fundo branco, borda `--lv-linha`, raio 16, elevação `--lv-s-2`. Cartão clicável ganha borda verde no hover e no foco.
Cartões de uma mesma linha têm a mesma estrutura; cartão vazio traz uma orientação, não um zero.

### Etiqueta de situação
Pílula com fundo `-fundo` e texto da situação (`ok`, `atencao`, `erro`, `neutro`), 11,5px/700, uma ou duas palavras.
É o único lugar, junto com siglas, em que MAIÚSCULAS são aceitas.

### Dica e janela do assistente
Dica: `gestao-dicas.js` (fundo `#0F2A27`, texto branco, raio 9). Assistente: `chatbot.js` (classes `lvq-`), mesmos tokens.

## Acessibilidade (piso)
- Contraste: 4,5:1 para texto, 3:1 para texto grande e para componentes. Conferir com
  `node scripts/testes/design/contraste.js` (com o servidor local na porta 8765) (varre as 15 páginas e lista o que ficar abaixo).
- Foco do teclado sempre visível; nada depende só de cor; toque com pelo menos 40px de altura.
- Animações com botão de pausa (página inicial) e respeito a "reduzir movimento".

## Migração (valores antigos → token)
| Antigo | Novo |
|---|---|
| `#0B1F2A` | `#0A1F2A` (`--lv-navy` / `--lv-tinta`) |
| `#7A8B91`, `#6A7B82`, `#66757F`, `#55666D`, `#8A9AA0`, `#6B7280` | `#5F7077` (`--lv-mudo`) |
| `#4A5D65`, `#4A5D64`, `#374151`, `#4B5563` | `#3D5058` (`--lv-texto`) |
| `#EDF1F0` | `#EEF2F1` (`--lv-preenchimento`) |
| `#7FE3B6` | `#6FE0AE` (`--lv-menta`) |
| raios 99 · 22 · 18 · 13 · 11 · 9 · 7 · 5 · 3 | 999 · 20 · 16 · 12 · 12 · 10 · 8 · 6 · 4 |
