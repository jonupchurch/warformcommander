import { GarageScreen } from '@/components/garage/garage-screen';
import { freshSession } from '@/lib/garage/editor-reducer';
import { GarageEditorProvider } from '@/lib/garage/use-garage-editor';
import { AuthError } from '@/server/authz';
import { listDefense, type DefenseSnapshot } from '@/server/defense';
import { listPresets, type Preset } from '@/server/presets';
import { getCurrentRuleset } from '@/server/ruleset';
import { requireSession } from '@/server/session';
import { BASELINE_SLOTS, listSquads, type Squad } from '@/server/squads';

/**
 * The Garage (Feature 4, T001). A Server Component that loads the two inputs the client editor needs
 * — the **live** current `Ruleset` (the same DB-backed balance table battles resolve against, so the
 * pickers/previews reflect admin edits + hot-added equipment, not the frozen engine default) and the
 * player's saved roster (Feature 7 `listSquads`) — and hands them to the client
 * {@link GarageEditorProvider}. An anonymous visitor still gets the builder (an empty roster); the
 * Save action is where the server enforces the session (A1).
 */
export const dynamic = 'force-dynamic';

export default async function GaragePage() {
  const { ruleset } = await getCurrentRuleset();

  let roster: Squad[] = [];
  let presets: Preset[] = [];
  let defense: DefenseSnapshot[] = [];
  try {
    const actor = await requireSession();
    const [squadsResult, presetsResult, defenseResult] = await Promise.all([
      listSquads(actor),
      listPresets(actor),
      listDefense(actor),
    ]);
    if (squadsResult.ok) roster = squadsResult.value;
    if (presetsResult.ok) presets = presetsResult.value;
    if (defenseResult.ok) defense = defenseResult.value;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e; // anonymous → empty roster, build still works
  }

  // Seed a fresh session targeting the first free roster slot, so a brand-new build is immediately
  // saveable without first picking a slot.
  const taken = new Set(roster.map((s) => s.slotIndex));
  const initialSession = freshSession();
  for (let i = 0; i < BASELINE_SLOTS; i += 1) {
    if (!taken.has(i)) {
      initialSession.rosterSlotIndex = i;
      break;
    }
  }

  return (
    <GarageEditorProvider
      ruleset={ruleset}
      roster={roster}
      presets={presets}
      defense={defense}
      initialSession={initialSession}
    >
      <GarageScreen />
    </GarageEditorProvider>
  );
}
