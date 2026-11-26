import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { resetPassword } from "@/app/auth-actions";

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? "";
  if (!token) {
    return (
      <main className="auth-page">
        <div className="card auth-card">
          <h1>Reset link invalid</h1>
          <p className="muted">This link is invalid or has expired. Request a new one.</p>
          <Link href="/forgot-password">Request a new link</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>Choose a new password</h1>
        <ActionForm action={resetPassword} submitLabel="Set new password">
          <input type="hidden" name="token" value={token} />
          <label>New password (at least 10 characters)<input name="password" type="password" autoComplete="new-password" required minLength={10} /></label>
          <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" required minLength={10} /></label>
        </ActionForm>
      </div>
    </main>
  );
}
