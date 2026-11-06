-- Gestão Contratual: prazos de preclusão e processuais (Lei 14.133/2021, arts. 123, 131, 157, 158, 166 e 167),
-- pedidos ao órgão, decisões, notificações, defesas e atestados de capacidade técnica na linha do tempo.
alter table public.contrato_eventos add column if not exists prazo date;
alter table public.contrato_eventos drop constraint if exists contrato_eventos_tipo_check;
alter table public.contrato_eventos add constraint contrato_eventos_tipo_check check (tipo in ('reajuste', 'repactuacao', 'reequilibrio_trib', 'reequilibrio_fato', 'aditivo_valor', 'prorrogacao', 'outro',
  'ocorrencia', 'advertencia', 'multa', 'impedimento', 'inidoneidade',
  'pedido_reajuste', 'pedido_repactuacao', 'pedido_reequilibrio', 'decisao', 'notificacao', 'defesa', 'atestado'));
