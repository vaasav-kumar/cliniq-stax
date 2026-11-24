-- Clinic CRM schema for Supabase (Postgres).
-- Every business table carries clinic_id. The app connects server-side with DATABASE_URL and always filters on clinic_id.
-- Row Level Security is enabled on every table with NO policies, so the public Supabase API keys (anon / publishable)
-- cannot read or write any data. Only the server connection, which has its own privileges, can.

create table if not exists clinics (
  id bigint generated always as identity primary key,
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'doctor', 'front_desk')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_users_clinic on users(clinic_id);

create table if not exists sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  clinic_id bigint not null references clinics(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_user on sessions(user_id);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  user_id bigint references users(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_clinic on audit_log(clinic_id, created_at);

create table if not exists patients (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  gender text,
  address_line text,
  area text,
  city text not null default 'Chennai',
  pincode text,
  reached_via text not null,
  referred_by text,
  notes text,
  registered_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_patients_clinic_phone on patients(clinic_id, phone);

create table if not exists visits (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  patient_id bigint not null references patients(id) on delete cascade,
  visit_date date not null,
  service text not null,
  status text not null default 'completed' check (status in ('completed', 'no_show', 'cancelled')),
  fee double precision not null default 0 check (fee >= 0),
  payment_status text not null default 'NOT_PAID' check (payment_status in ('PAID', 'NOT_PAID')),
  paid_at timestamptz,
  notes text,
  follow_up_date date,
  follow_up_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_visits_patient on visits(clinic_id, patient_id);
create index if not exists idx_visits_date on visits(clinic_id, visit_date);
create index if not exists idx_visits_payment on visits(clinic_id, payment_status);

create table if not exists transactions (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount double precision not null check (amount > 0),
  category text not null,
  description text,
  entry_date date not null,
  patient_id bigint references patients(id) on delete set null,
  visit_id bigint references visits(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_tx_date on transactions(clinic_id, entry_date);
create index if not exists idx_tx_visit on transactions(visit_id);

-- Lock the tables down from the public API.
alter table clinics enable row level security;
alter table users enable row level security;
alter table sessions enable row level security;
alter table audit_log enable row level security;
alter table patients enable row level security;
alter table visits enable row level security;
alter table transactions enable row level security;
