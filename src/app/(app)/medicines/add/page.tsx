import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { recordPurchaseAction } from "../actions";
import { getDb } from "@/lib/db";
import { listMedicines } from "@/lib/medicines";
import { todayIso } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function AddMedicinesPage() {
  const user = await requireUser();
  if (!can(user.role, "inventory:write")) return <p className="muted">You do not have access to add medicines.</p>;
  const existing = await listMedicines(getDb(), user.clinicId);
  return (
    <>
      <h1>Add medicines</h1>
      <div className="grid grid-2">
        <div className="card">
          <h2>Record a purchase</h2>
          <p className="muted">Adds the quantity to stock and books the cost as a medicine expense.</p>
          <ActionForm action={recordPurchaseAction} submitLabel="Save purchase">
            <label>Medicine name *
              <input name="name" required maxLength={120} list="medicine-names" />
              <datalist id="medicine-names">
                {existing.map((m) => <option key={m.id} value={m.name} />)}
              </datalist>
            </label>
            <div className="form-grid">
              <label>Quantity *<input name="quantity" type="number" min="0.001" step="any" required /></label>
              <label>Unit<input name="unit" defaultValue="unit" maxLength={20} placeholder="tablets, bottles, g" /></label>
              <label>Cost per unit (₹) *<input name="unitCost" type="number" min="0" step="0.01" required /></label>
              <label>Purchase date<input name="purchaseDate" type="date" max={todayIso()} defaultValue={todayIso()} /></label>
              <label>Supplier<input name="supplier" maxLength={120} /></label>
              <label>Reorder when below<input name="reorderLevel" type="number" min="0" step="any" /></label>
            </div>
          </ActionForm>
        </div>
        <div className="card">
          <h2>Import a list</h2>
          <p className="muted">Upload a CSV or a photo of a medicine list. Every row is checked before anything is saved.</p>
          <Link href="/medicines/import"><button type="button" className="secondary">Import medicines</button></Link>
        </div>
      </div>
      <p className="section"><Link href="/medicines">← Back to inventory</Link></p>
    </>
  );
}
