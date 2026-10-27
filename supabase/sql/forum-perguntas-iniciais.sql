-- Fórum: perguntas frequentes iniciais, com resposta oficial do Licitacon.
-- Idempotente: cada pergunta só é criada se ainda não existir uma com o mesmo título.
-- Autor: o primeiro administrador cadastrado (sem administrador, nada é criado).
-- Para editar ou apagar: Painel → Fórum.

do $$
declare
  adm public.perfis;
  t_id bigint;
  q_id bigint;
  item record;
begin
  select * into adm from public.perfis where admin order by criado_em limit 1;
  if not found then
    raise notice 'Sem administrador cadastrado: perguntas iniciais não criadas.';
    return;
  end if;

  -- a autoria normalmente vem do login; aqui o banco roda sem login, então
  -- os carimbos automáticos ficam desligados só durante esta carga.
  alter table public.forum_perguntas disable trigger forum_perguntas_autor;
  alter table public.forum_respostas disable trigger forum_respostas_autor;

  for item in
    select * from (values
    ('Reajuste de Preços',
     'Quando o contrato pode ser reajustado pela primeira vez e de onde se conta o prazo?',
     'Contrato de fornecimento assinado meses depois da abertura da licitação. A contratada pede reajuste ao completar 12 meses da assinatura. Está certo?',
     'Não: o prazo de um ano não se conta da assinatura. Na Lei 14.133/2021, o edital deve trazer o índice de reajuste com data-base vinculada à data do orçamento estimado (art. 25, §7º), e o contrato deve prever o reajuste com interregno mínimo de um ano contado dessa data do orçamento (art. 92, §3º). A Lei 10.192/2001 proíbe reajuste com periodicidade inferior a um ano (arts. 2º e 3º). Na prática, se o orçamento estimado é de março de 2025, o primeiro reajuste pode ser aplicado a partir de março de 2026, mesmo que o contrato tenha sido assinado depois. Os reajustes seguintes contam um ano a partir do anterior. Confira sempre o que o seu edital e o seu contrato dizem sobre índice e data-base.',
     'Lei 14.133/2021, art. 25, §7º, e art. 92, §3º; Lei 10.192/2001, arts. 2º e 3º.'),
    ('Reajuste de Preços',
     'O reajuste previsto no contrato precisa de termo aditivo?',
     'Queremos saber se basta um apostilamento ou se é preciso formalizar aditivo com nova publicação.',
     'Em regra, não. O art. 136, I, da Lei 14.133/2021 permite registrar por simples apostila a variação do valor do contrato decorrente de reajuste ou repactuação previstos no próprio contrato. O apostilamento deve ser instruído com o cálculo (índice, período e valores) e a manifestação da área responsável. Se o reajuste vier junto com outra alteração — de quantitativos ou de prazo, por exemplo — essa outra alteração exige termo aditivo.',
     'Lei 14.133/2021, art. 136, I.'),
    ('Repactuação',
     'Qual a diferença entre repactuação e reajuste por índice?',
     'Contrato de limpeza com dedicação exclusiva de mão de obra. A empresa pediu repactuação depois da nova convenção coletiva. Por que não aplicar simplesmente um índice?',
     'São duas formas de manter o equilíbrio do contrato. O reajuste em sentido estrito aplica um índice previsto no contrato (art. 6º, LVIII). A repactuação serve aos serviços contínuos com regime de dedicação exclusiva de mão de obra ou predominância de mão de obra e exige demonstração analítica da variação dos custos, normalmente na planilha (art. 6º, LIX, e art. 135). O interregno de um ano é contado da data da apresentação da proposta, para os custos de mercado (insumos), ou da data da convenção, acordo ou dissídio coletivo a que a proposta esteja vinculada, para os custos de mão de obra (art. 135, I e II). Por isso, no seu caso o caminho é a repactuação: a empresa apresenta a planilha com as variações da nova convenção e a Administração confere item a item.',
     'Lei 14.133/2021, art. 6º, LVIII e LIX, e art. 135, I e II.'),
    ('Repactuação',
     'A Administração tem de aceitar tudo o que a convenção coletiva prevê na repactuação?',
     'A nova convenção criou um benefício e fixou percentuais de encargos. A empresa quer repassar tudo ao contrato.',
     'Não necessariamente. O art. 135, §1º, da Lei 14.133/2021 diz que a Administração não se vincula às disposições de acordos, convenções ou dissídios coletivos que tratem de matéria não trabalhista, de participação nos lucros ou resultados, ou que estabeleçam direitos não previstos em lei — como valores ou índices obrigatórios de encargos sociais ou previdenciários e preços de insumos. Ou seja: aumentos salariais e benefícios de natureza trabalhista da categoria entram; cláusulas fora desse campo devem ser analisadas e, se for o caso, recusadas de forma motivada. Peça à empresa a convenção registrada e a planilha mostrando de onde vem cada variação.',
     'Lei 14.133/2021, art. 135, §1º.'),
    ('Adesão a Ata de Registro de Preços',
     'Quais são os requisitos e limites para aderir à ata de outro órgão (carona)?',
     'Município quer aderir a uma ata de registro de preços de um órgão estadual.',
     'A adesão de órgão não participante exige, entre outros pontos (art. 86, §2º, da Lei 14.133/2021): justificativa da vantagem da adesão, inclusive em situações de provável desabastecimento ou descontinuidade de serviço público; demonstração de que os valores registrados estão compatíveis com os de mercado; e consulta e aceitação prévias do órgão gerenciador e do fornecedor. Quanto aos limites, cada adesão não pode passar de 50% dos quantitativos de cada item registrados na ata para o gerenciador e os participantes (§4º), e o total das adesões não pode passar do dobro desses quantitativos (§5º). Município pode aderir a ata estadual, distrital ou federal; a adesão a ata de outro município depende de o registro de preços ter sido feito por licitação (§3º, com a redação da Lei 14.770/2023). Órgãos federais não podem aderir a atas de estados, DF ou municípios (§8º).',
     'Lei 14.133/2021, art. 86, §§2º a 5º e 8º (redação da Lei 14.770/2023).'),
    ('Aditivo e Prorrogação',
     'Até quanto o valor de um contrato pode ser aumentado por aditivo?',
     'Contrato de serviços precisa de mais quantidade do que o previsto. Qual o teto?',
     'Nas alterações unilaterais, o contratado é obrigado a aceitar, nas mesmas condições, acréscimos ou supressões de até 25% do valor inicial atualizado do contrato; no caso de reforma de edifício ou de equipamento, o limite para acréscimos é de 50% (art. 125 da Lei 14.133/2021). O cálculo considera acréscimos e supressões separadamente, sem compensar um com o outro. Além do limite percentual, a alteração não pode transfigurar o objeto contratado (art. 126). A necessidade precisa estar justificada no processo, com a demonstração de que o acréscimo decorre de fato posterior ou de melhor adequação técnica.',
     'Lei 14.133/2021, arts. 124, 125 e 126.'),
    ('Aditivo e Prorrogação',
     'Por quanto tempo um contrato de serviço contínuo pode ser prorrogado?',
     'Contrato de vigilância com vigência de 12 meses. Até quando dá para prorrogar?',
     'Serviços e fornecimentos contínuos podem ter vigência de até 5 anos (art. 106 da Lei 14.133/2021) e podem ser prorrogados sucessivamente até o máximo de 10 anos, desde que isso esteja previsto no edital e a autoridade competente ateste que as condições e os preços continuam vantajosos para a Administração, permitida a negociação com o contratado (art. 107). Atenção ao prazo: a prorrogação precisa ser formalizada enquanto o contrato ainda está vigente. Encerrada a vigência, o contrato está extinto e não pode ser prorrogado — esse é o entendimento consolidado dos órgãos de controle.',
     'Lei 14.133/2021, arts. 105, 106 e 107.'),
    ('Sobrepreço e Pesquisa de Preços',
     'Quais fontes posso usar na pesquisa de preços e quantas cotações são necessárias?',
     'Setor de compras costuma pedir três orçamentos por e-mail. Isso basta?',
     'O art. 23, §1º, da Lei 14.133/2021 lista os parâmetros, que podem ser usados combinados ou não: I — composição de custos unitários menores ou iguais à mediana do item no Painel de Preços ou no banco de preços em saúde; II — contratações similares feitas pela Administração no prazo de até um ano antes da pesquisa; III — dados de pesquisa publicada em mídia especializada, tabela de referência oficial e sítios eletrônicos especializados ou de domínio amplo, com data e hora de acesso; IV — pesquisa direta com no mínimo três fornecedores, com justificativa da escolha; V — pesquisa na base nacional de notas fiscais eletrônicas. No âmbito federal, a IN SEGES/ME nº 65/2021 manda priorizar os incisos I e II e justificar quando não for possível usá-los. Por isso, três orçamentos por e-mail sozinhos costumam ser vistos como pesquisa frágil: combine com contratações públicas similares e registre a metodologia (média, mediana ou menor preço) no processo.',
     'Lei 14.133/2021, art. 23, §1º; IN SEGES/ME nº 65/2021.'),
    ('Habilitação',
     'Posso aceitar documento novo em diligência para corrigir falha na habilitação?',
     'Licitante deixou de juntar um atestado, mas o serviço foi prestado antes da licitação.',
     'O art. 64 da Lei 14.133/2021 veda, depois da entrega dos documentos de habilitação, a substituição ou a apresentação de novos documentos, salvo em diligência para complementar informações sobre documentos já apresentados, desde que necessária para apurar fatos existentes à época da abertura do certame, e para atualizar documentos cuja validade tenha expirado. O TCU, no Acórdão 1211/2021-Plenário, entendeu que essa vedação não alcança documento que comprove condição que o licitante já atendia antes da abertura da sessão e que não foi juntado por equívoco ou falha. No seu caso, se o serviço foi prestado antes da licitação, a diligência para receber o atestado é admissível. O que não se pode aceitar é documento que crie condição nova, posterior à abertura.',
     'Lei 14.133/2021, art. 64; TCU, Acórdão 1211/2021-Plenário.'),
    ('Dispensa e Inexigibilidade',
     'Como evitar o fracionamento nas dispensas por valor?',
     'Secretaria faz várias compras pequenas de material de expediente ao longo do ano, cada uma abaixo do limite de dispensa.',
     'O art. 75, §1º, da Lei 14.133/2021 manda considerar, para aferir os limites de dispensa por valor (incisos I e II), o somatório do que for despendido no exercício financeiro pela respectiva unidade gestora e o somatório da despesa com objetos de mesma natureza, entendidos como os do mesmo ramo de atividade. Assim, compras repetidas de material de expediente no ano devem ser somadas; se o total ultrapassar o limite, é preciso licitar (ou registrar preços). Os valores dos limites são atualizados todo ano por decreto (art. 182), então confira o valor vigente. As dispensas por valor devem preferencialmente ser precedidas de aviso em sítio eletrônico oficial por no mínimo 3 dias úteis, para receber propostas de outros interessados (art. 75, §3º). Planejar as compras no plano de contratações anual é a melhor forma de evitar o problema.',
     'Lei 14.133/2021, art. 75, I, II, §§1º e 3º, e art. 182.'),
    ('Dispensa e Inexigibilidade',
     'Quando cabe inexigibilidade para contratar serviço técnico especializado?',
     'Queremos contratar um parecer jurídico de um especialista reconhecido.',
     'O art. 74, III, da Lei 14.133/2021 prevê inexigibilidade para serviços técnicos especializados de natureza predominantemente intelectual, prestados por profissionais ou empresas de notória especialização — o que inclui pareceres, assessorias e consultorias técnicas (alínea c), sendo vedada para publicidade e divulgação. Notória especialização é a do profissional ou empresa cujo conceito, decorrente de desempenho anterior, estudos, experiência, publicações, organização, equipe técnica ou outros requisitos, permite inferir que o seu trabalho é essencial e reconhecidamente adequado ao objeto (art. 74, §3º). O processo deve ser instruído conforme o art. 72: documento de formalização da demanda, razão da escolha do contratado, justificativa do preço (comparando com valores cobrados pelo mesmo profissional em outros contratos) e comprovação dos requisitos. Os órgãos de controle seguem exigindo que se demonstre por que o serviço não pode ser comparado e licitado entre vários prestadores.',
     'Lei 14.133/2021, arts. 72 e 74, III, alínea c, e §3º.')
    ) as v(topico, titulo, contexto, resposta, citacao)
  loop
    select id into t_id from public.forum_topicos where nome = item.topico;
    continue when t_id is null;
    continue when exists (select 1 from public.forum_perguntas where titulo = item.titulo);

    insert into public.forum_perguntas (topico_id, autor_id, autor_nome, autor_papel, autor_setor, titulo, contexto)
    values (t_id, adm.id, 'Licitacon', 'Pergunta frequente · curadoria Licitacon', 'Setor Público', item.titulo, item.contexto)
    returning id into q_id;

    insert into public.forum_respostas (pergunta_id, autor_id, autor_nome, autor_papel, texto, citacao, melhor, oficial)
    values (q_id, adm.id, coalesce(nullif(adm.nome, ''), 'Licitacon'), 'Resposta oficial · Licitacon',
            item.resposta, item.citacao, true, true);
  end loop;

  alter table public.forum_perguntas enable trigger forum_perguntas_autor;
  alter table public.forum_respostas enable trigger forum_respostas_autor;
end $$;
