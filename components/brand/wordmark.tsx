import { cn } from "@/lib/utils";

const SIZE = {
  sm: "type-h3",
  md: "type-h2",
  lg: "type-h1",
} as const;

export interface WordmarkProps {
  size?: keyof typeof SIZE;
  className?: string;
}

/**
 * The "WARFORM" wordmark — the expanded display face (via the `type-*` recipe, which sets the
 * font-stretch, so it never collides with the color utility under tailwind-merge).
 */
export function Wordmark({ size = "md", className }: WordmarkProps) {
  return <span className={cn(SIZE[size], "text-text-strong", className)}>WARFORM</span>;
}
