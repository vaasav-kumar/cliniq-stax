import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { addVisit, setPaymentStatus } from "@/app/actions";
import { cancelRequestAction, dispenseAction, requestMedicineAction } from "../../medicines/actions";
import MedicineRequestForm from "@/components/MedicineRequestForm";
import { listMedicines, listRequestsForPatient } from "@/lib/medicines";
import { getDb } from "@/lib/db";
import { getPatient, listVisitsForPatient } from "@/lib/repo";
import { recordAudit } from "@/lib/audit";
import { PAYMENT_STATUSES, SERVICES, VISIT_STATUSES, formatINR, todayIso } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params, searchParams }: { params: { id: string }; searchParams: { medError?: string } }) {
  const user = await requireUser();
  if (!can(user.role, "patients:read")) return <p className="muted">You do not have access to patients.</p>;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const db = getDb();
  // Scoped to the signed-in clinic: another clinic's patient id returns "not found".
  const patient = await getPatient(db, user.clinicId, id);
  if (!patient) notFound();

  await recordAudit(db, user.clinicId, user.id, "patient.viewed", `patient #${id}`);

  const visits = await listVisitsForPatient(db, user.clinicId, id);
  const medicines = can(user.role, "inventory:read") ? await listMedicines(db, user.clinicId) : [];
  const requests = can(user.role, "inventory:read") ? await listRequestsForPatient(db, user.clinicId, id) : [];
  const canDispense = can(user.role, "inventory:write");
  const completed = visits.filter((v) => v.status === "completed");
  const totalFees = completed.reduce((s, v) => s + v.fee, 0);
  const unpaid = completed.filter((v) => v.payment_status === "NOT_PAID").reduce((s, v) => s + v.fee, 0);
  const addr = [
    patient.door_number ? `Door ${patient.door_number}` : null,
    patient.apartment_name,
    patient.address_line,
    patient.area,
    patient.city,
    patient.pincode,
  ].filter(Boolean).join(", ");
  const canVisit = can(user.role, "visits:write");
  const canMoney = can(user.role, "finance:write");

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ marginBottom: 4 }}>{patient.name}</h1>
          <div className="muted">
            {patient.phone} · reached out via <strong>{patient.reached_via}</strong>
            {patient.referred_by ? ` (${patient.referred_by})` : ""}
            {completed.length >= 2 ? <> · <span className="badge">repeat patient</span></> : null}
          </div>
        </div>
        <Link href="/patients">← All patients</Link>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Details</h2>
          <table>
            <tbody>
              <tr><th>Email</th><td>{patient.email ?? "—"}</td></tr>
              <tr><th>Date of birth</th><td>{patient.date_of_birth ?? "—"}</td></tr>
              <tr><th>Gender</th><td>{patient.gender ?? "—"}</td></tr>
              <tr><th>Address</th><td>{addr || "—"}</td></tr>
              <tr><th>Registered</th><td>{patient.registered_on}</td></tr>
              <tr><th>Visits</th><td>{completed.length} completed</td></tr>
              {can(user.role, "finance:read") ? (
                <>
                  <tr><th>Fees billed</th><td>{formatINR(totalFees)}</td></tr>
                  <tr><th>Unpaid (NOT_PAID)</th><td className={unpaid > 0 ? "neg" : ""}>{formatINR(unpaid)}</td></tr>
                </>
              ) : null}
              <tr><th>Notes</th><td>{patient.notes ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>

        {canVisit ? (
          <div className="card">
            <h2>Record a visit</h2>
            <ActionForm action={addVisit.bind(null, id)} submitLabel="Save visit">
              <div className="form-grid">
                <label>Visit date *<input name="visitDate" type="date" required defaultValue={todayIso()} /></label>
                <label>Service *
                  <select name="service" required defaultValue={SERVICES[0]}>
                    {SERVICES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label>Status
                  <select name="status" defaultValue="completed">
                    {VISIT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </label>
                <label>Fee (₹)<input name="fee" type="number" min="0" step="1" defaultValue="0" /></label>
                {canMoney ? (
                  <label>Payment
                    <select name="paymentStatus" defaultValue="NOT_PAID">
                      {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                ) : null}
                <label>Next follow-up<input name="followUpDate" type="date" /></label>
              </div>
              <label>Notes<textarea name="notes" maxLength={2000} placeholder="Complaints, treatment given, advice" /></label>
            </ActionForm>
          </div>
        ) : null}
      </div>

      <section className="section card">
        <h2>Visit history</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Service</th><th>Status</th><th className="num">Fee</th>
              <th>Payment</th><th>Follow-up</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 ? (
              <tr><td colSpan={7} className="muted">No visits yet.</td></tr>
            ) : (
              visits.map((v) => (
                <tr key={v.id}>
                  <td>{v.visit_date}</td>
                  <td>{v.service}</td>
                  <td>{v.status.replace("_", " ")}</td>
                  <td className="num">{formatINR(v.fee)}</td>
                  <td>
                    <span className={`badge ${v.payment_status === "PAID" ? "" : "bad"}`}>{v.payment_status}</span>
                    {canMoney && v.status === "completed" && v.fee > 0 ? (
                      <form action={setPaymentStatus.bind(null, v.id, v.payment_status === "PAID" ? "NOT_PAID" : "PAID", id)}>
                        <button type="submit" className="secondary">
                          {v.payment_status === "PAID" ? "Mark NOT_PAID" : "Mark PAID"}
                        </button>
                      </form>
                    ) : null}
                  </td>
                  <td>
                    {v.follow_up_date ? (
                      v.follow_up_done ? (
                        <span className="badge">done · {v.follow_up_date}</span>
                      ) : (
                        <span className={`badge ${v.follow_up_date <= todayIso() ? "bad" : "warn"}`}>{v.follow_up_date}</span>
                      )
                    ) : "—"}
                  </td>
                  <td>{v.notes ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="section card">
        <h2>Medicines</h2>
        {searchParams.medError ? <p className="error">{searchParams.medError}</p> : null}
        {can(user.role, "visits:write") ? (
          <>
            <h3>Request medicine</h3>
            <MedicineRequestForm action={requestMedicineAction.bind(null, id)} medicines={medicines} />
          </>
        ) : null}
        <table style={{ marginTop: 16 }}>
          <thead>
            <tr><th>Requested</th><th>Medicine</th><th className="num">Quantity</th><th>Status</th><th>Notes</th><th>Action</th></tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={6} className="muted">No medicines requested.</td></tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.requested_on}</td>
                  <td>{r.medicine_name}</td>
                  <td className="num">{r.quantity} {r.unit}</td>
                  <td>
                    {r.status === "requested" ? (
                      r.stock_qty >= r.quantity ? <span className="badge">ready in stock</span> : <span className="badge warn">waiting for stock</span>
                    ) : (
                      <span className="badge">{r.status}</span>
                    )}
                  </td>
                  <td>{r.notes ?? ""}</td>
                  <td>
                    {r.status === "requested" && canDispense ? (
                      <form action={dispenseAction.bind(null, r.id, id)}>
                        <button type="submit">Hand over</button>
                      </form>
                    ) : null}
                    {r.status === "requested" && can(user.role, "visits:write") ? (
                      <form action={cancelRequestAction.bind(null, r.id, id)}>
                        <button type="submit" className="secondary">Cancel</button>
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
