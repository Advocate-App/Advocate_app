-- Run this in Supabase SQL Editor if empanelment tables do not exist yet

-- Target organizations to approach for empanelment
create table if not exists target_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  segment text not null check (segment in ('insurance','bank','nbfc','psu','govt')),
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  contact_role text,
  empanelment_process text,
  email text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Applications: one per advocate per organization
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references target_organizations(id) on delete cascade not null,
  advocate_id uuid references advocates(id) on delete cascade,
  subject text,
  body text,
  status text not null default 'new',
  send_method text,
  sent_date date,
  application_sent_at timestamptz,
  followup1_sent_at timestamptz,
  followup2_sent_at timestamptz,
  response_received_at timestamptz,
  response_summary text,
  response_sentiment text check (response_sentiment in ('positive','negative','neutral')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Status history log
create table if not exists application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete cascade not null,
  status text not null,
  notes text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_target_orgs_segment on target_organizations(segment);
create index if not exists idx_target_orgs_priority on target_organizations(priority);
create index if not exists idx_applications_org on applications(organization_id);
create index if not exists idx_applications_advocate on applications(advocate_id);
create index if not exists idx_applications_status on applications(status);
create index if not exists idx_applications_sent_at on applications(application_sent_at);
create index if not exists idx_status_history_app on application_status_history(application_id);

-- updated_at trigger for applications
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists applications_touch on applications;
create trigger applications_touch before update on applications for each row execute procedure touch_updated_at();

drop trigger if exists target_orgs_touch on target_organizations;
create trigger target_orgs_touch before update on target_organizations for each row execute procedure touch_updated_at();

-- RLS
alter table target_organizations enable row level security;
alter table applications enable row level security;
alter table application_status_history enable row level security;

-- Anyone logged in can read target_organizations (they are shared targets)
create policy if not exists "target_orgs_read" on target_organizations
  for select using (auth.role() = 'authenticated');

-- Advocates manage their own applications
create policy if not exists "applications_own" on applications
  for all using (
    advocate_id in (select id from advocates where user_id = auth.uid())
    or advocate_id is null
  )
  with check (
    advocate_id in (select id from advocates where user_id = auth.uid())
    or advocate_id is null
  );

create policy if not exists "status_history_own" on application_status_history
  for all using (
    application_id in (
      select id from applications where
        advocate_id in (select id from advocates where user_id = auth.uid())
        or advocate_id is null
    )
  );
