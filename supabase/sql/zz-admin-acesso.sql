-- (nome com "zz-" para ser aplicado por último: sobrepõe minha_cota_analises de analises.sql)
-- Administrador: acesso total sem cobrança. Para todo o site, o admin equivale ao plano Pro;
-- as cobranças (agente, consultoria) são zeradas no servidor (mp-checkout).
create or replace function public.plano_vigente(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when (auth.uid() is null or uid = auth.uid() or public.is_admin())
         and exists (select 1 from public.perfis p where p.id = uid and p.admin) then 'pro'
    else (
      select a.plano
      from public.assinaturas a
      where a.usuario_id = uid and a.status = 'ativa' and a.inicio <= now() and a.fim > now()
        and (auth.uid() is null or uid = auth.uid() or public.is_admin())
      order by case a.plano when 'pro' then 4 when 'premium' then 3 when 'basico' then 2 else 1 end desc
      limit 1)
  end
$$;

alter table public.analises drop constraint if exists analises_cobranca_check;
alter table public.analises add constraint analises_cobranca_check check (cobranca in ('franquia_pro', 'franquia_org', 'avulsa', 'cortesia_admin', 'cortesia_boas_vindas'));

-- cota do agente: admin sem limite
create or replace function public.minha_cota_analises()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object('plano', 'pro', 'limite', 9999, 'usadas', 0, 'admin', true,
                                                              'renova_em', public.inicio_semana_br() + interval '7 days')
  else jsonb_build_object(
    'plano', public.plano_vigente(auth.uid()),
    'limite', case when public.plano_vigente(auth.uid()) = 'pro' then 2 else 0 end,
    'usadas', public.analises_usadas_semana(auth.uid()),
    'renova_em', public.inicio_semana_br() + interval '7 days') end
$$;
