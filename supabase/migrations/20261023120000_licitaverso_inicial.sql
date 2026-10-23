-- =====================================================================
-- Licitaverso — banco de dados inicial
-- Contas, assinaturas, pagamentos (Mercado Pago), fórum, cursos,
-- consultoria, contato, lista de espera, LGPD e dados pessoais da
-- Biblioteca Jurídica. Toda tabela tem RLS ligado: o navegador só vê
-- o que a política permitir; o webhook de pagamento usa a chave de
-- serviço, que fica apenas nas funções do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Perfis (um por conta do Supabase Auth)
-- ---------------------------------------------------------------------
create table public.perfis (
  id            uuid primary key references auth.users on delete cascade,
  nome          text not null default '' check (char_length(nome) <= 160),
  celular       text not null default '' check (char_length(celular) <= 30),
  email         text not null default '',
  documento     text not null default '' check (char_length(documento) <= 30),
  orgao         text not null default '' check (char_length(orgao) <= 160),
  cargo         text not null default '' check (char_length(cargo) <= 120),
  setor         text not null default 'Setor Público' check (setor in ('Setor Público', 'Setor Privado')),
  notificacoes  jsonb not null default '{}'::jsonb,
  admin         boolean not null default false,
  teste_usado   boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger perfis_atualizado before update on public.perfis
  for each row execute function public.tocar_atualizado_em();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.admin from public.perfis p where p.id = auth.uid()), false)
$$;

-- Cria o perfil assim que a conta é criada (nome e celular vêm do cadastro)
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, celular, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 160),
    left(coalesce(new.raw_user_meta_data ->> 'celular', ''), 30),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

create or replace function public.sincronizar_email_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.perfis set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;
create trigger ao_mudar_email after update of email on auth.users
  for each row execute function public.sincronizar_email_perfil();

