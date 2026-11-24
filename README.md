# Clinic CRM (Harsha Vedic first, multi-clinic ready)

Internal CRM for Ayurveda clinics. Tracks patients (with address and where they reached out from), visits, PAID / NOT_PAID payments, repeat patients, follow-ups, income and expenses, and charts.

Data is stored in **Supabase** (managed Postgres). Several clinics can use one installation: every record carries its clinic, and every query is limited to the signed-in user's clinic.

## 1. Connect Supabase

1. In Supabase, open your project, then **Project Settings → Database → Connection string**. Choose **Session pooler** (or Direct connection) and copy the URI.
2. Copy the environment template and paste the connection string into it:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and set `DATABASE_URL` to your connection string, with your database password filled in. Keep this file private; it is git-ignored.

3. Create the tables:

   ```bash
   npm install
   npm run db:migrate
   ```

   This applies `supabase/migrations/*.sql` once and records it, so running it again is safe. The tables have row-level security on and no public policies, so the Supabase public API keys cannot read clinic data. Only this app's server connection can.

## 2. Run it

Requires Node.js 20 or newer.

```bash
npm run dev          # http://localhost:3000
```

Open `/register` to create your clinic and its first admin account. Then add doctors and front-desk staff under **Staff**.

Demo data (fake clinic and 40 fake patients, for trying the app). Use a database that holds no real clinic data:

```bash
ALLOW_DEMO_SEED=true npm run seed:demo
```

Demo sign-in: `demo-admin@example.com` / `demo-password-123`.

## Payments (PAID / NOT_PAID)

- Each visit has a payment status: **PAID** or **NOT_PAID**. New visits start as NOT_PAID.
- Marking a visit **PAID** books its fee as income. Marking it back to **NOT_PAID** removes that income, so totals stay correct.
- **Payments** page: all completed visits that are NOT_PAID, with the amount outstanding and a Mark PAID button.
- Patient page: each visit shows its status with a toggle, and the patient's unpaid total.
- Dashboard: "Unpaid (NOT_PAID)" tile linking to the Payments page.

## Accounts, roles and sessions

- **Register a clinic:** `/register`. Set `ALLOW_CLINIC_SIGNUP=false` in `.env.local` to close public sign-up.
- **Roles:**

| Area | Admin | Doctor / therapist | Front desk |
| --- | --- | --- | --- |
| Dashboard | yes | no | no |
| Patients (view, add) | yes | yes | yes |
| Visits | yes | yes | yes |
| Follow-ups | yes | yes | yes |
| Payments (mark PAID / NOT_PAID) | yes | no | yes |
| Income & expenses | yes | no | yes |
| Staff | yes | no | no |

- **Sessions:** 12-hour sign-in in an HttpOnly, SameSite cookie. Only a hash of the session token is stored in the database.
- **Passwords:** scrypt-hashed, minimum 10 characters.
- **Sign-in throttling:** 5 failed attempts lock an email for 15 minutes. The lock is in memory, so it resets when the server restarts.
- **Audit log:** sign-ins, patient views, record changes and staff changes are written to `audit_log`.

## Tests

Tests run against your Supabase database. Each test creates its own temporary schema and drops it when finished, so clinic data is never touched.

```bash
npm test
npm run typecheck
npm run build
```

## Before real clinical use

- Use the HTTPS address for the app (the session cookie is marked Secure in production).
- Run `npm run build && npm start` instead of the dev server.
- Turn on Supabase backups for the project.
- Clinical notes and therapy plans, attachments and printable receipts are not built yet.
- GST handling is pending confirmation from each clinic.
- Several server instances would need the sign-in throttle moved into the database.

## Notes

- Dates are handled in India time (IST) for "today".
- Monthly charts use the registration date for new patients and the visit or transaction date for the rest.
