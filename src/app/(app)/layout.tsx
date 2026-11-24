import Link from "next/link";
import { logout } from "@/app/auth-actions";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session-server";
import { can } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/domain";
import SidebarShell from "@/components/SidebarShell";

// Every page under (app) requires a signed-in user. Pages also check their own permission.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const logo = await getDb().one<{ has: boolean }>(
    "SELECT (logo_data IS NOT NULL) AS has FROM clinics WHERE id = @clinicId",
    { clinicId: user.clinicId },
  );
  const brand = (
    <>
      {logo?.has ? <img src="/logo" alt="" className="sidebar-logo" /> : null}
      <span>{user.clinicName}</span>
    </>
  );
  const nav = (
    <>
      {can(user.role, "dashboard:view") ? <Link href="/">Dashboard</Link> : null}
      {can(user.role, "patients:read") ? <Link href="/patients">Patients</Link> : null}
      {can(user.role, "followups:manage") ? <Link href="/followups">Follow-ups</Link> : null}
      {can(user.role, "finance:read") ? <Link href="/payments">Payments</Link> : null}
      {can(user.role, "finance:read") ? <Link href="/finance">Income &amp; expenses</Link> : null}
      {can(user.role, "inventory:read") ? <Link href="/medicines">Medicines</Link> : null}
      {can(user.role, "inventory:read") ? <Link href="/medicines/next-batch">Next batch</Link> : null}
      {can(user.role, "staff:manage") ? <Link href="/staff">Staff</Link> : null}
      <Link href="/account">My account</Link>
    </>
  );
  const userBlock = (
    <>
      <div>{user.name}</div>
      <div className="muted-light">{ROLE_LABELS[user.role]}</div>
      <form action={logout}>
        <button type="submit" className="secondary on-dark">Sign out</button>
      </form>
    </>
  );
  return (
    <SidebarShell brand={brand} nav={nav} user={userBlock}>
      {children}
    </SidebarShell>
  );
}
