# Licitacon — etapas até o site final

Trabalho dividido para caber no limite de uso. Cada etapa é uma conversa curta.
Os arquivos novos estão no branch `contas-e-pagamentos`; o site no ar (branch `main`) só muda na etapa 4.

## Etapa 1 — código (concluída em 23/10/2026)
- Login, cadastro (nome completo, celular, e-mail), "esqueci a senha" e sair — `src/site.html`, `licitaverso-auth.js`.
- Área do assinante com dados reais: perfil, assinatura, pagamentos, favoritos, notificações, LGPD.
- Fórum real: leitura com teste ou plano; perguntar e responder a partir do Básico; melhor resposta; resposta oficial.
- Planos com Mercado Pago (Pix, cartão até 12x no anual, débito, boleto); teste de 7 dias; órgão público vira solicitação.
- Consultoria com pedido e pagamento (incluída no Pro).
- Biblioteca exige login; anotações e dossiês ficam salvos na conta.
- Painel oculto `painel.html` (só para conta admin).
- Banco: `supabase/migrations/…_licitaverso_inicial.sql`. Pagamentos: `supabase/functions/mp-checkout` e `mp-webhook`.
- Testado localmente (banco + funções + navegador): cadastro, teste, pagamento anual, webhook, fórum, consultoria, LGPD, painel.

## Etapa 2 — Supabase (concluída em 23/10/2026)
Projeto: https://umnhhztdqersjfrzqcea.supabase.co — `config.js` preenchido; banco aplicado no SQL Editor; Site URL e Redirect URLs configuradas.
Fica para a etapa 4: o Renato cria a conta pelo site publicado e roda `update perfis set admin = true where email = '...';`.

1. Criar conta grátis em supabase.com e um projeto (região São Paulo).
2. Passar ao Claude: Project URL e a chave pública (anon/publishable). Nunca a chave secreta.
3. Claude: aplica o banco, preenche `config.js`, configura e-mails de confirmação e endereços de retorno.
4. Você marca sua conta como administradora (um comando que o Claude passa).

## Etapa 3 — Mercado Pago (concluída em 23/10/2026)
Aplicação Licitacon (Checkout Pro). Funções publicadas pelo GitHub Actions (secrets SUPABASE_ACCESS_TOKEN e MP_ACCESS_TOKEN, de produção desde 23/10/2026). Compra de teste do Básico mensal aprovada e plano ativado. Webhook configurado (evento Pagamentos) com MP_WEBHOOK_SECRET no GitHub.
1. Criar a aplicação no painel de desenvolvedor do Mercado Pago (credenciais de teste primeiro).
2. Cadastrar o Access Token e o segredo do webhook direto no Supabase (Claude mostra onde).
3. Claude publica as funções de pagamento e fazemos uma compra de teste.

## Etapa 4 — publicar (concluída em 23/10/2026)
Publicado no main. Conta do Renato criada e marcada como admin. Credenciais de PRODUÇÃO do Mercado Pago ativas: o site já recebe pagamentos reais.
Revisão final, juntar no `main` (o GitHub Pages publica sozinho) e trocar para as credenciais de produção.

## E-mails (23/10/2026)
- Textos de login em português: `supabase/emails/` (aplicados pelo workflow via `scripts/configurar-emails.py`).
- SMTP próprio pela Brevo: secrets BREVO_SMTP_USER, BREVO_SMTP_KEY, BREVO_API_KEY, EMAIL_REMETENTE (e opcional AVISOS_SECRET).
- Aviso de fim de plano: função `avisos` + workflow `avisos-diarios.yml` (todo dia 9h17; pagos 7 dias antes, teste 2 dias antes).

## Depois — domínio próprio
Registro.br → DNS A 185.199.108.153/109/110/111 e CNAME www → renatogarciagestorp-cpu.github.io → CNAME no repositório → Enforce HTTPS.
Lembrar de atualizar SITE_URL no Supabase e os endereços de retorno do login.

## Como editar o site
O código fica em `src/site.html`. Depois de mudar: `python3 scripts/empacotar-site.py` (gera o `index.html`).
Biblioteca: `python3 scripts/atualizar-biblioteca.py` reaplica o shim e a barra.
Cenas 3D da página inicial: o código fica em `src/inicio3d.js`. Depois de mudar: `cd scripts/3d && npm ci && npm run montar` (gera o `inicio3d.js` com o Three.js) e suba o `?v=` do `import("./inicio3d.js?v=…")` no `inicio.js`.

## Fórum: aviso por e-mail e perguntas iniciais (27/10/2026)
- Ao criar uma pergunta, o site pergunta se a pessoa quer receber e-mail quando alguém responder (Sim/Não, obrigatório). Dá para ligar/desligar depois, na própria pergunta.
- Função `forum-aviso` envia o e-mail (Brevo) ao autor; respeita "Resposta na minha pergunta" em Notificações; um e-mail por resposta.
- `supabase/sql/forum-perguntas-iniciais.sql`: 11 perguntas frequentes com resposta oficial (Lei 14.133/2021 e TCU). Editar/apagar em Painel → Fórum.

