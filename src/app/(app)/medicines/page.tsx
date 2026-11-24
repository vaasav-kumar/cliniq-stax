import Link from "next/link";
import { getDb } from "@/lib/db";
import { listMedicines } from "@/lib/medicines";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MedicinesPage() {
  const user = await requireUser();
  if (!can(user.role, "inventory:read")) return <p className="muted">You do not have access to the medicine inventory.</p>;
  const rows = await listMedicines(getDb(), user.clinicId);
  const canWrite = can(user.role, "inventory:write");
  const low = rows.filter((r) => r.stock_qty < r.requested_qty || (r.reorder_level > 0 && r.stock_qty < r.reorder_level));

  return (
    <>
      <div className="toolbar">
        <h1>Medicine inventory</h1>
        <div className="filter-form">
          <Link href="/medicines/next-batch"><button type="button" className="secondary">Next batch ({low.length})</button></Link>
          {canWrite ? <Link href="/medicines/add"><button type="button">+ Add medicines</button></Link> : null}
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Medicine</th><th>Unit</th><th className="num">In stock</th><th className="num">Reorder at</th><th className="num">Needed by patients</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="muted">No medicines yet. Add a purchase or import a list.</td></tr>
            ) : (
              rows.map((r) => {
                const needsOrder = r.stock_qty < r.requested_qty || (r.reorder_level > 0 && r.stock_qty < r.reorder_level);
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.unit}</td>
                    <td className="num">{r.stock_qty}</td>
                    <td className="num">{r.reorder_level || "—"}</td>
                    <td className="num">{r.requested_qty || "—"}</td>
                    <td>{needsOrder ? <span className="badge bad">order soon</span> : <span className="badge">OK</span>}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
