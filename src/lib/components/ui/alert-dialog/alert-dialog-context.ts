import { createContext } from "svelte"

/**
 * bits-ui's AlertDialog.Action does not close the dialog (Radix's did). The root wrapper
 * publishes a `close()` so AlertDialogAction can restore the Radix behaviour.
 */
export const [getAlertDialogClose, setAlertDialogClose, hasAlertDialogClose] =
  createContext<() => void>()
