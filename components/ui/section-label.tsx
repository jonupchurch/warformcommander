import * as React from "react";

import { cn } from "@/lib/utils";

export interface SectionLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** e.g. "01" */
  index?: string;
  /** the fading gradient rule; default true */
  rule?: boolean;
}

/** The `NN // LABEL` mono eyebrow + fading gradient rule that opens sections across the mockups. */
export function SectionLabel({ index, rule = true, className, children, ...props }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      <span className="type-eyebrow whitespace-nowrap text-faction-friendly">
        {index ? `${index} // ` : ""}
        <span className="text-text-strong">{children}</span>
      </span>
      {rule && (
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border-strong to-transparent" />
      )}
    </div>
  );
}
