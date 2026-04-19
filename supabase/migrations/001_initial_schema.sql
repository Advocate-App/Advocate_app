-- advocates: profile per user
create table advocates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  full_name text not null,
  bci_enrollment text,
  chamber_address text default 'Chamber No. 39, District Court, Udaipur',
  phone text,
  email text,
  advocate_id_ecourts text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- cases: the core case record
create table cases (
  id uuid primary key default gen_random_uuid(),
  advocate_id uuid references advocates(id) on delete cascade not null,
  court_level text not null check (court_level in ('district','high_court')),
  court_name text not null,
  court_code text,
  case_number text not null,
  case_year integer,
  case_type text,
  party_plaintiff text not null,
  party_defendant text not null,
  full_title text generated always as (party_plaintiff || ' vs ' || party_defendant) stored,
  client_name text,
  client_side text check (client_side in ('plaintiff','defendant','both','intervenor','petitioner','respondent','applicant','opposite_party')),
  our_role text,
  opposite_advocate text,
  case_stage text,
  status text default 'active' check (status in ('active','disposed','stayed','withdrawn','transferred','reserved')),
  filed_date date,
  disposal_date date,
  ecourts_cnr text,
  hc_bench text check (hc_bench in ('jodhpur','jaipur') or hc_bench is null),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- hearings: one row per hearing date per case
create table hearings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade not null,
  hearing_date date not null,
  previous_hearing_date date,
  next_hearing_date date,
  stage_on_date text,
  purpose text,
  appearing_advocate_name text,
  appearing_advocate_id uuid references advocates(id),
  happened boolean default false,
  adjournment_reason text,
  outcome_notes text,
  created_at timestamptz default now()
);

-- case_documents: PDFs and other files attached to cases
create table case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade not null,
  file_name text not null,
  storage_path text not null,
  file_size_bytes bigint,
  mime_type text,
  doc_type text check (doc_type in ('order','application','reply','evidence','written_statement','pleading','notice','plaint','vakalatnama','affidavit','judgment','other')) default 'other',
  uploaded_by uuid references advocates(id),
  uploaded_at timestamptz default now(),
  notes text
);

-- Indexes for speed
create index idx_cases_advocate on cases(advocate_id);
create index idx_cases_status on cases(status);
create index idx_cases_court_level on cases(court_level);
create index idx_hearings_case on hearings(case_id);
create index idx_hearings_date on hearings(hearing_date);
create index idx_hearings_next on hearings(next_hearing_date);
create index idx_documents_case on case_documents(case_id);

-- updated_at triggers
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger cases_touch before update on cases for each row execute procedure touch_updated_at();
create trigger advocates_touch before update on advocates for each row execute procedure touch_updated_at();

-- RLS
alter table advocates enable row level security;
alter table cases enable row level security;
alter table hearings enable row level security;
alter table case_documents enable row level security;

-- Policies: each advocate sees only their own data
create policy "advocates_self" on advocates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "cases_own" on cases
  for all using (advocate_id in (select id from advocates where user_id = auth.uid()))
  with check (advocate_id in (select id from advocates where user_id = auth.uid()));

create policy "hearings_own" on hearings
  for all using (case_id in (select id from cases where advocate_id in (select id from advocates where user_id = auth.uid())))
  with check (case_id in (select id from cases where advocate_id in (select id from advocates where user_id = auth.uid())));

create policy "documents_own" on case_documents
  for all using (case_id in (select id from cases where advocate_id in (select id from advocates where user_id = auth.uid())))
  with check (case_id in (select id from cases where advocate_id in (select id from advocates where user_id = auth.uid())));

-- Storage bucket for case documents
insert into storage.buckets (id, name, public) values ('case-documents', 'case-documents', false);

-- Storage policies
create policy "advocates_read_own_docs" on storage.objects
  for select using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select id::text from advocates where user_id = auth.uid())
  );
create policy "advocates_upload_own_docs" on storage.objects
  for insert with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select id::text from advocates where user_id = auth.uid())
  );
create policy "advocates_delete_own_docs" on storage.objects
  for delete using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] in (select id::text from advocates where user_id = auth.uid())
  );
