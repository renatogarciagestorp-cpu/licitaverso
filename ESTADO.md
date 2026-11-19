# Licitacon — estado atual do projeto

> Documento vivo. **Leia no início de cada conversa nova** (junto com `CLAUDE.md`) e **atualize no fim** de toda conversa
> que mudar algo: seção "Últimas mudanças", "Pendências" e o que mais tiver mudado. Última atualização: **19/11/2026**.

## 1. Como começar uma conversa nova
- Anexe só o repositório **renatogarciagestorp-cpu/licitaverso** (ele já traz `CLAUDE.md`, este arquivo e todo o código).
- Ramo de trabalho: o que a sessão indicar (até agora `claude/zealous-meitner-fez4hb`). Publicar no `main` só com "Publique".
- Peça: "Leia ESTADO.md e continue a partir das pendências" — não é preciso reler conversas antigas.
- A pasta `modelos-elaborador/` (PDFs dos modelos da AGU usados para montar os modelos) **não vai ao GitHub**; os modelos
  já estão convertidos em `agente/modelos/*.docx` e `scripts/agente/modelo_*.py`. Só reenvie os PDFs se for refazer um modelo.

## 2. Produto (o que está no ar)
- **Site**: `src/site.html` → `index.html` (`scripts/empacotar-site.py`), GitHub Pages. Biblioteca em `biblioteca.html`;
  painel em `painel.html`; Gestão Contratual (planilhas e painéis, Excel/PDF, reforma tributária EC 132/LC 214 já considerada).
- **Planos**: Pro com 8 ações/mês (elaborações + análises); equipes 6 por acesso, somadas. Teste de 7 dias com franquia do Pro.
  Preços e limites em `supabase/functions/_shared/precos.ts`; validação no `mp-checkout`.
- **O Parecerista** (`scripts/agente/analisar.py`, fila `fila.py`): até 60 documentos e 300 páginas somadas por análise,
  tipos repetidos permitidos. Pareceres e minutas apagados 7 dias após a conclusão (`limpeza-lgpd.yml`; resumo fica).
- **O Elaborador** (`scripts/agente/elaborar.py`): TR, ETP, Projeto Básico, matriz de riscos, edital, plano de trabalho,
  justificativas. Documentos de apoio (ETP, matriz, planilhas, orçamento, "outros", vários arquivos) somam até 300 páginas
  por ação e são lidos inteiros. Cadeia ETP → TR/PB → Edital: o assinante escolhe quais documentos usar.
  - Modelos: compras `modelo_tr.py`; serviços/locação/DEMO/obras e Projeto Básico pelo modelo AGU `modelo_tr_servicos_agu.py`
    (perfis comum, loc, demo, eng); estatais `modelo_tr_geral.py`; ETP `modelo_etp.py`; chamamento `modelo_chamamento.py`.
  - Os modelos são padrão; o conteúdo se ajusta aos documentos do processo e divergências viram pendências, perguntadas ao
    assinante antes do download.

## 3. Acervo de jurisprudência (Biblioteca)
- Base: artifact https://claude.ai/artifact/Lxz5Pk53S7V4hdAtKBw4wW (coleções `decisoes` e `meta`). Site: `acervo-completo.json`
  (**2.263 itens** em 19/11/2026). Novos itens: `acervo-novos/*.json` → workflow `acervo-mesclar` → `acervo-completo.json`.
  Reconciliação nos dias úteis às 9h03 (tarefa "Atualizar site") publica o que estiver na base.
- Foco: licitações e contratos (adm. direta e indireta) + **tudo da Lei 13.019** (tema "Parcerias com OSC (Lei 13.019)").
  Fora: pessoal, concursos, contas de governo, LRF, orçamento, tributos, teses só processuais.
- Leitura de sites: leitor de fontes do GitHub (`acervo-fontes.yml` + `scripts/agente/ler-fontes.py`, ramo `coleta-fontes`,
  pastas `lidas/`). Detalhes em `coletas/acesso-aos-sites.md`.
