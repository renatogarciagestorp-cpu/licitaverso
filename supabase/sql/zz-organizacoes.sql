-- Planos para equipes (empresas e órgãos públicos): licença anual ou mensal com N acessos nominais (e-mails), franquia de
-- análises do agente somada para a equipe (Pro: 6 por acesso por mês) e 1 consultoria por escrito por mês para a organização.
-- (nome "zz-o..." para ser aplicado depois de zz-mfa-admin.sql: sobrepõe plano_vigente e minha_cota_analises)

create table if not exists public.organizacoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text,
  tipo        text not null default 'privada' check (tipo in ('privada', 'publica')),
  plano       text not null check (plano in ('basico', 'premium', 'pro')),
  acessos     int  not null check (acessos between 1 and 500),
  ciclo       text not null default 'anual' check (ciclo in ('mensal', 'anual')),
  inicio      timestamptz not null default now(),
  fim         timestamptz not null,
  status      text not null default 'ativa' check (status in ('pendente', 'ativa', 'encerrada')),
  origem      text not null default 'empenho' check (origem in ('mercado_pago', 'empenho', 'cortesia', 'manual')),
  valor       numeric(12,2) not null default 0,
  observacao  text,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);

create table if not exists public.organizacao_membros (
  id        bigint generated always as identity primary key,
  org_id    uuid not null references public.organizacoes on delete cascade,
  email     text not null check (email = lower(btrim(email)) and email like '%@%'),
  papel     text not null default 'membro' check (papel in ('gestor', 'membro')),
  criado_em timestamptz not null default now(),
  unique (org_id, email)
);
alter table public.organizacoes add column if not exists usuario_id uuid references auth.users on delete set null; -- quem comprou pelo site
alter table public.organizacoes add column if not exists mp_preferencia text;
alter table public.organizacoes add column if not exists mp_pagamento text;
alter table public.organizacoes add column if not exists metodo text;
alter table public.organizacoes add column if not exists parcelas int not null default 1;
create index if not exists organizacao_membros_email on public.organizacao_membros (email);

alter table public.organizacoes enable row level security;
alter table public.organizacao_membros enable row level security;
revoke all on public.organizacoes, public.organizacao_membros from anon, authenticated;
grant select on public.organizacoes, public.organizacao_membros to authenticated;
grant insert, update, delete on public.organizacoes, public.organizacao_membros to authenticated;

