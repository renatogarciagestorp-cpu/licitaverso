# Licitaverso — etapas até o site final

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
Aplicação Licitaverso (Checkout Pro). Funções publicadas pelo GitHub Actions (secrets SUPABASE_ACCESS_TOKEN e MP_ACCESS_TOKEN, de produção desde 23/10/2026). Compra de teste do Básico mensal aprovada e plano ativado. Webhook configurado (evento Pagamentos) com MP_WEBHOOK_SECRET no GitHub.
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
