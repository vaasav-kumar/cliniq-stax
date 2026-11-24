"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving..." : label}
    </button>
  );
}

// Generic form wrapper: shows validation errors from the server action. Typed values are kept when there is an error.
export default function ActionForm({
  action,
  submitLabel,
  children,
  className = "stack",
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useFormState(action, {});
  // No key here: changing the key remounts the form and clears what the user typed when there is an error.
  const current = state ?? {};
  return (
    <form action={formAction} className={className}>
      {children}
      {current.error ? <p className="error">{current.error}</p> : null}
      {current.ok ? <p className="muted">Saved.</p> : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
