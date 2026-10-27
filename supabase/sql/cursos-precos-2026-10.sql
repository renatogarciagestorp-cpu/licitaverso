-- 27/10/2026: novos preços dos cursos (referência de mercado, um pouco abaixo).
-- Só muda cursos que ainda estão com o preço original; preços editados no Painel ficam como estão.
update public.cursos set valor = 597 where titulo like 'Nova Lei de Licitações na prática%' and valor = 297;
update public.cursos set valor = 497 where (titulo like 'Gestão Contratual Sem Erros%' or titulo = 'Reajuste, repactuação e reequilíbrio sem erro') and valor = 189;
update public.cursos set valor = 397 where titulo like 'Pregoeiro iniciante%' and valor = 149;
update public.cursos set valor = 297 where titulo like 'Fornecedor competitivo%' and valor = 129;
update public.cursos set valor = 447 where titulo like 'Fiscalização de contratos de serviços contínuos%' and valor = 197;
update public.cursos set valor = 347 where titulo like 'Registro de preços e adesão a ata%' and valor = 159;
