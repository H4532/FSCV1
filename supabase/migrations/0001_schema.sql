-- FSCV1 - Function Sheet Control v1
-- Schema: function sheets, departments, follow-up tasks, feedback, attachments, history.

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type user_role     as enum ('admin', 'sales', 'department');
create type sheet_status  as enum ('draft', 'submitted', 'confirmed', 'completed', 'cancelled');
create type task_status   as enum ('pending', 'in_progress', 'done', 'issue', 'na', 'cancelled');
create type feedback_type as enum ('remark', 'incident', 'client');
create type severity      as enum ('low', 'medium', 'high');

-- ---------- Reference data (editable from Settings) ----------
create table departments (
  code              text primary key,
  name              text not null,
  sort_order        int  not null default 0,
  escalation_email  text,
  active            boolean not null default true
);

create table recipients (
  id               uuid primary key default gen_random_uuid(),
  department_code  text not null references departments(code) on update cascade,
  name             text,
  email            text not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (department_code, email)
);

create table venues (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  capacity  int,
  active    boolean not null default true
);

create table setup_styles (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  active  boolean not null default true
);

create table settings (
  key    text primary key,
  value  jsonb not null
);

-- ---------- Users ----------
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text,
  email            text,
  role             user_role not null default 'department',
  department_code  text references departments(code) on update cascade,
  created_at       timestamptz not null default now()
);

-- Auto-create a profile when a user signs up (role defaults to department; admin promotes).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function app_department() returns text
language sql stable security definer set search_path = public as $$
  select department_code from profiles where id = auth.uid()
$$;

-- ---------- Accounts (clients) ----------
create table accounts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  created_at     timestamptz not null default now()
);

-- ---------- Function sheets ----------
create sequence sheet_seq;

create table events (
  id               uuid primary key default gen_random_uuid(),
  sheet_no         text unique,
  account_id       uuid references accounts(id),
  account_name     text not null,
  booking_name     text not null,
  contact_name     text,
  contact_phone    text,
  contact_email    text,
  event_type       text not null default 'Meeting',
  description      text,
  status           sheet_status not null default 'draft',
  revision         int not null default 0,          -- 0 = never submitted
  sales_user_id    uuid references profiles(id),
  -- Accounts block
  rate             numeric(12,2) not null default 0,
  pricing_unit     text not null default 'per_day'  -- per_day | per_pax_per_day | package
                   check (pricing_unit in ('per_day','per_pax_per_day','package')),
  pricing_pax      int not null default 0,
  pricing_days     int not null default 1,
  vat_rate         numeric(5,2) not null default 15,
  subtotal         numeric(12,2) not null default 0,
  vat_amount       numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  deposit          numeric(12,2) not null default 0,
  payment_method   text,
  accounts_notes   text,
  cancelled_reason text,
  survey_sent_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  submitted_at     timestamptz
);

create or replace function set_sheet_no() returns trigger language plpgsql as $$
begin
  if new.sheet_no is null then
    new.sheet_no := 'FS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('sheet_seq')::text, 4, '0');
  end if;
  return new;
end $$;
create trigger events_sheet_no before insert on events for each row execute function set_sheet_no();

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger events_touch before update on events for each row execute function touch_updated_at();

create table event_days (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  event_date      date not null,
  venue_id        uuid references venues(id),
  venue_name      text,
  start_time      time not null,
  end_time        time not null,
  pax_guaranteed  int not null default 0,
  pax_expected    int not null default 0,
  setup_style     text,
  notes           text,
  sort_order      int not null default 0
);
create index on event_days (event_date);
create index on event_days (venue_id, event_date);

create table event_fnb_items (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  event_day_id  uuid not null references event_days(id) on delete cascade,
  serve_time    time,
  item          text not null,          -- e.g. Coffee break, Lunch buffet, Water
  menu_ref      text,                   -- menu / package reference
  pax           int,
  notes         text,
  sort_order    int not null default 0
);

create table department_notes (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  department_code  text not null references departments(code) on update cascade,
  notes            text,
  not_required     boolean not null default false,
  ready_by         time,                -- optional department-level deadline (e.g. Housekeeping 12:00)
  unique (event_id, department_code)
);

-- Full snapshot of every submitted revision (print any old version exactly as sent)
create table revisions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  rev_no          int not null,
  snapshot        jsonb not null,
  change_summary  text[] not null default '{}',
  changed_by      uuid references profiles(id),
  changed_at      timestamptz not null default now(),
  unique (event_id, rev_no)
);

create table acknowledgements (
  event_id         uuid not null references events(id) on delete cascade,
  department_code  text not null references departments(code) on update cascade,
  rev_no           int not null,
  user_id          uuid references profiles(id),
  acknowledged_at  timestamptz not null default now(),
  primary key (event_id, department_code, rev_no)
);

-- ---------- Follow-up ----------
create table event_tasks (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  event_day_id     uuid references event_days(id) on delete set null,
  department_code  text not null references departments(code) on update cascade,
  task_key         text not null,       -- stable key used to keep status across revisions
  content_hash     text not null,       -- changes when the requirement changes -> task resets
  title            text not null,
  detail           text,
  ready_by         timestamptz,
  status           task_status not null default 'pending',
  eta              timestamptz,
  status_comment   text,
  assigned_to      uuid references profiles(id),
  changed_in_rev   int,                 -- set when a revision reset this task
  alert_sent_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_id, task_key)
);
create index on event_tasks (department_code, status);
create index on event_tasks (ready_by);
create trigger tasks_touch before update on event_tasks for each row execute function touch_updated_at();

