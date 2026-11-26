import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { login } from "@/app/auth-actions";

export default function LoginPage({ searchParams }: { searchParams: { reset?: string } }) {
  const allowSignup = process.env.ALLOW_CLINIC_SIGNUP !== "false";
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>Sign in</h1>
        {searchParams.reset ? <p className="muted">Password updated. Sign in with your new password.</p> : null}
        <ActionForm action={login} submitLabel="Sign in">
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        </ActionForm>
        <p className="muted"><Link href="/forgot-password">Forgot password?</Link></p>
        {allowSignup ? (
          <p className="muted">New clinic? <Link href="/register">Register your clinic</Link></p>
        ) : null}
      </div>
    </main>
  );
}
