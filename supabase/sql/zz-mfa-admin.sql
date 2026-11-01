-- Verificação em duas etapas: os poderes de administrador só valem numa sessão confirmada com o código do aplicativo
-- autenticador (aal2). Sem isso, a conta administradora é tratada como uma conta comum em todas as regras do banco.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.admin from public.perfis p where p.id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

-- plano_vigente: o "Pro" do administrador também depende da sessão confirmada (ou de chamada interna, sem usuário).
create or replace function public.plano_vigente(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.perfis p where p.id = uid and p.admin)
         and (auth.uid() is null or (uid = auth.uid() and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2') or public.is_admin()) then 'pro'
    else (
      select a.plano
      from public.assinaturas a
      where a.usuario_id = uid and a.status = 'ativa' and a.inicio <= now() and a.fim > now()
        and (auth.uid() is null or uid = auth.uid() or public.is_admin())
      order by case a.plano when 'pro' then 4 when 'premium' then 3 when 'basico' then 2 else 1 end desc
      limit 1)
  end
$$;

-- Conceder ou retirar o acesso de administrador pelo painel (só quem já é admin, em sessão com verificação em duas etapas).
create or replace function public.definir_admin(p_usuario uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Somente a administração, com verificação em duas etapas, pode alterar administradores.';
  end if;
  if p_usuario = auth.uid() and not p_admin then
    raise exception 'Você não pode retirar o seu próprio acesso de administrador.';
  end if;
  update public.perfis set admin = p_admin where id = p_usuario;
  insert into public.registro_admin (acao, detalhes)
  values (case when p_admin then 'tornar_admin' else 'retirar_admin' end, jsonb_build_object('usuario_id', p_usuario));
end $$;
revoke all on function public.definir_admin(uuid, boolean) from public, anon;
grant execute on function public.definir_admin(uuid, boolean) to authenticated;
