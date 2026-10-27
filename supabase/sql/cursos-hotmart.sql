-- 27/10/2026: curso de reequilíbrio/repactuação passa a ser vendido no Hotmart com o novo nome.
-- Só altera a linha que ainda tem o nome antigo (depois disso não faz nada; edições pelo painel ficam preservadas).
update public.cursos
   set titulo = 'Gestão Contratual Sem Erros: Aprenda a Realizar Reequilíbrios e Repactuações',
       link   = 'https://hotmart.com/PT_BR/club/renato-lopes-garcia-junior/products/8817419'
 where titulo = 'Reajuste, repactuação e reequilíbrio sem erro';
