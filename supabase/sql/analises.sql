-- Análise de documentos pelo Agente Licitacon (parecer técnico opinativo).
-- Pro: 2 análises por semana incluídas (semana de segunda a domingo, horário de Brasília; não acumula).
-- Demais: análise avulsa paga pelo Mercado Pago (referência "analise:<id>").
-- O processamento roda no GitHub Actions (fila), que lê esta tabela com a chave de serviço.

create table if not exists public.analises (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users on delete cascade,
  criado_em       timestamptz not null default now(),
  documento       text not null check (documento in ('edital', 'etp', 'tr', 'riscos', 'planilha')),
  origem          text not null check (origem in ('pdf', 'pncp')),
  arquivo         text,               -- caminho no bucket "analises" (origem pdf)
  nome_arquivo    text not null default '',
  pncp_link       text,
  cobranca        text not null check (cobranca in ('franquia_pro', 'avulsa')),
  plano           text,
  valor           numeric(10, 2) not null default 0,
  status          text not null default 'aguardando_pagamento'
                  check (status in ('aguardando_pagamento', 'na_fila', 'processando', 'concluida', 'erro', 'cancelada')),
  termo_aceito_em timestamptz not null,
  termo_versao    text not null default '',
  mp_preferencia  text,
  pago_em         timestamptz,
  iniciado_em     timestamptz,
  concluido_em    timestamptz,
  tentativas      int not null default 0,
  paginas         int,
  parecer_pdf     text,
  parecer_docx    text,
  resumo          jsonb not null default '{}'::jsonb,   -- {situacao, alta, media, baixa, objeto, orgao}
  custo_usd       numeric(10, 4),
  erro_msg        text,
  avisado_status  text
);
create index if not exists analises_usuario on public.analises (usuario_id, criado_em desc);
create index if not exists analises_fila on public.analises (status, criado_em) where status in ('na_fila', 'processando');

alter table public.analises enable row level security;
drop policy if exists analises_ler on public.analises;
create policy analises_ler on public.analises for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());
-- Inclusão e alterações só pelas funções do servidor (chave de serviço).

-- Arquivos: bucket privado. Envio do PDF na própria pasta; o parecer é gravado pelo servidor em <usuario>/pareceres/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('analises', 'analises', false, 26214400, array['application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12', 'application/vnd.oasis.opendocument.spreadsheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists analises_arquivos_enviar on storage.objects;
create policy analises_arquivos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'analises' and (storage.foldername(name))[1] = auth.uid()::text
              and coalesce((storage.foldername(name))[2], '') <> 'pareceres');
drop policy if exists analises_arquivos_ler on storage.objects;
create policy analises_arquivos_ler on storage.objects for select to authenticated
  using (bucket_id = 'analises' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Início da semana corrente (segunda-feira 00:00, horário de Brasília)
create or replace function public.inicio_semana_br(agora timestamptz default now())
returns timestamptz language sql immutable as $$
  select (date_trunc('week', agora at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
$$;

-- Cota semanal do Pro: análises que contam (não contam erro nem cancelada)
create or replace function public.analises_usadas_semana(uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.analises
  where usuario_id = uid and cobranca = 'franquia_pro'
    and status not in ('erro', 'cancelada') and criado_em >= public.inicio_semana_br()
$$;

create or replace function public.minha_cota_analises()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plano', public.plano_vigente(auth.uid()),
    'limite', case when public.plano_vigente(auth.uid()) = 'pro' then 2 else 0 end,
    'usadas', public.analises_usadas_semana(auth.uid()),
    'renova_em', public.inicio_semana_br() + interval '7 days')
$$;
revoke execute on function public.analises_usadas_semana(uuid) from public, anon, authenticated;
grant execute on function public.analises_usadas_semana(uuid) to service_role;
grant execute on function public.minha_cota_analises() to authenticated;

-- Pagamentos: acrescenta a análise avulsa às funções chamadas pelo webhook
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
  docs jsonb := '{"edital":"Edital","etp":"ETP","tr":"Termo de Referência","riscos":"Matriz de Riscos","planilha":"Planilha de custos","plano_trabalho":"Plano de trabalho"}';
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

  elsif tipo = 'analise' then
    select * into c from public.analises where id = ref_id for update;
    if not found then return 'analise_inexistente'; end if;
    if c.status not in ('aguardando_pagamento', 'cancelada') then return 'analise_ja_paga'; end if;
    if p_valor + 0.01 < c.valor then return 'valor_divergente'; end if;
    update public.analises set status = 'na_fila', pago_em = now() where id = c.id;
    insert into public.pagamentos (usuario_id, referencia, descricao, metodo, valor, parcelas, mp_pagamento)
    values (c.usuario_id, p_referencia, 'Análise de documento · ' || coalesce(docs ->> c.documento, c.documento),
            p_metodo, p_valor, coalesce(p_parcelas, 1), p_mp_pagamento);
    return 'analise_paga';
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
  elsif tipo = 'analise' then
    update public.analises set status = 'cancelada' where id = ref_id and status = 'aguardando_pagamento';
  end if;
  return 'ok';
end $$;
revoke execute on function public.registrar_pagamento_aprovado(text, text, text, numeric, int) from public, anon, authenticated;
revoke execute on function public.registrar_pagamento_recusado(text) from public, anon, authenticated;
grant execute on function public.registrar_pagamento_aprovado(text, text, text, numeric, int) to service_role;
grant execute on function public.registrar_pagamento_recusado(text) to service_role;

-- Fila (usada pelo GitHub Actions com a chave de gerenciamento): pega a próxima análise e marca como em processamento.
create or replace function public.analise_proxima()
returns setof public.analises language plpgsql security definer set search_path = public as $$
begin
  -- devolve à fila o que travou há mais de 40 minutos (até 3 tentativas)
  update public.analises set status = case when tentativas >= 3 then 'erro' else 'na_fila' end,
         erro_msg = case when tentativas >= 3 then 'Falha repetida no processamento.' else erro_msg end
   where status = 'processando' and iniciado_em < now() - interval '40 minutes';
  return query
  update public.analises set status = 'processando', iniciado_em = now(), tentativas = tentativas + 1
   where id = (select id from public.analises where status = 'na_fila' order by coalesce(pago_em, criado_em) limit 1 for update skip locked)
  returning *;
end $$;
revoke execute on function public.analise_proxima() from public, anon, authenticated;
grant execute on function public.analise_proxima() to service_role;

-- Painel: o administrador pode devolver uma análise com erro à fila
drop policy if exists analises_admin_alterar on public.analises;
create policy analises_admin_alterar on public.analises for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
