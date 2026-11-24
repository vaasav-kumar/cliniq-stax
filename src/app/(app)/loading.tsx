// Shown while any page under (app) is loading after a click.
export default function Loading() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>Loading…</span>
    </div>
  );
}
