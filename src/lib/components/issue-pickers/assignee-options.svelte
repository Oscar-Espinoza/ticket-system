<script module lang="ts">
  import { m } from '@/lib/i18n';
  import type { IssueUser } from '@/lib/issue-model';

  export interface AssigneeOptionsProps {
    /** Current assignee id; null = unassigned; undefined = mixed (bulk edit). */
    value: string | null | undefined;
    onSelect: (userId: string | null, user: IssueUser | null) => void;
    /** Copy for other person fields (waiting on). */
    placeholder?: string;
    noneLabel?: string;
  }

  const NO_ASSIGNEE = '__none';
</script>

<script lang="ts">
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/lib/components/ui/command';
  import { Avatar } from '@/lib/components/ui-icons';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { viewerFirst } from './option-builders';
  import { keywordFilter } from './picker-utils';

  let { value, onSelect, placeholder = m.issues_assign_to_placeholder(), noneLabel = m.issues_no_assignee() }: AssigneeOptionsProps = $props();

  const data = useProjectData();
  const ordered = $derived(viewerFirst(data.members, data.viewer.id));
</script>

<Command filter={keywordFilter}>
  <CommandInput {placeholder} />
  <CommandList>
    <CommandEmpty>{m.issues_member_none_found()}</CommandEmpty>
    <CommandGroup>
      <CommandItem
        value={NO_ASSIGNEE}
        keywords={[noneLabel, m.issues_unassigned_keyword(), m.common_none()]}
        data-checked={value === null}
        onSelect={() => onSelect(null, null)}
      >
        <UserRoundIcon class="text-muted-foreground" />
        {noneLabel}
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
            <span class="text-xs text-muted-foreground">{m.issues_you_paren()}</span>
          {/if}
        </CommandItem>
      {/each}
    </CommandGroup>
  </CommandList>
</Command>
