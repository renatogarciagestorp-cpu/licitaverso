-- Gestão Contratual (Painel da Organização, etapa B): gestor e fiscal (Lei 14.133/2021, arts. 8º e 117) ou preposto (art. 118),
-- setor requisitante, serviço essencial e penalidades/ocorrências na linha do tempo (art. 156).
alter table public.contratos add column if not exists gestor text;
alter table public.contratos add column if not exists fiscal text;
alter table public.contratos add column if not exists setor_req text;
alter table public.contratos add column if not exists essencial boolean not null default false;
alter table public.contratos drop constraint if exists contratos_gestao_tam_ck;
alter table public.contratos add constraint contratos_gestao_tam_ck check (char_length(coalesce(gestor, '')) <= 160 and char_length(coalesce(fiscal, '')) <= 160 and char_length(coalesce(setor_req, '')) <= 160);

alter table public.contrato_eventos add column if not exists valor_penalidade numeric(14, 2);
alter table public.contrato_eventos drop constraint if exists contrato_eventos_tipo_check;
alter table public.contrato_eventos add constraint contrato_eventos_tipo_check check (tipo in ('reajuste', 'repactuacao', 'reequilibrio_trib', 'reequilibrio_fato', 'aditivo_valor', 'prorrogacao', 'outro',
  'ocorrencia', 'advertencia', 'multa', 'impedimento', 'inidoneidade'));
