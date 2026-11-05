/**
 * AlertDialog (React: src/components/ui/alert-dialog.tsx, Radix → bits-ui AlertDialog).
 *
 * Caller translation:
 * - `<AlertDialog open={o} onOpenChange={setO}>` works unchanged; `bind:open` also works;
 *   `defaultOpen` seeds the uncontrolled state.
 * - `<AlertDialogTrigger asChild><Button …/></AlertDialogTrigger>` →
 *   `<AlertDialogTrigger>{#snippet child({ props })}<Button {...props} …/>{/snippet}</AlertDialogTrigger>`.
 * - `AlertDialogAction onClick` → `onclick`. As with Radix, the dialog CLOSES after the
 *   handler runs unless the handler calls `event.preventDefault()` (restored on top of
 *   bits-ui, whose Action does not close). Closing calls the root's `onOpenChange(false)`.
 * - `AlertDialogCancel` closes (bits-ui behaviour, same as Radix).
 * - Action/Cancel render a `<button>` with `buttonVariants({ variant, size })`,
 *   `data-variant` / `data-size`, `type="button"` by default (the Radix Slot output).
 * - AlertDialogContent always renders inside AlertDialogPortal + AlertDialogOverlay;
 *   `size` ("default" | "sm"). `onEscapeKeyDown` → `onEscapeKeydown`.
 *   On open it focuses AlertDialogCancel like Radix (bits would focus the content);
 *   a caller `onOpenAutoFocus` that calls `e.preventDefault()` opts out.
 * - AlertDialogTrigger defaults `type="button"` (Radix did), also passed to a `child` snippet.
 */
import AlertDialog from "./alert-dialog.svelte"
import AlertDialogAction from "./alert-dialog-action.svelte"
import AlertDialogCancel from "./alert-dialog-cancel.svelte"
import AlertDialogContent from "./alert-dialog-content.svelte"
import AlertDialogDescription from "./alert-dialog-description.svelte"
import AlertDialogFooter from "./alert-dialog-footer.svelte"
import AlertDialogHeader from "./alert-dialog-header.svelte"
import AlertDialogMedia from "./alert-dialog-media.svelte"
import AlertDialogOverlay from "./alert-dialog-overlay.svelte"
import AlertDialogPortal from "./alert-dialog-portal.svelte"
import AlertDialogTitle from "./alert-dialog-title.svelte"
import AlertDialogTrigger from "./alert-dialog-trigger.svelte"

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
