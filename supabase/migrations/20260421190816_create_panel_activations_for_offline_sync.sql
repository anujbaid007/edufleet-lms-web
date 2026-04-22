create table if not exists public.panel_activations (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references public.centres(id) on delete cascade,
  fingerprint_hex text not null
    check (
      fingerprint_hex ~ '^[0-9a-f]{8}$'
      or fingerprint_hex ~ '^[0-9a-f]{64}$'
    ),
  activation_code text not null
    check (activation_code ~ '^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$'),
  status text not null default 'issued'
    check (status in ('issued', 'applied', 'revoked')),
  issued_at timestamptz not null default now(),
  issued_by text,
  notes text,
  applied_at timestamptz,
  revoked_at timestamptz,
  constraint panel_activations_fingerprint_centre_unique unique (fingerprint_hex, centre_id)
);

create index if not exists panel_activations_centre_idx
  on public.panel_activations (centre_id);

create index if not exists panel_activations_code_idx
  on public.panel_activations (activation_code);

alter table public.panel_activations enable row level security;

create policy panel_activations_service_role_all
  on public.panel_activations
  for all to service_role
  using (true) with check (true);

create policy panel_activations_platform_admin_read_all
  on public.panel_activations
  for select to authenticated
  using (public.current_user_role() = 'platform_admin');

create policy panel_activations_org_admin_read_own_org
  on public.panel_activations
  for select to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and exists (
      select 1
      from public.centres c
      where c.id = panel_activations.centre_id
        and c.org_id = public.current_user_org_id()
    )
  );

create policy panel_activations_centre_admin_read_own_centre
  on public.panel_activations
  for select to authenticated
  using (
    public.current_user_role() = 'centre_admin'
    and centre_id = public.current_user_centre_id()
  );
