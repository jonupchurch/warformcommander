# Research: Battle Simulation Core + Game Data Model

**Feature**: `001-battle-sim-core` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the technical unknowns behind the revised spec (Rust→WASM engine,
cross-platform determinism, seekable replay-as-data). Format per decision:
**Decision / Rationale / Alternatives considered**. Sources are cited inline.

The unknowns cluster into three workstreams — **(A) cross-platform determinism of
`resolve()`**, **(B) the Rust→WASM build & integration toolchain on Vercel**, and
**(C) the replay format & its storage**. Each is load-bearing and largely independent.

---

## Workstream A — Cross-platform determinism (P6, SC-001)

The hard requirement: byte-identical output for a fixed seed + inputs across **native**
(the balancer) and **wasm32** (the server), 1,000× (SC-001). Everything below serves it.

### A1. Floats vs fixed-point → **no IEEE-754 floats in the core; integer/fixed-point only**

- **Decision**: Do **all** combat math in integer/fixed-point. No `f32`/`f64` anywhere in
  the deterministic core.
- **Rationale**: WebAssembly *internally* mandates correctly-rounded IEEE-754 for
  add/sub/mul/div/sqrt, so pure wasm float arithmetic is deterministic — **but native ==
  wasm is NOT guaranteed.** Three divergence sources survive across the native+wasm split:
  (1) **transcendentals/`libm`** (`sin/exp/pow` aren't wasm instructions; Rust documents
  their precision as platform- and version-dependent), (2) **FMA contraction** (`a*b+c`
  fused or not, backend-dependent), (3) x87 excess precision (historical). Rapier proves
  floats *can* be made cross-platform deterministic, but only with `enhanced-determinism` +
  all transcendentals via `libm` + SIMD/parallelism disabled — a permanent audit burden we
  avoid entirely, since our sim only does mul/add/compare (no trig, no sqrt). Fixed-point
  deletes the whole risk class and yields total order (integers are `Eq`/`Hash`, so the
  replay is trivially hashable).
