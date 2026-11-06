-- Tipo de perfil do assinante (define o Painel da Organização): órgão público ou empresa privada.
-- vinculo: 'servidor' (órgão público), 'colaborador' ou 'gestor' (empresa privada); nulo = ainda não informado.
alter table public.perfis add column if not exists vinculo text;
alter table public.perfis drop constraint if exists perfis_vinculo_ck;
alter table public.perfis add constraint perfis_vinculo_ck check (vinculo is null or vinculo in ('servidor', 'colaborador', 'gestor'));
grant update (vinculo) on public.perfis to authenticated;

-- o cadastro por e-mail envia setor, órgão/empresa e vínculo nos metadados; o login com Google não envia (o site pergunta depois)
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text := new.raw_user_meta_data ->> 'setor';
  vc text := new.raw_user_meta_data ->> 'vinculo';
begin
  if st is null or st not in ('Setor Público', 'Setor Privado') then st := 'Setor Público'; end if;
  if vc is not null and vc not in ('servidor', 'colaborador', 'gestor') then vc := null; end if;
  insert into public.perfis (id, nome, celular, email, setor, orgao, vinculo)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 160),
    left(coalesce(new.raw_user_meta_data ->> 'celular', ''), 30),
    coalesce(new.email, ''),
    st,
    left(coalesce(new.raw_user_meta_data ->> 'orgao', ''), 160),
    vc
  )
  on conflict (id) do nothing;
  return new;
end $$;
