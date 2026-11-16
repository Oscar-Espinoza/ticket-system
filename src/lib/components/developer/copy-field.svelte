<script lang="ts">
  import { m } from '@/lib/i18n';
  import CheckIcon from '@lucide/svelte/icons/check';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';

  let { value, label }: { value: string; label: string } = $props();

  let copied = $state(false);
  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => {
        copied = true;
        setTimeout(() => (copied = false), 1500);
      },
      () => toast.error(m.settings_dev_copy_failed()),
    );
</script>

<div class="flex max-w-xl items-center gap-2">
  <Input
    readonly
    {value}
    aria-label={label}
    class="font-mono text-xs"
    onfocus={(e) => e.currentTarget.select()}
  />
  <Button
    type="button"
    variant="outline"
    size="icon"
    onclick={copy}
    aria-label={m.settings_dev_copy_label({ label: label.toLowerCase() })}
  >
    {#if copied}<CheckIcon class="text-emerald-500" />{:else}<CopyIcon />{/if}
  </Button>
</div>