-- ---------------------------------------------------------------------
-- Assinaturas e pagamentos
-- ---------------------------------------------------------------------
create table public.assinaturas (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users on delete cascade,
  plano           text not null check (plano in ('teste', 'basico', 'premium', 'pro')),
  ciclo           text not null check (ciclo in ('teste', 'mensal', 'anual')),
  status          text not null default 'pendente'
                  check (status in ('pendente', 'ativa', 'recusada', 'cancelada', 'expirada')),
  valor           numeric(10, 2) not null default 0,
  parcelas        int not null default 1 check (parcelas between 1 and 12),
  contratante     text not null default 'fisica' check (contratante in ('fisica', 'privada', 'publica')),
  metodo          text not null default '',
  inicio          timestamptz,
  fim             timestamptz,
  mp_preferencia  text,
  mp_pagamento    text,
  origem          text not null default 'checkout' check (origem in ('checkout', 'teste', 'manual')),
  observacao      text not null default '',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index assinaturas_usuario on public.assinaturas (usuario_id, status, fim);
create trigger assinaturas_atualizado before update on public.assinaturas
  for each row execute function public.tocar_atualizado_em();

create table public.pagamentos (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users on delete cascade,
  referencia    text not null,
  descricao     text not null,
  metodo        text not null default '',
  valor         numeric(10, 2) not null,
  parcelas      int not null default 1,
  mp_pagamento  text unique,
  criado_em     timestamptz not null default now()
);
create index pagamentos_usuario on public.pagamentos (usuario_id, criado_em desc);

-- Plano em vigor (o de maior nível entre as assinaturas ativas no prazo)
create or replace function public.plano_vigente(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select a.plano
  from public.assinaturas a
  where a.usuario_id = uid and a.status = 'ativa' and a.inicio <= now() and a.fim > now()
    -- cada pessoa só consulta o próprio plano (o servidor e o admin consultam qualquer um)
    and (auth.uid() is null or uid = auth.uid() or public.is_admin())
  order by case a.plano when 'pro' then 4 when 'premium' then 3 when 'basico' then 2 else 1 end desc
  limit 1
$$;

create or replace function public.meu_plano()
returns text language sql stable security definer set search_path = public as $$
  select public.plano_vigente(auth.uid())
$$;

create or replace function public.pode_participar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.plano_vigente(auth.uid()) in ('basico', 'premium', 'pro'), false)
$$;

create or replace function public.pode_ler_forum()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.plano_vigente(auth.uid()) is not null
$$;

-- Teste grátis de 7 dias, uma vez por conta, sem cartão
create or replace function public.iniciar_teste()
returns public.assinaturas language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  nova public.assinaturas;
begin
  if u is null then raise exception 'Entre na sua conta para começar o teste.'; end if;
  if (select teste_usado from public.perfis where id = u) then
    raise exception 'O teste de 7 dias já foi usado nesta conta.';
  end if;
  if public.plano_vigente(u) is not null then
    raise exception 'Você já tem um plano ativo.';
  end if;
  insert into public.assinaturas (usuario_id, plano, ciclo, status, valor, inicio, fim, origem, metodo)
  values (u, 'teste', 'teste', 'ativa', 0, now(), now() + interval '7 days', 'teste', 'sem cobrança')
  returning * into nova;
  update public.perfis set teste_usado = true where id = u;
  return nova;
end $$;

-- Chamadas apenas pelo webhook (chave de serviço)
create or replace function public.registrar_pagamento_aprovado(
  p_referencia text, p_mp_pagamento text, p_metodo text, p_valor numeric, p_parcelas int
) returns text language plpgsql security definer set search_path = public as $$
declare
  tipo text := split_part(p_referencia, ':', 1);
  ref_id uuid;
  a public.assinaturas;
  c record;
  inicio_novo timestamptz;
  nomes jsonb := '{"basico":"Básico","premium":"Premium","pro":"Pro"}';
begin
  begin
    ref_id := split_part(p_referencia, ':', 2)::uuid;
  exception when others then
    return 'referencia_invalida';
  end;
  if exists (select 1 from public.pagamentos where mp_pagamento = p_mp_pagamento) then
    return 'ja_registrado';
  end if;

  if tipo = 'assinatura' then
    select * into a from public.assinaturas where id = ref_id for update;
    if not found then return 'assinatura_inexistente'; end if;
    if a.status = 'ativa' then return 'ja_ativa'; end if;
    if p_valor + 0.01 < a.valor then return 'valor_divergente'; end if;
    -- Recompra do mesmo plano soma ao período que ainda resta
    select greatest(now(), coalesce(max(x.fim), now())) into inicio_novo
      from public.assinaturas x
      where x.usuario_id = a.usuario_id and x.status = 'ativa' and x.plano = a.plano and x.fim > now();
    update public.assinaturas set
      status = 'ativa', inicio = inicio_novo,
      fim = inicio_novo + case a.ciclo when 'anual' then interval '12 months' else interval '1 month' end,
      mp_pagamento = p_mp_pagamento, metodo = coalesce(nullif(p_metodo, ''), metodo),
      parcelas = greatest(1, least(12, coalesce(p_parcelas, 1)))
    where id = a.id;
    insert into public.pagamentos (usuario_id, referencia, descricao, metodo, valor, parcelas, mp_pagamento)
    values (a.usuario_id, p_referencia,
            'Plano ' || coalesce(nomes ->> a.plano, a.plano) || ' · ' || case a.ciclo when 'anual' then '12 meses' else '1 mês' end,
            p_metodo, p_valor, coalesce(p_parcelas, 1), p_mp_pagamento);
    return 'assinatura_ativada';

  elsif tipo = 'consultoria' then
    select * into c from public.consultorias where id = ref_id for update;
    if not found then return 'consultoria_inexistente'; end if;
    if c.status not in ('aguardando_pagamento', 'cancelada') then return 'consultoria_ja_paga'; end if;
    if p_valor + 0.01 < c.valor then return 'valor_divergente'; end if;
    update public.consultorias set status = 'recebida', pago_em = now() where id = c.id;
    insert into public.pagamentos (usuario_id, referencia, descricao, metodo, valor, parcelas, mp_pagamento)
    values (c.usuario_id, p_referencia, 'Consultoria · ' || c.assunto, p_metodo, p_valor, coalesce(p_parcelas, 1), p_mp_pagamento);
    return 'consultoria_paga';
  end if;
  return 'tipo_desconhecido';
end $$;

create or replace function public.registrar_pagamento_recusado(p_referencia text)
returns text language plpgsql security definer set search_path = public as $$
declare
  tipo text := split_part(p_referencia, ':', 1);
  ref_id uuid;
begin
  begin
    ref_id := split_part(p_referencia, ':', 2)::uuid;
  exception when others then
    return 'referencia_invalida';
  end;
  if tipo = 'assinatura' then
    update public.assinaturas set status = 'recusada' where id = ref_id and status = 'pendente';
  elsif tipo = 'consultoria' then
    update public.consultorias set status = 'cancelada' where id = ref_id and status = 'aguardando_pagamento';
  end if;
  return 'ok';
end $$;

-- ---------------------------------------------------------------------
-- Fórum
-- ---------------------------------------------------------------------
create table public.forum_topicos (
  id        bigint generated always as identity primary key,
  nome      text not null unique,
  descricao text not null default '',
  ordem     int not null default 0,
  ativo     boolean not null default true
);

create table public.forum_perguntas (
  id            bigint generated always as identity primary key,
  topico_id     bigint not null references public.forum_topicos on delete restrict,
  autor_id      uuid not null default auth.uid() references auth.users on delete cascade,
  autor_nome    text not null default '',
  autor_papel   text not null default '',
  autor_setor   text not null default 'Setor Público',
  titulo        text not null check (char_length(titulo) between 8 and 300),
  contexto      text not null default '' check (char_length(contexto) <= 8000),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index forum_perguntas_topico on public.forum_perguntas (topico_id, criado_em desc);
create trigger forum_perguntas_atualizado before update on public.forum_perguntas
  for each row execute function public.tocar_atualizado_em();

create table public.forum_respostas (
  id          bigint generated always as identity primary key,
  pergunta_id bigint not null references public.forum_perguntas on delete cascade,
  autor_id    uuid not null default auth.uid() references auth.users on delete cascade,
  autor_nome  text not null default '',
  autor_papel text not null default '',
  texto       text not null check (char_length(texto) between 2 and 8000),
  citacao     text not null default '' check (char_length(citacao) <= 1000),
  melhor      boolean not null default false,
  oficial     boolean not null default false,
  criado_em   timestamptz not null default now()
);
create index forum_respostas_pergunta on public.forum_respostas (pergunta_id, criado_em);

create table public.forum_seguindo (
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  topico_id  bigint not null references public.forum_topicos on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, topico_id)
);

-- Autoria preenchida pelo banco (ninguém publica em nome de outra pessoa)
create or replace function public.forum_carimbar_autor()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.perfis;
begin
  select * into p from public.perfis where id = auth.uid();
  if not found then raise exception 'Perfil não encontrado.'; end if;
  new.autor_id := p.id;
  new.autor_nome := coalesce(nullif(p.nome, ''), 'Participante');
  new.autor_papel := concat_ws(' · ', nullif(p.cargo, ''), nullif(p.orgao, ''));
  if tg_table_name = 'forum_perguntas' then
    new.autor_setor := p.setor;
  else
    new.melhor := false;
    new.oficial := p.admin;
  end if;
  return new;
end $$;
create trigger forum_perguntas_autor before insert on public.forum_perguntas
  for each row execute function public.forum_carimbar_autor();
create trigger forum_respostas_autor before insert on public.forum_respostas
  for each row execute function public.forum_carimbar_autor();

-- Contagem por tópico (visível a qualquer pessoa logada, mesmo sem plano)
create or replace function public.forum_resumo()
returns table (id bigint, nome text, descricao text, ordem int, perguntas bigint, ultima timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.nome, t.descricao, t.ordem,
         count(q.id) as perguntas,
         greatest(max(q.criado_em), (select max(r.criado_em) from public.forum_respostas r
                                      join public.forum_perguntas q2 on q2.id = r.pergunta_id
                                      where q2.topico_id = t.id)) as ultima
  from public.forum_topicos t
  left join public.forum_perguntas q on q.topico_id = t.id
  where t.ativo
  group by t.id
  order by t.ordem, t.nome
$$;

-- Melhor resposta: quem perguntou ou o administrador
create or replace function public.forum_marcar_melhor(p_resposta bigint)
returns void language plpgsql security definer set search_path = public as $$
declare q bigint; dono uuid;
begin
  select r.pergunta_id, p.autor_id into q, dono
    from public.forum_respostas r join public.forum_perguntas p on p.id = r.pergunta_id
    where r.id = p_resposta;
  if q is null then raise exception 'Resposta não encontrada.'; end if;
  if dono <> auth.uid() and not public.is_admin() then
    raise exception 'Só quem fez a pergunta pode escolher a melhor resposta.';
  end if;
  update public.forum_respostas set melhor = (id = p_resposta) where pergunta_id = q;
end $$;

create or replace function public.forum_marcar_oficial(p_resposta bigint, p_oficial boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador.'; end if;
  update public.forum_respostas set oficial = p_oficial where id = p_resposta;
end $$;

-- ---------------------------------------------------------------------
-- Cursos
-- ---------------------------------------------------------------------
create table public.cursos (
  id          bigint generated always as identity primary key,
  titulo      text not null,
  ementa      text not null default '',
  instrutor   text not null default 'Renato Garcia',
  carga       text not null default '',
  nivel       text not null default 'Intermediário',
  nota        text not null default '',
  avaliacoes  int not null default 0,
  valor       numeric(10, 2) not null default 0,
  link        text not null default '',
  ordem       int not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table public.curso_acessos (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  curso_id   bigint not null references public.cursos on delete cascade,
  plano      text,
  criado_em  timestamptz not null default now()
);

create or replace function public.carimbar_acesso_curso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.usuario_id := auth.uid();
  new.plano := public.plano_vigente(auth.uid());
  return new;
end $$;
create trigger curso_acessos_carimbo before insert on public.curso_acessos
  for each row execute function public.carimbar_acesso_curso();

-- ---------------------------------------------------------------------
-- Consultoria
-- ---------------------------------------------------------------------
create table public.consultorias (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users on delete cascade,
  modalidade      text not null check (modalidade in ('escrita', 'video', 'reuniao')),
  assunto         text not null check (char_length(assunto) between 4 and 200),
  descricao       text not null default '' check (char_length(descricao) <= 10000),
  plano           text,
  valor           numeric(10, 2) not null default 0,
  status          text not null default 'aguardando_pagamento'
                  check (status in ('aguardando_pagamento', 'recebida', 'em_andamento', 'entregue', 'cancelada')),
  resposta        text not null default '',
  mp_preferencia  text,
  pago_em         timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index consultorias_usuario on public.consultorias (usuario_id, criado_em desc);
create trigger consultorias_atualizado before update on public.consultorias
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Contato, lista de espera do agente, pedidos LGPD
-- ---------------------------------------------------------------------
create table public.contatos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid default auth.uid() references auth.users on delete set null,
  nome       text not null check (char_length(nome) between 2 and 160),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  assunto    text not null default 'Suporte à conta' check (char_length(assunto) <= 80),
  mensagem   text not null check (char_length(mensagem) between 5 and 8000),
  detalhes   jsonb not null default '{}'::jsonb,
  lido       boolean not null default false,
  criado_em  timestamptz not null default now()
);

create table public.lista_espera (
  email     text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  criado_em timestamptz not null default now()
);

create table public.solicitacoes_lgpd (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  tipo       text not null check (tipo in ('exclusao', 'portabilidade', 'acesso')),
  status     text not null default 'aberta' check (status in ('aberta', 'concluida', 'cancelada')),
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Anotações, marcadores, dossiês e preferências da Biblioteca Jurídica
-- ---------------------------------------------------------------------
create table public.biblioteca_pessoal (
  usuario_id    uuid not null default auth.uid() references auth.users on delete cascade,
  chave         text not null check (char_length(chave) between 1 and 200),
  dados         jsonb not null default '{}'::jsonb check (octet_length(dados::text) < 300000),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, chave)
);
create trigger biblioteca_pessoal_atualizado before update on public.biblioteca_pessoal
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Registro de ações do administrador
-- ---------------------------------------------------------------------
create table public.registro_admin (
  id        bigint generated always as identity primary key,
  admin_id  uuid not null default auth.uid() references auth.users on delete cascade,
  acao      text not null,
  detalhes  jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

-- =====================================================================
-- Permissões (o padrão do Supabase libera tudo; aqui fica explícito)
-- =====================================================================
revoke all on public.perfis, public.assinaturas, public.pagamentos, public.forum_topicos,
  public.forum_perguntas, public.forum_respostas, public.forum_seguindo, public.cursos,
  public.curso_acessos, public.consultorias, public.contatos, public.lista_espera,
  public.solicitacoes_lgpd, public.biblioteca_pessoal, public.registro_admin
  from anon, authenticated;

alter table public.perfis             enable row level security;
alter table public.assinaturas        enable row level security;
alter table public.pagamentos         enable row level security;
alter table public.forum_topicos      enable row level security;
alter table public.forum_perguntas    enable row level security;
alter table public.forum_respostas    enable row level security;
alter table public.forum_seguindo     enable row level security;
alter table public.cursos             enable row level security;
alter table public.curso_acessos      enable row level security;
alter table public.consultorias       enable row level security;
alter table public.contatos           enable row level security;
alter table public.lista_espera       enable row level security;
alter table public.solicitacoes_lgpd  enable row level security;
alter table public.biblioteca_pessoal enable row level security;
alter table public.registro_admin     enable row level security;

-- perfis
grant select on public.perfis to authenticated;
grant update (nome, celular, documento, orgao, cargo, setor, notificacoes) on public.perfis to authenticated;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy perfis_editar on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- assinaturas: o assinante lê as suas; o admin lê todas e concede manualmente (empenho, cortesia)
grant select, insert, update on public.assinaturas to authenticated;
create policy assinaturas_ler on public.assinaturas for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());
create policy assinaturas_admin_inserir on public.assinaturas for insert to authenticated
  with check (public.is_admin());
create policy assinaturas_admin_editar on public.assinaturas for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- pagamentos
grant select on public.pagamentos to authenticated;
create policy pagamentos_ler on public.pagamentos for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

-- fórum: tópicos
grant select, insert, update, delete on public.forum_topicos to authenticated;
create policy topicos_ler on public.forum_topicos for select to authenticated using (true);
create policy topicos_admin on public.forum_topicos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- fórum: perguntas
grant select, delete on public.forum_perguntas to authenticated;
grant insert (topico_id, titulo, contexto) on public.forum_perguntas to authenticated;
grant update (titulo, contexto) on public.forum_perguntas to authenticated;
create policy perguntas_ler on public.forum_perguntas for select to authenticated
  using (public.pode_ler_forum());
create policy perguntas_criar on public.forum_perguntas for insert to authenticated
  with check (public.pode_participar());
create policy perguntas_editar on public.forum_perguntas for update to authenticated
  using (autor_id = auth.uid() or public.is_admin()) with check (autor_id = auth.uid() or public.is_admin());
create policy perguntas_apagar on public.forum_perguntas for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin());

-- fórum: respostas
grant select, delete on public.forum_respostas to authenticated;
grant insert (pergunta_id, texto, citacao) on public.forum_respostas to authenticated;
grant update (texto, citacao) on public.forum_respostas to authenticated;
create policy respostas_ler on public.forum_respostas for select to authenticated
  using (public.pode_ler_forum());
create policy respostas_criar on public.forum_respostas for insert to authenticated
  with check (public.pode_participar());
create policy respostas_editar on public.forum_respostas for update to authenticated
  using (autor_id = auth.uid() or public.is_admin()) with check (autor_id = auth.uid() or public.is_admin());
create policy respostas_apagar on public.forum_respostas for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin());

-- fórum: seguir tópico
grant select, insert, delete on public.forum_seguindo to authenticated;
create policy seguindo_proprio on public.forum_seguindo for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- cursos (vitrine pública; edição só do admin)
grant select on public.cursos to anon;
grant select, insert, update, delete on public.cursos to authenticated;
create policy cursos_ler_publico on public.cursos for select to anon using (ativo);
create policy cursos_ler on public.cursos for select to authenticated using (ativo or public.is_admin());
create policy cursos_admin on public.cursos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.curso_acessos to authenticated;
grant insert (curso_id) on public.curso_acessos to authenticated;
create policy acessos_ler on public.curso_acessos for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());
create policy acessos_criar on public.curso_acessos for insert to authenticated
  with check (usuario_id = auth.uid());

-- consultorias (criadas pela função de checkout; admin atualiza andamento e entrega)
grant select on public.consultorias to authenticated;
grant update (status, resposta) on public.consultorias to authenticated;
create policy consultorias_ler on public.consultorias for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());
create policy consultorias_admin on public.consultorias for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- contato (qualquer visitante envia; só o admin lê)
grant insert (nome, email, assunto, mensagem, detalhes) on public.contatos to anon, authenticated;
grant select, update (lido) on public.contatos to authenticated;
create policy contatos_enviar on public.contatos for insert to anon, authenticated
  with check (lido = false);
