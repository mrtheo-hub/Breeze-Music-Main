import type { SourceError, SourceErrorKind } from '@breeze/core';

const ERROR_COPY: Record<SourceErrorKind, { title: string; body: string }> = {
  network: { title: "Can't reach YouTube Music", body: 'Check your internet connection, then try again.' },
  blocked: { title: 'YouTube is limiting requests', body: 'Wait a minute, then try again.' },
  not_found: { title: 'Not found', body: "This isn't available on YouTube Music." },
  parse: { title: 'Something went wrong', body: "YouTube Music sent something Breeze didn't expect. Try again." },
};

export function ErrorState({ error, onRetry }: { error: SourceError; onRetry: () => void }) {
  const copy = ERROR_COPY[error.kind];
  return (
    <div className="state" role="alert">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="state">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

const SKELETON_ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];

export function RowsSkeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {SKELETON_ROWS.map((id) => (
        <div key={id} className="skeleton-row" />
      ))}
    </div>
  );
}
