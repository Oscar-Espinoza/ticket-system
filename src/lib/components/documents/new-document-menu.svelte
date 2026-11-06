<!--
  "New doc" button + template menu (Blank / Spec / RFC / Meeting notes). Also
  registers the "New document" palette commands while mounted. Port of
  new-document-menu.tsx; its useCreateDocument hook is ./use-create-document.svelte.ts.
-->
<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import FileText from '@lucide/svelte/icons/file-text';
  import Plus from '@lucide/svelte/icons/plus';

  import { DOCUMENT_TEMPLATES } from '@/lib/document-model';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { useCreateDocument } from './use-create-document.svelte';

  let {
    projectId,
    epicId,
    class: className,
  }: {
    projectId: string;
    epicId?: string | null;
    class?: string;
  } = $props();

  const doc = useCreateDocument(
    () => projectId,
    () => epicId,
  );
  let open = $state(false);

  $effect(() =>
    registerPaletteCommands([
      {
        id: 'new-document',
        label: 'New document',
        section: 'Docs',
        keywords: ['create', 'doc', 'page', 'write'],
        run: () => doc.create('blank'),
      },
      {
        id: 'new-document-template',
        label: 'New document from template…',
        section: 'Docs',
        keywords: ['spec', 'rfc', 'meeting notes', 'template'],
        run: () => {
          open = true;
        },
      },
    ]),
  );
</script>

<div class={className}>
  <DropdownMenu bind:open>
    <div class="flex items-center">
      <Button size="sm" class="rounded-r-none" disabled={doc.pending} onclick={() => doc.create('blank')}>
        <Plus />
        New doc
      </Button>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            size="sm"
            class="rounded-l-none border-l border-primary-foreground/20 px-1.5"
            disabled={doc.pending}
            aria-label="New doc from a template"
          >
            <ChevronDown />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
    </div>
    <DropdownMenuContent align="end" class="w-64">
      <DropdownMenuLabel class="text-xs text-muted-foreground">New document</DropdownMenuLabel>
      {#each DOCUMENT_TEMPLATES as template, index (template.id)}
        <div>
          {#if index === 1}
            <DropdownMenuSeparator />
          {/if}
          <DropdownMenuItem onSelect={() => doc.create(template.id)} class="items-start">
            <span class="mt-0.5 flex size-4 shrink-0 items-center justify-center text-sm leading-none">
              {#if template.icon}
                {template.icon}
              {:else}
                <FileText class="text-muted-foreground" />
              {/if}
            </span>
            <span class="flex min-w-0 flex-col">
              <span>{template.label}</span>
              <span class="text-xs text-muted-foreground">{template.description}</span>
            </span>
          </DropdownMenuItem>
        </div>
      {/each}
    </DropdownMenuContent>
  </DropdownMenu>
</div>
