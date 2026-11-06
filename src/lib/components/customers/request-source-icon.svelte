<script lang="ts">
  import CodeXmlIcon from '@lucide/svelte/icons/code-xml';
  import HashIcon from '@lucide/svelte/icons/hash';
  import InboxIcon from '@lucide/svelte/icons/inbox';
  import PenLineIcon from '@lucide/svelte/icons/pen-line';

  import { cn } from '@/lib/utils';
  import { REQUEST_SOURCE_LABEL, type RequestSource } from '@/lib/customer-model';

  let { source, class: className }: { source: RequestSource; class?: string } = $props();

  const SOURCE_ICON = { intake: InboxIcon, slack: HashIcon, manual: PenLineIcon, api: CodeXmlIcon } as const;
  const Icon = $derived(SOURCE_ICON[source]);
</script>

<Icon
  role="img"
  aria-label={REQUEST_SOURCE_LABEL[source]}
  class={cn('size-3.5 shrink-0 text-muted-foreground', className)}
/>
