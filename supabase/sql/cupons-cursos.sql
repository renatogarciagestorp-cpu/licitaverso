-- Cupons do Hotmart para assinantes (um código por plano, cadastrado no Painel → Cursos).
-- Só o administrador lê a tabela; cada assinante vê apenas o cupom do próprio plano, pela função meu_cupom_curso().
create table if not exists public.cupons_cursos (
  plano         text primary key check (plano in ('basico', 'premium', 'pro')),
  codigo        text not null default '' check (char_length(codigo) <= 40),
  atualizado_em timestamptz not null default now()
);
alter table public.cupons_cursos enable row level security;
revoke all on public.cupons_cursos from anon, authenticated;
grant select, insert, update on public.cupons_cursos to authenticated;
drop policy if exists cupons_admin on public.cupons_cursos;
create policy cupons_admin on public.cupons_cursos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.cupons_cursos (plano) values ('basico'), ('premium'), ('pro') on conflict do nothing;

create or replace function public.meu_cupom_curso()
returns text language sql stable security definer set search_path = public as $$
  select nullif(codigo, '') from public.cupons_cursos where plano = public.plano_vigente(auth.uid())
$$;
revoke execute on function public.meu_cupom_curso() from public, anon;
grant execute on function public.meu_cupom_curso() to authenticated;

-- Códigos padrão (os mesmos a criar em cada curso no Hotmart). Só preenche se ainda estiver vazio:
-- o que for salvo depois no Painel → Cursos prevalece.
update public.cupons_cursos set codigo = 'BASICO10', atualizado_em = now() where plano = 'basico' and codigo = '';
update public.cupons_cursos set codigo = 'PREMIUM15', atualizado_em = now() where plano = 'premium' and codigo = '';
update public.cupons_cursos set codigo = 'PRO50', atualizado_em = now() where plano = 'pro' and codigo = '';
