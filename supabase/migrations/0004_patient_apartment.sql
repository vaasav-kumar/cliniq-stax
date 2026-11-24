-- Apartment details for a patient: whether they live in an apartment, the apartment name and the door number.
alter table patients add column if not exists is_apartment boolean not null default false;
alter table patients add column if not exists apartment_name text;
alter table patients add column if not exists door_number text;
