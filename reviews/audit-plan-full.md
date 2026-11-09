# Auditoria completa: página inicial animada e painéis da Gestão Contratual

**Data**: 09/11/2026
**Modo**: Branch comparada com o main (`origin/main...HEAD`)
**Origem**: branch `claude/zealous-meitner-fez4hb` (commits e58b57a, 5bb0b68, 2ae0bcb, da80a87)
**Lentes rodadas**: 8/10
**Lentes puladas**:
- Backend: não há servidor, Rust ou Tauri nas mudanças.
- DX: o site não é uma ferramenta para desenvolvedores.

**Arquivos auditados**:
- `inicio-ui.js`
- `gestao-anim.js`
- `gestao.css`
- `inicio.css`
- `inicio.js`
- `src/inicio3d.js`
- `src/site.html`
- `ETAPAS.md`
- `vendor/`, só para licenças

Os gerados (`index.html` e `inicio3d.js`) foram conferidos: estão em sincronia com a fonte.

---

## Veredito geral: APROVAR COM MUDANÇAS. Todas as mudanças obrigatórias foram feitas nesta branch.

Todas as lentes aprovaram a direção. São telas que mostram a ferramenta trabalhando, painéis no padrão Code and Chill e 3D só onde agrega. Antes da publicação, porém, havia quatro bloqueios:

1. A contagem dos números no painel da Gestão substituía o nó de texto que o React controla. O número congelava, e um valor vazio derrubava a aplicação. Foi testado com o React do site.
2. Duas bibliotecas de animação disputavam os mesmos cartões, que piscavam ou ficavam escondidos.
3. As animações repetiam sem fim e não tinham botão de pausa (WCAG 2.2.2).
4. A troca de paleta reduziu o contraste. Afetou o texto branco nos ladrilhos, a aba ativa (2,1:1), o mapa de prazos e os textos verdes das telas.

Os quatro foram corrigidos e testados no navegador (ver "Correções aplicadas").

## Veredito por lente

| # | Lente | Veredito | Críticos | Recomendações |
|---|------|---------|----------|-----------------|
| 1 | Engenheiro de design | APROVAR COM MUDANÇAS | 4 | 9 |
| 2 | Engenheiro de UX | APROVAR COM MUDANÇAS | 3 | 4 |
| 3 | Engenheiro de frontend | APROVAR COM MUDANÇAS | 2 | 6 |
| 4 | Engenheiro de backend | Pulada | — | — |
| 5 | Engenheiro estrutural | APROVAR COM MUDANÇAS | 2 | 5 |
| 6 | Mantenedor do repositório | APROVAR COM MUDANÇAS | 2 | 5 |
| 7 | Prontidão para produção | APROVAR COM MUDANÇAS | 1 | 4 |
| 8 | DX | Pulada | — | — |
| 9 | Engenheiro de desempenho | APROVAR COM MUDANÇAS | 2 | 7 |
| 10 | Engenheiro de acessibilidade | APROVAR COM MUDANÇAS (2 bloqueios) | 2 | 8 |

## Todos os problemas críticos (deduplicados)

