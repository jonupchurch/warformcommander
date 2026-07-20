"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A color swatch that reports its own *resolved* paint value (rgb/rgba) by reading
 * getComputedStyle on itself. This keeps the gallery source free of raw hex (SC-002) while still
 * documenting the real value, and gives the token e2e spec a stable `[data-swatch]` target.
 */
export function Swatch({ token, name }: { token: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (ref.current) setValue(getComputedStyle(ref.current).backgroundColor);
  }, []);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={ref}
        data-swatch={token}
        style={{ background: `var(${token})` }}
        className="h-14 rounded-md border border-border-hairline"
      />
      <span className="type-readout text-text-strong">{name}</span>
      <span className="type-readout text-text-muted" data-swatch-value>
        {value}
      </span>
    </div>
  );
}

/** A labeled grid of swatches for one token family. */
export function Ramp({ title, tokens }: { title: string; tokens: { token: string; name: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="type-eyebrow text-text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {tokens.map((t) => (
          <Swatch key={t.token} token={t.token} name={t.name} />
        ))}
      </div>
    </div>
  );
}