create or replace function public.meu_email_conta(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select lower(btrim(coalesce(p.email, ''))) from public.perfis p where p.id = uid
$$;

-- Organização vigente da pessoa (a de melhor plano, se houver mais de uma)
create or replace function public.org_do_usuario(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select o.id from public.organizacoes o
  join public.organizacao_membros m on m.org_id = o.id
  where m.email = public.meu_email_conta(uid) and m.email <> ''
    and o.status = 'ativa' and o.inicio <= now() and o.fim > now()
  order by case o.plano when 'pro' then 3 when 'premium' then 2 else 1 end desc, o.fim desc
  limit 1
$$;
revoke execute on function public.org_do_usuario(uuid) from public, anon;
grant execute on function public.org_do_usuario(uuid) to authenticated, service_role;

create or replace function public.sou_gestor(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizacao_membros m
                 where m.org_id = org and m.papel = 'gestor' and m.email = public.meu_email_conta(auth.uid()) and m.email <> '')
$$;

drop policy if exists org_ler on public.organizacoes;
create policy org_ler on public.organizacoes for select to authenticated
  using (public.is_admin() or exists (select 1 from public.organizacao_membros m
                                      where m.org_id = organizacoes.id and m.email = public.meu_email_conta(auth.uid())));
drop policy if exists org_admin on public.organizacoes;
create policy org_admin on public.organizacoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists orgm_ler on public.organizacao_membros;
create policy orgm_ler on public.organizacao_membros for select to authenticated
  using (public.is_admin() or email = public.meu_email_conta(auth.uid()) or public.sou_gestor(org_id));
drop policy if exists orgm_admin on public.organizacao_membros;
create policy orgm_admin on public.organizacao_membros for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Plano vigente: o melhor entre a assinatura individual e a da organização (o admin, com verificação em duas etapas, é Pro)
create or replace function public.plano_vigente(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.perfis p where p.id = uid and p.admin)
         and (auth.uid() is null or (uid = auth.uid() and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2') or public.is_admin()) then 'pro'
    when not (auth.uid() is null or uid = auth.uid() or public.is_admin()) then null
    else (
      select x.plano from (
        select a.plano from public.assinaturas a
        where a.usuario_id = uid and a.status = 'ativa' and a.inicio <= now() and a.fim > now()
        union all
        select o.plano from public.organizacoes o where o.id = public.org_do_usuario(uid)
      ) x
      order by case x.plano when 'pro' then 4 when 'premium' then 3 when 'basico' then 2 else 1 end desc
      limit 1)
  end
$$;

-- Franquia de análises da equipe
alter table public.analises add column if not exists org_id uuid references public.organizacoes on delete set null;
alter table public.analises drop constraint if exists analises_cobranca_check;
alter table public.analises add constraint analises_cobranca_check check (cobranca in ('franquia_pro', 'franquia_org', 'avulsa', 'cortesia_admin', 'cortesia_boas_vindas'));
alter table public.consultorias add column if not exists org_id uuid references public.organizacoes on delete set null;

-- Início do mês corrente (dia 1, 00:00, horário de Brasília)
create or replace function public.inicio_mes_br(agora timestamptz default now())
returns timestamptz language sql immutable as $$
  select (date_trunc('month', agora at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
$$;

create or replace function public.analises_usadas_org(org uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.analises
  where org_id = org and cobranca = 'franquia_org'
    and status not in ('erro', 'cancelada') and criado_em >= public.inicio_mes_br()
$$;
revoke execute on function public.analises_usadas_org(uuid) from public, anon, authenticated;
grant execute on function public.analises_usadas_org(uuid) to service_role;

create or replace function public.minha_cota_analises()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.organizacoes; org uuid;
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
  return jsonb_build_object(
    'plano', public.plano_vigente(auth.uid()),
    'limite', case when public.plano_vigente(auth.uid()) = 'pro' then 2 else 0 end,
    'usadas', public.analises_usadas_semana(auth.uid()),
    'renova_em', public.inicio_semana_br() + interval '7 days');
end $$;
grant execute on function public.minha_cota_analises() to authenticated;

-- Painel da equipe (para quem pertence a uma organização; o gestor vê a lista de acessos)
create or replace function public.minha_organizacao()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare org uuid; o public.organizacoes; gestor boolean;
begin
  org := public.org_do_usuario(auth.uid());
  if org is null then return null; end if;
  select * into o from public.organizacoes where id = org;
  gestor := public.sou_gestor(org);
  return jsonb_build_object('id', o.id, 'nome', o.nome, 'plano', o.plano, 'acessos', o.acessos, 'fim', o.fim, 'ciclo', o.ciclo,
    'gestor', gestor,
    'usados', (select count(*) from public.organizacao_membros where org_id = org),
    'analises_mes', case when o.plano = 'pro' then public.analises_usadas_org(org) else null end,
    'limite_mes', case when o.plano = 'pro' then 6 * o.acessos else null end,
    'membros', case when gestor then (select coalesce(jsonb_agg(jsonb_build_object('email', m.email, 'papel', m.papel,
                     'nome', (select p.nome from public.perfis p where lower(p.email) = m.email limit 1),
                     'cadastrado', exists (select 1 from public.perfis p where lower(p.email) = m.email)) order by m.papel, m.email), '[]'::jsonb)
                   from public.organizacao_membros m where m.org_id = org) else null end);
end $$;
grant execute on function public.minha_organizacao() to authenticated;

-- O gestor inclui e retira acessos (o número de e-mails nunca passa do contratado)
create or replace function public.org_definir_membro(p_email text, p_incluir boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org uuid; o public.organizacoes; e text := lower(btrim(coalesce(p_email, '')));
begin
  org := public.org_do_usuario(auth.uid());
  if org is null or not public.sou_gestor(org) then raise exception 'Somente o gestor da equipe pode alterar os acessos.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  select * into o from public.organizacoes where id = org;
  if p_incluir then
    if exists (select 1 from public.organizacao_membros where org_id = org and email = e) then return public.minha_organizacao(); end if;
    if (select count(*) from public.organizacao_membros where org_id = org) >= o.acessos then
      raise exception 'Todos os % acessos contratados já estão em uso. Retire um acesso ou peça a ampliação.', o.acessos;
    end if;
    insert into public.organizacao_membros (org_id, email, papel) values (org, e, 'membro');
  else
    if e = public.meu_email_conta(auth.uid()) then raise exception 'O gestor não pode retirar o próprio acesso. Fale com o Licitacon para trocar o gestor.'; end if;
    delete from public.organizacao_membros where org_id = org and email = e and papel = 'membro';
  end if;
  return public.minha_organizacao();
end $$;
revoke execute on function public.org_definir_membro(text, boolean) from public, anon;
grant execute on function public.org_definir_membro(text, boolean) to authenticated;

-- Compra de plano de equipe pelo site (Mercado Pago): ativa a equipe quando o pagamento é aprovado
create or replace function public.registrar_pagamento_equipe(
  p_referencia text, p_mp_pagamento text, p_metodo text, p_valor numeric, p_parcelas int
) returns text language plpgsql security definer set search_path = public as $$
declare o public.organizacoes; ref_id uuid; nomes jsonb := '{"basico":"Básico","premium":"Premium","pro":"Pro"}';
begin
  begin ref_id := split_part(p_referencia, ':', 2)::uuid; exception when others then return 'referencia_invalida'; end;
  if exists (select 1 from public.pagamentos where mp_pagamento = p_mp_pagamento) then return 'ja_registrado'; end if;
  select * into o from public.organizacoes where id = ref_id for update;
  if not found then return 'equipe_inexistente'; end if;
  if o.status = 'ativa' then return 'ja_ativa'; end if;
  if p_valor + 0.01 < o.valor then return 'valor_divergente'; end if;
  update public.organizacoes set status = 'ativa', inicio = now(),
    fim = now() + case o.ciclo when 'anual' then interval '12 months' else interval '1 month' end,
    mp_pagamento = p_mp_pagamento, metodo = coalesce(nullif(p_metodo, ''), metodo), parcelas = greatest(1, least(12, coalesce(p_parcelas, 1)))
  where id = o.id;
  insert into public.pagamentos (usuario_id, referencia, descricao, metodo, valor, parcelas, mp_pagamento)
  values (o.usuario_id, p_referencia,
          'Plano ' || coalesce(nomes ->> o.plano, o.plano) || ' para equipes · ' || o.acessos || ' acessos · ' || case o.ciclo when 'anual' then '12 meses' else '1 mês' end,
          p_metodo, p_valor, coalesce(p_parcelas, 1), p_mp_pagamento);
  return 'equipe_ativada';
end $$;
revoke execute on function public.registrar_pagamento_equipe(text, text, text, numeric, int) from public, anon, authenticated;
grant execute on function public.registrar_pagamento_equipe(text, text, text, numeric, int) to service_role;
