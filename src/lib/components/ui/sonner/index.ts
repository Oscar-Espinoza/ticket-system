/*
 * Port of src/components/ui/sonner.tsx (sonner → svelte-sonner).
 *
 * Caller translation:
 * - `<Toaster position="bottom-right" />` unchanged. Theme follows mode-watcher (`mode.current`)
 *   instead of next-themes; the icons, CSS variables and `toastOptions.classes.toast = "cn-toast"`
 *   match the React file (`classNames` → `classes`, `className` → `class`).
 * - Props passed to Toaster override these defaults, as `{...props}` did in React.
 * - Raise toasts with `import { toast } from 'svelte-sonner'` (same API as sonner).
 */
import Toaster from './sonner.svelte';

export { Toaster };
