-- Franquia do Pro individual passa a ser mensal: 8 por mês, somando análises do Parecerista e documentos do Elaborador
-- (mês do calendário, horário de Brasília, sem acúmulo). O teste grátis de 7 dias continua com 2 na semana;
-- equipes Pro continuam com 6 por acesso por mês, somados.
-- (nome "zz-zi..." para ser aplicado depois de zz-ze-upgrade-e-teste.sql: sobrepõe minha_cota_analises)

create or replace function public.analises_usadas_mes(uid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.analises
  where usuario_id = uid and cobranca = 'franquia_pro'
    and status not in ('erro', 'cancelada') and criado_em >= public.inicio_mes_br()
$$;
revoke all on function public.analises_usadas_mes(uuid) from public, anon, authenticated;

create or replace function public.minha_cota_analises()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare org uuid; o public.organizacoes; pl text;
begin
  if public.is_admin() then
    return jsonb_build_object('plano', 'pro', 'limite', 9999, 'usadas', 0, 'admin', true, 'renova_em', public.inicio_mes_br() + interval '1 month');
  end if;
  org := public.org_do_usuario(auth.uid());
  if org is not null then select * into o from public.organizacoes where id = org; end if;
  if o.id is not null and o.plano = 'pro' then
    return jsonb_build_object('plano', 'pro', 'equipe', true, 'periodo', 'mes', 'organizacao', o.nome, 'acessos', o.acessos,
      'limite', 6 * o.acessos, 'usadas', public.analises_usadas_org(o.id), 'renova_em', public.inicio_mes_br() + interval '1 month');
  end if;
  pl := public.plano_vigente(auth.uid());
  if pl = 'pro' then
    return jsonb_build_object('plano', pl, 'periodo', 'mes', 'limite', 8,
      'usadas', public.analises_usadas_mes(auth.uid()), 'renova_em', public.inicio_mes_br() + interval '1 month');
  end if;
  return jsonb_build_object(
    'plano', pl, 'periodo', 'semana',
    'limite', case when pl = 'teste' then 2 else 0 end,
    'usadas', public.analises_usadas_semana(auth.uid()),
    'renova_em', public.inicio_semana_br() + interval '7 days');
end $$;
grant execute on function public.minha_cota_analises() to authenticated;
