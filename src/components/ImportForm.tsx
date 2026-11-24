"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ImportState } from "@/app/(app)/patients/import/actions";

type Action = (prev: ImportState, form: FormData) => Promise<ImportState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Checking and saving..." : label}
    </button>
  );
}

// Upload form that shows either a single error or the list of row errors. Nothing is saved when errors are shown.
export default function ImportForm({
  action,
  accept,
  submitLabel,
}: {
  action: Action;
  accept: string;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className="stack">
      <input type="file" name="file" accept={accept} required />
      <SubmitButton label={submitLabel} />
      {state.error ? <p className="error">{state.error}</p> : null}
      {state.rowErrors && state.rowErrors.length > 0 ? (
        <div className="error">
          <p>
            <strong>Nothing was saved.</strong> Fix these {state.rowErrors.length} problem(s) in your file and upload it again:
          </p>
          <ul>
            {state.rowErrors.slice(0, 50).map((e, i) => (
              <li key={i}>Row {e.row}: {e.message}</li>
            ))}
          </ul>
          {state.rowErrors.length > 50 ? <p>…and {state.rowErrors.length - 50} more.</p> : null}
        </div>
      ) : null}
    </form>
  );
}
