<!-- Health toggle + markdown body, ⌘Enter to post. -->
<script lang="ts">
  import { toast } from 'svelte-sonner';

  import { postEpicUpdate } from '@/lib/actions/epics';
  import { Button } from '@/lib/components/ui/button';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import {
    HEALTHS,
    HEALTH_LABEL,
    UPDATE_BODY_MAX,
    isHealth,
    type Health,
  } from '@/lib/epic-model';
  import HealthDot from './health-dot.svelte';
  import RichTextEditor from './rich-text-editor.svelte';

  let {
    projectId,
    epicId,
    initialHealth,
  }: {
    projectId: string;
    epicId: string;
    initialHealth: Health;
  } = $props();

  // useState(initialHealth): only the first value counts.
  // svelte-ignore state_referenced_locally
  let health = $state<Health>(initialHealth);
  let body = $state('');
  let pending = $state(false);

  async function submit() {
    if (!body.trim() || pending) return;
    pending = true;
    try {
      const result = await postEpicUpdate({ projectId, epicId, health, body });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      body = '';
      toast.success('Update posted');
    } finally {
      pending = false;
    }
  }
</script>

<form
  class="flex flex-col gap-2 rounded-md border border-border p-3"
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
>
  <ToggleGroup
    type="single"
    size="sm"
    variant="outline"
    spacing={0}
    bind:value={() => health, (value: string) => isHealth(value) && (health = value)}
    aria-label="Health"
  >
    {#each HEALTHS as h (h)}
      <ToggleGroupItem value={h} class="gap-1.5 px-2.5 text-xs">
        <HealthDot health={h} />
        {HEALTH_LABEL[h]}
      </ToggleGroupItem>
    {/each}
  </ToggleGroup>
  <RichTextEditor
    aria-label="Update"
    value={body}
    onChange={(next) => (body = next)}
    onSubmit={submit}
    placeholder="What changed since the last update? Markdown supported."
    maxLength={UPDATE_BODY_MAX}
  />
  <div class="flex items-center gap-2">
    <span class="text-xs text-muted-foreground">⌘Enter to post</span>
    <Button type="submit" size="sm" class="ml-auto" disabled={!body.trim() || pending}>
      Post update
    </Button>
  </div>
</form>
