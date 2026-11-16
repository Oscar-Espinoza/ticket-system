<!-- Accept form inside AcceptDialog. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { PRIORITY_LABEL, PRIORITY_ORDER, type IssueRow, type Priority } from '@/lib/issue-model';
  import { acceptStates } from '@/lib/triage';
  import { defaultNewIssueState } from '@/lib/workflow';
  import type { AcceptChoice } from './accept-dialog.svelte';

  const UNASSIGNED = '__none';

  let {
    issue,
    pending,
    onAccept,
    onCancel,
  }: {
    issue: IssueRow;
    pending: boolean;
    onAccept: (choice: AcceptChoice) => void;
    onCancel: () => void;
  } = $props();

  const data = useProjectData();
  const options = $derived(acceptStates(data.states));
  // useState(...): seeded once per open (the dialog remounts the form).
  let stateId = $state(
    untrack(() => defaultNewIssueState(data.states)?.id ?? acceptStates(data.states)[0]?.id ?? ''),
  );
  let priority = $state<Priority>(untrack(() => issue.priority));
  let assigneeId = $state(untrack(() => issue.assignee?.id ?? UNASSIGNED));

  const selectedState = $derived(options.find((s) => s.id === stateId));
  const selectedMember = $derived(data.members.find((member) => member.id === assigneeId));
  const stateItems = $derived(options.map((s) => ({ value: s.id, label: s.name })));
  const priorityItems = PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));
  const assigneeItems = $derived([
    { value: UNASSIGNED, label: m.issues_unassigned() },
    ...data.members.map((member) => ({ value: member.id, label: member.name })),
  ]);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!stateId) return;
    onAccept({ stateId, priority, assigneeId: assigneeId === UNASSIGNED ? null : assigneeId });
  }
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
  <DialogHeader>
    <DialogTitle>{m.issues_triage_accept_title({ key: issue.key })}</DialogTitle>
    <DialogDescription class="truncate">{issue.title}</DialogDescription>
  </DialogHeader>
  <div class="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-3">
    <Label for="accept-state" class="text-xs text-muted-foreground">{m.common_status()}</Label>
    <Select items={stateItems} bind:value={stateId}>
      <SelectTrigger id="accept-state" class="w-full">
        <SelectValue placeholder={m.issues_triage_pick_status()}>
          {#snippet children()}
            {#if selectedState}
              <StateIcon state={selectedState} size={14} />
              {selectedState.name}
            {:else}
              {m.issues_triage_pick_status()}
            {/if}
          {/snippet}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {#each options as state (state.id)}
          <SelectItem value={state.id} label={state.name}>
            <StateIcon {state} size={14} />
            {state.name}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <Label for="accept-priority" class="text-xs text-muted-foreground">{m.common_priority()}</Label>
    <Select items={priorityItems} bind:value={() => priority, (v) => (priority = v as Priority)}>
      <SelectTrigger id="accept-priority" class="w-full">
        <SelectValue>
          {#snippet children()}
            <PriorityIcon {priority} size={14} />
            {PRIORITY_LABEL[priority]}
          {/snippet}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {#each PRIORITY_ORDER as p (p)}
          <SelectItem value={p} label={PRIORITY_LABEL[p]}>
            <PriorityIcon priority={p} size={14} />
            {PRIORITY_LABEL[p]}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <Label for="accept-assignee" class="text-xs text-muted-foreground">{m.common_assignee()}</Label>
    <Select items={assigneeItems} bind:value={assigneeId}>
      <SelectTrigger id="accept-assignee" class="w-full">
        <SelectValue>
          {#snippet children()}
            {#if selectedMember}
              <Avatar name={selectedMember.name} src={selectedMember.image} size={20} />
              {selectedMember.name}
            {:else}
              {m.issues_unassigned()}
            {/if}
          {/snippet}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>{m.issues_unassigned()}</SelectItem>
        {#each data.members as member (member.id)}
          <SelectItem value={member.id} label={member.name}>
            <Avatar name={member.name} src={member.image} size={20} />
            {member.name}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
  {#if options.length === 0}
    <p class="text-sm text-destructive">
      {m.issues_triage_no_states()}
    </p>
  {/if}
  <DialogFooter>
    <Button type="button" variant="outline" onclick={onCancel}>{m.common_cancel()}</Button>
    <!-- svelte-ignore a11y_autofocus -->
    <Button type="submit" disabled={pending || !stateId} autofocus>
      {#if pending}<LoaderCircle class="animate-spin" />{/if}
      {m.issues_triage_accept()}
    </Button>
  </DialogFooter>
</form>
