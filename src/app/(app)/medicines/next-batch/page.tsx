import Link from "next/link";
import { getDb } from "@/lib/db";
import { nextBatch } from "@/lib/medicines";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Reminder list: what to buy in the next batch, from open patient requests and low stock.
export default async function NextBatchPage() {
  const user = await requireUser();
  if (!can(user.role, "inventory:read")) return <p className="muted">You do not have access to the medicine inventory.</p>;
  const items = await nextBatch(getDb(), user.clinicId);
  return (
    <>
      <h1>Next batch: medicines to order</h1>
      <p className="muted">
        Shows what patients have asked for that the shelf cannot cover, plus anything below its reorder level.
        Record the purchase on <Link href="/medicines/add">Add medicines</Link> when it arrives.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr><th>Medicine</th><th className="num">To order</th><th className="num">In stock</th><th className="num">Asked by patients</th><th>For patients</th></tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="muted">Nothing to order. ✓</td></tr>
            ) : (
              items.map((i) => (
                <tr key={i.medicine_id}>
                  <td>{i.name} <span className="muted">({i.unit})</span></td>
                  <td className="num"><span className="badge bad">{i.to_order}</span></td>
                  <td className="num">{i.stock_qty}</td>
                  <td className="num">{i.requested_qty || "—"}</td>
                  <td>{i.patients.length ? i.patients.join(", ") : "Low stock"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
