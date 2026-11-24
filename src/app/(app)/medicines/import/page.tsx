import Link from "next/link";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function MedicineImportChooser() {
  const user = await requireUser();
  if (!can(user.role, "inventory:write")) return <p className="muted">You do not have access to import medicines.</p>;
  return (
    <>
      <h1>Import medicines</h1>
      <div className="grid grid-2">
        <Link href="/medicines/import/csv" style={{ color: "inherit" }}>
          <div className="card"><h2>1. Upload CSV</h2><p className="muted">One medicine per row. Best option.</p></div>
        </Link>
      </div>
      <p className="section"><Link href="/medicines/add">← Back</Link></p>
    </>
  );
}
