-- Assistente do site: registro das perguntas e das avaliações (👍/👎), para melhorar a base de respostas.
-- Qualquer visitante pode registrar; só o administrador lê (Painel → Assistente).
create table if not exists public.chatbot_registros (
  id          bigint generated always as identity primary key,
  pergunta    text not null default '' check (char_length(pergunta) <= 300),
  resposta_id text not null default '' check (char_length(resposta_id) <= 60),
  util        boolean,
  pagina      text not null default '' check (char_length(pagina) <= 120),
  usuario_id  uuid default auth.uid() references auth.users on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists chatbot_registros_data on public.chatbot_registros (criado_em desc);
alter table public.chatbot_registros enable row level security;
revoke all on public.chatbot_registros from anon, authenticated;
grant insert (pergunta, resposta_id, util, pagina) on public.chatbot_registros to anon, authenticated;
grant select, delete on public.chatbot_registros to authenticated;
drop policy if exists chatbot_registrar on public.chatbot_registros;
create policy chatbot_registrar on public.chatbot_registros for insert to anon, authenticated with check (true);
drop policy if exists chatbot_admin_ler on public.chatbot_registros;
create policy chatbot_admin_ler on public.chatbot_registros for select to authenticated using (public.is_admin());
drop policy if exists chatbot_admin_apagar on public.chatbot_registros;
create policy chatbot_admin_apagar on public.chatbot_registros for delete to authenticated using (public.is_admin());
