-- Gestão contratual: data da assinatura, reforma (limite de 50% para acréscimos, art. 125) e aviso de início da prorrogação.
alter table public.contratos add column if not exists assinatura date;
alter table public.contratos add column if not exists reforma boolean not null default false;
alter table public.contrato_alertas drop constraint if exists contrato_alertas_tipo_check;
alter table public.contrato_alertas add constraint contrato_alertas_tipo_check check (tipo in ('anualidade', 'convencao', 'fim120', 'fim90', 'fim30'));
