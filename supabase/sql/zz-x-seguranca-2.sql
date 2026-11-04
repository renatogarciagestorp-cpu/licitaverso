-- Varredura de segurança (nov/2026, 2ª rodada). Ajustes idempotentes.

-- 1) Acesso de equipe só para e-mail CONFIRMADO: a pessoa só é reconhecida como membro de uma equipe
--    (pelo e-mail cadastrado pelo gestor) depois de confirmar o e-mail da conta. Evita que alguém crie uma conta
--    com o e-mail de um convidado, antes do dono, e use o plano da equipe.
create or replace function public.meu_email_conta(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select lower(btrim(coalesce(p.email, ''))) from public.perfis p
    join auth.users u on u.id = p.id
   where p.id = uid
     and u.email_confirmed_at is not null
     and (uid = auth.uid()
          or coalesce(auth.role(), '') not in ('anon', 'authenticated')
          or public.is_admin())
$$;
revoke execute on function public.meu_email_conta(uuid) from public, anon;
grant execute on function public.meu_email_conta(uuid) to authenticated, service_role;

-- 2) Selo de resposta oficial no fórum só para administrador com a verificação em duas etapas ativa (is_admin),
--    como no restante do painel.
create or replace function public.forum_carimbar_autor()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.perfis;
begin
  select * into p from public.perfis where id = auth.uid();
  if not found then raise exception 'Perfil não encontrado.'; end if;
  new.autor_id := p.id;
  new.autor_nome := coalesce(nullif(p.nome, ''), 'Participante');
  new.autor_papel := concat_ws(' · ', nullif(p.cargo, ''), nullif(p.orgao, ''));
  if tg_table_name = 'forum_perguntas' then
    new.autor_setor := p.setor;
  else
    new.melhor := false;
    new.oficial := public.is_admin();
  end if;
  return new;
end $$;
