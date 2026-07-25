/**
 * `GET|POST /api/cron/bot-tournament` — the scheduled trigger for the automated bot round-robin
 * (cold-start ladder liveness). There is no user session; the trust boundary is a shared `CRON_SECRET`
 * bearer, verified constant-time — the same posture as `/api/admin/devlog`. A bad or absent secret is
 * 401 with **no work done**.
 *
 * Both verbs are accepted so either scheduler works unchanged: GitHub Actions posts here, and a future
 * switch to Vercel Cron (which issues GET with the same bearer) needs no code change. Node runtime
 * (DB + wasm host); the fan-out gets the full function budget.
 */

import { timingSafeEqual } from "node:crypto";

import { runBotTournament } from "@/server/bot-tournament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Constant-time comparison of the presented Bearer against the configured `CRON_SECRET`. */
function authorized(req: Request): boolean {
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (provided.length === 0 || expected.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual requires equal lengths
  return timingSafeEqual(a, b);
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const summary = await runBotTournament();
  return Response.json(summary);
}

export const GET = handle;
export const POST = handle;