- **Leitura antecipada** (`acervo-pre-leitura.yml` + `scripts/agente/pre-leitura.py`): segundas 7h50 (Brasília), deixa em
  `lidas/rj-<data>*` e `lidas/nacional-<data>*` as fontes das coletas do RJ. TCU pela API pública da Jurisprudência
  Selecionada. **TCE-RJ e TJ-RJ bloqueiam o GitHub** → lidos pelo Firecrawl (segredo `FIRECRAWL_API_KEY` no GitHub;
  plano gratuito de 500 créditos/mês, renova dia 9). TJ-RJ: confere a data de atualização (1 crédito) e só baixa a lista
  inteira (~27 créditos) quando muda; marca em `lidas/tjrj-inconstitucionalidades-atualizacao.txt`.

### Tarefas agendadas (claude.ai)
| Tarefa | ID | Quando |
|---|---|---|
| Coleta Nacional e RJ (TCU, STF, STJ, CGU, PGE-RJ, TJ-RJ, normas) | trig_01FJxXEtj3iCS3TkSopibJCJ | seg 8h07 |
| Coleta TCE-RJ e TCM-RJ | trig_0153MHPJ7N8wuTUwwWE4DLSt | seg 8h37 |
| Coleta Norte | trig_01Gaa86Vot99tJSVSjuU5rUe | semanal |
| Coleta Nordeste I | trig_0184fzPN6iUGcUq4qk4Z6C2i | semanal |
| Coleta Nordeste II | trig_01JFeHV3MFtcJAhYh7bd3XCL | semanal |
| Coleta Sudeste | trig_01Uytz1uLqtHor4c8HEZC8tT | semanal |
| Coleta Sul e Centro-Oeste | trig_01JDWVhzkgzayDYgQ2yoKyMy | sex 7h37 |
| Atualizar site (reconciliação) | trig_014M6zqCFtnWP2ggrL2DBEnL | dias úteis 9h03 |
| Resumo semanal | trig_01DoLvqv74fESijknkGD5mY9 | semanal |

- As coletas do RJ não têm conector de envio ao GitHub (só leem o repositório); as regionais têm o conector Claude Code Remote.
- `create_trigger` não consegue definir conectores nesta organização; `update_trigger` preserva conectores, modelo e permissões.
- Ambiente de nuvem `licitaverso`: rede limitada; tribunais não estão liberados (por isso o leitor do GitHub).

## 4. Últimas mudanças (mais recentes primeiro)
- 19/11: TCE-RJ e TJ-RJ pelo Firecrawl na leitura antecipada; instruções das coletas do RJ ajustadas (leituras
  identificadas pela url). Teste deu 402 (conta Firecrawl sem créditos até 09/12) — esperado.
- 19/11: 1ª limpeza de armazenamento conferida: pareceres e minutas apagados de 7 análises prontas há mais de 7 dias, sem erro.
- 19/11: recuperação do atraso do acervo (TCU, PGE-RJ, TCM-RJ); `CLAUDE.md` e este `ESTADO.md` criados.
- 17–18/11: leitura antecipada das coletas do RJ; TCU pela API; Lei 13.019 incluída em todas as coletas e na Biblioteca.
- 16–17/11: Elaborador com modelos AGU (DEMO, locação, obras/Projeto Básico), documentos de apoio até 300 páginas por ação,
  edital sem exigência de 3 documentos; Parecerista com 300 páginas somadas.

## 5. Pendências
- **14/12/2026 10h**: conferir se o TCE-RJ e o TJ-RJ voltaram a ser lidos pelo Firecrawl (lembrete agendado
  trig_01K2qKM6tZVmba9G16xcNR3y). Até 09/12 essas duas fontes falham com 402 (sem custo).
- **23/11/2026**: primeira segunda real da leitura antecipada (7h50) e das coletas do RJ (8h07/8h37) — conferir resultados.
- TCE-RJ: a página do Firecrawl mostra só os 10 registros mais recentes; se uma semana tiver mais, a coleta avisa "possível lacuna".
