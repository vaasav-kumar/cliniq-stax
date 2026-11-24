import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { register } from "@/app/auth-actions";

export default function RegisterPage() {
  if (process.env.ALLOW_CLINIC_SIGNUP === "false") {
    return (
      <main className="auth-page">
        <div className="card auth-card">
          <h1>Registration closed</h1>
          <p className="muted">New clinic sign-up is closed. Please contact the Harsha Vedic team.</p>
          <Link href="/login">Back to sign in</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="auth-page">
      <div className="card auth-card">
        <h1>Register your clinic</h1>
        <p className="muted">You will be the admin. You can add doctors and front-desk staff afterwards.</p>
        <ActionForm action={register} submitLabel="Create clinic">
          <label>Clinic name *<input name="clinicName" required maxLength={120} /></label>
          <label>City<input name="city" defaultValue="Chennai" maxLength={100} /></label>
          <label>Clinic logo (optional, PNG, JPEG or WebP, up to 512 KB)
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <label>Your name *<input name="adminName" required maxLength={120} /></label>
          <label>Email *<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password * (at least 10 characters)
            <input name="password" type="password" autoComplete="new-password" required minLength={10} />
          </label>
        </ActionForm>
        <p className="muted">Already registered? <Link href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
