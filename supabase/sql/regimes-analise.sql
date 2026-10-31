-- Análise por regime jurídico (Leis 14.133, 13.303 e 13.019), objeto especial e anexos (planilhas Excel e convenção coletiva).
alter table public.analises add column if not exists regime text not null default 'lei-14133';
alter table public.analises add column if not exists objeto jsonb not null default '[]'::jsonb;   -- ["obras", "mao-de-obra"]
alter table public.analises add column if not exists anexos jsonb not null default '[]'::jsonb;   -- [{tipo, arquivo, nome_arquivo}]
alter table public.analises drop constraint if exists analises_regime_check;
alter table public.analises add constraint analises_regime_check check (regime in ('lei-14133', 'lei-13303', 'lei-13019'));
alter table public.analises drop constraint if exists analises_documento_check;
alter table public.analises add constraint analises_documento_check
  check (documento in ('edital', 'etp', 'tr', 'riscos', 'planilha', 'plano_trabalho'));

-- Até 3 documentos por análise; pagamento (ou cota do Pro) antes do envio dos documentos.
alter table public.analises add column if not exists documentos jsonb not null default '[]'::jsonb; -- [{tipo, arquivo, nome_arquivo, paginas}]
alter table public.analises add column if not exists enviado_em timestamptz;
alter table public.analises drop constraint if exists analises_documento_check;
alter table public.analises add constraint analises_documento_check
  check (documento in ('edital', 'etp', 'tr', 'riscos', 'planilha', 'plano_trabalho', 'multiplos'));
alter table public.analises drop constraint if exists analises_status_check;
alter table public.analises add constraint analises_status_check
  check (status in ('aguardando_pagamento', 'aguardando_documentos', 'na_fila', 'processando', 'concluida', 'erro', 'cancelada'));
alter table public.analises drop constraint if exists analises_origem_check;
alter table public.analises add constraint analises_origem_check check (origem in ('pdf', 'pncp', 'arquivos'));