create policy contatos_admin_ler on public.contatos for select to authenticated using (public.is_admin());
create policy contatos_admin_editar on public.contatos for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- lista de espera do agente de IA
grant insert on public.lista_espera to anon, authenticated;
grant select on public.lista_espera to authenticated;
create policy espera_entrar on public.lista_espera for insert to anon, authenticated with check (true);
create policy espera_admin on public.lista_espera for select to authenticated using (public.is_admin());

-- LGPD
grant select, insert (tipo) on public.solicitacoes_lgpd to authenticated;
grant update (status) on public.solicitacoes_lgpd to authenticated;
create policy lgpd_criar on public.solicitacoes_lgpd for insert to authenticated
  with check (usuario_id = auth.uid());
create policy lgpd_ler on public.solicitacoes_lgpd for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());
create policy lgpd_admin on public.solicitacoes_lgpd for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Biblioteca pessoal
grant select, insert, update, delete on public.biblioteca_pessoal to authenticated;
create policy biblioteca_propria on public.biblioteca_pessoal for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- registro do admin
grant select, insert on public.registro_admin to authenticated;
create policy registro_admin_todo on public.registro_admin for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and admin_id = auth.uid());

-- funções
revoke execute on function public.registrar_pagamento_aprovado(text, text, text, numeric, int) from public, anon, authenticated;
revoke execute on function public.registrar_pagamento_recusado(text) from public, anon, authenticated;
grant execute on function public.registrar_pagamento_aprovado(text, text, text, numeric, int) to service_role;
grant execute on function public.registrar_pagamento_recusado(text) to service_role;

