-- Optional clinic logo, shown in the sidebar and on the account page.
-- Stored in the clinic row and served only to signed-in users of that clinic (see src/app/logo/route.ts).
alter table clinics add column if not exists logo_mime text;
alter table clinics add column if not exists logo_data bytea;
