<!--
  Two steps in one popover (React's local AddRequest of SectionCustomers):
  the customer, then importance + an optional note.
-->
<script lang="ts">
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

  import {
    IMPORTANCES,
    IMPORTANCE_LABEL,
    REQUEST_BODY_MAX,
    type CustomerOption,
    type Importance,
  } from '@/components/customers/customer-model';
  import CustomerLogo from '@/lib/components/customers/customer-logo.svelte';
  import ImportanceIcon from '@/lib/components/customers/importance-icon.svelte';
  import { digitShortcut } from '@/lib/components/issue-pickers/picker-utils';
  import { Button } from '@/lib/components/ui/button';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { cn } from '@/lib/utils';
  import CustomerOptions from './customer-options.svelte';

  let {
    options,
    onAdd,
  }: {
    options: CustomerOption[];
    onAdd: (customer: { id: string | null; name: string }, importance: Importance | null, body: string) => void;
  } = $props();

  let customer = $state.raw<{ id: string | null; name: string } | null>(null);
  let importance = $state<Importance | null>('medium');
  let body = $state('');

  const submit = () => customer && onAdd(customer, importance, body.trim());
  // Low → critical reads left to right, like a meter.
  const levels = [...IMPORTANCES].reverse();
</script>

{#if !customer}
  <CustomerOptions
    {options}
    onSelect={(option) => (customer = { id: option.id, name: option.name })}
    onCreate={(name) => (customer = { id: null, name })}
  />
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex flex-col gap-3 p-3"
    onkeydown={(event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    }}
  >
    <div class="flex items-center gap-2 text-sm">
      <Button variant="ghost" size="icon-xs" aria-label="Back to customers" onclick={() => (customer = null)}>
        <ArrowLeftIcon />
      </Button>
      <CustomerLogo name={customer.name} size={16} />
      <span class="truncate font-medium">{customer.name}</span>
      {#if !customer.id}<span class="shrink-0 text-xs text-muted-foreground">New</span>{/if}
    </div>
    <div class="flex flex-col gap-1.5">
      <span class="text-xs text-muted-foreground">Importance</span>
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="radiogroup"
        aria-label="Importance"
        class="grid grid-cols-4 gap-1"
        onkeydown={digitShortcut('', (digit) => {
          const level = levels[digit - 1];
          if (level) importance = level;
          return Boolean(level);
        })}
      >
        {#each levels as level, index (level)}
          <button
            type="button"
            role="radio"
            aria-checked={importance === level}
            title={`${IMPORTANCE_LABEL[level]} (${index + 1})`}
            onclick={() => (importance = importance === level ? null : level)}
            class={cn(
              'flex h-7 items-center justify-center gap-1 rounded-md border border-border text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
              importance === level && 'border-ring bg-accent',
            )}
          >
            <ImportanceIcon importance={level} class="size-3" />
            {IMPORTANCE_LABEL[level]}
          </button>
        {/each}
      </div>
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <Textarea
      autofocus
      bind:value={body}
      placeholder="What did they ask for? (optional)"
      maxlength={REQUEST_BODY_MAX}
      aria-label="Request note"
      class="min-h-20 text-sm"
    />
    <div class="flex items-center gap-2">
      <span class="text-xs text-muted-foreground">⌘Enter to add</span>
      <Button size="sm" class="ml-auto" onclick={submit}>
        Add request
      </Button>
    </div>
  </div>
{/if}
