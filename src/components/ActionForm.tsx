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

// Generic form wrapper: shows validation errors from the server action and resets on success.
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
  return (
    <form action={formAction} className={className} key={state.error ? "err" : "ok"}>
      {children}
      {state.error ? <p className="error">{state.error}</p> : null}
      {state.ok ? <p className="muted">Saved.</p> : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