- **Alternatives considered**: *Floats + strict-IEEE + libm routing* (Rapier's path) —
  rejected: fragile, one stray `f32::sin` silently breaks it, unnecessary here. *Wasm-only
  determinism* — insufficient: the native balancer isn't bound by the wasm spec.
- Sources: [WebAssembly Nondeterminism.md](https://github.com/WebAssembly/design/blob/main/Nondeterminism.md),
  [Rust float non-determinism #150323](https://github.com/rust-lang/rust/issues/150323),
  [Rapier determinism guide](https://rapier.rs/docs/user_guides/rust/determinism/),
  [Gaffer On Games: Floating Point Determinism](https://gafferongames.com/post/floating_point_determinism/).

### A2. Fixed-point representation → **scaled `i64` newtype (milli-units), basis-point multipliers via `i128`**

- **Decision**: Represent every quantity as a thin `i64` newtype at **decimal scale 1000**
  (milli-units): hull 2000 → `2_000_000`. Apply percentage multipliers (×1.4, ×0.85, ×0.6,
  ×1.25) as **basis points** (`14000, 8500, 6000, 12500`; scale 10 000) through one helper
  that widens to `i128`, multiplies, integer-divides with a **single documented rounding
  rule**:
  ```rust
  fn mul_bp(value: i64, bp: i64) -> i64 { ((value as i128 * bp as i128) / 10_000) as i64 }
  ```
- **Rationale**: Magnitudes are tiny (hull ≤ ~2000, multipliers near 1.0) and there are no
  transcendentals, so a raw scaled integer gives **exact, decimal-legible** multipliers with
  zero external-crate/version surface — the strongest determinism story. Basis-point math
  removes the "is 1.4 *really* 1.4?" question that *binary* fixed-point introduces. `i64`
  headroom (±9.2×10¹⁸) makes overflow a non-issue as long as products widen to `i128`.
  - **±5% variance**: roll `r ∈ [-500, 500]` bp → `mul_bp(dmg, 10_000 + r)`.
  - **Accuracy/evasion/crit**: integer threshold compares — `hit = roll_bp < accuracy_bp`,
    `roll_bp = rng.next_u32() % 10_000`.
  - **Overflow posture**: use `checked_*`/`saturating_*`/`i128` widening explicitly — debug
    panics but release wraps by default, which is a determinism footgun; make them agree.
- **Alternatives considered**: *`fixed` crate `I32F32`* — acceptable ergonomic alternative
  (operator overloading, `checked/saturating`, `no_std`), but it's *binary* fixed-point so
  1.4 isn't stored exactly; you'd still want bp math for legible balance numbers. Pin the
  version if used. *`I16F16`* — rejected: 16 integer bits overflow on hull×multiplier
  products. *`cordic`/`substrate-fixed`* — unneeded (no trig; substrate-fixed is a pinned
  fork for blockchains).
- Sources: [`fixed` crate](https://docs.rs/fixed/), [FixedI64](https://docs.rs/fixed/latest/fixed/struct.FixedI64.html),
  [Rust deterministic game engine (2025)](https://blog.vermeilsoft.com/2025-09-rust-game-engine/).

### A3. Seeded PRNG → **`rand_pcg::Pcg64` via `seed_from_u64`, version-pinned**

- **Decision**: `rand_pcg::Pcg64`, seeded `Pcg64::seed_from_u64(seed)`. Pin the exact crate
  version (`rand_pcg = "=x.y.z"`). `rand_chacha::ChaCha8Rng` is the equal-footing alternative
  if we want stream-cipher quality / 32-byte keys.
- **Rationale**: `rand_pcg` is explicitly **portable & value-stable** ("deterministic and
  portable … tested against reference vectors"), float-free, and just two `u128` words (cheap
  to clone/snapshot). It has none of `StdRng`'s "may change output any release" disclaimer.
- **Alternatives considered**: ***`StdRng`/`SmallRng`* — rejected outright**: the rand book
  declares them **non-portable** ("may make value-breaking changes in any release"); `StdRng`'s
  algorithm has already been swapped once. *Hand-rolled SplitMix64/PCG* (~20 lines) — valid for
  a hard-determinism core and removes the crate surface, but `rand_pcg` pinned + a reference-
  vector test is nearly as safe and better tested.
- **Usage rules**: never `from_entropy`/`thread_rng`; **never sample `usize`/`isize`** (width
  differs 32- vs 64-bit → wasm32 vs native64 divergence) — draw explicit fixed-width integers;
  **avoid float distributions** (route through platform math). Prefer `next_u32() % N` or
  `Uniform<u32>`.
- Sources: [rand book: Reproducibility](https://rust-random.github.io/book/crate-reprod.html),
  [rand_pcg](https://docs.rs/rand_pcg/latest/rand_pcg/), [rand_chacha](https://docs.rs/rand_chacha/latest/rand_chacha/),
  [StdRng docs](https://docs.rs/rand/latest/rand/rngs/struct.StdRng.html).

### A4. Deterministic ordering → **BTreeMap/Vec, total-order sorts, single-threaded, time/entropy-free**

- **Decision**: A hard rule-set for the core crate:
  1. **No `HashMap`/`HashSet` iteration** in the sim (per-process `RandomState` seeding varies
     order). Use `BTreeMap`/`BTreeSet`/`Vec` with explicit stable ordering.
  2. **Sort with a total-order key** — always include a unique tiebreaker (e.g. `instanceId`)
     so `sort_unstable_by_key` has no ambiguous ties.
  3. **Single-threaded `resolve()`** — no `rayon`/`par_iter` *inside* a match; the balancer
     parallelizes **across** independent, independently-seeded matches only.
  4. **No ambient time/entropy** — no `SystemTime`/`Instant`/`getrandom`/`thread_rng` in the
     core; feature-gate any `std::time`.
  5. **No floats / float hashing / `f32::sin`** (A1).
  6. **Deterministic overflow** — `checked/saturating/wrapping` explicit so debug==release.
  7. **Fix the order of every accumulation and multiplier chain** — because integer division
     rounds, `mul_bp(mul_bp(x,a),b) ≠ mul_bp(mul_bp(x,b),a)`; the mitigation pipeline order
     (shield → armor → variance → crit, per §9.2) is defined once in code and tested.
- **Rationale**: These are the known Rust determinism footguns; each is cheap to follow and
  catastrophic to miss.
- Sources: [Bevy determinism discussion](https://github.com/bevyengine/bevy/discussions/2480),
  [Rapier determinism](https://rapier.rs/docs/user_guides/rust/determinism/).

### A5. Determinism testing → **committed golden-hash, run on native + wasm in CI**

- **Decision**: `resolve(input) → Replay`; serialize deterministically; hash (BLAKE3 or
  SHA-256); assert against a **committed golden hash**; run that same golden test on **native
  (x86-64 + ARM)** and **wasm (`wasm-pack test --node`)** in CI. Three layers:
  1. **Intra-run**: 1000× same input → all hashes equal (catches ambient nondeterminism).
  2. **Golden/reference-vector**: committed known-good hash for a fixed battery of
     `(seed, inputs)` — anchors against logic changes AND a silent PRNG/crate-version shift.
  3. **Property**: `proptest` over random inputs asserting `resolve(x) == resolve(x)`.
  - **Cross-target is the load-bearing part**: if the **wasm** hash equals the **native**
    golden hash for the battery, native==wasm determinism is *proven* for those cases.
    `wasm-pack test --node` matches the actual Node-on-Vercel runtime most closely.
- **Rationale**: A single committed hash simultaneously pins intra-run determinism, cross-
  version stability, and native==wasm agreement. **This hash test — not the PRNG crate's
  informal promise — is the real determinism contract**; pin exact crate versions behind it.
- **What to hash**: the canonical stored artifact is the **JSON replay** (Workstream C). Its
  serialization is deterministic because the state is integer-only and the shape is
  structs + positional arrays (declaration/index order) with **no serde maps** (the one
  serde_json nondeterminism source — key order — which we never use). So hashing the JSON
  bytes tests the real artifact. (A binary `postcard` encoding of the same `Replay` is an
  equally-valid hash target if we ever want it faster; both are float-free and stable.)
- **Build-reproducibility caveat**: Cargo has produced non-bit-identical `.wasm` across host
  OSes for identical source — that's *build* reproducibility, not *output* determinism. With
  an integer-only core the **output** stays identical regardless; still, build the production
  wasm in one CI environment and pin the toolchain to avoid confusion.
- Sources: [Wasmtime deterministic execution](https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html),
  [wasm cross-OS build reproducibility #117597](https://github.com/rust-lang/rust/issues/117597).

---

## Workstream B — Rust→WASM build & integration on Vercel

### B1. Build tool → **`wasm-pack build --target nodejs`**

- **Decision**: Build the engine's wasm with `wasm-pack build crates/engine --target nodejs`.
- **Rationale**: The module is compute-only, consumed by Node server code. `--target nodejs`
  emits self-contained **CommonJS** glue that `readFileSync`s and instantiates the `.wasm`
  **synchronously at module load** (no top-level `await`, no bundler) — exactly what survives
  Vercel's Node runtime intact. `wasm-pack` wraps `cargo build` + `wasm-bindgen` + `wasm-opt`
  + emits a `package.json`, so the Next app consumes it as an ordinary workspace package.
- **Alternatives considered**: *`--target bundler`* (the default) — **rejected**: emits an ES
  module assuming the bundler handles `asyncWebAssembly`; works under webpack but **not
  Turbopack** (Next 16 default), a trap. *`--target web`* — browser-only, irrelevant server-
  side. *Raw `wasm-bindgen` CLI* — only buys control we don't need for a headless module.
- Source: [wasm-bindgen deployment reference](https://rustwasm.github.io/docs/wasm-bindgen/reference/deployment.html).

### B2. Loading the `.wasm` on Vercel → **`serverExternalPackages` + `outputFileTracingIncludes`**

- **Decision**: Mark the generated wasm package as `serverExternalPackages`, and force the
  binary into the function bundle with top-level `outputFileTracingIncludes`. Call it from a
  Node-runtime Route Handler (`runtime = 'nodejs'`, **never** edge).
  ```ts
  // next.config.ts (Next 16 — top-level, no longer experimental)
  const nextConfig: NextConfig = {
    serverExternalPackages: ['@wfc/engine-wasm'],
    outputFileTracingIncludes: { '/api/resolve': ['./node_modules/@wfc/engine-wasm/**/*.wasm'] },
    // monorepo: outputFileTracingRoot: path.join(__dirname, '../../'),
  };
  ```
- **Rationale**: Vercel traces files with `@vercel/nft`; the nodejs-glue loads its `.wasm` via
  a `__dirname`-joined path nft doesn't always trace → the classic "file not found at runtime."
  `serverExternalPackages` keeps Node `require`-ing the glue from `node_modules` (not bundled/
  mangled); `outputFileTracingIncludes` guarantees `engine_bg.wasm` ships.
- **Turbopack caveats**: Turbopack exposes no `module.rules` and no `asyncWebAssembly` escape
  hatch, so `import x from './foo.wasm'` bundler-magic won't work — keeping the package
  **external** sidesteps it entirely. Keep any `require.resolve()` **lazy** (inside the handler),
  since Turbopack statically evaluates it at build time. The webpack path
  (`next build --webpack` + `experiments.asyncWebAssembly`) exists as a fallback but we don't
  design around it — external + file-tracing is bundler-agnostic.
- Sources: [Vercel WASM runtime docs](https://vercel.com/docs/functions/runtimes/wasm),
  [Next.js output tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
  [next.js#54395 (wasm not traced)](https://github.com/vercel/next.js/issues/54395).

### B3. Workspace layout & CI → **one `["cdylib","rlib"]` crate; prebuild wasm in CI and commit it**

- **Decision**: A single Rust crate `crate-type = ["cdylib", "rlib"]` — the `rlib` links into
  the native balancer, the `cdylib` feeds `wasm-pack`. **Prebuild `packages/engine-wasm/` in
  our own CI (GitHub Actions) and commit the artifact**; Vercel runs only `next build`.
  ```
  repo/
    crates/engine/      # pure resolve() core; [lib] crate-type = ["cdylib","rlib"]
    crates/balancer/    # native Monte-Carlo bin (Feature 2); depends on engine (rlib)
    packages/engine-wasm/  # committed wasm-pack output (engine.js + engine_bg.wasm + package.json)
    app/ (existing Next.js app at repo root)  # depends on @wfc/engine-wasm
    Cargo.toml          # [workspace]
  ```
- **Rationale**: Dual crate-type is the documented rustwasm pattern (cdylib → `.wasm` with no
  start fn; rlib → native link + `wasm-pack test`). **Vercel's build image has no guaranteed
  Rust toolchain**, so prebuilding avoids installing rustup+wasm-pack in the build command
  (minutes + flakiness) — and committing the exact `.wasm` **pins a byte-identical replay-
  producer across deploys** (P6). Set `outputFileTracingRoot` to repo root so nft reaches the
  hoisted package. Escape hatch (install toolchain in the Vercel build command) is fallback only.
- **Repo-fit note**: the existing Next.js app lives at the **repo root** (not `apps/web`), so
  the Rust crates + wasm package are added *alongside* it (`crates/`, `packages/`) rather than
  restructuring into `apps/`. Structure Decision in plan.md pins the concrete paths.
- Sources: [wasm-pack Cargo.toml deep-dive](https://rustwasm.github.io/docs/wasm-pack/tutorials/npm-browser-packages/template-deep-dive/cargo-toml.html),
  [vercel-community/rust](https://github.com/vercel-community/rust).

### B4. Precedent & headroom → **first-party supported, huge margin**

- **Decision / evidence**: Rust→WASM in Vercel Node functions is a documented, first-party
  path. Vercel's runtime docs show compiling Rust to `.wasm` in the `nodejs` runtime; the
  canonical `vercel/next.js` `with-webassembly` example backs it; **`@vercel/og` ships a
  Rust/WASM pipeline in production** (Satori + **resvg** via `@resvg/resvg-wasm`). Package-size
  headroom: 250 MB standard → **5 GB** on Fluid Compute; a wasm-bindgen engine is a few MB —
  nowhere near either ceiling.
- Sources: [Vercel WASM runtime](https://vercel.com/docs/functions/runtimes/wasm),
  [vercel/satori](https://github.com/vercel/satori),
  [5 GB changelog](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size).

---

## Workstream C — Replay format & storage

### C1. JS↔WASM marshaling → **bytes-in / bytes-out; Rust owns (de)serialization; replay = JSON bytes**

- **Decision**: The WASM boundary is `resolve(input: &[u8]) -> Vec<u8>` — a **thin two-copy
  boundary** (one buffer in, one out), Rust owning all encode/decode. The **replay is emitted
  as JSON bytes** (`serde_json::to_vec`). Input (two 5-unit armies + ruleset) is small — JSON
  bytes are fine.
- **Rationale**: This **reconciles the two research streams.** The WASM-marshaling analysis
  favored a compact binary codec (postcard/bincode) for a thin boundary and warned against
  `serde-wasm-bindgen` (which recursively materializes many fine-grained JS objects per call —
  wrong for a large replay). The replay-format analysis — with the full picture of the replay's
  shape and the **client's random-access needs** — showed **JSON is right for the replay
  artifact** (the TS client must parse & index it; it's positional-integer, not binary-buffer-
  nested; size is modest). These combine: pass **JSON bytes** across the thin boundary (still
  one copy out, Rust-owned), the server stores them **directly as jsonb**, the client parses &
  indexes. Best of both: thin boundary + JSON-for-client, one canonical artifact across wasm,
  native, and client. (The **native balancer** never serializes for storage — it reads the
  in-memory `MatchResult` directly; only the server path emits JSON.)
- **Alternatives considered**: *`serde-wasm-bindgen`* — rejected: too many boundary crossings
  for a large replay. *postcard/bincode out* — viable and more compact, but forces a binary
  decode step on the TS client for zero benefit at this size; keep it as the documented escape
  hatch (C3) if replays ever grow past multiple MB.
- Sources: [serde-wasm-bindgen](https://docs.rs/serde-wasm-bindgen/latest/serde_wasm_bindgen/),
  [rustwasm: arbitrary data with serde](https://rustwasm.github.io/docs/wasm-bindgen/reference/arbitrary-data-with-serde.html).

### C2. Replay serialization & random access → **JSON, positional/columnar arrays, tick-indexed**

- **Decision**: Plain **JSON**; **full per-tick state snapshots + events** (not deltas);
  **positional/columnar arrays** keyed by a `unitOrder` dictionary; **tick-indexed** so
  `snapshots[tick]` / `events[tick]` are O(1). Decode the whole replay once into a JS array on
  load, then index. Full schema: [contracts/replay-format.md](./contracts/replay-format.md).
- **Rationale**: The hard constraint is **instant random-access seek from TS with zero
  re-simulation** (the previous game's broken scrubber came from event/delta streams needing
  re-sim to seek). Snapshots-not-deltas make seek a pure array index. Positional arrays
  (`[hull,shield,zoneIdx,alive]` per unit) cut raw size ~2–3× vs keyed objects and compress
  better while keeping indexing trivial. At hundreds of KB, "decode once, index" *is* O(1) seek
  — a real tick→byte-offset index only pays off at MB–GB streaming scale (the FlatBuffers/
  Cap'n Proto regime), which we're nowhere near.
- **Alternatives considered**: *MessagePack/CBOR* — only ~2× smaller and often **slower** to
  decode in-browser than native `JSON.parse`; adds a dep both sides for a size win Postgres
  TOAST already provides. *bincode/postcard* — non-self-describing, awkward from TS; exactly the
  cross-language friction to avoid. *FlatBuffers/Cap'n Proto* — true zero-copy seek but solves a
  GB-scale problem we don't have; heaviest cross-language friction.
- Sources: [msgpack-javascript](https://github.com/msgpack/msgpack-javascript),
  [JSON.parse vs msgpack in-browser](https://smali-kazmi.medium.com/when-optimized-is-slower-why-we-stuck-with-native-json-for-our-10mb-context-object-2d7dd62e6982).

### C3. Postgres/Neon storage → **`jsonb` column; let TOAST compress; no Blob offload**

- **Decision**: Store the replay as one **`jsonb`** column on a `replays` row, alongside
  first-class scalar columns for what a query filters/joins on (`seed`, `rulesetHash`/
  `rulesetVersion`, `formatVersion`, `winner`) + the army inputs. Let Postgres TOAST-compress
  it automatically. **No manual gzip, no `bytea`, no Vercel Blob offload.** (This lands in the
  Feature 7 schema; noted here as the format's storage contract.)
- **Rationale**: For "fetch whole replay by id," `jsonb` gives a **parsed, TS-typed object for
  free** via Drizzle `.$type<Replay>()` + postgres-js, whereas `bytea` needs a Drizzle custom
  type + manual encode/decode and only wins under heavy per-field access we don't do. `jsonb`
  max field is **1 GB** (5 orders of magnitude of headroom); values >~2 KB auto-move to TOAST
  and compress (PGLZ/LZ4) — so manual compression buys nothing. Vercel Blob is for unstructured
  files >100 MB, not the core structured artifact at hundreds of KB.
  - **Driver reconciliation**: the actual code (`db/index.ts`) uses **`drizzle-orm/postgres-js`**
    (not `neon-http` as STATUS.md's tech-stack line still says — that line is stale and gets
    fixed in the planning pass). postgres-js returns `jsonb` as parsed objects and `bytea` as
    native `Buffer` (no HTTP hex-encode penalty), so the escape hatch below is cheap.
- **Escape hatch (don't build yet)**: if replays ever routinely exceed ~1 MB and profiling
  proves payload size a bottleneck, switch that one column to **MessagePack-in-`bytea`**; the
  `formatVersion` stamp makes it a clean, non-breaking migration.
- Sources: [Postgres JSON types](https://www.postgresql.org/docs/current/datatype-json.html),
  [jsonb + TOAST](https://www.snowflake.com/en/engineering-blog/postgres-jsonb-columns-and-toast/),
  [Drizzle custom types / bytea #3902](https://github.com/drizzle-team/drizzle-orm/issues/3902),
  [Neon serverless driver notes](https://neon.tech/blog/serverless-driver-ga).

### C4. Versioning → **integer `formatVersion`, supported-range gate, regenerate-not-migrate**

- **Decision**: Stamp an integer **`formatVersion`** both in the jsonb payload and as a SQL
  column. Player accepts a supported range, else **rejects explicitly** (no silent mis-render).
  Additive changes within a major → optional fields (`Option<T>` in Rust, optional in the TS
  schema). Breaking layout change → bump the integer.
- **Rationale**: Because we persist **seed + army inputs + rulesetHash** next to the replay, a
  format bump needs **no in-place migration** — an old replay is **re-emitted server-side** by
  re-running the deterministic engine at the current format. "Old replays still play" becomes
  "reject + optionally regenerate on the server," and the client stays a pure player that never
  re-simulates. This is why `rulesetHash`/inputs must be first-class stored fields.
- Sources: [Rust serde versioning](https://siedentop.dev/posts/rust-serde-versioning/),
  [schema evolution compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html).

### C5. Size sanity check → **tens-to-low-hundreds of KB; jsonb is right**

- **Finding**: Worst case (1000-tick cap, 10 units): compact positional JSON ≈ **250–400 KB
  raw**; verbose keyed ≈ 0.6–1 MB. **Typical 300–450-tick battle ≈ 70–150 KB compact raw.**
  All **5–10× smaller stored** (TOAST). Squarely `jsonb` territory; nothing demands binary. The
  one lever that keeps raw size honest is the **positional-array shape** (C2) — adopt it and even
  the cap sits in low-hundreds-of-KB raw, tens-of-KB stored.

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Language** | Rust (stable), `no_std`-friendly core where practical; TypeScript for the app + replay reader |
| **Math** | Integer/fixed-point — scaled `i64` milli-units + basis-point (`i128`) multipliers; **no floats** |
| **PRNG** | `rand_pcg::Pcg64` via `seed_from_u64`, **version-pinned**; golden-hash test is the contract |
| **Determinism rules** | BTreeMap/Vec, total-order sorts, single-threaded `resolve()`, no time/entropy, deterministic overflow, fixed pipeline order |
| **WASM build** | `wasm-pack build --target nodejs`; one `["cdylib","rlib"]` crate → native balancer + wasm |
| **Vercel integration** | `serverExternalPackages` + `outputFileTracingIncludes`; Node runtime route handler; **prebuild wasm in CI, commit artifact** |
| **JS↔WASM boundary** | `&[u8]` in → `Vec<u8>` out; Rust owns (de)serialization; replay = **JSON bytes** |
| **Replay format** | JSON, snapshots-not-deltas, positional/columnar arrays, tick-indexed (O(1) seek), `formatVersion` stamp |
| **Storage** | Postgres `jsonb` (Neon via **postgres-js**/Drizzle) + scalar columns; TOAST compresses; no Blob offload |
| **Testing** | committed golden-hash on native (x86-64+ARM) **and** wasm (`wasm-pack test --node`) in CI; 1000× intra-run; `proptest` run-twice; counter-web majority; validation coverage |

All spec **NEEDS CLARIFICATION** items (engine language/distribution, determinism approach,
replay format, storage) are resolved. No unresolved unknowns remain for Phase 1.
