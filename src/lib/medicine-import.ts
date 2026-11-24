// Medicine list import (CSV). Same rules as the patient import: validate every row, save all or nothing.
// A row with a quantity is a purchase: it adds stock and books the cost as an expense. A row without quantity just adds the medicine.
import type { Database } from "./db";
import { ValidationError, optionalText } from "./domain";
import { ImportError, type ImportRowError } from "./import";
import { recordPurchase, optionalQuantity, requireQuantity, round2 } from "./medicines";

export const MEDICINE_IMPORT_MAX_ROWS = 500;

const COLUMN_ALIASES: Record<string, string> = {
  name: "name",
  medicine: "name",
  medicine_name: "name",
  unit: "unit",
  quantity: "quantity",
  qty: "quantity",
  stock: "quantity",
  unit_cost: "unitCost",
  cost: "unitCost",
  price: "unitCost",
  reorder_level: "reorderLevel",
  reorder: "reorderLevel",
  supplier: "supplier",
  purchase_date: "purchaseDate",
  date: "purchaseDate",
};

export type MedicineRowInput = {
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  reorderLevel: number;
  supplier: string | null;
  purchaseDate: string | undefined;
};

// Checks every row and returns all problems together (with row numbers), or the clean rows.
export function tableToMedicineRows(table: string[][]): MedicineRowInput[] {
  if (table.length < 2) throw new ImportError([{ row: 1, message: "The file needs a header row and at least one medicine" }]);
  const errors: ImportRowError[] = [];
  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const fields = headers.map((h) => {
    const f = COLUMN_ALIASES[h];
    if (!f) errors.push({ row: 1, message: `Unknown column "${h}"` });
    return f ?? null;
  });
  if (!fields.includes("name")) errors.push({ row: 1, message: "Missing required column: name" });
  if (errors.length) throw new ImportError(errors);
  const dataRows = table.slice(1);
  if (dataRows.length > MEDICINE_IMPORT_MAX_ROWS) {
    throw new ImportError([{ row: 1, message: `A file can hold at most ${MEDICINE_IMPORT_MAX_ROWS} medicines` }]);
  }

  const rows: MedicineRowInput[] = [];
  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const get: Record<string, string> = {};
    fields.forEach((f, col) => {
      if (f) get[f] = (cells[col] ?? "").trim();
    });
    try {
      if (!get.name) throw new ValidationError("Medicine name is required");
      const quantity = optionalQuantity(get.quantity, "Quantity");
      const unitCost = get.unitCost ? Number(get.unitCost) : NaN;
      if (quantity > 0) {
        if (!get.unitCost || !Number.isFinite(unitCost) || unitCost < 0) {
          throw new ValidationError("Unit cost is required when a quantity is given");
        }
      }
      const reorderLevel = optionalQuantity(get.reorderLevel, "Reorder level");
      const purchaseDate = get.purchaseDate || undefined;
      if (purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw new ValidationError("Purchase date must be YYYY-MM-DD");
      rows.push({
        name: get.name,
        unit: optionalText(get.unit, 20) ?? "unit",
        quantity,
        unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? round2(unitCost) : 0,
        reorderLevel,
        supplier: optionalText(get.supplier, 120),
        purchaseDate,
      });
    } catch (e) {
      if (e instanceof ValidationError) errors.push({ row: rowNumber, message: e.message });
      else throw e;
    }
  });
  if (errors.length) throw new ImportError(errors);
  return rows;
}

// Saves every medicine row in one transaction. Returns how many rows were saved.
export async function importMedicines(db: Database, clinicId: number, userId: number, table: string[][]): Promise<number> {
  const rows = tableToMedicineRows(table);
  return db.tx(async (tx) => {
    for (const row of rows) {
      if (row.quantity > 0) {
        await recordPurchase(tx, clinicId, userId, {
          name: row.name,
          unit: row.unit,
          quantity: requireQuantity(row.quantity, "Quantity"),
          unitCost: row.unitCost,
          supplier: row.supplier,
          purchaseDate: row.purchaseDate,
          reorderLevel: row.reorderLevel,
        });
      } else {
        // Catalogue entry with no stock yet: add it if new, otherwise update its reorder level.
        const existing = await tx.one<{ id: number }>(
          "SELECT id FROM medicines WHERE clinic_id = @clinicId AND lower(name) = lower(@name)",
          { clinicId, name: row.name },
        );
        if (existing) {
          await tx.query("UPDATE medicines SET reorder_level = @reorder WHERE id = @id", { reorder: row.reorderLevel, id: existing.id });
        } else {
          await tx.query(
            "INSERT INTO medicines (clinic_id, name, unit, reorder_level) VALUES (@clinicId, @name, @unit, @reorder)",
            { clinicId, name: row.name, unit: row.unit, reorder: row.reorderLevel },
          );
        }
      }
    }
    return rows.length;
  });
}
