-- Ofertas de lançamento do Licitacon
-- 1) Preço de fundador: 30% de desconto nos planos individuais (Básico, Premium, Pro) para os primeiros 100 assinantes,
--    travado enquanto a assinatura continuar ativa (tolerância de 30 dias após o fim do período para renovar).
--    Não se soma ao desconto do anual nem aos planos de equipe. Quem decide o preço é o servidor (mp-checkout).
-- 2) Primeira análise grátis: 1 por CPF válido (e por conta), com e-mail confirmado. Erro técnico não consome a cortesia.
--    Limite global de 20 por dia: acima disso, a análise entra na fila do primeiro dia com vaga (prioridade sobre as do dia seguinte).
-- (nome "zz-p..." para ser aplicado depois de zz-organizacoes.sql)

alter table public.perfis add column if not exists fundador_em timestamptz;
alter table public.assinaturas add column if not exists fundador boolean not null default false;
alter table public.renovacoes add column if not exists fundador boolean not null default false;

create or replace function public.limite_fundadores() returns int language sql immutable as $$ select 100 $$;

create or replace function public.vagas_fundador()
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, public.limite_fundadores() - (select count(*)::int from public.perfis where fundador_em is not null))
$$;

-- Fundador com assinatura ativa (ou terminada há menos de 30 dias) mantém o preço
create or replace function public.eh_fundador(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis p where p.id = uid and p.fundador_em is not null)
     and (exists (select 1 from public.assinaturas a where a.usuario_id = uid and a.status = 'ativa' and a.plano <> 'teste'
                    and a.fim > now() - interval '30 days')
          or exists (select 1 from public.renovacoes r where r.usuario_id = uid and r.status = 'ativa'))
$$;

-- Marca a pessoa como fundadora quando o primeiro pagamento com preço de fundador é aprovado
create or replace function public.marcar_fundador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fundador and new.status = 'ativa' and (tg_op = 'INSERT' or old.status is distinct from 'ativa') then
    update public.perfis set fundador_em = now() where id = new.usuario_id and fundador_em is null;
  end if;
  return new;
end $$;
drop trigger if exists assinaturas_fundador on public.assinaturas;
create trigger assinaturas_fundador after insert or update of status on public.assinaturas
  for each row execute function public.marcar_fundador();
drop trigger if exists renovacoes_fundador on public.renovacoes;
create trigger renovacoes_fundador after insert or update of status on public.renovacoes
  for each row execute function public.marcar_fundador();

-- Cortesia de boas-vindas no Agente IA
alter table public.analises drop constraint if exists analises_cobranca_check;
alter table public.analises add constraint analises_cobranca_check
  check (cobranca in ('franquia_pro', 'franquia_org', 'avulsa', 'cortesia_admin', 'cortesia_boas_vindas'));

create or replace function public.limite_cortesias_dia() returns int language sql immutable as $$ select 20 $$;

-- Uma cortesia por conta e por CPF (o CPF fica guardado só como hash, para conferir repetição)
alter table public.analises add column if not exists cortesia_cpf text;
alter table public.analises add column if not exists cortesia_dia date;
alter table public.analises add column if not exists liberar_em timestamptz;  -- fila: não processa antes disso
create unique index if not exists analises_cortesia_cpf_unica on public.analises (cortesia_cpf)
  where cobranca = 'cortesia_boas_vindas' and status not in ('erro', 'cancelada');

create or replace function public.cpf_valido(doc text)
returns boolean language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(doc, ''), '\D', '', 'g'); s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

create or replace function public.hash_cpf(doc text) returns text language sql immutable as $$
  select md5('licitacon-cortesia:' || regexp_replace(coalesce(doc, ''), '\D', '', 'g'))
$$;

-- Situação da cortesia: ok | sem_cpf | usada | cpf_usado
create or replace function public.cortesia_situacao(uid uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare doc text;
begin
  if exists (select 1 from public.analises a where a.usuario_id = uid and a.cobranca = 'cortesia_boas_vindas'
               and a.status not in ('erro', 'cancelada')) then return 'usada'; end if;
  select documento into doc from public.perfis where id = uid;
  if not public.cpf_valido(doc) then return 'sem_cpf'; end if;
  if exists (select 1 from public.analises a where a.cortesia_cpf = public.hash_cpf(doc) and a.cobranca = 'cortesia_boas_vindas'
               and a.status not in ('erro', 'cancelada')) then return 'cpf_usado'; end if;
  return 'ok';
end $$;

create or replace function public.cortesia_disponivel(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.cortesia_situacao(uid) = 'ok'
$$;

-- Primeiro dia (horário de Brasília), a partir de hoje, com vaga no limite diário de cortesias
create or replace function public.dia_cortesia()
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  loop
    exit when (select count(*) from public.analises a where a.cobranca = 'cortesia_boas_vindas' and a.cortesia_dia = d
                 and a.status not in ('erro', 'cancelada')) < public.limite_cortesias_dia();
    d := d + 1;
  end loop;
  return d;
end $$;

-- Cria a análise grátis (chamada pela função de checkout, com a chave de serviço). Devolve id, dia e liberar_em.
create or replace function public.criar_cortesia(uid uuid, p_plano text, p_termo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare doc text; d date; lib timestamptz; novo uuid;
begin
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

-- Fila do agente: não pega análise com liberar_em no futuro; as adiadas entram na frente das que chegarem no dia seguinte
create or replace function public.analise_proxima()
returns setof public.analises language plpgsql security definer set search_path = public as $$
begin
  update public.analises set status = case when tentativas >= 3 then 'erro' else 'na_fila' end,
         erro_msg = case when tentativas >= 3 then 'Falha repetida no processamento.' else erro_msg end
   where status = 'processando' and iniciado_em < now() - interval '40 minutes';
  return query
  update public.analises set status = 'processando', iniciado_em = now(), tentativas = tentativas + 1
   where id = (select id from public.analises where status = 'na_fila' and (liberar_em is null or liberar_em <= now())
               order by coalesce(liberar_em, pago_em, criado_em) limit 1 for update skip locked)
  returning *;
end $$;
revoke execute on function public.analise_proxima() from public, anon, authenticated;
grant execute on function public.analise_proxima() to service_role;

-- O que o site mostra (funciona sem login: aí só as vagas)
create or replace function public.oferta_lancamento()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'desconto', 0.3,
    'limite', public.limite_fundadores(),
    'vagas', public.vagas_fundador(),
    'sou_fundador', case when auth.uid() is null then false else public.eh_fundador(auth.uid()) end,
    'cortesia', case when auth.uid() is null then true else public.cortesia_disponivel(auth.uid()) end,
    'cortesia_situacao', case when auth.uid() is null then 'anonimo' else public.cortesia_situacao(auth.uid()) end,
    'cortesia_proximo_dia', public.dia_cortesia())
$$;

revoke execute on function public.vagas_fundador(), public.eh_fundador(uuid), public.cortesia_disponivel(uuid), public.cortesia_situacao(uuid),
  public.dia_cortesia(), public.criar_cortesia(uuid, text, text) from public, anon, authenticated;
grant execute on function public.vagas_fundador(), public.eh_fundador(uuid), public.cortesia_disponivel(uuid), public.cortesia_situacao(uuid),
  public.dia_cortesia(), public.criar_cortesia(uuid, text, text) to service_role;
revoke execute on function public.marcar_fundador() from public, anon, authenticated;
grant execute on function public.oferta_lancamento() to anon, authenticated;
