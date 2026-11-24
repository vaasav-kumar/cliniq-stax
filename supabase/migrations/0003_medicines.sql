-- Medicine inventory, purchases and patient medicine requests.
-- Stock only changes through purchases (increase) and dispensing (decrease), both recorded in the app's transactions.

create table if not exists medicines (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  name text not null,
  unit text not null default 'unit',
  stock_qty double precision not null default 0 check (stock_qty >= 0),
  reorder_level double precision not null default 0 check (reorder_level >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists idx_medicines_clinic_name on medicines(clinic_id, lower(name));

create table if not exists medicine_purchases (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  medicine_id bigint not null references medicines(id) on delete cascade,
  quantity double precision not null check (quantity > 0),
  unit_cost double precision not null check (unit_cost >= 0),
  total_cost double precision not null check (total_cost >= 0),
  supplier text,
  purchase_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_purchases_clinic_date on medicine_purchases(clinic_id, purchase_date);

create table if not exists medicine_requests (
  id bigint generated always as identity primary key,
  clinic_id bigint not null references clinics(id) on delete cascade,
  patient_id bigint not null references patients(id) on delete cascade,
  medicine_id bigint not null references medicines(id) on delete restrict,
  quantity double precision not null check (quantity > 0),
  status text not null default 'requested' check (status in ('requested', 'dispensed', 'cancelled')),
  notes text,
  requested_on date not null default current_date,
  dispensed_on date,
  created_at timestamptz not null default now()
);
create index if not exists idx_requests_open on medicine_requests(clinic_id, status, medicine_id);
create index if not exists idx_requests_patient on medicine_requests(clinic_id, patient_id);

alter table medicines enable row level security;
alter table medicine_purchases enable row level security;
alter table medicine_requests enable row level security;
