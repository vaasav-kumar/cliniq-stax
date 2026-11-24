import Link from "next/link";
import ImportForm from "@/components/ImportForm";
import { importCsv } from "../actions";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function CsvImportPage() {
  const user = await requireUser();
  if (!can(user.role, "patients:write")) return <p className="muted">You do not have access to add patients.</p>;
  return (
    <>
      <h1>Bulk import from CSV</h1>
      <div className="card" style={{ maxWidth: 820 }}>
        <p>
          Download the <a href="/samples/patients-sample.csv" download>sample CSV file</a> and fill in one patient per row.
        </p>
        <h2>Columns</h2>
        <table>
          <tbody>
            <tr><th>name *</th><td>Full name</td></tr>
            <tr><th>phone *</th><td>10-digit mobile number</td></tr>
            <tr><th>reached_via *</th><td>Google Search, Instagram, Facebook, Website, Walk-in, Phone call, Doctor referral, Patient referral, Other</td></tr>
            <tr><th>email, gender, address_line, area, city, pincode, referred_by, notes</th><td>Optional</td></tr>
            <tr><th>date_of_birth</th><td>Optional, YYYY-MM-DD</td></tr>
            <tr><th>registered_on</th><td>Optional, YYYY-MM-DD. Leave empty for today</td></tr>
          </tbody>
        </table>
        <p className="muted">Phone numbers must be unique in the file and must not already belong to a patient. If any row has a problem, nothing is saved.</p>
        <ImportForm action={importCsv} accept=".csv,text/csv" submitLabel="Check and import" />
      </div>
      <p className="section"><Link href="/patients/import">← Back</Link></p>
    </>
  );
}
