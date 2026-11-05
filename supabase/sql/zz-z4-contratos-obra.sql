-- Gestão contratual: obras e serviços de engenharia, em que o reajuste incide só sobre o saldo a executar.
alter table public.contratos add column if not exists obra boolean not null default false;
alter table public.contrato_eventos add column if not exists saldo numeric(14, 2) check (saldo is null or saldo >= 0);