## Consultoria v2 (27/10/2026)
- Preços: por escrito R$ 390 (até 5 dias úteis), vídeo gravado R$ 590 (até 7 dias úteis, até 20 min), reunião ao vivo R$ 490 (60 min, agendada em até 7 dias úteis).
- Descontos: Básico 10%, Premium 15%, Pro 30% + 1 consultoria por escrito por mês incluída (sem acúmulo).
- Pedido com anexos (bucket privado `consultorias`), aceite das condições (versão registrada) e opção "Sou órgão público: pedir proposta" (vai para Mensagens).
- E-mail à equipe quando chega pedido pago/incluído ou pedido de proposta; Painel → Consultorias: link de entrega/agenda e "Avisar o cliente por e-mail" (função `consultoria-aviso`).
- Textos: consultoria técnica, não jurídica (Lei 8.906/1994, art. 1º, II); perfil do especialista atualizado.

## Assistente de dúvidas (27/10/2026)
- `chatbot.js` (widget) + `chatbot-base.js` (63 respostas, 10 temas na primeira versão) no site e na Biblioteca; sem custo de IA.
- Busca por palavras com peso pela raridade; em dúvida, oferece opções; sem resposta, encaminha à equipe (grava em contatos).
- Respostas personalizadas para quem está logado (plano e validade, cupom dos cursos).
- Registro de perguntas e avaliações 👍/👎 em `chatbot_registros`; Painel → Assistente mostra o que falta responder.
- Testes: 68/68 perguntas da base e 30/30 perguntas novas.
- **Reestruturado em 09/11/2026:** janela nova no visual da página inicial (verde-floresta, Manrope), classes com prefixo `lvq-` (o prefixo antigo `lvc-` colidia com a Calculadora e com a tela do Parecerista, onde o botão "Analisar 3 documentos" ficava preso na tela). Busca ao vivo: as perguntas parecidas da base aparecem enquanto a pessoa digita, com as palavras coincidentes marcadas (setas e Enter escolhem). Respostas em ficha com listas e passos numerados, botão principal, "Veja também" e "Esta resposta ajudou?". Tela inicial com as perguntas do assunto da página aberta e 14 assuntos por ferramenta; o botão diz "Dúvidas sobre a Calculadora?" etc. Janela inteira no celular (o site arredondava toda janela de diálogo). Base com 95 respostas, revista com os fatos do site: Parecerista, Elaborador, Pesquisa de preços, as 6 ferramentas da Calculadora (`f` abre a ferramenta direto), Gestão Contratual, PCA, planos para equipes, renovação automática opcional, CPGF, verificação em duas etapas. Bateria: `node scripts/testes/chatbot/testar.js` (com o servidor local na porta 8765): 95/95 da base e 61/61 perguntas novas.

## Revisão para o lançamento (27/10/2026)
- Retiradas promessas sem lastro: SICAF, certidões, nota fiscal, faturamento mensal, "+40 fontes", classificador com curadoria humana, instrutores/especialistas parceiros, backups diários e meta de disponibilidade.
- Endereço no site: Estrada Henfil, Maricá, Rio de Janeiro (sem CPF, por decisão do Renato).
- Busca e compartilhamento: descrição, Open Graph (icones/compartilhar.png), robots.txt e sitemap.xml.
- Medição de visitas: Cloudflare Web Analytics, carregada só com consentimento "todos" (falta o token em config.js).
- E-mails: boas-vindas no primeiro acesso (função boas-vindas), dica no 3º dia do teste e aviso na véspera do fim (avisos).

