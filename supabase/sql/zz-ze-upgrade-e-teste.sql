-- Troca para um plano maior com crédito do tempo não usado, e franquia do Pro no teste de 7 dias (nov/2026).
-- (nome "zz-ze..." para ser aplicado depois de zz-organizacoes.sql e zz-admin-acesso.sql: sobrepõe minha_cota_analises)
-- Idempotente: pode ser aplicado várias vezes.

-- 1) Assinaturas: de quais planos uma compra é a troca, quanto de crédito foi descontado e a situação "substituida"
alter table public.assinaturas add column if not exists substitui uuid[];
alter table public.assinaturas add column if not exists credito numeric(10, 2) not null default 0;
alter table public.assinaturas drop constraint if exists assinaturas_status_check;
alter table public.assinaturas add constraint assinaturas_status_check
  check (status in ('pendente', 'ativa', 'recusada', 'cancelada', 'expirada', 'substituida'));

-- 2) Crédito da troca: o valor pago pelos planos individuais menores ainda ativos, proporcional ao tempo que falta.
--    Teste, cortesias (valor 0) e o mesmo plano não entram (recomprar o mesmo plano soma o tempo, como antes).
create or replace function public.credito_upgrade(uid uuid, p_plano text)
returns jsonb language sql stable security definer set search_path = public as $$
  with nivel as (select case p_plano when 'pro' then 4 when 'premium' then 3 when 'basico' then 2 else 0 end as n),
  base as (
    select a.id, a.plano,
           round(a.valor * greatest(0, extract(epoch from (a.fim - greatest(now(), a.inicio))))
                         / nullif(extract(epoch from (a.fim - a.inicio)), 0), 2) as credito
    from public.assinaturas a, nivel
    where a.usuario_id = uid and a.status = 'ativa' and a.fim > now() and a.valor > 0
      and a.plano in ('basico', 'premium', 'pro')
      and (case a.plano when 'pro' then 4 when 'premium' then 3 when 'basico' then 2 else 0 end) < nivel.n
  )
  select jsonb_build_object(
    'credito', coalesce(sum(credito), 0),
    'ids', coalesce(jsonb_agg(id) filter (where credito > 0), '[]'::jsonb),
    'planos', coalesce(jsonb_agg(distinct plano) filter (where credito > 0), '[]'::jsonb))
  from base
$$;
revoke execute on function public.credito_upgrade(uuid, text) from public, anon, authenticated;
grant execute on function public.credito_upgrade(uuid, text) to service_role;

-- a própria pessoa consulta o crédito antes de pagar (o valor cobrado é sempre recalculado no servidor)
create or replace function public.meu_credito_upgrade(p_plano text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.credito_upgrade(auth.uid(), p_plano)
$$;
revoke execute on function public.meu_credito_upgrade(text) from public, anon;
grant execute on function public.meu_credito_upgrade(text) to authenticated;

-- 3) Quando o plano novo é ativado, os planos que ele substitui terminam na mesma hora
create or replace function public.encerrar_planos_substituidos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ativa' and coalesce(old.status, '') <> 'ativa' and coalesce(array_length(new.substitui, 1), 0) > 0 then
    update public.assinaturas
       set status = 'substituida', fim = least(fim, now()), atualizado_em = now(),
           observacao = trim(both ' ·' from observacao || ' · substituída pela troca para o plano ' || new.plano)
     where id = any(new.substitui) and usuario_id = new.usuario_id and status = 'ativa' and id <> new.id;
  end if;
  return new;
end $$;
drop trigger if exists assinaturas_upgrade on public.assinaturas;
create trigger assinaturas_upgrade after update of status on public.assinaturas
  for each row execute function public.encerrar_planos_substituidos();

-- 4) Teste de 7 dias: mesma franquia do Pro no Parecerista e no Elaborador (2 por semana, somados)
create or replace function public.minha_cota_analises()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare org uuid; o public.organizacoes; pl text;
begin
  if public.is_admin() then
    return jsonb_build_object('plano', 'pro', 'limite', 9999, 'usadas', 0, 'admin', true, 'renova_em', public.inicio_semana_br() + interval '7 days');
  end if;
  org := public.org_do_usuario(auth.uid());
  if org is not null then select * into o from public.organizacoes where id = org; end if;
  if o.id is not null and o.plano = 'pro' then
    return jsonb_build_object('plano', 'pro', 'equipe', true, 'periodo', 'mes', 'organizacao', o.nome, 'acessos', o.acessos,
      'limite', 6 * o.acessos, 'usadas', public.analises_usadas_org(o.id), 'renova_em', public.inicio_mes_br() + interval '1 month');
  end if;
  pl := public.plano_vigente(auth.uid());
  return jsonb_build_object(
    'plano', pl,
    'limite', case when pl in ('pro', 'teste') then 2 else 0 end,
    'usadas', public.analises_usadas_semana(auth.uid()),
    'renova_em', public.inicio_semana_br() + interval '7 days');
end $$;
grant execute on function public.minha_cota_analises() to authenticated;

-- 5) Análise grátis: passa a existir só pelo teste de 7 dias (franquia acima). A antiga "primeira análise grátis por CPF"
--    fica desligada; as que já foram liberadas e aguardam documentos continuam valendo.
--    Para religar, troque "false" por "true" na função abaixo.
create or replace function public.cortesia_ativa() returns boolean language sql immutable as $$ select false $$;

create or replace function public.cortesia_disponivel(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.cortesia_ativa() and public.cortesia_situacao(uid) = 'ok'
$$;

create or replace function public.criar_cortesia(uid uuid, p_plano text, p_termo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare doc text; d date; lib timestamptz; novo uuid;
begin
  if not public.cortesia_ativa() then return null; end if;
  perform pg_advisory_xact_lock(hashtext('cortesia_boas_vindas'));
  if public.cortesia_situacao(uid) <> 'ok' then return null; end if;
  select documento into doc from public.perfis where id = uid;
  d := public.dia_cortesia();
  lib := case when d > (now() at time zone 'America/Sao_Paulo')::date then d::timestamp at time zone 'America/Sao_Paulo' end;
  insert into public.analises (usuario_id, documento, origem, cobranca, plano, valor, termo_aceito_em, termo_versao, status,
                               cortesia_cpf, cortesia_dia, liberar_em)
  values (uid, 'multiplos', 'arquivos', 'cortesia_boas_vindas', p_plano, 0, now(), left(coalesce(p_termo, ''), 20), 'aguardando_documentos',
          public.hash_cpf(doc), d, lib)
  returning id into novo;
  return jsonb_build_object('id', novo, 'dia', d, 'liberar_em', lib);
end $$;

create or replace function public.oferta_lancamento()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'desconto', 0.3,
    'limite', public.limite_fundadores(),
    'vagas', public.vagas_fundador(),
    'sou_fundador', case when auth.uid() is null then false else public.eh_fundador(auth.uid()) end,
    'cortesia', case when not public.cortesia_ativa() then false when auth.uid() is null then true else public.cortesia_disponivel(auth.uid()) end,
    'cortesia_situacao', case when not public.cortesia_ativa() then 'encerrada' when auth.uid() is null then 'anonimo' else public.cortesia_situacao(auth.uid()) end,
    'cortesia_proximo_dia', public.dia_cortesia())
$$;

revoke execute on function public.cortesia_ativa(), public.cortesia_disponivel(uuid), public.criar_cortesia(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cortesia_ativa(), public.cortesia_disponivel(uuid), public.criar_cortesia(uuid, text, text) to service_role;
grant execute on function public.oferta_lancamento() to anon, authenticated;
