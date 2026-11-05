<script module lang="ts">
  import type { IssueUser } from '@/lib/issue-model';

  export interface AssigneeOptionsProps {
    /** Current assignee id; null = unassigned; undefined = mixed (bulk edit). */
    value: string | null | undefined;
    onSelect: (userId: string | null, user: IssueUser | null) => void;
  }

  const NO_ASSIGNEE = '__none';
</script>

<script lang="ts">
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/lib/components/ui/command';
  import { Avatar } from '@/lib/components/ui-icons';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { keywordFilter } from './picker-utils';

  let { value, onSelect }: AssigneeOptionsProps = $props();

  const data = useProjectData();
  // Viewer first — assigning to yourself is the common case.
  const ordered = $derived([
    ...data.members.filter((m) => m.id === data.viewer.id),
    ...data.members.filter((m) => m.id !== data.viewer.id),
  ]);
</script>

<Command filter={keywordFilter}>
  <CommandInput placeholder="Assign to…" />
  <CommandList>
    <CommandEmpty>No member found.</CommandEmpty>
    <CommandGroup>
      <CommandItem
        value={NO_ASSIGNEE}
        keywords={['No assignee', 'Unassigned']}
        data-checked={value === null}
        onSelect={() => onSelect(null, null)}
      >
        <UserRoundIcon class="text-muted-foreground" />
        No assignee
      </CommandItem>
      {#each ordered as member (member.id)}
        <CommandItem
          value={member.id}
          keywords={[member.name, ...(member.id === data.viewer.id ? ['me'] : [])]}
          data-checked={member.id === value}
          onSelect={() => onSelect(member.id, { id: member.id, name: member.name, image: member.image })}
        >
          <Avatar name={member.name} src={member.image} size={20} />
          <span class="truncate">{member.name}</span>
          {#if member.id === data.viewer.id}
            <span class="text-xs text-muted-foreground">(you)</span>
          {/if}
        </CommandItem>
      {/each}
    </CommandGroup>
  </CommandList>
</Command>
