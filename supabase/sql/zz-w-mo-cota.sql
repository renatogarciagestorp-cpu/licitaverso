-- Mão de Obra Exclusiva: franquia semanal do agente por assinatura (individual ou de equipe):
-- 1 elaboração (Planilha 1), 1 análise de repactuação (Planilha 2) e 1 análise de proposta (Planilha 3) por semana
-- (segunda-feira a domingo, horário de Brasília). Na equipe, a franquia é da organização, somando todos os membros.
-- Só conta a análise concluída: falha técnica não consome a franquia.
alter table public.mo_preenchimentos add column if not exists org_id uuid references public.organizacoes on delete set null;
create index if not exists mo_preenchimentos_org on public.mo_preenchimentos (org_id, criado_em desc);

-- uso da semana para quem está logado (o site mostra o que ainda está disponível)
create or replace function public.mo_cota()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); org uuid; ini timestamptz := public.inicio_semana_br();
begin
  if uid is null then return null; end if;
  org := public.org_do_usuario(uid);
  return jsonb_build_object('admin', public.is_admin(), 'equipe', org is not null, 'renova_em', ini + interval '7 days',
    'usadas', coalesce((select jsonb_object_agg(modo, n) from (
       select modo, count(*) as n from public.mo_preenchimentos
        where criado_em >= ini and (case when org is not null then org_id = org else usuario_id = uid end)
        group by modo) x), '{}'::jsonb));
end $$;
revoke execute on function public.mo_cota() from public, anon;
grant execute on function public.mo_cota() to authenticated;
