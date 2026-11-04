-- Auditoria de segurança (nov/2026).
-- (nome "zz-s..." para ser aplicado depois de zz-organizacoes.sql, onde meu_email_conta é criada)

-- 1) meu_email_conta(uid) era executável por qualquer pessoa, inclusive sem login, e devolvia o e-mail de QUALQUER conta
--    a partir do id (que aparece, por exemplo, no ranking do fórum). Agora só devolve o e-mail da própria pessoa, do
--    administrador ou das chamadas internas (funções do servidor, sem login de usuário).
create or replace function public.meu_email_conta(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select lower(btrim(coalesce(p.email, ''))) from public.perfis p
   where p.id = uid
     and (uid = auth.uid()
          or coalesce(auth.role(), '') not in ('anon', 'authenticated')
          or public.is_admin())
$$;
revoke execute on function public.meu_email_conta(uuid) from public, anon;
grant execute on function public.meu_email_conta(uuid) to authenticated, service_role;

-- org_do_usuario(uid): a pessoa logada só consulta a própria organização (as funções do servidor consultam qualquer uma)
create or replace function public.org_do_usuario(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select o.id from public.organizacoes o
  join public.organizacao_membros m on m.org_id = o.id
  where (uid = auth.uid() or coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin())
    and m.email = public.meu_email_conta(uid) and m.email <> ''
    and o.status = 'ativa' and o.inicio <= now() and o.fim > now()
  order by case o.plano when 'pro' then 3 when 'premium' then 2 else 1 end desc, o.fim desc
  limit 1
$$;
revoke execute on function public.org_do_usuario(uuid) from public, anon;
grant execute on function public.org_do_usuario(uuid) to authenticated, service_role;

-- funções auxiliares das regras de acesso: nunca para visitantes sem login
revoke execute on function public.sou_gestor(uuid) from public, anon;
grant execute on function public.sou_gestor(uuid) to authenticated, service_role;

-- 2) Limite de envios dos formulários abertos a visitantes (contato, lista de espera, assistente):
--    por origem (endereço de rede, guardado só como resumo criptográfico) e no total, para impedir abuso automatizado.
alter table public.contatos add column if not exists origem text;
alter table public.lista_espera add column if not exists origem text;
alter table public.chatbot_registros add column if not exists origem text;
create index if not exists contatos_origem on public.contatos (origem, criado_em);
create index if not exists lista_espera_origem on public.lista_espera (origem, criado_em);
create index if not exists chatbot_registros_origem on public.chatbot_registros (origem, criado_em);

create or replace function public.limitar_envios()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  por_origem int := TG_ARGV[0]::int;   -- máximo por origem na janela
  total int := TG_ARGV[1]::int;        -- máximo geral na janela
  janela interval := (TG_ARGV[2] || ' minutes')::interval;
  ip text := '';
  n int;
begin
  begin
    ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then ip := '';
  end;
  new.origem := case when btrim(ip) = '' then null else md5('licitacon:' || btrim(ip)) end;
  if new.origem is not null then
    execute format('select count(*) from public.%I where origem = $1 and criado_em > now() - $2', TG_TABLE_NAME)
      into n using new.origem, janela;
    if n >= por_origem then raise exception 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.'; end if;
  end if;
  execute format('select count(*) from public.%I where criado_em > now() - $1', TG_TABLE_NAME) into n using janela;
  if n >= total then raise exception 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.'; end if;
  return new;
end $$;
revoke execute on function public.limitar_envios() from public, anon, authenticated;

drop trigger if exists contatos_limite on public.contatos;
create trigger contatos_limite before insert on public.contatos
  for each row execute function public.limitar_envios('5', '200', '10');
drop trigger if exists lista_espera_limite on public.lista_espera;
create trigger lista_espera_limite before insert on public.lista_espera
  for each row execute function public.limitar_envios('5', '200', '10');
drop trigger if exists chatbot_registros_limite on public.chatbot_registros;
create trigger chatbot_registros_limite before insert on public.chatbot_registros
  for each row execute function public.limitar_envios('60', '2000', '10');

-- a origem nunca é lida por visitantes nem por usuários (só o administrador, pelas regras já existentes)
revoke select (origem) on public.contatos from anon;

-- 3) Tamanho máximo do campo livre "detalhes" do contato (evita envio de arquivos enormes pelo formulário)
do $$ begin
  alter table public.contatos add constraint contatos_detalhes_tamanho check (pg_column_size(detalhes) <= 16384) not valid;
exception when duplicate_object then null; end $$;

-- 4) Controle de uso da conferência prévia: tabela interna, nunca acessível pelo site
revoke all on public.elab_triagens from anon, authenticated;
