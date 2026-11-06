-- Cabeçalho dos documentos do plano de equipe: nome, linha de identificação e logotipo do órgão ou da empresa,
-- usados nos PDFs gerados no site (planilhas, notas técnicas, peças) e no parecer do Parecerista.
-- (nome "zz-zd..." para ser aplicado depois de zz-organizacoes.sql: sobrepõe minha_organizacao com o campo cabecalho)
alter table public.organizacoes add column if not exists cabecalho jsonb;

create or replace function public.minha_organizacao()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare org uuid; o public.organizacoes; gestor boolean;
begin
  org := public.org_do_usuario(auth.uid());
  if org is null then return null; end if;
  select * into o from public.organizacoes where id = org;
  gestor := public.sou_gestor(org);
  return jsonb_build_object('id', o.id, 'nome', o.nome, 'plano', o.plano, 'acessos', o.acessos, 'fim', o.fim, 'ciclo', o.ciclo,
    'gestor', gestor, 'cabecalho', o.cabecalho,
    'usados', (select count(*) from public.organizacao_membros where org_id = org),
    'analises_mes', case when o.plano = 'pro' then public.analises_usadas_org(org) else null end,
    'limite_mes', case when o.plano = 'pro' then 6 * o.acessos else null end,
    'membros', case when gestor then (select coalesce(jsonb_agg(jsonb_build_object('email', m.email, 'papel', m.papel,
                     'nome', (select p.nome from public.perfis p where lower(p.email) = m.email limit 1),
                     'cadastrado', exists (select 1 from public.perfis p where lower(p.email) = m.email)) order by m.papel, m.email), '[]'::jsonb)
                   from public.organizacao_membros m where m.org_id = org) else null end);
end $$;
grant execute on function public.minha_organizacao() to authenticated;

-- só o gestor da equipe altera o cabeçalho; logotipo em PNG ou JPEG (data URL), até ~250 KB
create or replace function public.org_salvar_cabecalho(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare org uuid; logo text := coalesce(p ->> 'logo', '');
begin
  org := public.org_do_usuario(auth.uid());
  if org is null or not public.sou_gestor(org) then raise exception 'Somente o gestor da equipe pode alterar o cabeçalho dos documentos.'; end if;
  if logo <> '' and logo !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$' then raise exception 'Logotipo inválido: envie uma imagem PNG ou JPG.'; end if;
  if octet_length(logo) > 350000 then raise exception 'Logotipo grande demais: use uma imagem menor.'; end if;
  update public.organizacoes set cabecalho = case when coalesce(btrim(p ->> 'nome'), '') = '' and logo = '' then null else jsonb_build_object(
    'nome', left(btrim(coalesce(p ->> 'nome', '')), 160), 'linha2', left(btrim(coalesce(p ->> 'linha2', '')), 200), 'logo', logo) end
  where id = org;
  return public.minha_organizacao();
end $$;
revoke execute on function public.org_salvar_cabecalho(jsonb) from public, anon;
grant execute on function public.org_salvar_cabecalho(jsonb) to authenticated;

-- usado pelo agente (serviço) para pôr o cabeçalho da equipe no parecer de quem pediu a análise
create or replace function public.cabecalho_do_usuario(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare org uuid;
begin
  org := public.org_do_usuario(uid);
  if org is null then return null; end if;
  return (select cabecalho from public.organizacoes where id = org and status = 'ativa' and fim > now());
end $$;
revoke execute on function public.cabecalho_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.cabecalho_do_usuario(uuid) to service_role;
