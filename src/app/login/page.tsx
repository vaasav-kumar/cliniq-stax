import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { login } from "@/app/auth-actions";

export default function LoginPage() {
  const allowSignup = process.env.ALLOW_CLINIC_SIGNUP !== "false";
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>Sign in</h1>
        <ActionForm action={login} submitLabel="Sign in">
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        </ActionForm>
        {allowSignup ? (
          <p className="muted">New clinic? <Link href="/register">Register your clinic</Link></p>
        ) : null}
      </div>
    </main>
  );
}
