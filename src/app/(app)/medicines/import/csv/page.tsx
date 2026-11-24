import Link from "next/link";
import ImportForm from "@/components/ImportForm";
import { importMedicinesCsv } from "../actions";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function MedicineCsvPage() {
  const user = await requireUser();
  if (!can(user.role, "inventory:write")) return <p className="muted">You do not have access to import medicines.</p>;
  return (
    <>
      <h1>Import medicines from CSV</h1>
      <div className="card" style={{ maxWidth: 820 }}>
        <p>Download the <a href="/samples/medicines-sample.csv" download>sample medicine CSV</a> and fill in one medicine per row.</p>
        <table>
          <tbody>
            <tr><th>name *</th><td>Medicine name (existing names add to the stock)</td></tr>
            <tr><th>quantity</th><td>Quantity bought. Leave empty or 0 to just add the medicine</td></tr>
            <tr><th>unit_cost</th><td>Cost per unit in ₹. Required when quantity is given</td></tr>
            <tr><th>unit</th><td>tablets, bottles, g, etc. Default: unit</td></tr>
            <tr><th>reorder_level</th><td>Order again when stock falls below this</td></tr>
            <tr><th>supplier, purchase_date</th><td>Optional. purchase_date as YYYY-MM-DD, default today</td></tr>
          </tbody>
        </table>
        <p className="muted">If any row has a problem, nothing is saved.</p>
        <ImportForm action={importMedicinesCsv} accept=".csv,text/csv" submitLabel="Check and import" />
      </div>
      <p className="section"><Link href="/medicines/import">← Back</Link></p>
    </>
  );
}