| # | Problema | Lentes | Arquivos | Impacto | Correção (aplicada) |
|---|---|---|---|---|---|
| 1 | `el.textContent =` na contagem destruía o nó de texto do React | Frontend, Estrutural, Repo, Produção, Desempenho | gestao-anim.js | Número congelado; `NotFoundError` e o `#dc-root` em branco | A contagem escreve só em `nodeValue` do único nó de texto. Se o React mudar o valor, a contagem para. Testado: o filtro troca 12 → 3 → 12 sem congelar |
| 2 | Motion (`animacoes.js`) e GSAP animavam os mesmos `.gp-card` | Frontend, Estrutural, Design (pisca) | animacoes.js, gestao-anim.js | Cartões ocultos ou piscando | `.gx`, `.gp-grade` e `.gp-acoes` entram no `FORA` de animacoes.js. Painéis já na tela montam na hora, sem atraso de 60 ms |
| 3 | Animação infinita sem controle de pausa | Acessibilidade, UX | inicio-ui.js, src/inicio3d.js | Falha no WCAG 2.2.2 (nível A), o que contradiz a declaração AA do rodapé | Botão "Pausar animação" (`aria-pressed`) em cada tela e cena 3D. O estado é compartilhado e guardado em `localStorage`. Testado: pausa, recarrega e continua pausado; retoma |
| 4 | Contraste: texto branco sobre GX_PALETA (até 1,62:1), aba ativa (2,1:1), mapa de prazos (1,89:1), textos verdes e brancos nas telas (3,24:1) | Acessibilidade, Design, UX | src/site.html, gestao.css, inicio.css | Ilegível para baixa visão | Paleta dos ladrilhos com todas as cores ≥ 4,5:1 com branco. `.gp-aba.ativo` branco. Mapa de prazos com tons ≥ 3:1. `--u-verde` #0B7A52. Etiqueta do marco #B8433A. Foco #0B7A52 |
| 5 | A cor do indicador seguia a posição do cartão, não a situação | Design, UX | gestao.css | Verde e coral indicavam o oposto da situação | Cor pelas classes do site (`ok`/`at`/`er`); sem classe fica neutro. A `em` mantém a cor de alerta |
| 6 | Valor do indicador cortado com reticências ("R$ 44,8 mi…" lido como milhões) | Design, UX, Acessibilidade | gestao.css | Número lido errado | Valor sem corte: quebra se precisar e a fonte se ajusta com `clamp` |
| 7 | Aviso por e-mail trocado na tela da Gestão | UX | inicio-ui.js | O exemplo mostrava o aviso errado | Avisos indexados pelo contrato |
| 8 | ETAPAS.md descrevia cenas 3D que não existem mais | Repo | ETAPAS.md | Engana quem for editar | Seção reescrita |

## Problemas que aparecem em várias lentes

| Problema | Apontado por | Causa | Correção (aplicada) |
|---|---|---|---|
| Fronteira com o runtime (React) | Frontend, Estrutural, Repo, Produção, Desempenho | Scripts escrevendo `textContent` em nós controlados pelo React | Regra única: escrever só em `nodeValue`, que já era o padrão do `inicio.js` |
| Quem é dono de cada nó animado | Frontend, Estrutural, Design | Listas de seletores sobrepostas em 3 scripts | Painéis da Gestão marcados como FORA do Motion; cada raiz tem um dono |
| Laço entre animação e MutationObserver | Frontend, Desempenho, Produção | Cada quadro trocava um nó de texto e acordava 4 observadores do documento inteiro | Texto via `nodeValue` (não gera `childList`); os observadores novos ignoram mutações sem elemento novo |
| Vazamentos ao trocar de página | Frontend, Desempenho, Produção | Timelines, IntersectionObservers e palcos 3D só eram liberados dentro de callbacks que podiam nunca disparar | `limpar()` em cada varredura: `kill`/`disconnect` de tudo que saiu do documento; o 3D exporta `limpar()`, chamado pelo inicio.js |
| GSAP carregado em todas as páginas | Estrutural, Produção, Desempenho | `<script defer>` global atrasava o boot do runtime | GSAP baixado sob demanda pelos dois scripts (promessa compartilhada `window.__lvGsap`) |
| Tokens e paleta duplicados ou pela metade | Design, Estrutural, Repo | Cores no modelo e na camada `#dc-root` | Restos (`.gx-hbar`, `.gx-leg-f`, `.gx-hspark`) migrados; `evCor` sem cor repetida. Pendente: renomear as chaves `GX_COR.indigo`/`roxo` |

## Todas as recomendações

