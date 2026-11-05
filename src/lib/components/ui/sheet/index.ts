/*
 * Port of src/components/ui/sheet.tsx (Radix Dialog → bits-ui Dialog, same side variants).
 *
 * Caller translation:
 * - `<Sheet open onOpenChange={(open) => !open && onClose()}>` keeps working; `bind:open` also
 *   works; `defaultOpen` is supported. bits Dialog is always modal (Radix default).
 * - `<SheetContent side="right" showCloseButton={false} class=… onCloseAutoFocus={(e) =>
 *   e.preventDefault()}>`: same props/defaults (`side="right"`, `showCloseButton={true}`), always
 *   portaled with the overlay. Event renames: `onEscapeKeyDown` → `onEscapeKeydown`,
 *   `onPointerDownOutside`/`onInteractOutside` → `onInteractOutside`.
 * - `asChild` on SheetTrigger/SheetClose → `{#snippet child({ props })}<el {...props} />{/snippet}`.
 * - SheetTitle/SheetDescription keep providing the dialog's aria-labelledby/-describedby.
 *   SheetTitle renders an `<h2>` like Radix.
 * - Styling: Content/Overlay `data-state="open|closed"` (data-open:/data-closed:) as in Radix.
 */
import Root from './sheet.svelte';
import Trigger from './sheet-trigger.svelte';
import Close from './sheet-close.svelte';
import Content, { type SheetSide } from './sheet-content.svelte';
import Header from './sheet-header.svelte';
import Footer from './sheet-footer.svelte';
import Title from './sheet-title.svelte';
import Description from './sheet-description.svelte';

export {
  Root as Sheet,
  Trigger as SheetTrigger,
  Close as SheetClose,
  Content as SheetContent,
  Header as SheetHeader,
  Footer as SheetFooter,
  Title as SheetTitle,
  Description as SheetDescription,
  type SheetSide,
};
