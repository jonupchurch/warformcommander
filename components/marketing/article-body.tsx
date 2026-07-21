import type { PostView } from "@/lib/post-view";

/** Surface a couple of well-known auto-post metadata fields legibly, when present (FR-014). */
function MetadataStrip({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return null;
  const commitSha = typeof metadata.commitSha === "string" ? metadata.commitSha : null;
  const balanceDelta = typeof metadata.balanceDelta === "string" ? metadata.balanceDelta : null;
  if (!commitSha && !balanceDelta) return null;
  return (
    <dl className="mb-8 flex flex-wrap gap-x-8 gap-y-2 rounded-lg border border-border-hairline bg-surface-sunken p-4">
      {commitSha && (
        <div className="flex flex-col gap-1">
          <dt className="type-eyebrow text-text-dim">Commit</dt>
          <dd className="type-readout text-text-strong">{commitSha.slice(0, 12)}</dd>
        </div>
      )}
      {balanceDelta && (
        <div className="flex flex-col gap-1">
          <dt className="type-eyebrow text-text-dim">Balance delta</dt>
          <dd className="type-readout text-text-strong">{balanceDelta}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The article body (T044, FR-014): the safely-rendered markdown (`PostView.bodyHtml`, never a raw
 * string) plus any surfaced auto-post metadata. Prose styling via semantic-token descendant selectors
 * (no raw hex, no `prose` plugin), so react-markdown's semantic HTML reads well. Degrades gracefully
 * with no image/metadata.
 */
export function ArticleBody({ post }: { post: PostView }) {
  return (
    <div className="mt-10">
      <MetadataStrip metadata={post.metadata} />
      <div
        className={[
          "max-w-prose text-text",
          "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-text-strong",
          "[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-text-strong",
          "[&_p]:my-4 [&_p]:leading-relaxed",
          "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_li]:my-1 [&_li]:marker:text-text-dim",
          "[&_a]:text-faction-friendly [&_a]:underline [&_a]:underline-offset-2",
          "[&_strong]:text-text-strong [&_strong]:font-semibold",
          "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-faction-friendly [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted",
          "[&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1.5 [&_code]:py-0.5",
          "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border-hairline [&_pre]:bg-surface-sunken [&_pre]:p-4",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
          "[&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-border-hairline",
          "[&_hr]:my-8 [&_hr]:border-border",
          "[&_table]:my-6 [&_table]:w-full [&_table]:text-left",
          "[&_th]:border-b [&_th]:border-border [&_th]:pb-2 [&_th]:text-text-strong",
          "[&_td]:border-b [&_td]:border-border-hairline [&_td]:py-2",
        ].join(" ")}
      >
        {post.bodyHtml}
      </div>
    </div>
  );
}
