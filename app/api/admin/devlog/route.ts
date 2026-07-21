/**
 * `POST /api/admin/devlog` (Feature 12, US4) — the machine-to-machine code-push → news endpoint. A
 * post-deploy hook (the GitHub Action in `.github/workflows/devlog.yml`, or a Vercel
 * `deployment.succeeded` webhook) presents a **shared secret** and the commit metadata; there is no
 * user session, so the trust boundary is the secret (verified constant-time), never a role (FR-004,
 * admin-authz.md). A bad/absent secret is 401 with **no write**; `recordDevlogPost` is idempotent by
 * SHA so a retried delivery is a silent no-op.
 *
 * Node runtime — DB access + `node:crypto`.
 */

import { timingSafeEqual } from "node:crypto";

import { recordDevlogPost, type DevlogPayload } from "@/server/devlog";

export const runtime = "nodejs";

/** Constant-time comparison of the presented Bearer secret against the configured one. */
function verifySecret(req: Request): boolean {
  const header = req.headers.get("authorization");
  const provided = header?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = process.env.DEVLOG_WEBHOOK_SECRET ?? "";
  if (provided.length === 0 || expected.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual requires equal lengths
  return timingSafeEqual(a, b);
}

/** Only real pushes to `main` post (a preview / non-main deploy does not — FR-018, US4-AS4). */
function isMainBranch(branch: string): boolean {
  return branch === "main" || branch.endsWith("/main");
}

export async function POST(req: Request): Promise<Response> {
  if (!verifySecret(req)) return new Response(null, { status: 401 });

  let payload: Partial<DevlogPayload>;
  try {
    payload = (await req.json()) as Partial<DevlogPayload>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const required = [payload.sha, payload.message, payload.author, payload.compareUrl, payload.branch];
  if (!required.every((v) => typeof v === "string" && v.length > 0)) {
    return Response.json({ error: "missing required commit fields" }, { status: 400 });
  }

  if (!isMainBranch(payload.branch as string)) {
    return Response.json({ created: false, skipped: "non-main deploy" }, { status: 200 });
  }

  const result = await recordDevlogPost(payload as DevlogPayload);
  return Response.json(result, { status: 200 });
}
