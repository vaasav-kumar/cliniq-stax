import Link from "next/link";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function AddPatientChooser() {
  const user = await requireUser();
  if (!can(user.role, "patients:write")) return <p className="muted">You do not have access to add patients.</p>;
  return (
    <>
      <h1>Add patients</h1>
      <div className="grid grid-2">
        <Link href="/patients/new" style={{ color: "inherit" }}>
          <div className="card">
            <h2>1. Add manually</h2>
            <p className="muted">Type in one patient at a time using the form.</p>
          </div>
        </Link>
        <Link href="/patients/import" style={{ color: "inherit" }}>
          <div className="card">
            <h2>2. Bulk import</h2>
            <p className="muted">Upload a CSV file or a photo of a patient list. The whole file is checked before anything is saved.</p>
          </div>
        </Link>
      </div>
      <p className="section"><Link href="/patients">← Back to patients</Link></p>
    </>
  );
}
