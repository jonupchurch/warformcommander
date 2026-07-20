/**
 * Server-authoritative battle resolution (Feature 1, T027). POST a `BattleInput`, get the compact
 * wire replay back. Runs the WASM engine on the Node runtime (Vercel Fluid Compute).
 *
 * This is the foundational endpoint the sim core exposes. Feature 8 (Arena) wraps it with auth,
 * matchmaking, a **server-loaded** ruleset (never trust a client-supplied balance table), and
 * persistence; here it is the thin, well-typed engine boundary those features build on.
 */

import { NextResponse } from 'next/server';

import { resolveBattle, EngineError, type BattleInput } from '@/sim';

// The WASM engine needs full Node APIs — never Edge (constitution/Vercel guidance).
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let input: BattleInput;
  try {
    input = (await request.json()) as BattleInput;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const reader = await resolveBattle(input);
    // Return the wire replay for the client to play back (Feature 5) or the server to persist.
    return NextResponse.json(reader.replay);
  } catch (err) {
    if (err instanceof EngineError) {
      // Validation / derivation / parse failures are the caller's fault, not a server error.
      return NextResponse.json({ error: err.status, detail: err.response }, { status: 422 });
    }
    throw err; // unexpected — let the platform log it (Sentry)
  }
}
