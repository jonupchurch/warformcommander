/**
 * The engine's canonical default ruleset, loaded from the committed parity fixture (emitted by
 * `emit_derive_battery`). Shared by the Garage foundational-layer unit tests so they exercise the
 * real balance table + content catalog, not a hand-rolled stub.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Ruleset } from '@/sim/ruleset';

export const defaultRuleset: Ruleset = (
  JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'fixtures', 'derive-battery.json'), 'utf8'),
  ) as { ruleset: Ruleset }
).ruleset;
