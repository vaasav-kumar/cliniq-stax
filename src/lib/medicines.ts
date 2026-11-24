import type { Database } from "./db";
import { recordAudit } from "./audit";
import { ValidationError, optionalDate, optionalText, requireAmount, requireText, todayIso } from "./domain";

// Medicine stock, purchases and patient requests.
// Every function takes clinicId and filters on it.
// Stock goes up only through purchases and down only through dispensing; both are checked and saved in one transaction.

export const MEDICINE_EXPENSE_CATEGORY = "Medicines & herbs";

export function requireQuantity(value: unknown, field: string): number {
  const n = typeof value === "string" ? Number(value.trim()) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new ValidationError(`${field} must be a number greater than 0`);
  return round3(n);
}

export function optionalQuantity(value: unknown, field: string): number {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return 0;
  const n = typeof value === "string" ? Number(value.trim()) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new ValidationError(`${field} must be a number, 0 or more`);
  return round3(n);
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PurchaseInput = {
  name: unknown;
  unit?: unknown;
  quantity: unknown;
  unitCost: unknown;
  supplier?: unknown;
  purchaseDate?: unknown;
  reorderLevel?: unknown;
};

// Adds stock for a medicine (creating it if new) and books the cost as an expense.
export async function recordPurchase(db: Database, clinicId: number, userId: number, input: PurchaseInput): Promise<number> {
  const name = requireText(input.name, "Medicine name", 120);
  const unit = optionalText(input.unit, 20) ?? "unit";
  const quantity = requireQuantity(input.quantity, "Quantity");
  const unitCost = requireAmount(input.unitCost, "Unit cost");
  const supplier = optionalText(input.supplier, 120);
  const purchaseDate = optionalDate(input.purchaseDate, "Purchase date") ?? todayIso();
  const total = round2(quantity * unitCost);

  return db.tx(async (tx) => {
    let med = await tx.one<{ id: number; unit: string }>(
      "SELECT id, unit FROM medicines WHERE clinic_id = @clinicId AND lower(name) = lower(@name)",
      { clinicId, name },
    );
    if (!med) {
      med = await tx.one<{ id: number; unit: string }>(
        `INSERT INTO medicines (clinic_id, name, unit) VALUES (@clinicId, @name, @unit) RETURNING id, unit`,
        { clinicId, name, unit },
      );
    }
    await tx.query(
      "UPDATE medicines SET stock_qty = stock_qty + @quantity WHERE id = @id AND clinic_id = @clinicId",
      { quantity, id: med!.id, clinicId },
    );
    if (input.reorderLevel !== undefined) {
      const reorder = optionalQuantity(input.reorderLevel, "Reorder level");
      await tx.query("UPDATE medicines SET reorder_level = @reorder WHERE id = @id AND clinic_id = @clinicId", {
        reorder,
        id: med!.id,
        clinicId,
      });
    }
    await tx.query(
      `INSERT INTO medicine_purchases (clinic_id, medicine_id, quantity, unit_cost, total_cost, supplier, purchase_date)
       VALUES (@clinicId, @medicineId, @quantity, @unitCost, @total, @supplier, @purchaseDate)`,
      { clinicId, medicineId: med!.id, quantity, unitCost, total, supplier, purchaseDate },
    );
    if (total > 0) {
      await tx.query(
        `INSERT INTO transactions (clinic_id, kind, amount, category, description, entry_date)
         VALUES (@clinicId, 'expense', @total, @category, @description, @purchaseDate)`,
        {
          clinicId,
          total,
          category: MEDICINE_EXPENSE_CATEGORY,
          description: `Medicine purchase: ${name} (${quantity} ${med!.unit})${supplier ? ` from ${supplier}` : ""}`,
          purchaseDate,
        },
      );
    }
    await recordAudit(tx, clinicId, userId, "medicine.purchase", `${name} x${quantity} = ${total}`);
    return med!.id;
  });
}

export type MedicineRow = {
  id: number;
  name: string;
  unit: string;
  stock_qty: number;
  reorder_level: number;
  requested_qty: number;
};

export async function listMedicines(db: Database, clinicId: number): Promise<MedicineRow[]> {
  return db.query<MedicineRow>(
    `SELECT m.id, m.name, m.unit, m.stock_qty, m.reorder_level,
       COALESCE((SELECT SUM(r.quantity) FROM medicine_requests r
                 WHERE r.medicine_id = m.id AND r.clinic_id = m.clinic_id AND r.status = 'requested'), 0) AS requested_qty
     FROM medicines m WHERE m.clinic_id = @clinicId ORDER BY lower(m.name)`,
    { clinicId },
  );
}

export async function createRequest(
  db: Database,
  clinicId: number,
  input: { patientId: number; medicineId: number; quantity: unknown; notes?: unknown },
): Promise<number> {
  const quantity = requireQuantity(input.quantity, "Quantity");
  const notes = optionalText(input.notes, 300);
  const patient = await db.one<{ id: number }>("SELECT id FROM patients WHERE id = @id AND clinic_id = @clinicId", {
    id: input.patientId,
    clinicId,
  });
  if (!patient) throw new ValidationError("Patient not found");
  const med = await db.one<{ id: number }>("SELECT id FROM medicines WHERE id = @id AND clinic_id = @clinicId", {
    id: input.medicineId,
    clinicId,
  });
  if (!med) throw new ValidationError("Medicine not found");
  const row = await db.one<{ id: number }>(
    `INSERT INTO medicine_requests (clinic_id, patient_id, medicine_id, quantity, notes)
     VALUES (@clinicId, @patientId, @medicineId, @quantity, @notes) RETURNING id`,
    { clinicId, patientId: input.patientId, medicineId: input.medicineId, quantity, notes },
  );
  return row!.id;
}

export type RequestRow = {
  id: number;
  patient_id: number;
  medicine_id: number;
  medicine_name: string;
  unit: string;
  quantity: number;
  status: "requested" | "dispensed" | "cancelled";
  notes: string | null;
  requested_on: string;
  dispensed_on: string | null;
  stock_qty: number;
};

export async function listRequestsForPatient(db: Database, clinicId: number, patientId: number): Promise<RequestRow[]> {
  return db.query<RequestRow>(
    `SELECT r.id, r.patient_id, r.medicine_id, m.name AS medicine_name, m.unit, r.quantity, r.status, r.notes,
            r.requested_on, r.dispensed_on, m.stock_qty
     FROM medicine_requests r JOIN medicines m ON m.id = r.medicine_id AND m.clinic_id = r.clinic_id
     WHERE r.clinic_id = @clinicId AND r.patient_id = @patientId
     ORDER BY r.requested_on DESC, r.id DESC`,
    { clinicId, patientId },
  );
}

// Hands a requested medicine to the patient. Fails (and changes nothing) if stock is short.
export async function dispenseRequest(db: Database, clinicId: number, userId: number, requestId: number): Promise<void> {
  await db.tx(async (tx) => {
    const req = await tx.one<{ id: number; status: string; quantity: number; medicine_id: number; patient_id: number }>(
      "SELECT id, status, quantity, medicine_id, patient_id FROM medicine_requests WHERE id = @requestId AND clinic_id = @clinicId FOR UPDATE",
      { requestId, clinicId },
    );
    if (!req) throw new ValidationError("Request not found");
    if (req.status !== "requested") throw new ValidationError("This request is already closed");
    const med = await tx.one<{ name: string; unit: string; stock_qty: number }>(
      "SELECT name, unit, stock_qty FROM medicines WHERE id = @medicineId AND clinic_id = @clinicId FOR UPDATE",
      { medicineId: req.medicine_id, clinicId },
    );
    if (!med) throw new ValidationError("Medicine not found");
    if (med.stock_qty < req.quantity) {
      throw new ValidationError(`Only ${med.stock_qty} ${med.unit} of ${med.name} in stock, ${req.quantity} needed`);
    }
    await tx.query("UPDATE medicines SET stock_qty = stock_qty - @quantity WHERE id = @medicineId AND clinic_id = @clinicId", {
      quantity: req.quantity,
      medicineId: req.medicine_id,
      clinicId,
    });
    await tx.query(
      "UPDATE medicine_requests SET status = 'dispensed', dispensed_on = CURRENT_DATE WHERE id = @requestId AND clinic_id = @clinicId",
      { requestId, clinicId },
    );
    await recordAudit(tx, clinicId, userId, "medicine.dispensed", `request #${requestId}: ${med.name} x${req.quantity}`);
  });
}

export async function cancelRequest(db: Database, clinicId: number, userId: number, requestId: number): Promise<void> {
  const row = await db.one<{ id: number }>(
    "UPDATE medicine_requests SET status = 'cancelled' WHERE id = @requestId AND clinic_id = @clinicId AND status = 'requested' RETURNING id",
    { requestId, clinicId },
  );
  if (!row) throw new ValidationError("Request not found or already closed");
  await recordAudit(db, clinicId, userId, "medicine.request_cancelled", `request #${requestId}`);
}

export type BatchItem = {
  medicine_id: number;
  name: string;
  unit: string;
  stock_qty: number;
  reorder_level: number;
  requested_qty: number;
  to_order: number;
  patients: string[];
};

// What to buy in the next batch: open patient requests the shelf cannot cover, plus anything below its reorder level.
export async function nextBatch(db: Database, clinicId: number): Promise<BatchItem[]> {
  const meds = await listMedicines(db, clinicId);
  const open = await db.query<{ medicine_id: number; patient_name: string }>(
    `SELECT r.medicine_id, p.name AS patient_name
     FROM medicine_requests r JOIN patients p ON p.id = r.patient_id AND p.clinic_id = r.clinic_id
     WHERE r.clinic_id = @clinicId AND r.status = 'requested'
     ORDER BY p.name`,
    { clinicId },
  );
  const items: BatchItem[] = [];
  for (const m of meds) {
    const fromRequests = Math.max(0, m.requested_qty - m.stock_qty);
    const belowReorder = m.reorder_level > 0 && m.stock_qty < m.reorder_level ? m.reorder_level - m.stock_qty : 0;
    const toOrder = round3(Math.max(fromRequests, belowReorder));
    if (toOrder <= 0) continue;
    items.push({
      medicine_id: m.id,
      name: m.name,
      unit: m.unit,
      stock_qty: m.stock_qty,
      reorder_level: m.reorder_level,
      requested_qty: m.requested_qty,
      to_order: toOrder,
      patients: [...new Set(open.filter((o) => o.medicine_id === m.id).map((o) => o.patient_name))],
    });
  }
  return items.sort((a, b) => b.to_order - a.to_order);
}
