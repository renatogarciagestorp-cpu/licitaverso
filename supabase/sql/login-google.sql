-- Login com Google: o nome vem em full_name/name nos metadados do provedor (o cadastro por e-mail usa "nome").
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, celular, email)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 160),
    left(coalesce(new.raw_user_meta_data ->> 'celular', ''), 30),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
