import Link from "next/link";
import ImportForm from "@/components/ImportForm";
import { importImage } from "../actions";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function ImageImportPage() {
  const user = await requireUser();
  if (!can(user.role, "patients:write")) return <p className="muted">You do not have access to add patients.</p>;
  return (
    <>
      <h1>Bulk import from image</h1>
      <div className="card" style={{ maxWidth: 820 }}>
        <p>
          Upload a clear photo or scan (PNG, JPEG or WebP, up to 4 MB) of a table. The first row must be the column names from the
          <a href="/samples/patients-sample.csv" download> sample CSV</a>, for example <code>name,phone,reached_via,...</code>.
        </p>
        <p className="muted">
          The text is read on this computer. Printed tables work best. Handwriting and blurry photos often fail the checks, and you will
          see which rows need fixing. Nothing is saved unless every row passes.
        </p>
        <ImportForm action={importImage} accept="image/png,image/jpeg,image/webp" submitLabel="Read and import" />
      </div>
      <p className="section"><Link href="/patients/import">← Back</Link></p>
    </>
  );
}
