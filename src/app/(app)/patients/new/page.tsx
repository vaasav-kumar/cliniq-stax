import ActionForm from "@/components/ActionForm";
import ApartmentFields from "@/components/ApartmentFields";
import { addPatient } from "@/app/actions";
import { REACH_SOURCES, todayIso } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export default async function NewPatientPage() {
  const user = await requireUser();
  if (!can(user.role, "patients:write")) return <p className="muted">You do not have access to add patients.</p>;
  return (
    <>
      <h1>Add patient</h1>
      <div className="card" style={{ maxWidth: 820 }}>
        <ActionForm action={addPatient} submitLabel="Save patient">
          <div className="form-grid">
            <label>Full name *<input name="name" required maxLength={120} /></label>
            <label>Mobile number *<input name="phone" required placeholder="10-digit mobile" inputMode="tel" /></label>
            <label>Email<input name="email" type="email" /></label>
            <label>Date of birth<input name="dateOfBirth" type="date" max={todayIso()} /></label>
            <label>Gender
              <select name="gender" defaultValue="">
                <option value="">—</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </label>
            <label>Reached out from *
              <select name="reachedVia" required defaultValue="">
                <option value="" disabled>Select source</option>
                {REACH_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>Referred by (name)<input name="referredBy" placeholder="Doctor or patient name" /></label>
            <label>Registered on *<input name="registeredOn" type="date" required max={todayIso()} defaultValue={todayIso()} /></label>
          </div>
          <h2 style={{ marginTop: 8 }}>Address</h2>
          <div className="form-grid">
            <ApartmentFields />
            <label style={{ gridColumn: "1 / -1" }}>Address line<input name="addressLine" placeholder="Door no, street, landmark" /></label>
            <label>Area<input name="area" placeholder="e.g. Medavakkam" /></label>
            <label>City<input name="city" defaultValue="Chennai" /></label>
            <label>Pincode<input name="pincode" inputMode="numeric" maxLength={6} /></label>
          </div>
          <label>Notes<textarea name="notes" maxLength={2000} /></label>
        </ActionForm>
      </div>
    </>
  );
}
