import ActionForm from "@/components/ActionForm";
import FinanceImageImport from "@/components/FinanceImageImport";
import { importFinanceImage } from "./actions";
import { addTransaction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { buildDashboard, defaultPeriod, listTransactions } from "@/lib/repo";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatINR, todayIso } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const user = await requireUser();
  if (!can(user.role, "finance:read")) return <p className="muted">You do not have access to income and expenses.</p>;
  const base = defaultPeriod(todayIso());
  const period = {
    from: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from ?? "") ? searchParams.from! : base.from,
    to: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to ?? "") ? searchParams.to! : base.to,
  };
  const db = getDb();
  const totals = (await buildDashboard(db, user.clinicId, period)).totals;
  const rows = await listTransactions(db, user.clinicId, period);
  const canWrite = can(user.role, "finance:write");

  return (
    <>
      <div className="toolbar">
        <h1>Income &amp; expenses</h1>
        <form className="filter-form" method="get">
          <input type="date" name="from" defaultValue={period.from} aria-label="From" />
          <input type="date" name="to" defaultValue={period.to} aria-label="To" />
          <button type="submit" className="secondary">Apply</button>
        </form>
      </div>

      <div className="grid grid-4">
        <div className="card"><div className="stat-label">Income (PAID)</div><div className="stat-value pos">{formatINR(totals.income)}</div></div>
        <div className="card"><div className="stat-label">Expenses (outcomes)</div><div className="stat-value neg">{formatINR(totals.expense)}</div></div>
        <div className="card"><div className="stat-label">Net</div><div className={`stat-value ${totals.net >= 0 ? "pos" : "neg"}`}>{formatINR(totals.net)}</div></div>
      </div>

      {canWrite ? (
        <section className="card section">
          <h2>Import from image</h2>
          <p className="muted">
            Upload a clear photo or scan (PNG, JPEG or WebP, up to 4 MB). Put a heading line before each list:
            <code> Patients</code>, <code>Income</code> or <code>Expenses</code>. Under each heading, the first line names the
            columns and the rows follow.
          </p>
          <p className="muted">
            Patients: <code>name, phone, reached_via</code> (plus any optional patient columns). Income and expenses:
            <code> date, amount, category, description</code> (date is optional and defaults to today). The text is read on this
            computer. Nothing is saved unless every row passes.
          </p>
          <FinanceImageImport action={importFinanceImage} />
        </section>
      ) : null}

      {canWrite ? (
        <div className="grid grid-2 section">
          <div className="card">
            <h2>Add expense</h2>
            <ActionForm action={addTransaction} submitLabel="Save expense">
              <input type="hidden" name="kind" value="expense" />
              <div className="form-grid">
                <label>Date *<input name="entryDate" type="date" required defaultValue={todayIso()} /></label>
                <label>Amount (₹) *<input name="amount" type="number" min="1" step="1" required /></label>
                <label>Category *
                  <select name="category" required defaultValue={EXPENSE_CATEGORIES[0]}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <label>Description<input name="description" maxLength={300} /></label>
            </ActionForm>
          </div>
          <div className="card">
            <h2>Add other income</h2>
            <p className="muted">Visit fees are added automatically when a visit is marked PAID on the Payments page.</p>
            <ActionForm action={addTransaction} submitLabel="Save income">
              <input type="hidden" name="kind" value="income" />
              <div className="form-grid">
                <label>Date *<input name="entryDate" type="date" required defaultValue={todayIso()} /></label>
                <label>Amount (₹) *<input name="amount" type="number" min="1" step="1" required /></label>
                <label>Category *
                  <select name="category" required defaultValue={INCOME_CATEGORIES[0]}>
                    {INCOME_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <label>Description<input name="description" maxLength={300} /></label>
            </ActionForm>
          </div>
        </div>
      ) : null}

      <section className="section card">
        <h2>Ledger</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Patient</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="muted">No entries in this period.</td></tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.entry_date}</td>
                  <td>{t.kind === "income" ? <span className="badge">income</span> : <span className="badge bad">expense</span>}</td>
                  <td>{t.category}</td>
                  <td>{t.description ?? ""}</td>
                  <td>{t.patient_name ?? ""}</td>
                  <td className={`num ${t.kind === "income" ? "pos" : "neg"}`}>
                    {t.kind === "income" ? "+" : "−"}{formatINR(t.amount)}
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
