<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui"

  // Radix rendered `<button type="button">` (and passed it through asChild); bits does not.
  let { ref = $bindable(null), type = "button", ...restProps }: DialogPrimitive.TriggerProps = $props()
</script>

<DialogPrimitive.Trigger bind:ref data-slot="dialog-trigger" {type} {...restProps} />
