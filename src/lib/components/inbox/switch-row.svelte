<!-- Label + description + switch row (also used by the push settings). -->
<script lang="ts">
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { cn } from '@/lib/utils';

  let {
    id,
    label,
    description,
    checked,
    onChange,
    class: className,
  }: {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    class?: string;
  } = $props();
</script>

<div class={cn('flex items-center gap-4', className)}>
  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
    <Label for={id}>{label}</Label>
    <p class="text-xs text-muted-foreground">{description}</p>
  </div>
  <!-- Controlled like Radix: the switch shows `checked`, flips go through onChange. -->
  <Switch {id} bind:checked={() => checked, onChange} />
</div>
