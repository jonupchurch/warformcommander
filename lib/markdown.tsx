/**
 * Safe markdown rendering for `posts.body` (Feature 11, T007) — the **one** markdown trust boundary
 * (FR-012, SC-003, Principle II). The article body, the derived excerpt, and the RSS feed summary all
 * render/read through here, never a per-caller sanitizer.
 *
 * Built on **react-markdown + remark-gfm**: it parses to a syntax tree and builds **React elements** —
 * it never passes a string through `dangerouslySetInnerHTML`. Raw HTML is **disabled** (react-markdown's
 * default: no `rehype-raw`), so any embedded `<script>`, `onerror=` attribute, or inline HTML in the body
 * is dropped, not rendered. react-markdown's default `urlTransform` also strips dangerous URL schemes
 * (`javascript:`, `data:` — except safe image data) from link/image `href`/`src`, so a `[x](javascript:…)`
 * link is neutralised. If raw HTML is ever needed, it must go through `rehype-raw` **then** `rehype-sanitize`
 * with an explicit allowlist — v1 does not enable that path (contract §3.4).
 */

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render a markdown `body` to safe React elements — the supported GFM subset (headings, paragraphs,
 * lists incl. task lists, blockquotes, links, images, code, tables). External links open in a new tab
 * with `rel="noopener noreferrer"`. Returns `null` for an empty body.
 */
export function renderPostMarkdown(body: string): React.ReactNode {
  if (!body || body.trim().length === 0) return null;
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => {
          const external = typeof href === "string" && /^https?:\/\//i.test(href);
          return (
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              {...props}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {body}
    </Markdown>
  );
}

/**
 * Strip markdown to plain text — for excerpt derivation and feed summaries (never rendered as HTML).
 * A deliberately small, dependency-free reducer: it removes the common inline/block markdown syntax so
 * the first prose of a body can seed an excerpt. Not a full parser (it never needs to *render*, only to
 * flatten), and it can only ever *remove* markup, so it introduces no injection surface.
 */
export function markdownToPlainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}[-*+]\s+/gm, "") // unordered list markers
    .replace(/^\s{0,3}\d+\.\s+/gm, "") // ordered list markers
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1") // emphasis/strong/strike
    .replace(/\s+/g, " ")
    .trim();
}
