-- Gestão contratual: modalidade/forma de contratação e natureza do objeto (controle de fracionamento das dispensas por valor)
alter table public.contratos add column if not exists modalidade text;
alter table public.contratos add column if not exists natureza text;
