"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { FinanceImageState } from "@/app/(app)/finance/actions";

type Action = (prev: FinanceImageState, form: FormData) => Promise<FinanceImageState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Reading and saving..." : "Read and save"}
    </button>
  );
}

// Upload form for the income and expense page. Shows what was saved, or the row problems (nothing is saved then).
export default function FinanceImageImport({ action }: { action: Action }) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className="stack">
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required />
      <SubmitButton />
      {state.summary ? <p className="muted">{state.summary}</p> : null}
      {state.error ? <p className="error">{state.error}</p> : null}
      {state.rowErrors && state.rowErrors.length > 0 ? (
        <div className="error">
          <p>
            <strong>Nothing was saved.</strong> Fix these {state.rowErrors.length} problem(s) and upload the image again:
          </p>
          <ul>
            {state.rowErrors.slice(0, 50).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
          {state.rowErrors.length > 50 ? <p>…and {state.rowErrors.length - 50} more.</p> : null}
        </div>
      ) : null}
    </form>
  );
}