## Página inicial animada e painéis da Gestão (09/11/2026)
- Referências estudadas: profitize.com.br/build (sites 3D feitos com Three.js, GSAP e Lenis) e codeandchill.store (dashboards animados: GSAP + SVG, sem framework).
- Biblioteca: única cena 3D (Three.js), em `src/inicio3d.js` → pacote `inicio3d.js` (`cd scripts/3d && npm ci && npm run montar`), baixado só quando chega perto: 90 fontes alimentando o acervo.
- Parecerista: duas telas vivas em GSAP (`inicio-ui.js`). "Como funciona O Parecerista" (`data-lvui="como"`): envio dos documentos e regime, leitura item a item com contador, conferência com a lei, a súmula do TCU e o roteiro, e o parecer em PDF e Word; os passos ao lado acompanham a etapa e levam direto a ela. Seção do Parecerista (`data-lvui="parecer"`): o resultado como painel (itens conferidos, apontamentos por gravidade com o fundamento e a redação sugerida).
- Elaborador, Calculadora, Gestão e Comunidade: telas vivas em GSAP (`inicio-ui.js`, atributo `data-lvui` no modelo), a própria ferramenta trabalhando: ETP redigido com a pesquisa de preços; reajuste com a série real de `indices.json` (IPCA, IGP-M, INCC, IPCA-E); carteira com prazos e aviso por e-mail; fórum com resposta oficial.
- Painéis da Gestão Contratual: acabamento no padrão Code and Chill em `gestao.css` (prefixo `#dc-root`; a cor de cada indicador segue a situação ok/at/er) e montagem animada em `gestao-anim.js` (conta os números só no nó de texto do runtime). Os painéis ficam fora do `animacoes.js` (lista FORA).
- GSAP (`vendor/gsap-3.15.1.min.js`, licença gratuita "no charge") é baixado sob demanda por `inicio-ui.js` e `gestao-anim.js`; o Motion continua nas demais animações do site.
- Acessibilidade: botão "Pausar animação" em cada tela viva e cena 3D (WCAG 2.2.2; a escolha fica em `localStorage` `lv-anim-pausa`); "reduzir movimento" e "economia de dados" mostram o quadro final parado; sem WebGL ou sem GSAP, a página fica como era.
- A cada mudança nesses arquivos, subir o `?v=` correspondente em `src/site.html` e rodar `python3 scripts/empacotar-site.py`.
- Auditoria completa (10 lentes) em `reviews/audit-plan-full.md`.

## Regras decididas pelo Renato (10/11/2026)
- **Desistência em 7 dias:** vale para todos os contratantes na primeira contratação (Termos, Planos e assistente).
- **Troca de plano com cobrança proporcional (crédito do tempo):** o valor não usado dos planos menores ainda ativos (dias restantes) é descontado do plano novo, que começa um ciclo inteiro; o antigo termina ao ativar (`status = 'substituida'`) e a renovação automática dele é cancelada no Mercado Pago. `supabase/sql/zz-ze-upgrade-e-teste.sql` (`credito_upgrade`, `meu_credito_upgrade`, gatilho `assinaturas_upgrade`), `mp-checkout` (calcula no servidor; na troca não há renovação automática; crédito maior que o preço pede o ciclo anual) e a tela de pagamento (linha "Crédito do plano atual"). Recomprar o mesmo plano continua somando o tempo.
- **Análise grátis só pelo teste de 7 dias:** o teste tem a franquia do Pro (2 por semana, somando Parecerista e Elaborador). A "primeira análise grátis por CPF" foi desligada (`cortesia_ativa()` = false; para religar, trocar para true); as já liberadas continuam valendo.
- **Biblioteca exige conta (grátis, sem plano):** sem sessão, `biblioteca.html` mostra só a apresentação e os botões de criar conta e entrar (`scripts/biblioteca-shim.js`). É um bloqueio da página: os arquivos `acervo.json` e `acervo-completo.json` continuam públicos no GitHub Pages.
- **Aba Assinatura:** mostra a situação real da renovação automática.

## Painel da Organização revisado (10/11/2026, skills dashboard-design e dataviz)
- **Honestidade dos gráficos:** o mapa de valor por natureza agora tem área proporcional (`gxTreemap`, algoritmo "squarified"; fatias abaixo de 2% viram "Outras" e os ladrilhos sem rótulo ganham legenda); eixo do custo mensal com números redondos (`gxEixo`); o indicador "Gasto mensal" usa o mesmo valor do mês atual do gráfico; variação zero aparece como "sem variação".
- **Linha do tempo de 120 dias:** cada rótulo ocupa um intervalo e vai para a primeira faixa livre (antes havia limite de 6 faixas e rótulos por cima uns dos outros); no celular vira lista com "em N d".
- **Medidores em arco** viraram número + barra com faixa de referência (bullet); a qualidade do cadastro ficou só com a barra.
- **Comparação entre exercícios:** valores em duas linhas (sem colidir), variação em cinza para volume e colorida só onde há lado bom (diretas e tempo do reajuste); contagem com base menor que 5 mostra "eram N".
- **Calmo:** indicador saudável em branco (cor só para atenção e pendência); células do mapa de prazos depois do fim da vigência em branco; rótulos do funil e da tabela sem reticências.
- **Estados vazios:** alterações contratuais sem registro e PCA sem itens mostram orientação (o PCA sem itens não aparece mais como "0% executado" em vermelho).
- **Dicas:** `gestao-dicas.js` troca o title nativo por uma dica escura própria (mouse, teclado e toque) e põe linha-guia no gráfico de área; a dica fica no body, fora da árvore do runtime.
- Conferência: `gasto mensal` igual no indicador, no gráfico e na aba Gestão e dados; área dos ladrilhos = participação; 0 rótulos sobrepostos; sem rolagem lateral no celular.
