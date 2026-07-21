/**
 * Own profile route (Feature 10, T006 — US1) — a Server Component that assembles the signed-in
 * commander's public career view (`getOwnProfile`). Anonymous → a sign-in prompt (profiles are viewed
 * from inside the app). Read-only.
 */

import Link from 'next/link';

import { ProfileScreen } from '@/components/profile/profile-screen';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/server/authz';
import { getOwnProfile } from '@/server/profile';
import { requireSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  let viewerId: string;
  try {
    viewerId = (await requireSession()).id;
  } catch (e) {
    if (e instanceof AuthError) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
          <h1 className="type-display text-2xl text-text-strong">PROFILE</h1>
          <p className="type-body text-sm text-text-muted">Sign in to see your career stats and badges.</p>
          <Button asChild size="lg">
            <Link href="/api/auth/signin">Sign in</Link>
          </Button>
        </div>
      );
    }
    throw e;
  }

  const res = await getOwnProfile(viewerId);
  if (!res.ok) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-16 text-center">
        <h1 className="type-display text-2xl text-text-strong">PROFILE</h1>
        <p className="type-body text-sm text-text-muted">Your profile could not be loaded.</p>
      </div>
    );
  }

  return <ProfileScreen vm={res.value} />;
}
