import Link from "next/link";
import { getDb } from "@/lib/db";
import { listPatients } from "@/lib/repo";
import { REACH_SOURCES } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PatientsPage({ searchParams }: { searchParams: { q?: string; source?: string } }) {
  const user = await requireUser();
  if (!can(user.role, "patients:read")) return <p className="muted">You do not have access to patients.</p>;
  const rows = await listPatients(getDb(), user.clinicId, { q: searchParams.q, source: searchParams.source });
  return (
    <>
      <div className="toolbar">
        <h1>Patients</h1>
        {can(user.role, "patients:write") ? (
          <Link href="/patients/add"><button type="button">+ Add patients</button></Link>
        ) : null}
      </div>

      <form className="filter-form card" method="get" style={{ marginBottom: 16 }}>
        <input name="q" placeholder="Search name or phone" defaultValue={searchParams.q ?? ""} />
        <select name="source" defaultValue={searchParams.source ?? ""}>
          <option value="">All sources</option>
          {REACH_SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="secondary">Filter</button>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Area</th>
              <th>Reached out via</th>
              <th className="num">Visits</th>
              <th>Last visit</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="muted">No patients match.</td></tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/patients/${p.id}`}>{p.name}</Link></td>
                  <td>{p.phone}</td>
                  <td>{[p.area, p.city].filter(Boolean).join(", ")}</td>
                  <td>
                    {p.reached_via}
                    {p.referred_by ? <div className="muted">by {p.referred_by}</div> : null}
                  </td>
                  <td className="num">
                    {p.completed_visits ?? 0}{" "}
                    {(p.completed_visits ?? 0) >= 2 ? <span className="badge">repeat</span> : null}
                  </td>
                  <td>{p.last_visit ?? "—"}</td>
                  <td>{p.registered_on}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
