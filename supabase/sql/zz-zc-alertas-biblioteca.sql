-- Alertas da Biblioteca Jurídica: "me avise quando entrar decisão nova sobre <tema> no <órgão/UF>".
-- O assinante cria pelo botão da Biblioteca com os filtros que está usando; a função avisos (diária) envia o e-mail
-- com os documentos novos do acervo desde o último envio. Até 10 alertas por conta.
create table if not exists public.alertas_biblioteca (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 200),
  tema text, orgao text, grupo text, uf text, termo text, natureza text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz
);
create index if not exists alertas_biblioteca_usuario on public.alertas_biblioteca (usuario_id);
alter table public.alertas_biblioteca enable row level security;
drop policy if exists alertas_bib_ler on public.alertas_biblioteca;
create policy alertas_bib_ler on public.alertas_biblioteca for select to authenticated using (usuario_id = auth.uid());
drop policy if exists alertas_bib_criar on public.alertas_biblioteca;
create policy alertas_bib_criar on public.alertas_biblioteca for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists alertas_bib_apagar on public.alertas_biblioteca;
create policy alertas_bib_apagar on public.alertas_biblioteca for delete to authenticated using (usuario_id = auth.uid());
grant select, insert, delete on public.alertas_biblioteca to authenticated;

create or replace function public.alertas_biblioteca_limite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.alertas_biblioteca where usuario_id = new.usuario_id) >= 10 then
    raise exception 'Limite de 10 alertas por conta. Apague um alerta para criar outro.';
  end if;
  new.ultimo_envio := null;
  return new;
end $$;
drop trigger if exists alertas_biblioteca_limite on public.alertas_biblioteca;
create trigger alertas_biblioteca_limite before insert on public.alertas_biblioteca for each row execute function public.alertas_biblioteca_limite();
