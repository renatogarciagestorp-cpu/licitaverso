-- Ofertas de lançamento do Licitacon
-- 1) Preço de fundador: 30% de desconto nos planos individuais (Básico, Premium, Pro) para os primeiros 100 assinantes,
--    travado enquanto a assinatura continuar ativa (tolerância de 30 dias após o fim do período para renovar).
--    Não se soma ao desconto do anual nem aos planos de equipe. Quem decide o preço é o servidor (mp-checkout).
-- 2) Primeira análise grátis: toda conta com e-mail confirmado tem 1 análise do Agente IA sem custo (uma única vez).
--    Análise que termina em erro não consome a cortesia. Limite global diário para proteger os créditos da API.
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

create or replace function public.cortesia_disponivel(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.analises a where a.usuario_id = uid and a.cobranca = 'cortesia_boas_vindas'
                       and a.status not in ('erro', 'cancelada'))
     and (select count(*) from public.analises a where a.cobranca = 'cortesia_boas_vindas'
            and a.criado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))
         < public.limite_cortesias_dia()
$$;

-- O que o site mostra (funciona sem login: aí só as vagas)
create or replace function public.oferta_lancamento()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'desconto', 0.3,
    'limite', public.limite_fundadores(),
    'vagas', public.vagas_fundador(),
    'sou_fundador', case when auth.uid() is null then false else public.eh_fundador(auth.uid()) end,
    'cortesia', case when auth.uid() is null then true else public.cortesia_disponivel(auth.uid()) end)
$$;

revoke execute on function public.vagas_fundador(), public.eh_fundador(uuid), public.cortesia_disponivel(uuid) from public, anon, authenticated;
grant execute on function public.vagas_fundador(), public.eh_fundador(uuid), public.cortesia_disponivel(uuid) to service_role;
revoke execute on function public.marcar_fundador() from public, anon, authenticated;
grant execute on function public.oferta_lancamento() to anon, authenticated;
