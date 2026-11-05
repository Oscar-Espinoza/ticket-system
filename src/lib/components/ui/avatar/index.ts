/**
 * Avatar (React: src/components/ui/avatar.tsx, Radix Avatar → bits-ui Avatar).
 *
 * Caller translation:
 * - `<Avatar size="sm" className>` → `<Avatar size="sm" class>`; same `size` values.
 * - `<AvatarImage src alt />` unchanged. The image is `display:none` until it has loaded
 *   and the fallback shows meanwhile (same visible behaviour as Radix).
 * - Radix `AvatarFallback delayMs` → pass `delayMs` on `Avatar` (bits-ui puts it on Root).
 * - `onLoadingStatusChange` / `bind:loadingStatus` go on `Avatar`.
 */
import Avatar from "./avatar.svelte"
import AvatarImage from "./avatar-image.svelte"
import AvatarFallback from "./avatar-fallback.svelte"
import AvatarGroup from "./avatar-group.svelte"
import AvatarGroupCount from "./avatar-group-count.svelte"
import AvatarBadge from "./avatar-badge.svelte"

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
