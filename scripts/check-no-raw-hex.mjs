// SC-002 guard: no raw brand hex outside app/globals.css.
// Every consumer must bind to a semantic token (bg-*/text-*/border-* utilities or var(--…)),
// so a hex color literal anywhere under components/ or app/ (except the token file itself and
// generated brand icon assets) is a violation. Run via `npm run lint:tokens`; wired into CI.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const ROOTS = ["components", "app"];
// The only places raw hex is allowed to live:
const ALLOW = new Set([
  join("app", "globals.css"), // the token source of truth
  join("app", "favicon.ico"), // binary
]);
// Generated brand vector assets legitimately carry the mark's fills (US4, T044).
const ALLOW_PREFIX = [join("app", "icon"), join("app", "apple-icon")];
const EXT = /\.(tsx?|css|svg)$/;
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** @param {string} dir */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir may not exist yet
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.test(name)) yield p;
  }
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (ALLOW.has(file) || ALLOW_PREFIX.some((pre) => file.startsWith(pre))) continue;
    const src = readFileSync(file, "utf8");
    src.split(/\r?\n/).forEach((line, i) => {
      const m = line.match(HEX);
      if (m) violations.push(`${file.split(sep).join("/")}:${i + 1}  ${m.join(", ")}`);
    });
  }
}

if (violations.length) {
  console.error("✗ Raw brand hex found outside app/globals.css (SC-002). Bind to a token instead:\n");
  violations.forEach((v) => console.error("  " + v));
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
console.log("✓ No raw brand hex outside app/globals.css.");