| # | Recomendação | Lente | Situação |
|---|---|---|---|
| 1 | Recalcular posições depois de redimensionar (`invalidate`) | Frontend, Desempenho | Feito: ResizeObserver |
| 2 | Animar `scaleX` em vez de `width` no indicador de abas | Frontend, Desempenho | Feito |
| 3 | Montar as telas só quando chegam perto | Desempenho | Feito |
| 4 | Regex de números com 4 ou mais dígitos e `useGrouping` | Frontend | Feito; `Intl.NumberFormat` reaproveitado |
| 5 | Não animar os exemplos estáticos escondidos | Frontend, UX | Feito (`inicio.js`) |
| 6 | Índices fictícios com rótulo "série oficial" | Produção | Feito: série real de `indices.json`; sem ela, o rótulo diz "valores ilustrativos" |
| 7 | Respeitar economia de dados | Produção | Feito: quadro final parado |
| 8 | Carimbos cobrindo dados; buraco na Comunidade; título cortado | Design | Feito |
| 9 | Tempo de leitura curto (resposta e avisos) | UX | Feito: resposta ≥ 5 s; avisos ~3 s |
| 10 | `role="img"` inútil sob `aria-hidden` | Acessibilidade, UX | Feito: `aria-hidden` passou para o cartão estático; cada tela tem um rótulo próprio |
| 11 | `aria-busy` durante a contagem; não esconder cartões com foco dentro | Acessibilidade | Feito: só `opacity` (sem `visibility`); não anima se o foco estiver dentro |
| 12 | "Reduzir movimento" lido só na carga | Acessibilidade | Feito nas telas vivas (escuta `change`) |
| 13 | `webglcontextrestored` | Frontend | Feito |
| 14 | DPR 1,25 no celular | Desempenho | Feito |
| 15 | Código morto (CSS `.lv3d-*`, imports, `cartao`/`desloca`, `.gp-kpi`) | Repo, Design, Estrutural | Feito |
| 16 | Não reanimar o painel a cada volta à aba | UX | Pendente (baixo impacto) |
| 17 | Montador único para os 4 MutationObservers | Estrutural | Pendente (refatoração maior) |
| 18 | Checagem no CI de que os gerados estão em sincronia | Repo | Pendente |
| 19 | Renomear `GX_COR.indigo`/`roxo` | Design, Repo | Pendente |

---

# Relatório de cada lente

## 1. Engenheiro de design

**Veredito**: APROVAR COM MUDANÇAS

**Arquivos**:

| Arquivo | Risco |
|---|---|
| inicio-ui.js | Médio |
| inicio.css (blocos "telas vivas" e "cenas 3D") | Médio |
| src/inicio3d.js | Baixo |
| gestao.css | Alto |
| gestao-anim.js | Médio |
| src/site.html (paleta e CSS `.gx`) | Alto |

**Críticos**:
1. Aba ativa ilegível: `#dc-root .gp-aba` tinha mais especificidade que `.gp-aba.ativo` (2,1:1).
2. Valor do indicador cortado, mudando o sentido ("44,8 mi…").
3. A cor do cartão seguia a posição (`nth-child`) e o `::after` de alerta foi apagado.
4. Texto branco sobre a nova GX_PALETA: 1,62–3,24:1 nos ladrilhos do mapa de valor.

**Recomendações**:
- R1: nomes da paleta enganam.
- R2: restos de índigo e bege.
- R3: tokens duplicados.
- R4: acento do `.gp-acoes` perdido.
- R5: título da janela cortado.
- R6: carimbos sobre dados.
- R7: buraco na Comunidade.
- R8: pisca antes de animar.
- R9: CSS morto.

**Desejáveis**:
- D1: valor em dinheiro quebrando linha.
- D2: posição da linha da média.
- D3: "hoje" cobrindo os meses.
- D4: código morto no 3D.
- D5: ETAPAS desatualizado.

**Conformidade com o sistema de design**:
- A troca de roxo e laranja pela marca está correta, mas ficou pela metade.
- A camada `#dc-root` vencia as variantes do site e quebrava estados.
- O site não tem modo escuro.

**Matriz de estados**:

| Componente | Situação |
|---|---|
| `.gp-aba` ativa | Falhava |
| `.gx-hd` em alerta | Falhava |
| `.gx-tile` | Contraste baixo |
| `.gx-c`/`.gp-card` | Piscava |
| Telas vivas e 3D | OK |

**Detalhes**:
- Tokens: com ressalvas.
- Estados: com ressalvas.
- Modo escuro: não se aplica.
- Animação: aprovada com ressalvas.
- Consistência: com ressalvas.

**Situação após correções**: críticos 1 a 4 resolvidos. R2, R4 (acento mantido), R5, R6, R7, R8 e R9 resolvidos. D1 e D3 resolvidos. R1 e R3 ficaram parcialmente pendentes.

## 2. Engenheiro de UX

**Veredito**: APROVAR COM MUDANÇAS

**Jornada A (visitante na página inicial)**:
1. Rola até a seção. OK.
2. Vê "Exemplo ilustrativo". OK.
3. Lê:
   - Gestão: falhava, porque o aviso estava trocado.
   - Comunidade e Gestão: tempo curto.
4. Clica em controles falsos: aviso.
5. Quer pausar: não podia.
6. Clica no botão da ferramenta. OK.
7. Com "reduzir movimento": quadro final. OK.

