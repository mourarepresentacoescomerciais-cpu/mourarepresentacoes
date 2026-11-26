-- Apply to the database configured by the storefront; does not modify orders.
create table if not exists public.purchase_history_overrides (
  client_id uuid not null references public.profiles(id) on delete cascade,
  original_product_id uuid not null references public.products(id) on delete cascade,
  replacement_product_id uuid references public.products(id) on delete set null,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (client_id, original_product_id)
);
grant all on public.purchase_history_overrides to service_role;
revoke all on public.purchase_history_overrides from anon, authenticated;
alter table public.purchase_history_overrides enable row level security;

create or replace function public.purchase_history_read(_token text, _client_id uuid)
returns setof public.purchase_history_overrides
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions;
begin
  s := public._session(_token);
  if s.role is null or (s.role <> 'admin' and (s.role <> 'client' or s.profile_id is distinct from _client_id)) then
    raise exception 'unauthorized';
  end if;
  return query select h.* from public.purchase_history_overrides h where h.client_id = _client_id;
end $$;
revoke all on function public.purchase_history_read(text, uuid) from public;
grant execute on function public.purchase_history_read(text, uuid) to anon, authenticated, service_role;

create or replace function public.purchase_history_save(
  _token text, _client_id uuid, _original_id uuid, _replacement_id uuid, _hidden boolean
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.app_sessions; original_brand text; replacement_brand text;
begin
  s := public._session(_token);
  if s.role is null or (s.role <> 'admin' and (s.role <> 'client' or s.profile_id is distinct from _client_id)) then
    raise exception 'unauthorized';
  end if;
  if not exists (select 1 from public.profiles where id = _client_id and role = 'client') then
    raise exception 'client not found';
  end if;
  if _hidden is null or (not _hidden and _replacement_id is null) then raise exception 'invalid change'; end if;
  -- Adding a product manually: stored as a self-replacement of an active product.
  if not _hidden and _replacement_id = _original_id then
    if not exists (select 1 from public.products where id = _original_id and active) then
      raise exception 'product must be active';
    end if;
  else
    if not exists (
      select 1 from public.orders o join public.order_items i on i.order_id = o.id
      where o.client_id = _client_id and i.product_id = _original_id
    ) and not exists (
      select 1 from public.purchase_history_overrides h
      where h.client_id = _client_id and h.original_product_id = _original_id
    ) then raise exception 'product not in client history'; end if;
    select brand into original_brand from public.products where id = _original_id;
    if _replacement_id is not null then
      if _replacement_id = _original_id then raise exception 'invalid replacement'; end if;
      select brand into replacement_brand from public.products where id = _replacement_id and active;
      if not found or lower(replacement_brand) is distinct from lower(original_brand) then
        raise exception 'replacement must be active and from the same company';
      end if;
    end if;
  end if;
  insert into public.purchase_history_overrides(client_id, original_product_id, replacement_product_id, hidden)
  values (_client_id, _original_id, case when _hidden then null else _replacement_id end, _hidden)
  on conflict (client_id, original_product_id) do update
    set replacement_product_id = excluded.replacement_product_id, hidden = excluded.hidden, updated_at = now();
end $$;
revoke all on function public.purchase_history_save(text, uuid, uuid, uuid, boolean) from public;
grant execute on function public.purchase_history_save(text, uuid, uuid, uuid, boolean) to anon, authenticated, service_role;
notify pgrst, 'reload schema';