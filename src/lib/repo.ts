import type { Database } from "./db";
import {
  type PaymentStatus,
  type VisitStatus,
  ValidationError,
  normalizePhone,
  optionalDate,
  optionalText,
  requireAmount,
  requireDate,
  requireOption,
  requireText,
  REACH_SOURCES,
  SERVICES,
  VISIT_STATUSES,
  PAYMENT_STATUSES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  todayIso,
} from "./domain";

// Every function takes clinicId and filters on it. Never call these with an id from the URL alone:
// a patient or visit id from another clinic must look like "not found".

export type PatientInput = {
  name: unknown;
  phone: unknown;
  email?: unknown;
  dateOfBirth?: unknown;
  gender?: unknown;
  addressLine?: unknown;
  isApartment?: unknown;
  apartmentName?: unknown;
  doorNumber?: unknown;
  area?: unknown;
  city?: unknown;
  pincode?: unknown;
  reachedVia: unknown;
  referredBy?: unknown;
  notes?: unknown;
  registeredOn?: unknown;
};

// Accepts a checkbox value ("on") or yes/no words from a CSV file.
function parseFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return typeof value === "string" && ["on", "true", "yes", "y", "1"].includes(value.trim().toLowerCase());
}

export function parsePatient(input: PatientInput) {
  const pincode = optionalText(input.pincode, 6);
  // Apartment name and door number are required only when the apartment box is checked.
  const isApartment = parseFlag(input.isApartment);
  const apartmentName = isApartment ? requireText(input.apartmentName, "Apartment name", 120) : null;
  const doorNumber = isApartment ? requireText(input.doorNumber, "Door number", 30) : null;
  if (pincode && !/^\d{6}$/.test(pincode)) throw new ValidationError("Pincode must be 6 digits");
  const email = optionalText(input.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("Email looks invalid");
  return {
    name: requireText(input.name, "Name", 120),
    phone: normalizePhone(input.phone),
    email,
    date_of_birth: optionalDate(input.dateOfBirth, "Date of birth"),
    gender: optionalText(input.gender, 20),
    is_apartment: isApartment,
    apartment_name: apartmentName,
    door_number: doorNumber,
    address_line: optionalText(input.addressLine, 200),
    area: optionalText(input.area, 100),
    city: optionalText(input.city, 100) ?? "Chennai",
    pincode,
    reached_via: requireOption(input.reachedVia, REACH_SOURCES, "Where the patient reached out from"),
    referred_by: optionalText(input.referredBy, 120),
    notes: optionalText(input.notes, 2000),
    registered_on: optionalDate(input.registeredOn, "Registered on") ?? todayIso(),
  };
}

export async function createPatient(db: Database, clinicId: number, input: PatientInput): Promise<number> {
  const p = parsePatient(input);
  const row = await db.one<{ id: number }>(
    `INSERT INTO patients (clinic_id, name, phone, email, date_of_birth, gender, is_apartment, apartment_name, door_number,
                           address_line, area, city, pincode, reached_via, referred_by, notes, registered_on)
     VALUES (@clinic_id, @name, @phone, @email, @date_of_birth, @gender, @is_apartment, @apartment_name, @door_number,
             @address_line, @area, @city, @pincode, @reached_via, @referred_by, @notes, @registered_on)
     RETURNING id`,
    { ...p, clinic_id: clinicId },
  );
  return row!.id;
}

export type PatientRow = {
  id: number;
  clinic_id: number;
  name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  is_apartment: boolean;
  apartment_name: string | null;
  door_number: string | null;
  address_line: string | null;
  area: string | null;
  city: string;
  pincode: string | null;
  reached_via: string;
  referred_by: string | null;
  notes: string | null;
  registered_on: string;
  created_at: string;
  completed_visits?: number;
  last_visit?: string | null;
};

export async function listPatients(db: Database, clinicId: number, opts: { q?: string; source?: string } = {}) {
  const where: string[] = ["p.clinic_id = @clinicId"];
  const params: Record<string, unknown> = { clinicId };
  if (opts.q && opts.q.trim()) {
    where.push("(p.name ILIKE @q OR p.phone LIKE @q)");
    params.q = `%${opts.q.trim().slice(0, 60)}%`;
  }
  if (opts.source && (REACH_SOURCES as readonly string[]).includes(opts.source)) {
    where.push("p.reached_via = @source");
    params.source = opts.source;
  }
  return db.query<PatientRow>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.id AND v.status = 'completed') AS completed_visits,
       (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id AND v.status = 'completed') AS last_visit
     FROM patients p
     WHERE ${where.join(" AND ")}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 500`,
    params,
  );
}

export async function getPatient(db: Database, clinicId: number, id: number): Promise<PatientRow | undefined> {
  return db.one<PatientRow>("SELECT * FROM patients WHERE id = @id AND clinic_id = @clinicId", { id, clinicId });
}

export type VisitInput = {
  patientId: number;
  visitDate: unknown;
  service: unknown;
  status?: unknown;
  fee?: unknown;
  paymentStatus?: unknown;
  notes?: unknown;
  followUpDate?: unknown;
};

export async function createVisit(db: Database, clinicId: number, input: VisitInput): Promise<number> {
  const status: VisitStatus =
    input.status === undefined ? "completed" : requireOption(input.status, VISIT_STATUSES, "Status");
  const fee = input.fee === undefined || input.fee === "" ? 0 : requireAmount(input.fee, "Fee");
  const paymentStatus: PaymentStatus =
    input.paymentStatus === undefined || input.paymentStatus === ""
      ? "NOT_PAID"
      : requireOption(input.paymentStatus, PAYMENT_STATUSES, "Payment status");
  const visitDate = requireDate(input.visitDate, "Visit date");
  const followUpDate = optionalDate(input.followUpDate, "Follow-up date");
  const service = requireOption(input.service, SERVICES, "Service");

  return db.tx(async (tx) => {
    const patient = await getPatient(tx, clinicId, input.patientId);
    if (!patient) throw new ValidationError("Patient not found");
    const row = await tx.one<{ id: number }>(
      `INSERT INTO visits (clinic_id, patient_id, visit_date, service, status, fee, notes, follow_up_date,
                           payment_status, paid_at)
       VALUES (@clinicId, @patientId, @visitDate, @service, @status, @fee, @notes, @followUpDate,
               'NOT_PAID', NULL)
       RETURNING id`,
      {
        clinicId,
        patientId: patient.id,
        visitDate,
        service,
        status,
        fee,
        notes: optionalText(input.notes, 2000),
        followUpDate,
      },
    );
    const visitId = row!.id;
    if (paymentStatus === "PAID") {
      await applyPaid(tx, clinicId, visitId);
    }
    return visitId;
  });
}

// Marks a visit PAID or NOT_PAID. PAID books the fee as income; NOT_PAID removes that income again.
// Returns false when the visit is not in this clinic.
export async function setVisitPaymentStatus(
  db: Database,
  clinicId: number,
  visitId: number,
  status: unknown,
): Promise<boolean> {
  const target = requireOption(status, PAYMENT_STATUSES, "Payment status");
  return db.tx(async (tx) => {
    const visit = await tx.one<{ id: number; payment_status: PaymentStatus }>(
      "SELECT id, payment_status FROM visits WHERE id = @visitId AND clinic_id = @clinicId FOR UPDATE",
      { visitId, clinicId },
    );
    if (!visit) return false;
    if (visit.payment_status === target) return true;
    if (target === "PAID") {
      await applyPaid(tx, clinicId, visitId);
    } else {
      await tx.query(
        "DELETE FROM transactions WHERE visit_id = @visitId AND clinic_id = @clinicId AND kind = 'income'",
        { visitId, clinicId },
      );
      await tx.query(
        "UPDATE visits SET payment_status = 'NOT_PAID', paid_at = NULL WHERE id = @visitId AND clinic_id = @clinicId",
        { visitId, clinicId },
      );
    }
    return true;
  });
}

async function applyPaid(db: Database, clinicId: number, visitId: number): Promise<void> {
  const visit = await db.one<{ fee: number; service: string; visit_date: string; patient_id: number; name: string }>(
    `SELECT v.fee, v.service, v.visit_date, v.patient_id, p.name
     FROM visits v JOIN patients p ON p.id = v.patient_id AND p.clinic_id = v.clinic_id
     WHERE v.id = @visitId AND v.clinic_id = @clinicId`,
    { visitId, clinicId },
  );
  if (!visit) throw new ValidationError("Visit not found");
  await db.query(
    "UPDATE visits SET payment_status = 'PAID', paid_at = now() WHERE id = @visitId AND clinic_id = @clinicId",
    { visitId, clinicId },
  );
  // Only book income once: remove any earlier entry for this visit first.
  await db.query(
    "DELETE FROM transactions WHERE visit_id = @visitId AND clinic_id = @clinicId AND kind = 'income'",
    { visitId, clinicId },
  );
  if (visit.fee > 0) {
    await db.query(
      `INSERT INTO transactions (clinic_id, kind, amount, category, description, entry_date, patient_id, visit_id)
       VALUES (@clinicId, 'income', @amount, @category, @description, @entryDate, @patientId, @visitId)`,
      {
        clinicId,
        amount: visit.fee,
        category: incomeCategoryFor(visit.service),
        description: `${visit.service} - ${visit.name}`,
        entryDate: visit.visit_date,
        patientId: visit.patient_id,
        visitId,
      },
    );
  }
}

function incomeCategoryFor(service: string): string {
  if (service.includes("Panchakarma")) return "Panchakarma";
  if (service.includes("Pain")) return "Pain care";
  if (service.includes("Women")) return "Women's health";
  return "Consultation";
}

export type VisitRow = {
  id: number;
  patient_id: number;
  visit_date: string;
  service: string;
  status: string;
  fee: number;
  payment_status: PaymentStatus;
  paid_at: Date | null;
  notes: string | null;
  follow_up_date: string | null;
  follow_up_done: boolean;
};

export async function listVisitsForPatient(db: Database, clinicId: number, patientId: number): Promise<VisitRow[]> {
  return db.query<VisitRow>(
    `SELECT * FROM visits WHERE patient_id = @patientId AND clinic_id = @clinicId
     ORDER BY visit_date DESC, id DESC`,
    { patientId, clinicId },
  );
}

export async function markFollowUpDone(db: Database, clinicId: number, visitId: number): Promise<void> {
  await db.query("UPDATE visits SET follow_up_done = true WHERE id = @visitId AND clinic_id = @clinicId", { visitId, clinicId });
}

export type FollowUpRow = VisitRow & { patient_name: string; patient_phone: string };

// Follow-ups due today or overdue and not yet done.
export async function dueFollowUps(db: Database, clinicId: number, asOf: string): Promise<FollowUpRow[]> {
  return db.query<FollowUpRow>(
    `SELECT v.*, p.name AS patient_name, p.phone AS patient_phone
     FROM visits v JOIN patients p ON p.id = v.patient_id AND p.clinic_id = v.clinic_id
     WHERE v.clinic_id = @clinicId AND v.follow_up_date IS NOT NULL AND v.follow_up_done = false
       AND v.follow_up_date <= @asOf
     ORDER BY v.follow_up_date ASC LIMIT 200`,
    { clinicId, asOf },
  );
}

export type UnpaidRow = {
  id: number;
  patient_id: number;
  visit_date: string;
  service: string;
  fee: number;
  patient_name: string;
  patient_phone: string;
};

// Completed visits that are NOT_PAID and have a fee. Optionally limited to a period.
export async function listUnpaidVisits(db: Database, clinicId: number, period?: Period): Promise<UnpaidRow[]> {
  const range = period ? " AND v.visit_date BETWEEN @from AND @to" : "";
  return db.query<UnpaidRow>(
    `SELECT v.id, v.patient_id, v.visit_date, v.service, v.fee, p.name AS patient_name, p.phone AS patient_phone
     FROM visits v JOIN patients p ON p.id = v.patient_id AND p.clinic_id = v.clinic_id
     WHERE v.clinic_id = @clinicId AND v.status = 'completed' AND v.payment_status = 'NOT_PAID' AND v.fee > 0${range}
     ORDER BY v.visit_date DESC, v.id DESC LIMIT 500`,
    { clinicId, from: period?.from, to: period?.to },
  );
}

export type TransactionInput = {
  kind: unknown;
  amount: unknown;
  category: unknown;
  description?: unknown;
  entryDate: unknown;
};

export async function createTransaction(db: Database, clinicId: number, input: TransactionInput): Promise<number> {
  const kind = requireOption(input.kind, ["income", "expense"] as const, "Type");
  const categories: readonly string[] = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const category = requireOption(input.category, categories, "Category");
  const row = await db.one<{ id: number }>(
    `INSERT INTO transactions (clinic_id, kind, amount, category, description, entry_date)
     VALUES (@clinicId, @kind, @amount, @category, @description, @entryDate) RETURNING id`,
    {
      clinicId,
      kind,
      amount: requireAmount(input.amount, "Amount"),
      category,
      description: optionalText(input.description, 300),
      entryDate: requireDate(input.entryDate, "Date"),
    },
  );
  return row!.id;
}

export type Period = { from: string; to: string };

export function defaultPeriod(asOf: string = todayIso()): Period {
  // Last 12 months, from the first day of the month 11 months back.
  const [y, m] = asOf.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 - 11, 1));
  return { from: start.toISOString().slice(0, 10), to: asOf };
}

export type Dashboard = {
  period: Period;
  totals: {
    income: number;
    expense: number;
    net: number;
    unpaid: number;
    patients: number;
    repeatPatients: number;
    visits: number;
  };
  monthly: { month: string; income: number; expense: number; newPatients: number; visits: number }[];
  bySource: { source: string; patients: number }[];
  byService: { service: string; income: number }[];
  expenseByCategory: { category: string; amount: number }[];
  followUpsDue: number;
};

export async function buildDashboard(db: Database, clinicId: number, period: Period = defaultPeriod()): Promise<Dashboard> {
  const p = { c: clinicId, from: period.from, to: period.to };

  const sums = await db.one<{ income: number; expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'income' THEN amount END), 0) AS income,
       COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount END), 0) AS expense
     FROM transactions WHERE clinic_id = @c AND entry_date BETWEEN @from AND @to`,
    p,
  );

  const unpaid = await db.one<{ total: number }>(
    `SELECT COALESCE(SUM(fee), 0) AS total FROM visits
     WHERE clinic_id = @c AND status = 'completed' AND payment_status = 'NOT_PAID' AND visit_date BETWEEN @from AND @to`,
    p,
  );

  const patients = await db.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM patients WHERE clinic_id = @c AND registered_on BETWEEN @from AND @to`,
    p,
  );

  const visits = await db.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM visits WHERE clinic_id = @c AND status = 'completed' AND visit_date BETWEEN @from AND @to`,
    p,
  );

  // Patients with 2+ completed visits in the period, counted once each.
  const repeat = await db.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT patient_id FROM visits
       WHERE clinic_id = @c AND status = 'completed' AND visit_date BETWEEN @from AND @to
       GROUP BY patient_id HAVING COUNT(*) >= 2) AS r`,
    p,
  );

  const monthsIncome = await db.query<{ month: string; income: number; expense: number }>(
    `SELECT to_char(entry_date, 'YYYY-MM') AS month,
       COALESCE(SUM(CASE WHEN kind = 'income' THEN amount END), 0) AS income,
       COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount END), 0) AS expense
     FROM transactions WHERE clinic_id = @c AND entry_date BETWEEN @from AND @to
     GROUP BY to_char(entry_date, 'YYYY-MM')`,
    p,
  );

  const monthsPatients = await db.query<{ month: string; n: number }>(
    `SELECT to_char(registered_on, 'YYYY-MM') AS month, COUNT(*) AS n FROM patients
     WHERE clinic_id = @c AND registered_on BETWEEN @from AND @to
     GROUP BY to_char(registered_on, 'YYYY-MM')`,
    p,
  );

  const monthsVisits = await db.query<{ month: string; n: number }>(
    `SELECT to_char(visit_date, 'YYYY-MM') AS month, COUNT(*) AS n FROM visits
     WHERE clinic_id = @c AND status = 'completed' AND visit_date BETWEEN @from AND @to
     GROUP BY to_char(visit_date, 'YYYY-MM')`,
    p,
  );

  const bySource = await db.query<{ source: string; patients: number }>(
    `SELECT reached_via AS source, COUNT(*) AS patients FROM patients
     WHERE clinic_id = @c AND registered_on BETWEEN @from AND @to
     GROUP BY reached_via ORDER BY patients DESC`,
    p,
  );

  const byService = await db.query<{ service: string; income: number }>(
    `SELECT category AS service, COALESCE(SUM(amount), 0) AS income FROM transactions
     WHERE clinic_id = @c AND kind = 'income' AND entry_date BETWEEN @from AND @to
     GROUP BY category ORDER BY income DESC`,
    p,
  );

  const expenseByCategory = await db.query<{ category: string; amount: number }>(
    `SELECT category, COALESCE(SUM(amount), 0) AS amount FROM transactions
     WHERE clinic_id = @c AND kind = 'expense' AND entry_date BETWEEN @from AND @to
     GROUP BY category ORDER BY amount DESC`,
    p,
  );

  const due = await db.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM visits
     WHERE clinic_id = @c AND follow_up_date IS NOT NULL AND follow_up_done = false AND follow_up_date <= @today`,
    { c: clinicId, today: todayIso() },
  );

  // Continuous month list so charts have no gaps.
  const monthly = monthRange(period.from, period.to).map((month) => ({
    month,
    income: monthsIncome.find((m) => m.month === month)?.income ?? 0,
    expense: monthsIncome.find((m) => m.month === month)?.expense ?? 0,
    newPatients: monthsPatients.find((m) => m.month === month)?.n ?? 0,
    visits: monthsVisits.find((m) => m.month === month)?.n ?? 0,
  }));

  return {
    period,
    totals: {
      income: sums!.income,
      expense: sums!.expense,
      net: sums!.income - sums!.expense,
      unpaid: unpaid!.total,
      patients: patients!.n,
      repeatPatients: repeat!.n,
      visits: visits!.n,
    },
    monthly,
    bySource,
    byService,
    expenseByCategory,
    followUpsDue: due!.n,
  };
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export type TransactionRowX = {
  id: number;
  kind: "income" | "expense";
  amount: number;
  category: string;
  description: string | null;
  entry_date: string;
  patient_name: string | null;
};

export async function listTransactions(db: Database, clinicId: number, period: Period): Promise<TransactionRowX[]> {
  return db.query<TransactionRowX>(
    `SELECT t.id, t.kind, t.amount, t.category, t.description, t.entry_date, p.name AS patient_name
     FROM transactions t
     LEFT JOIN patients p ON p.id = t.patient_id AND p.clinic_id = t.clinic_id
     WHERE t.clinic_id = @c AND t.entry_date BETWEEN @from AND @to
     ORDER BY t.entry_date DESC, t.id DESC LIMIT 500`,
    { c: clinicId, from: period.from, to: period.to },
  );
}