revoke execute on function public.iniciar_teste(), public.forum_resumo(), public.forum_marcar_melhor(bigint),
  public.forum_marcar_oficial(bigint, boolean), public.meu_plano(), public.plano_vigente(uuid)
  from public, anon;
grant execute on function public.iniciar_teste(), public.forum_resumo(), public.forum_marcar_melhor(bigint),
  public.forum_marcar_oficial(bigint, boolean), public.meu_plano(), public.plano_vigente(uuid)
  to authenticated, service_role;

-- =====================================================================
-- Conteúdo inicial
-- =====================================================================
insert into public.forum_topicos (nome, descricao, ordem) values
  ('Reajuste de Preços', 'Periodicidade, índices, data-base e diferença entre reajuste e repactuação.', 1),
  ('Repactuação', 'Demonstração analítica de custos, convenção coletiva e planilhas.', 2),
  ('Adesão a Ata de Registro de Preços', 'Carona, limites quantitativos, vantajosidade e anuência do gerenciador.', 3),
  ('Aditivo e Prorrogação', 'Limites de alteração, prorrogação intempestiva e motivação.', 4),
  ('Sobrepreço e Pesquisa de Preços', 'Fontes de pesquisa, painéis oficiais e formação da estimativa.', 5),
  ('Habilitação', 'Qualificação técnica e econômica, saneamento de falhas formais.', 6),
  ('Dispensa e Inexigibilidade', 'Hipóteses legais, singularidade do objeto e notória especialização.', 7);

