create table if not exists public.offline_sync_events (
  client_event_id uuid primary key,
  centre_id uuid not null references public.centres(id) on delete cascade,
  panel_fingerprint_hex text not null
    check (
      panel_fingerprint_hex ~ '^[0-9a-f]{8}$'
      or panel_fingerprint_hex ~ '^[0-9a-f]{64}$'
    ),
  teacher_id text,
  credential_id text,
  event_type text not null,
  video_id text,
  quiz_id text,
  attempt_id text,
  question_id text,
  payload_json jsonb,
  occurred_at timestamptz not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  app_version text,
  raw_event jsonb not null default '{}'::jsonb
);

create index if not exists offline_sync_events_centre_received_idx
  on public.offline_sync_events (centre_id, received_at desc);

create index if not exists offline_sync_events_teacher_idx
  on public.offline_sync_events (teacher_id);

create index if not exists offline_sync_events_event_type_idx
  on public.offline_sync_events (event_type);

alter table public.offline_sync_events enable row level security;

create policy offline_sync_events_service_role_all
  on public.offline_sync_events
  for all to service_role
  using (true) with check (true);