create table task_updates (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references event_tasks(id) on delete cascade,
  old_status  task_status,
  new_status  task_status not null,
  eta         timestamptz,
  comment     text,
  user_id     uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ---------- Feedback & materials ----------
create table event_feedback (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  department_code  text references departments(code) on update cascade,
  type             feedback_type not null default 'remark',
  category         text,                -- for incidents: F&B, AV, cleanliness, billing, safety...
  text             text not null,
  rating           int check (rating between 1 and 5),
  severity         severity,
  resolved         boolean not null default false,
  author           uuid references profiles(id),
  created_at       timestamptz not null default now()
);

create table attachments (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  feedback_id     uuid references event_feedback(id) on delete set null,
  task_update_id  uuid references task_updates(id) on delete set null,
  file_path       text not null,        -- path inside storage bucket "materials"
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  caption         text,
  uploaded_by     uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create table client_surveys (
  token         uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  ratings       jsonb,                  -- {venue, fnb, service, value}
  comment       text,
  sent_at       timestamptz not null default now(),
  submitted_at  timestamptz
);

create table email_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references events(id) on delete cascade,
  rev_no      int,
  kind        text not null,            -- sheet | alert | survey
  recipients  text[] not null,
  subject     text,
  status      text not null,            -- sent | failed | logged
  error       text,
  created_at  timestamptz not null default now()
);

-- ---------- Views ----------
create or replace view event_readiness as
select
  e.id as event_id,
  t.department_code,
  count(*) filter (where t.status not in ('na','cancelled'))            as total,
  count(*) filter (where t.status = 'done')                              as done,
  count(*) filter (where t.status = 'issue')                             as issues,
  count(*) filter (where t.status not in ('done','na','cancelled')
                   and t.ready_by < now())                               as overdue
from events e
join event_tasks t on t.event_id = e.id
group by e.id, t.department_code;

-- ---------- Row level security ----------
alter table departments      enable row level security;
alter table recipients       enable row level security;
alter table venues           enable row level security;
alter table setup_styles     enable row level security;
alter table settings         enable row level security;
alter table profiles         enable row level security;
alter table accounts         enable row level security;
alter table events           enable row level security;
alter table event_days       enable row level security;
alter table event_fnb_items  enable row level security;
alter table department_notes enable row level security;
alter table revisions        enable row level security;
alter table acknowledgements enable row level security;
alter table event_tasks      enable row level security;
alter table task_updates     enable row level security;
alter table event_feedback   enable row level security;
alter table attachments      enable row level security;
alter table client_surveys   enable row level security;
alter table email_log        enable row level security;

-- Everyone signed in can read operational data
do $$
declare t text;
begin
  foreach t in array array['departments','recipients','venues','setup_styles','settings','profiles','accounts',
    'events','event_days','event_fnb_items','department_notes','revisions','acknowledgements',
    'event_tasks','task_updates','event_feedback','attachments','client_surveys','email_log']
  loop
    execute format('create policy "read_%1$s" on %1$I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Sales & admin manage sheets, accounts and settings
do $$
declare t text;
begin
  foreach t in array array['departments','recipients','venues','setup_styles','settings','accounts',
    'events','event_days','event_fnb_items','department_notes','revisions','event_tasks','client_surveys','email_log']
  loop
    execute format('create policy "sales_write_%1$s" on %1$I for all to authenticated
      using (app_role() in (''admin'',''sales'')) with check (app_role() in (''admin'',''sales''))', t);
  end loop;
end $$;

-- Departments update only their own tasks
create policy "dept_update_tasks" on event_tasks for update to authenticated
  using (department_code = app_department()) with check (department_code = app_department());

-- Anyone signed in can log task updates, acknowledgements, feedback and attachments as themselves
create policy "insert_task_updates" on task_updates for insert to authenticated with check (user_id = auth.uid());
create policy "insert_ack" on acknowledgements for insert to authenticated with check (user_id = auth.uid());
create policy "insert_feedback" on event_feedback for insert to authenticated with check (author = auth.uid());
create policy "update_own_feedback" on event_feedback for update to authenticated
  using (author = auth.uid() or app_role() in ('admin','sales'));
create policy "insert_attachments" on attachments for insert to authenticated with check (uploaded_by = auth.uid());

-- Profiles: users edit their own name; admin manages roles
create policy "admin_profiles" on profiles for update to authenticated using (app_role() = 'admin' or id = auth.uid());

-- ---------- Storage bucket for materials ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 262144000)  -- 250 MB per file
on conflict (id) do nothing;

create policy "materials_read" on storage.objects for select to authenticated using (bucket_id = 'materials');
create policy "materials_upload" on storage.objects for insert to authenticated with check (bucket_id = 'materials');

-- Prevent users from promoting themselves: only admins change role/department
create or replace function guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.department_code is distinct from old.department_code)
     and coalesce(app_role()::text, '') <> 'admin' and auth.uid() is not null then
    raise exception 'Only an admin can change roles or departments';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_role();
