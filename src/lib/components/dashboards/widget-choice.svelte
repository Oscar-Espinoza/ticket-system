<!-- A labelled Select over a fixed list of options (string or number values). -->
<script lang="ts" generics="T extends string | number">
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import WidgetField from './widget-field.svelte';

  let {
    label,
    value,
    options,
    format,
    onChange,
  }: {
    label: string;
    value: T;
    options: readonly T[];
    format: (value: T) => string;
    onChange: (value: T) => void;
  } = $props();

  const items = $derived(options.map((o) => ({ value: String(o), label: format(o) })));
</script>

<WidgetField {label}>
  <Select
    type="single"
    value={String(value)}
    {items}
    onValueChange={(next) => {
      const match = options.find((o) => String(o) === next);
      if (match !== undefined) onChange(match);
    }}
  >
    <SelectTrigger size="sm" aria-label={label} class="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {#each options as option (String(option))}
        <SelectItem value={String(option)}>{format(option)}</SelectItem>
      {/each}
    </SelectContent>
  </Select>
</WidgetField>
