'use client';

/**
 * The unsaved-changes guard (T037) — while the editor draft differs from its saved baseline
 * (`isDirty`), a `beforeunload` handler prompts before a tab close / reload / external navigation, so a
 * dirty draft is never *silently* lost. It renders nothing. (In-app route changes are additionally
 * gated by the Save affordance and the roster's explicit load action; the browser guard covers the
 * unrecoverable exits.)
 */

import { useEffect } from 'react';

import { useGarageEditor } from '@/lib/garage/use-garage-editor';

export function UnsavedGuard() {
  const { isDirty } = useGarageEditor();

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Legacy browsers require a returnValue to trigger the native prompt.
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  return null;
}