insert into public.cursos (titulo, ementa, instrutor, carga, nivel, nota, avaliacoes, valor, ordem) values
  ('Nova Lei de Licitações na prática: do planejamento à assinatura', 'Estudo técnico preliminar, termo de referência, modalidades e julgamento — com modelos aplicáveis.', 'Renato Garcia', '24 h', 'Intermediário', '', 0, 297, 1),
  ('Reajuste, repactuação e reequilíbrio sem erro', 'Como enquadrar cada pedido, montar a planilha e fundamentar a decisão diante do controle.', 'Renato Garcia', '12 h', 'Avançado', '', 0, 189, 2),
  ('Pregoeiro iniciante: condução de sessão pública', 'Sistema, atas, diligências, recursos e as armadilhas mais comuns na condução do pregão eletrônico.', 'Renato Garcia', '16 h', 'Iniciante', '', 0, 149, 3),
  ('Fornecedor competitivo: como participar e ganhar', 'Leitura de edital, habilitação, formação de preço e impugnações bem fundamentadas.', 'Renato Garcia', '10 h', 'Iniciante', '', 0, 129, 4),
  ('Fiscalização de contratos de serviços contínuos', 'Rotinas do fiscal, sanções, glosas e a instrução do processo de pagamento.', 'Renato Garcia', '14 h', 'Intermediário', '', 0, 197, 5),
  ('Registro de preços e adesão a ata', 'Gerenciamento, participação, carona e a defesa da vantajosidade perante o controle interno.', 'Renato Garcia', '8 h', 'Avançado', '', 0, 159, 6);
