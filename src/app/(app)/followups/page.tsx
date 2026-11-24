import Link from "next/link";
import { completeFollowUp } from "@/app/actions";
import { getDb } from "@/lib/db";
import { dueFollowUps } from "@/lib/repo";
import { todayIso } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const user = await requireUser();
  if (!can(user.role, "followups:manage")) return <p className="muted">You do not have access to follow-ups.</p>;
  const today = todayIso();
  const rows = await dueFollowUps(getDb(), user.clinicId, today);
  return (
    <>
      <h1>Follow-ups due</h1>
      <p className="muted">Shows follow-ups due today or overdue. Mark a follow-up done once the patient has been contacted or seen.</p>
      <div className="card">
        <table>
          <thead>
            <tr><th>Due</th><th>Patient</th><th>Phone</th><th>Last visit service</th><th>Action</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="muted">No follow-ups due. ✓</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`badge ${r.follow_up_date && r.follow_up_date < today ? "bad" : "warn"}`}>
                      {r.follow_up_date}
                    </span>
                  </td>
                  <td><Link href={`/patients/${r.patient_id}`}>{r.patient_name}</Link></td>
                  <td>{r.patient_phone}</td>
                  <td>{r.service}</td>
                  <td>
                    <form action={completeFollowUp.bind(null, r.id, r.patient_id)}>
                      <button type="submit" className="secondary">Mark done</button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
