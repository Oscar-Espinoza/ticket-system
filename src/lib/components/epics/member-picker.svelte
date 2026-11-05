<!-- Member picker (epic lead, initiative / customer owner). Takes the member list as a prop
     so it also works outside a project (initiatives). -->
<script lang="ts">
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import { Avatar } from '@/lib/components/ui-icons';
  import type { IssueUser } from '@/lib/issue-model';

  let {
    value,
    members,
    viewerId,
    onChange,
    placeholder = 'Set lead…',
    noneLabel = 'No lead',
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null;
    members: IssueUser[];
    viewerId?: string;
    onChange: (userId: string | null) => void;
    placeholder?: string;
    noneLabel?: string;
  } = $props();

  // Viewer first — picking yourself is the common case.
  const ordered = $derived([
    ...members.filter((m) => m.id === viewerId),
    ...members.filter((m) => m.id !== viewerId),
  ]);
</script>

<PickerPopover {...popover} bind:open class="w-60">
  {#snippet content(close: () => void)}
    {@const pick = (id: string | null) => {
      close();
      onChange(id);
    }}
    <Command filter={keywordFilter}>
      <CommandInput {placeholder} />
      <CommandList>
        <CommandEmpty>No member found.</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value="__none"
            keywords={[noneLabel]}
            data-checked={value === null}
            onSelect={() => pick(null)}
          >
            <UserRoundIcon class="text-muted-foreground" />
            {noneLabel}
          </CommandItem>
          {#each ordered as member (member.id)}
            <CommandItem
              value={member.id}
              keywords={[member.name, ...(member.id === viewerId ? ['me'] : [])]}
              data-checked={member.id === value}
              onSelect={() => pick(member.id)}
            >
              <Avatar name={member.name} src={member.image} size={20} />
              <span class="truncate">{member.name}</span>
              {#if member.id === viewerId}
                <span class="text-xs text-muted-foreground">(you)</span>
              {/if}
            </CommandItem>
          {/each}
        </CommandGroup>
      </CommandList>
    </Command>
  {/snippet}
</PickerPopover>
