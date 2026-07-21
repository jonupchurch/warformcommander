import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";
import { Panel } from "@/components/ui/panel";
import { AuthError } from "@/server/authz";
import { requireSession } from "@/server/session";

import { OnboardingForm } from "./onboarding-form";

/**
 * Registration handle gate (Feature 7). A signed-in commander with no handle is routed here by the
 * `(app)` layout and must choose one before using the app. Lives *outside* the `(app)` route group so
 * the gate never loops. Anonymous → sign-in; already-onboarded → straight into the app.
 */
export const metadata: Metadata = { title: "Choose your handle", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let user;
  try {
    user = await requireSession();
  } catch (e) {
    if (e instanceof AuthError) redirect("/api/auth/signin");
    throw e;
  }
  if (user.handle) redirect("/garage"); // already onboarded — nothing to do here

  return (
    <main className="px-safe flex min-h-dvh flex-col items-center justify-center py-16">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex items-center gap-2.5">
          <Logo />
          <Wordmark size="sm" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="type-display text-3xl text-text-strong">Choose your commander handle</h1>
          <p className="type-body text-text-muted">
            One more step, commander. Pick the name other players will see on the ladder and in battle.
            You can change it later from your profile.
          </p>
        </div>
        <Panel className="flex flex-col gap-4">
          <OnboardingForm />
        </Panel>
      </div>
    </main>
  );
}
