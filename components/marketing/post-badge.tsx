import { Chip } from "@/components/ui/chip";
import type { PostBadge as PostBadgeData } from "@/lib/post-view";

/** Renders a post's type badge via Feature 3's `Chip` (tone from the data-model mapping table). */
export function PostBadge({ badge }: { badge: PostBadgeData }) {
  return <Chip tone={badge.tone}>{badge.label}</Chip>;
}
