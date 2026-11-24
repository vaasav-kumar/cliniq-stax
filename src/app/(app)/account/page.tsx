import ActionForm from "@/components/ActionForm";
import { changeMyPassword } from "@/app/auth-actions";
import { uploadClinicLogo } from "./actions";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session-server";
import { ROLE_LABELS } from "@/lib/domain";

export default async function AccountPage() {
  const user = await requireUser();
  const logo = await getDb().one<{ has: boolean }>(
    "SELECT (logo_data IS NOT NULL) AS has FROM clinics WHERE id = @clinicId",
    { clinicId: user.clinicId },
  );
  return (
    <>
      <h1>My account</h1>
      <div className="grid grid-2">
        <div className="card">
          <h2>Profile</h2>
          {logo?.has ? <img src="/logo" alt={`${user.clinicName} logo`} className="profile-logo" /> : null}
          <table>
            <tbody>
              <tr><th>Name</th><td>{user.name}</td></tr>
              <tr><th>Email</th><td>{user.email}</td></tr>
              <tr><th>Role</th><td>{ROLE_LABELS[user.role]}</td></tr>
              <tr><th>Clinic</th><td>{user.clinicName}</td></tr>
            </tbody>
          </table>
        </div>
        {user.role === "admin" ? (
          <div className="card">
            <h2>Clinic logo</h2>
            <p className="muted">PNG, JPEG or WebP, up to 512 KB. Shown in the sidebar and on this page for everyone in the clinic.</p>
            <ActionForm action={uploadClinicLogo} submitLabel={logo?.has ? "Replace logo" : "Upload logo"}>
              <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
            </ActionForm>
          </div>
        ) : null}
        <div className="card">
          <h2>Change password</h2>
          <p className="muted">Changing your password signs you out of your other browsers.</p>
          <ActionForm action={changeMyPassword} submitLabel="Change password">
            <label>Current password<input name="current" type="password" autoComplete="current-password" required /></label>
            <label>New password (at least 10 characters)<input name="next" type="password" autoComplete="new-password" required minLength={10} /></label>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
