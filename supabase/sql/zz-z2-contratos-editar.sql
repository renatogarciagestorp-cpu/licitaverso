-- Gestão contratual: o dono do contrato pode editar os registros da linha do tempo.
-- Na edição não muda o contrato, o dono nem a data de criação do registro.
create or replace function public.contrato_eventos_alterar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar.'; end if;
  if not exists (select 1 from public.contratos c where c.id = old.contrato_id and c.usuario_id = auth.uid()) then
    raise exception 'Contrato não encontrado.';
  end if;
  new.contrato_id := old.contrato_id;
  new.usuario_id := old.usuario_id;
  new.criado_em := old.criado_em;
  return new;
end $$;
drop trigger if exists contrato_eventos_alterar on public.contrato_eventos;
create trigger contrato_eventos_alterar before update on public.contrato_eventos for each row execute function public.contrato_eventos_alterar();
revoke execute on function public.contrato_eventos_alterar() from public, anon, authenticated;

drop policy if exists contrato_eventos_alterar on public.contrato_eventos;
create policy contrato_eventos_alterar on public.contrato_eventos for update to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_id and c.usuario_id = auth.uid()))
  with check (exists (select 1 from public.contratos c where c.id = contrato_id and c.usuario_id = auth.uid()));
grant update on public.contrato_eventos to authenticated;
