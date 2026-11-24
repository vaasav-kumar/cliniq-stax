"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { MedicineActionState } from "@/app/(app)/medicines/actions";

type Action = (prev: MedicineActionState, form: FormData) => Promise<MedicineActionState>;

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Saving..." : "Add request"}</button>;
}

// Form to add a patient's medicine request. Shows validation errors inline.
export default function MedicineRequestForm({
  action,
  medicines,
}: {
  action: Action;
  medicines: { id: number; name: string; unit: string }[];
}) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className="stack">
      <div className="form-grid">
        <label>Medicine *
          <select name="medicineId" required defaultValue="">
            <option value="" disabled>Choose medicine</option>
            {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
          </select>
        </label>
        <label>Quantity *<input name="quantity" type="number" min="0.001" step="any" required /></label>
        <label>Notes<input name="notes" maxLength={300} placeholder="Dosage, duration" /></label>
      </div>
      <Submit />
      {state.error ? <p className="error">{state.error}</p> : null}
      {state.ok ? <p className="muted">Request added. It appears on the next batch list if stock is short.</p> : null}
    </form>
  );
}
