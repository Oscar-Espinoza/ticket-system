/**
 * Dialog (Radix Dialog → bits-ui Dialog).
 *
 * Caller translation:
 * - `<Dialog open={o} onOpenChange={setO}>` works unchanged (the wrapper forwards `open`
 *   to bits-ui, so prop changes are honoured); `bind:open` also works; `defaultOpen` seeds it.
 * - `asChild` on DialogTrigger/DialogClose → `{#snippet child({ props })}<Button {...props}>…</Button>{/snippet}`.
 * - DialogTrigger / DialogClose (and the built-in X / footer Close) default `type="button"`
 *   like Radix; the `child` snippet's `props` carry it, so a nested `<Button>` won't submit.
 * - DialogContent always renders inside DialogPortal + DialogOverlay;
 *   `portalProps` forwards `to` / `disabled` to the portal. `showCloseButton` (default true).
 * - Event props: `onOpenAutoFocus` / `onCloseAutoFocus` unchanged (call `e.preventDefault()`),
 *   `onEscapeKeyDown` → `onEscapeKeydown`, `onPointerDownOutside` / `onInteractOutside` →
 *   `onInteractOutside`. `onKeyDown` on DialogContent → `onkeydown`.
 * - DialogTitle renders bits' heading element (`role="heading" aria-level="2"`; `level` prop).
 */
import Dialog from "./dialog.svelte"
import DialogClose from "./dialog-close.svelte"
import DialogContent from "./dialog-content.svelte"
import DialogDescription from "./dialog-description.svelte"
import DialogFooter from "./dialog-footer.svelte"
import DialogHeader from "./dialog-header.svelte"
import DialogOverlay from "./dialog-overlay.svelte"
import DialogPortal from "./dialog-portal.svelte"
import DialogTitle from "./dialog-title.svelte"
import DialogTrigger from "./dialog-trigger.svelte"

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
