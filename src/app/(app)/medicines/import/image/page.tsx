import Link from "next/link";
import ImportForm from "@/components/ImportForm";
import { importMedicinesImage } from "../actions";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function MedicineImagePage() {
  const user = await requireUser();
  if (!can(user.role, "inventory:write")) return <p className="muted">You do not have access to import medicines.</p>;
  return (
    <>
      <h1>Import medicines from image</h1>
      <div className="card" style={{ maxWidth: 820 }}>
        <p>Upload a clear photo or scan (PNG, JPEG or WebP, up to 4 MB). The first row must be the column names from the <a href="/samples/medicines-sample.csv" download>sample CSV</a>.</p>
        <p className="muted">The text is read on this computer. Printed lists work best; rows that fail the checks are listed and nothing is saved.</p>
        <ImportForm action={importMedicinesImage} accept="image/png,image/jpeg,image/webp" submitLabel="Read and import" />
      </div>
      <p className="section"><Link href="/medicines/import">← Back</Link></p>
    </>
  );
}
