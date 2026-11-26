import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { requestPasswordReset } from "@/app/auth-actions";

export default function ForgotPasswordPage({ searchParams }: { searchParams: { sent?: string } }) {
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>Forgot password</h1>
        {searchParams.sent ? (
          <p className="muted">
            If an account exists for that email, a reset link has been sent. The link works once and expires in 30 minutes.
            Check your spam folder if it does not arrive.
          </p>
        ) : (
          <ActionForm action={requestPasswordReset} submitLabel="Send reset link">
            <p className="muted">Enter the email you signed up with. We will send you a link to choose a new password.</p>
            <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          </ActionForm>
        )}
        <p className="muted"><Link href="/login">Back to sign in</Link></p>
      </div>
    </main>
  );
}
