-- Elaboração de documentos pelo Agente IA (ETP, Termo de Referência e Projeto Básico, Lei 14.133/2021).
-- Usa a mesma tabela e a mesma cobrança das análises: tipo = 'geracao'.
-- Franquia compartilhada: no Pro, 2 por semana somando análises e elaborações; no Pro para equipes, 6 por acesso por mês, somados.
-- (as funções analises_usadas_semana e analises_usadas_org já contam todas as linhas da franquia, de qualquer tipo)
-- Avulso: R$ 290 por documento, com os mesmos descontos da análise (Básico 10%, Premium 15%, Pro acima da franquia 30%).
-- (nome "zz-r..." para ser aplicado depois de zz-promocoes.sql, que também redefine analise_proxima)

alter table public.analises add column if not exists tipo text not null default 'analise';
alter table public.analises drop constraint if exists analises_tipo_check;
alter table public.analises add constraint analises_tipo_check check (tipo in ('analise', 'geracao'));
alter table public.analises add column if not exists respostas jsonb not null default '{}'::jsonb; -- questionário da elaboração

alter table public.analises drop constraint if exists analises_documento_check;
alter table public.analises add constraint analises_documento_check
  check (documento in ('edital', 'etp', 'tr', 'riscos', 'planilha', 'plano_trabalho', 'multiplos', 'projeto_basico'));
alter table public.analises drop constraint if exists analises_origem_check;
alter table public.analises add constraint analises_origem_check check (origem in ('pdf', 'pncp', 'arquivos', 'questionario'));

-- Fila do agente: por enquanto só pega análises; as elaborações terão o próprio processamento (etapa 3)
create or replace function public.analise_proxima()
returns setof public.analises language plpgsql security definer set search_path = public as $$
begin
  update public.analises set status = case when tentativas >= 3 then 'erro' else 'na_fila' end,
         erro_msg = case when tentativas >= 3 then 'Falha repetida no processamento.' else erro_msg end
   where status = 'processando' and iniciado_em < now() - interval '40 minutes' and tipo = 'analise';
  return query
  update public.analises set status = 'processando', iniciado_em = now(), tentativas = tentativas + 1
   where id = (select id from public.analises where status = 'na_fila' and tipo = 'analise' and (liberar_em is null or liberar_em <= now())
               order by coalesce(liberar_em, pago_em, criado_em) limit 1 for update skip locked)
  returning *;
end $$;
revoke execute on function public.analise_proxima() from public, anon, authenticated;
grant execute on function public.analise_proxima() to service_role;

-- Fila das elaborações (processadas pelo mesmo workflow do agente, depois das análises)
create or replace function public.geracao_proxima()
returns setof public.analises language plpgsql security definer set search_path = public as $$
begin
  update public.analises set status = case when tentativas >= 3 then 'erro' else 'na_fila' end,
         erro_msg = case when tentativas >= 3 then 'Falha repetida no processamento.' else erro_msg end
   where status = 'processando' and iniciado_em < now() - interval '40 minutes' and tipo = 'geracao';
  return query
  update public.analises set status = 'processando', iniciado_em = now(), tentativas = tentativas + 1
   where id = (select id from public.analises where status = 'na_fila' and tipo = 'geracao'
               order by coalesce(pago_em, criado_em) limit 1 for update skip locked)
  returning *;
end $$;
revoke execute on function public.geracao_proxima() from public, anon, authenticated;
grant execute on function public.geracao_proxima() to service_role;


-- Andamento da elaboração, para o site mostrar em que etapa o documento está (pesquisa, redação, conferência, Word)
alter table public.analises add column if not exists progresso text;

-- Conferência prévia das informações (antes de criar o documento): registro para limitar o uso (custo de API)
create table if not exists public.elab_triagens (id bigserial primary key, usuario_id uuid not null, criado_em timestamptz not null default now());
alter table public.elab_triagens enable row level security;
create index if not exists elab_triagens_usuario on public.elab_triagens (usuario_id, criado_em desc);

-- Pausa para pedir informações ao assinante (antes de redigir ou para preencher lacunas depois da redação, sem novo custo de API)
alter table public.analises drop constraint if exists analises_status_check;
alter table public.analises add constraint analises_status_check
  check (status in ('aguardando_pagamento', 'aguardando_documentos', 'na_fila', 'processando', 'aguardando_informacoes', 'concluida', 'erro', 'cancelada'));
alter table public.analises add column if not exists perguntas jsonb;   -- [{id, tema, pergunta, por_que, opcoes, lacuna}]
alter table public.analises add column if not exists fase text;         -- null (normal) | 'completar' (só preencher lacunas no texto já redigido)
