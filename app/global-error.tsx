"use client";

// Root-level error boundary. Replaces the whole app shell (including the root
// layout) when a top-level render error occurs, so it renders its own
// <html>/<body> and uses inline styles rather than depending on globals.css.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ opacity: 0.7, fontSize: "0.875rem" }}>
          The error has been reported. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            border: "1px solid currentColor",
            borderRadius: "0.375rem",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            cursor: "pointer",
            background: "transparent",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
