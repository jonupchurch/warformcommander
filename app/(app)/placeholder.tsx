/** Shared stand-in for screens owned by later features; the shell itself is live and wraps it now. */
export function PlaceholderScreen({ title, feature }: { title: string; feature: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="type-h1 text-text-strong">{title}</h1>
      <p className="type-body max-w-prose text-text-muted">
        This screen ships with {feature}. The app shell — nav, header, identity, and responsive
        chrome — is live and wrapping it now.
      </p>
    </section>
  );
}
