import Link from "next/link";
import { getDb } from "@/lib/db";
import { buildDashboard, defaultPeriod } from "@/lib/repo";
import { formatINR, todayIso } from "@/lib/domain";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";
import { ExpenseCategoryChart, InventoryChart, PatientsChart, RevenueChart, ServiceChart, SourceChart } from "@/components/Charts";
import { listMedicines, nextBatch } from "@/lib/medicines";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const user = await requireUser();
  if (!can(user.role, "dashboard:view")) {
    return (
      <>
        <h1>Dashboard</h1>
        <p className="muted">The dashboard is available to clinic admins. Use Patients or Follow-ups from the menu.</p>
      </>
    );
  }

  const base = defaultPeriod(todayIso());
  const period = {
    from: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from ?? "") ? searchParams.from! : base.from,
    to: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to ?? "") ? searchParams.to! : base.to,
  };
  const db = getDb();
  const d = await buildDashboard(db, user.clinicId, period);
  const medicines = await listMedicines(db, user.clinicId);
  const batch = await nextBatch(db, user.clinicId);
  const inventoryData = medicines.slice(0, 15).map((m) => ({ name: m.name, stock: m.stock_qty, reorder: m.reorder_level }));

  return (
    <>
      <div className="toolbar">
        <h1>Dashboard</h1>
        <form className="filter-form" method="get">
          <input type="date" name="from" defaultValue={period.from} aria-label="From" />
          <input type="date" name="to" defaultValue={period.to} aria-label="To" />
          <button type="submit" className="secondary">Apply</button>
        </form>
      </div>

      <div className="grid grid-4">
        <Stat label="Income (PAID)" value={formatINR(d.totals.income)} tone="pos" />
        <Stat label="Expenses (outcomes)" value={formatINR(d.totals.expense)} tone="neg" />
        <Stat label="Net" value={formatINR(d.totals.net)} tone={d.totals.net >= 0 ? "pos" : "neg"} />
        <Stat label="Unpaid (NOT_PAID)" value={formatINR(d.totals.unpaid)} tone="neg" link="/payments" />
        <Stat label="Follow-ups due" value={String(d.followUpsDue)} link="/followups" />
        <Stat label="Medicines to order" value={String(batch.length)} link="/medicines/next-batch" />
        <Stat label="New patients" value={String(d.totals.patients)} link="/patients" />
        <Stat label="Completed visits" value={String(d.totals.visits)} />
        <Stat label="Repeat patients (2+ visits)" value={String(d.totals.repeatPatients)} />
      </div>

      <section className="section grid grid-2">
        <div className="card">
          <h2>Revenue vs expenses (by month)</h2>
          <RevenueChart data={d.monthly} />
        </div>
        <div className="card">
          <h2>New patients and visits (by month)</h2>
          <PatientsChart data={d.monthly} />
        </div>
        <div className="card">
          <h2>Where patients reached out from</h2>
          <SourceChart data={d.bySource} />
        </div>
        <div className="card">
          <h2>Income by service</h2>
          <ServiceChart data={d.byService} />
        </div>
        <div className="card">
          <h2>Expenses by category (includes medicine purchases)</h2>
          <ExpenseCategoryChart data={d.expenseByCategory} />
        </div>
        <div className="card">
          <h2>Medicine inventory (stock vs reorder level)</h2>
          <InventoryChart data={inventoryData} />
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, tone, link }: { label: string; value: string; tone?: "pos" | "neg"; link?: string }) {
  const body = (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ""}`}>{value}</div>
    </div>
  );
  return link ? <Link href={link} style={{ color: "inherit" }}>{body}</Link> : body;
}
