import ActionForm from "@/components/ActionForm";
import { addStaff, toggleStaff } from "@/app/staff/actions";
import { getDb } from "@/lib/db";
import { listStaff } from "@/lib/accounts";
import { ROLES, ROLE_LABELS } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const user = await requireUser();
  if (!can(user.role, "staff:manage")) return <p className="muted">Only clinic admins can manage staff.</p>;
  const staff = await listStaff(getDb(), user.clinicId);

  return (
    <>
      <h1>Staff</h1>
      <div className="grid grid-2">
        <div className="card">
          <h2>Add staff member</h2>
          <p className="muted">Set a starting password and share it with them securely. They can change it under My account.</p>
          <ActionForm action={addStaff} submitLabel="Add staff">
            <label>Name *<input name="name" required maxLength={120} /></label>
            <label>Email *<input name="email" type="email" required /></label>
            <label>Role *
              <select name="role" defaultValue="front_desk">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>
            <label>Starting password * (at least 10 characters)
              <input name="password" type="password" autoComplete="new-password" required minLength={10} />
            </label>
          </ActionForm>
        </div>
        <div className="card">
          <h2>Roles</h2>
          <table>
            <tbody>
              <tr><th>Admin</th><td>Everything, including dashboard, finance and staff</td></tr>
              <tr><th>Doctor / therapist</th><td>Patients, visits, follow-ups</td></tr>
              <tr><th>Front desk</th><td>Patients, visits, follow-ups, payments, income and expenses</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <section className="section card">
        <h2>Team</h2>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}{s.id === user.id ? <span className="muted"> (you)</span> : null}</td>
                <td>{s.email}</td>
                <td>{ROLE_LABELS[s.role]}</td>
                <td>{s.active ? <span className="badge">active</span> : <span className="badge bad">inactive</span>}</td>
                <td>
                  {s.id === user.id ? null : (
                    <form action={toggleStaff.bind(null, s.id, !s.active)}>
                      <button type="submit" className="secondary">{s.active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
