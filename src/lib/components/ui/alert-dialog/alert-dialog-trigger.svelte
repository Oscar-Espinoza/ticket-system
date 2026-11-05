<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui"

  // Radix rendered `<button type="button">` (and passed it through asChild); bits does not.
  let { ref = $bindable(null), type = "button", ...restProps }: AlertDialogPrimitive.TriggerProps = $props()
</script>

<AlertDialogPrimitive.Trigger bind:ref data-slot="alert-dialog-trigger" {type} {...restProps} />