**Jornada B (Painel da Organização)**:
1. Monta: piscava.
2. Procura a aba ativa: ilegível (falha).
3. Lê os indicadores: valor cortado e cor trocada (falha).
4. Troca o filtro. OK.
5. Volta à aba: reanima.
6. Baixa o PDF. OK.

**Críticos**:
- U1: aviso trocado.
- U5: aba ativa.
- U6: indicador cortado e com cor trocada.

**Recomendações**:
- U2: controles falsos.
- U3: tempo de leitura.
- U4: pausa.
- U7: reanima a cada volta à aba.
- U8: `role="img"` sem efeito.

**Desejáveis**:
- U9: salto do acumulado na volta.
- U10: "12 contratos" com 4 linhas.
- U11: exemplos escondidos animando.

**Consistência**: a vitrine pausava com o mouse em cima; as telas novas não pausavam.

**Situação após correções**:
- Resolvidos: U1, U5, U6, U2 (botões falsos viraram `span`), U3, U4, U8, U9, U10 e U11.
- Pendente: U7.

## 3. Engenheiro de frontend

**Veredito**: APROVAR COM MUDANÇAS

**Críticos**:
- C1: `textContent` sobre `<b><span class="sc-interp">` do React.
- C2: Motion e GSAP no mesmo `.gp-card`.

**Recomendações**:
- R1: escrita por quadro aciona 4 observadores.
- R2: vazamentos em inicio-ui, gestao-anim e inicio3d.
- R3: valores em função calculados só uma vez.
- R4: regex.
- R5: `montarExemplos` sobre exemplos ocultos.
- R6: animava `width`.

**Desejáveis**:
- D1: `tl.set(className)`.
- D2: `role`/`aria`.
- D3: `webglcontextrestored`.
- D4: `beforeprint`.
- D5: proteção `#lvc-captura` sem efeito.

**Caminho de renderização**: o runtime (React 18) só inicia no `DOMContentLoaded`, depois dos scripts `defer`. Os observadores reagem a cada commit nesta ordem:
1. `animacoes.js` (síncrono);
2. `inicio`/`inicio-ui` (microtarefa);
3. `gestao-anim`.

**Situação após correções**: todos os itens resolvidos.
- D4: há `beforeprint`, que termina as timelines.
- D5: a proteção virou `aria-hidden`, e o comentário foi corrigido.

## 4. Engenheiro de backend

**Pulada**: não há servidor, Rust, Tauri nem IPC nas mudanças.

## 5. Engenheiro estrutural

**Veredito**: APROVAR COM MUDANÇAS

**Críticos**:
- E1: ninguém é dono declarado de cada nó animado.
- E2: retrocesso do padrão `nodeValue` já resolvido no `inicio.js`.

**Recomendações**:
- E3: 4 MutationObservers globais.
- E4: tokens `.gx` em dois lugares.
- E5: GSAP carregado em todas as páginas.
- E6: código e documentação mortos.
- E7: dependência implícita da ordem das tags.

**Mapa de dependências**:
- `src/site.html` → `animacoes.js`, `inicio.js`, `inicio-ui.js`, `gestao-anim.js` (observam `#dc-root`).
- `inicio.js` → `import()` → `inicio3d.js`.
- `inicio-ui.js` e `gestao-anim.js` → GSAP (agora sob demanda, o que resolve E5 e E7).

**Situação após correções**:
- Resolvidos: E1, E2, E5, E6, E7.
- Parcial: E4 (restos migrados).
- Pendente: E3 (montador único).

## 6. Mantenedor do repositório

**Veredito**: APROVAR COM MUDANÇAS

**Críticos**:
1. `contar` do gestao-anim contrariava a regra do repositório.
2. ETAPAS.md desatualizado.

**Recomendações**:
- código morto;
- cabeçalhos desatualizados;
- comentário de `#lvc-captura`;
- `evCor` com cor repetida;
- três cópias de `contar`.

**Desejáveis**:
- `npm ci` no ETAPAS;
- texto completo da licença do GSAP;
- `:has()` misturado num seletor;
- "FGV" redundante;
- checagem no CI.

**Checklist**:

| Item | Situação |
|---|---|
| Comentários no topo | OK |
| `?v=` | OK |
| Gerados em sincronia (testado) | OK |
| Licenças | OK |
| Documentação | Falhava |
| Código morto | Falhava |
| Dono do DOM | Falhava |

**Situação após correções**:
- Resolvidos: os críticos 1 e 2, todas as recomendações e os desejáveis `npm ci`, `:has` e FGV.
- Pendentes: CI e texto completo da licença.

