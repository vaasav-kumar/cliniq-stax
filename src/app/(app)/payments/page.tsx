import Link from "next/link";
import { setPaymentStatus } from "@/app/actions";
import { getDb } from "@/lib/db";
import { listUnpaidVisits } from "@/lib/repo";
import { formatINR } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Every completed visit that is still NOT_PAID, with a button to mark it PAID.
export default async function PaymentsPage() {
  const user = await requireUser();
  if (!can(user.role, "finance:read")) return <p className="muted">You do not have access to payments.</p>;
  const rows = await listUnpaidVisits(getDb(), user.clinicId);
  const total = rows.reduce((s, r) => s + r.fee, 0);
  const canMark = can(user.role, "finance:write");

  return (
    <>
      <h1>Payments</h1>
      <div className="grid grid-4">
        <div className="card">
          <div className="stat-label">Visits NOT_PAID</div>
          <div className="stat-value">{rows.length}</div>
        </div>
        <div className="card">
          <div className="stat-label">Amount outstanding</div>
          <div className="stat-value neg">{formatINR(total)}</div>
        </div>
      </div>

      <section className="section card">
        <table>
          <thead>
            <tr><th>Visit date</th><th>Patient</th><th>Phone</th><th>Service</th><th className="num">Fee</th><th>Payment</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="muted">No unpaid visits. ✓</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.visit_date}</td>
                  <td><Link href={`/patients/${r.patient_id}`}>{r.patient_name}</Link></td>
                  <td>{r.patient_phone}</td>
                  <td>{r.service}</td>
                  <td className="num">{formatINR(r.fee)}</td>
                  <td>
                    <span className="badge bad">NOT_PAID</span>
                    {canMark ? (
                      <form action={setPaymentStatus.bind(null, r.id, "PAID", r.patient_id)}>
                        <button type="submit">Mark PAID</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
