/**
 * Feature 11 safe markdown render (T007/T038) — SC-003, the load-bearing security guarantee. A
 * corpus of bodies with embedded `<script>`, `onerror=`, and `javascript:` payloads renders the
 * expected semantic HTML with **zero** executable-injection survivors. `react-markdown` builds React
 * elements (never `dangerouslySetInnerHTML`), raw HTML is disabled, and dangerous URL schemes are
 * stripped — so we render to a static HTML string and assert the payloads are gone.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { markdownToPlainText, renderPostMarkdown } from "@/lib/markdown";

function html(body: string): string {
  const node = renderPostMarkdown(body);
  return node ? renderToStaticMarkup(node as React.ReactElement) : "";
}

describe("renderPostMarkdown — semantic HTML", () => {
  it("renders headings, lists, blockquotes, links, images, code, and tables", () => {
    const out = html(
      [
        "# Title",
        "",
        "A paragraph with **bold** and a [link](https://example.com).",
        "",
        "- one",
        "- two",
        "",
        "> a quote",
        "",
        "`inline code`",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "![alt](/pic.png)",
      ].join("\n"),
    );
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<blockquote>");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain("<table>");
    expect(out).toContain("<code>");
    expect(out).toContain('src="/pic.png"');
    // External links get a safe rel + target.
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("returns null for an empty body", () => {
    expect(renderPostMarkdown("")).toBeNull();
    expect(renderPostMarkdown("   ")).toBeNull();
  });
});

describe("renderPostMarkdown — zero XSS survivors (SC-003)", () => {
  const payloads = [
    "Before <script>alert('xss')</script> after.",
    'An image: <img src=x onerror="alert(1)">',
    "A [bad link](javascript:alert(1)) here.",
    "<a href=\"javascript:alert(1)\">click</a>",
    "<iframe src='https://evil.example'></iframe>",
    "Text with an onload=alert(1) attribute in <div onload=alert(1)>raw html</div>.",
  ];

  it("has zero EXECUTABLE survivors — raw HTML is escaped to inert text, not rendered as elements", () => {
    for (const body of payloads) {
      const out = html(body);
      const lower = out.toLowerCase();
      // No real dangerous elements (raw HTML is escaped, so `<script>` becomes `&lt;script&gt;`).
      expect(lower).not.toContain("<script");
      expect(lower).not.toContain("<iframe");
      // No real element carries an inline event handler (an escaped `&lt;img … onerror=…&gt;` is text).
      expect(out).not.toMatch(/<[a-z][a-z0-9]*[^>]*\son[a-z]+\s*=/i);
      // No real link/image uses the javascript: scheme (react-markdown strips it from markdown URLs;
      // a raw `<a href="javascript:…">` is escaped to text, so no actual attribute survives).
      expect(out).not.toMatch(/(?:href|src)\s*=\s*["']?\s*javascript:/i);
    }
  });

  it("keeps the surrounding safe prose intact", () => {
    const out = html("Before <script>alert('xss')</script> after.");
    expect(out).toContain("Before");
    expect(out).toContain("after.");
  });
});

describe("markdownToPlainText", () => {
  it("flattens markdown to plain prose (for excerpts/feed summaries)", () => {
    const plain = markdownToPlainText("## H\n\n**Bold** and `code` and [a](https://x) and ![i](/p.png).");
    expect(plain).toContain("Bold and code and a and");
    expect(plain).not.toContain("#");
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("https://x");
  });
});