## 7. Prontidão para produção

**Veredito**: APROVAR COM MUDANÇAS. Não publicar sem a correção 1, que foi feita.

**Testes do auditor**:

| Cenário | Resultado |
|---|---|
| Normal | OK |
| Reduzir movimento | OK |
| Sem GSAP | Exemplo estático |
| Sem WebGL | OK |
| 375 px | Sem rolagem lateral |

**Modos de falha relevantes**:
- Valor muda depois da contagem: congelava. Agora resolvido e testado.
- Valor vazio: derrubava a aplicação. Agora resolvido.
- Painel já visível: piscava. Agora resolvido.
- Economia de dados: era parcial. Agora resolvido.
- Navegador sem `:has`: regra ignorada. Agora resolvido.

**Ambiente**:
- caminhos relativos;
- cache de 600 s com `?v=`;
- sem CSP;
- GSAP local;
- gerados versionados.

## 8. DX

**Pulada**: o site não é uma ferramenta para desenvolvedores, e as mudanças não alteram comandos, configuração nem mensagens de erro para eles.

## 9. Engenheiro de desempenho

**Veredito**: APROVAR COM MUDANÇAS

**Críticos**:
1. Laço entre as animações e os observadores do documento: cerca de 3 `querySelectorAll` por quadro com uma tela visível.
2. Vazamento de timelines e observadores ao desmontar.

**Orçamento**:

| Item | Antes das correções |
|---|---|
| Observadores com `subtree` | 4 |
| `querySelectorAll` por quadro | ~3 |
| Timelines na página inicial | 4 |
| Contextos WebGL | 1 |
| Cenas 3D | 6 → 2 |
| Pacote 3D | 552 KB (143 KB comprimido) |

**Situação após correções**:
- Escrita por `nodeValue`: nenhuma mutação `childList` por quadro.
- Observadores novos filtram mutações sem elemento novo.
- `limpar()` em todas as varreduras.
- GSAP sob demanda.
- Montagem só ao chegar perto.
- DPR 1,25 no celular.
- `Intl.NumberFormat` reaproveitado.

## 10. Engenheiro de acessibilidade

**Veredito**: APROVAR COM MUDANÇAS (2 bloqueios)

**Contrastes (antes, em pontos)**:

| Par | Razão |
|---|---|
| Branco sobre #0FA36B | 3,24 |
| Branco sobre #E5675B | 3,27 |
| Ladrilhos com a nova GX_PALETA (7 de 8 falhavam) | 1,62 a 3,32 |
| Foco #0FA36B sobre #F4F6F5 | 2,99 |
| Mapa de prazos | 1,89 a 2,90 |
| Projeção | 2,18 |

**Críticos**:
1. WCAG 2.2.2: sem pausa.
2. 1.4.3: texto branco nos ladrilhos.

**Recomendações**:
1. Perda de foco com `visibility:hidden`.
2. Contadores lidos no meio.
3. Contraste das telas.
4. Valores truncados.
5. Mapa só por cor.
6. Foco.
7. `role="img"` inútil.
8. "Reduzir movimento" lido só na carga.

**Teclado**:
- O Tab pula as telas.
- O botão de pausa agora existe, é focável e tem `aria-pressed` e rótulo "Pausar animação" / "Retomar animação".
- Os botões do painel continuam focáveis.

**Situação após correções**:
- Os dois bloqueios foram resolvidos.
- Recomendações 1, 2, 3, 4, 6, 7 e 8 resolvidas.
- Recomendação 5: o mapa ganhou contraste, mas o nome acessível por célula fica pendente.

---

## Correções aplicadas (verificadas no navegador)

| Teste | Resultado |
|---|---|
| Pausar | Todas as telas e cenas 3D com `aria-pressed=true`; o texto não muda |
| Recarregar pausado | Continua pausado e mostra o quadro completo |
| Retomar | 0 → 7 → 11 respostas |
| Gestão: trocar o setor durante a contagem | Indicador 12 → 3 → 12; sem erro |
| Aba ativa | Texto branco (rgb 255, 255, 255) |
| Indicadores | Fundos pelas classes `ok`/`at`/`er`; neutros sem classe |
| Calculadora | Série real até set/2026, do `indices.json` (fontes do Banco Central exibidas na tela) |
| Console | Sem erros novos |
