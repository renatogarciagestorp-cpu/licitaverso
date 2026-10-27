-- 27/10/2026: curso de reequilíbrio/repactuação vendido no Hotmart (link da página de pagamento).
-- Só altera linhas com o nome ou o link antigos; edições posteriores pelo painel ficam preservadas.
update public.cursos
   set titulo = 'Gestão Contratual Sem Erros: Aprenda a Realizar Reequilíbrios e Repactuações',
       link   = 'https://pay.hotmart.com/Y108208489V'
 where titulo = 'Reajuste, repactuação e reequilíbrio sem erro'
    or link   = 'https://hotmart.com/PT_BR/club/renato-lopes-garcia-junior/products/8817419';
