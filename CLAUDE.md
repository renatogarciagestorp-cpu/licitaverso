# Licitacon — instruções permanentes

Site sobre licitações, contratos e parcerias (Lei 13.019) para a administração pública. Respostas e textos em português.

## Publicação (regra principal)
- Trabalhe só no ramo de desenvolvimento indicado na sessão. **Publique no `main` apenas quando o usuário disser "Publique".**
- Como publicar: crie o ramo `pub` a partir de `origin/main`, aplique os commits com `cherry-pick`, rode `python3 scripts/empacotar-site.py` e envie com `git push origin HEAD:main`. Depois volte ao ramo de trabalho, apague o `pub`, faça merge de `origin/main` e envie.
- Depois de empacotar no ramo de trabalho, desfaça a mudança em `inicio-destaques.json` (ele é gerado no `main`).
- Não abra pull request sem pedido. Não coloque segredos (chaves, senhas) no chat, em variáveis de ambiente nem no código. Não cite identificadores de modelo de IA em commits ou código.
- Economize uso de API e créditos (Firecrawl, leituras de sites): leia só o necessário.

## Estrutura
- `src/site.html` é a fonte do site; `index.html` é gerado por `scripts/empacotar-site.py` (não edite `index.html` à mão).
- `biblioteca.html`: Biblioteca de jurisprudência (lê `acervo-completo.json`).
- `scripts/agente/`: o Parecerista (análises) e o Elaborador (`elaborar.py`, modelos AGU em `modelo_tr_*.py`), a fila (`fila.py`) e as coletas (`ler-fontes.py`, `pre-leitura.py`).
- `supabase/functions/`: pagamento e validação (`mp-checkout`), preços e limites em `_shared/precos.ts`. Publica sozinho ao enviar ao `main`.
- Padrões visuais: `DESIGN.md` / `sistema.css`. Orientações do especialista para os pareceres: `agente/orientacoes-especialista.md`.

## Regras do produto
- Cada assinante tem 8 ações por mês no Pro (elaborações do Elaborador + análises do Parecerista); equipes: 6 por acesso, somadas para a equipe.
- Documentos de apoio (ETP, matriz de riscos, planilhas, orçamento, outros) somam no máximo **300 páginas por ação**, em qualquer número de arquivos. Vale para TR, ETP, Projeto Básico, Plano de Trabalho, Edital e para o Parecerista. O agente lê os documentos inteiros (sem resumir).
- Os modelos (AGU etc.) são padrão: o conteúdo se ajusta à contratação a partir dos documentos do processo; divergências viram pendências.
- Pendências devem ser perguntadas ao assinante antes do download do documento.

## Acervo e coletas
- Foco obrigatório: licitações e contratos da administração direta e indireta, e tudo da Lei 13.019/2014 (parcerias com OSC). Fora: pessoal, concursos, contas de governo, LRF, orçamento, tributos, teses só processuais.
- Base: artifact do acervo (coleção `decisoes`, controle em `meta`). Novos itens entram por `acervo-novos/` → workflow `acervo-mesclar` → `acervo-completo.json`; a reconciliação dos dias úteis (9h03) publica o que estiver na base.
- Leituras de sites: o leitor de fontes do GitHub (ramo `coleta-fontes`, pasta `lidas/`). Às segundas 7h50 o workflow `acervo-pre-leitura.yml` lê antes as fontes das coletas do RJ. TCE-RJ e TJ-RJ bloqueiam o GitHub e são lidos pelo Firecrawl (segredo `FIRECRAWL_API_KEY` no GitHub; plano de 500 créditos/mês).
- Detalhes em `coletas/acesso-aos-sites.md`.
