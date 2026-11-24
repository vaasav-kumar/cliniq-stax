import Link from "next/link";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function BulkImportChooser() {
  const user = await requireUser();
  if (!can(user.role, "patients:write")) return <p className="muted">You do not have access to add patients.</p>;
  return (
    <>
      <h1>Bulk import</h1>
      <div className="grid grid-2">
        <Link href="/patients/import/csv" style={{ color: "inherit" }}>
          <div className="card">
            <h2>1. Upload CSV</h2>
            <p className="muted">Best option. One patient per row, with a header row. A sample file is provided.</p>
          </div>
        </Link>
      </div>
      <p className="section"><Link href="/patients/add">← Back</Link></p>
    </>
  );
}
