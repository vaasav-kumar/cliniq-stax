// Loads clearly-fake DEMO data (a demo clinic with a demo admin) so the dashboard, payments and charts can be checked.
// It writes into whatever database DATABASE_URL points to, so it needs an explicit opt-in and will not run twice.
// Usage (never on a clinic's live data):
//   ALLOW_DEMO_SEED=true npm run seed:demo
import { getDb, migrate } from "../src/lib/db";
import { registerClinic } from "../src/lib/accounts";
import { createPatient, createTransaction, createVisit, setVisitPaymentStatus } from "../src/lib/repo";
import { loadLocalEnv } from "../src/lib/env";

async function main() {
  loadLocalEnv();
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("Refusing to seed: set ALLOW_DEMO_SEED=true to add demo data to DATABASE_URL.");
    process.exit(1);
  }
  const db = getDb();
  await migrate(db);

  const DEMO_EMAIL = "demo-admin@example.com";
  const DEMO_PASSWORD = "demo-password-123";
  if (await db.one("SELECT 1 FROM users WHERE email = @email", { email: DEMO_EMAIL })) {
    console.log("Demo clinic already exists; skipping seed.");
    await db.close();
    return;
  }

  const { clinicId } = await registerClinic(db, {
    clinicName: "Demo Ayurveda Clinic",
    city: "Chennai",
    adminName: "Demo Admin",
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  const sources = ["Google Search", "Instagram", "Walk-in", "Doctor referral", "Patient referral", "Website", "Facebook"];
  const services = ["Ayurveda consultation", "Kerala Panchakarma", "Pain care", "Women's health"];
  const areas = ["Medavakkam", "Tambaram", "Pallikaranai", "Velachery", "Perumbakkam", "Kovilambakkam"];

  const now = new Date();
  const dateMonthsAgo = (m: number, day: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, Math.min(day, 28)));
    return d.toISOString().slice(0, 10);
  };

  // One transaction for the whole demo load: faster, and all-or-nothing.
  await db.tx(async (tx) => {
    for (let i = 0; i < 40; i++) {
      const seq = i + 1;
      const phone = `9${String(100000000 + seq * 7919).slice(-9)}`;
      const patientId = await createPatient(tx, clinicId, {
        name: `Demo Patient ${seq}`,
        phone,
        reachedVia: sources[i % sources.length],
        area: areas[i % areas.length],
        addressLine: `Demo street ${seq}`,
        pincode: "600100",
        registeredOn: dateMonthsAgo(11 - (i % 12), 2),
      });
      const visits = 1 + (i % 3);
      for (let v = 0; v < visits; v++) {
        const service = services[(i + v) % services.length];
        const fee = [800, 1500, 3000][(i + v) % 3];
        const visitId = await createVisit(tx, clinicId, {
          patientId,
          visitDate: dateMonthsAgo(11 - ((i + v * 2) % 12), 5 + v),
          service,
          fee,
          followUpDate: v === 0 && i % 4 === 0 ? dateMonthsAgo(0, 1) : undefined,
        });
        // Most visits are paid; every third one is left NOT_PAID so the Payments page has data.
        if ((i + v) % 3 !== 0) await setVisitPaymentStatus(tx, clinicId, visitId, "PAID");
      }
    }
    for (let m = 0; m < 12; m++) {
      await createTransaction(tx, clinicId, { kind: "expense", amount: 18000, category: "Rent", entryDate: dateMonthsAgo(m, 1) });
      await createTransaction(tx, clinicId, {
        kind: "expense",
        amount: 6000 + m * 150,
        category: "Medicines & herbs",
        entryDate: dateMonthsAgo(m, 10),
      });
    }
  });

  console.log("Seeded demo clinic with 40 demo patients.");
  console.log(`Demo sign-in: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
