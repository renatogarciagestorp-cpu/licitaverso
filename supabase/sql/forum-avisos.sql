-- Fórum: aviso por e-mail quando alguém responde a uma pergunta (opcional, escolhido por quem pergunta).
alter table public.forum_perguntas add column if not exists avisar_respostas boolean not null default false;
alter table public.forum_respostas add column if not exists aviso_enviado_em timestamptz;
grant insert (avisar_respostas), update (avisar_respostas) on public.forum_perguntas to authenticated;
