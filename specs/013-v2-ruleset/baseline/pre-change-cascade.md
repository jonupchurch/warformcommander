# Pre-Change Cascade — v11 Green Baseline

**Captured**: 2026-07-22, on `feat/v2-ruleset-spec` at `842f441`, before any v2 content change.

Purpose (T001): make any later failure **attributable**. If something in this list breaks during v2
implementation, it broke because of v2 — not because it was already broken.

## Results

| Suite | Result |
|---|---|
| `cargo test -p engine` | **89 passed**, 0 failed |
| `cargo test -p balancer -- --test-threads=1` | **39 passed**, 1 ignored, 0 failed |
| `cargo test -p balancer --doc` | 0 tests, clean |
| `npx tsc --noEmit` | clean (exit 0) |
| `npm test` | **416 passed** across **49 files** |

Engine total 89 = 61 (unit) + 10 + 9 + 2 + 4 + 3 (integration).

## Two environmental gotchas found while establishing this

Both are **pre-existing** and unrelated to v2. Recorded so they are not misdiagnosed later.

### 1. `balancer --test statistics` crashes under parallel test threads

A bare `cargo test` aborts with `STATUS_ACCESS_VIOLATION (0xc0000005)` in
`tests/statistics.rs`. All three tests in that file pass individually and pass together with
`--test-threads=1`.

This is a **stack overflow**, not a logic fault — the statistics tests each run Monte-Carlo batches
that spawn rayon workers, and several running concurrently in an unoptimised debug build exhaust the
Windows default thread stack.

**Use `cargo test -p balancer -- --test-threads=1`.** A bare `cargo test` across the whole workspace
is unreliable on this machine and its failure means nothing.

### 2. A killed cargo process leaves unusable metadata

After the background `cargo test` was terminated mid-write, `cargo test -p balancer --doc` failed
with `E0786: found invalid metadata files for crate engine`. `cargo clean -p engine` (3879 files,
1.3 GiB) cleared it and the doctests passed.

If `E0786` appears, it is a corrupted incremental artifact from an interrupted build, not a code
problem. Clean the package and retry before investigating anything else.

## Reliable invocation for this feature

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo test -p engine
cargo test -p balancer -- --test-threads=1
npx tsc --noEmit
npm test          # NOT bare `npx vitest` — DB-backed tests need the dotenv wrapper
```
