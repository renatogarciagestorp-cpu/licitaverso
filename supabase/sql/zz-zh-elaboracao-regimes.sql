-- O Elaborador passa a criar Edital (com as minutas), Processo de contratação direta e Mapa de riscos,
-- nas Leis 14.133/2021, 13.303/2016 (com o RILC da estatal) e 13.019/2014; o Parecerista analisa a contratação direta.
-- (nome "zz-zh..." para ser aplicado depois de zz-r-geracao.sql, que define a mesma restrição)
alter table public.analises drop constraint if exists analises_documento_check;
alter table public.analises add constraint analises_documento_check
  check (documento in ('edital', 'etp', 'tr', 'riscos', 'planilha', 'plano_trabalho', 'multiplos', 'projeto_basico', 'direta'));
