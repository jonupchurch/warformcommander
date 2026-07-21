/**
 * Public commander profile (Feature 10, T006 — US1). A Server Component that resolves a commander by
 * handle (`getProfileByHandle`) and renders the same public view-model as the own route; an unknown
 * handle calls `notFound()` (FR-005). `generateMetadata` puts the handle in the tab title. Any
 * signed-in viewer may view any commander; anonymous viewers see the public board too. Read-only.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProfileScreen } from '@/components/profile/profile-screen';
import { AuthError } from '@/server/authz';
import { getProfileByHandle } from '@/server/profile';
import { requireSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle} — Warform Commander` };
}

async function viewerIdOrNull(): Promise<string | null> {
  try {
    return (await requireSession()).id;
  } catch (e) {
    if (e instanceof AuthError) return null;
    throw e;
  }
}

export default async function CommanderProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewerId = await viewerIdOrNull();

  const res = await getProfileByHandle(handle, viewerId);
  if (!res.ok) notFound();

  return <ProfileScreen vm={res.value} />;
}
