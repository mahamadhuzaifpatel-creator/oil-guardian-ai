-- =====================================================================
-- OIL Guardian AI - Supabase setup (reference)
-- Run in Supabase SQL Editor on a NEW project.
-- The live project's policies were created in the Supabase dashboard;
-- the policies below are equivalent reconstructions of their intent.
-- =====================================================================

-- ---------- profiles (one row per user, created by trigger) ----------
create sequence if not exists employee_id_seq start 79650;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null default ('oil-' || nextval('employee_id_seq')),
  full_name text not null,
  email text,
  role text not null default 'employee',          -- employee | safety_officer
  requested_role text,                            -- what the user asked for at signup
  job_title text,
  certification text,
  company text default 'Oil India Limited',
  division text,
  facility_station text,
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
-- No update policy: users cannot change their own role.

-- ---------- signup trigger: role is ALWAYS 'employee' ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  requested_user_role text;
begin
  requested_user_role :=
    case
      when new.raw_user_meta_data->>'requested_role' in ('employee', 'safety_officer')
        then new.raw_user_meta_data->>'requested_role'
      else 'employee'
    end;

  insert into public.profiles (id, full_name, email, role, requested_role, job_title, company, division)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'OIL Guardian User'),
    new.email,
    'employee',
    requested_user_role,
    'Field Technician',
    'Oil India Limited',
    'Exploration & Production (E&P)'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Approve officer requests (run by an administrator):
-- update public.profiles set role = 'safety_officer', job_title = 'Safety Officer',
--   division = 'Health, Safety & Environment'
-- where requested_role = 'safety_officer';

-- ---------- reports ----------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  report_text text not null,
  facility_location text not null,
  operational_department text not null,
  input_mode text not null default 'text',        -- text | voice | ocr
  category text,                                  -- Unsafe Act | Unsafe Condition | Near Miss | Incident
  sif_probability numeric,                        -- 0-1 (rescaled SIF score)
  sif_percentage numeric,
  risk_tier text,                                 -- High Risk | Moderate Risk | Low Risk
  iogp_rule text,
  near_miss_confidence numeric,
  unsafe_act_confidence numeric,
  unsafe_condition_confidence numeric,
  ai_result jsonb,                                -- full AI output + report-type source
  status text not null default 'submitted',       -- submitted | under_review | action_required | closed
  assigned_to text,
  officer_remarks text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "Users can insert their own reports" on public.reports
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users can view their own reports" on public.reports
  for select to authenticated using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'safety_officer'
    )
  );

create policy "Safety officers can update reports" on public.reports
  for update to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'safety_officer'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'safety_officer'
  ));
