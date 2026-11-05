<script lang="ts">
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import { toast } from 'svelte-sonner';

  import { customersPath } from '@/lib/components/customers/customer-model';
  import { rotateIntakeToken, setIntakeEnabled } from '@/lib/actions/intake';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import CopyField from './copy-field.svelte';

  let {
    projectId,
    url: initialUrl,
    canEdit,
    triageEnabled,
  }: {
    projectId: string;
    url: string | null;
    canEdit: boolean;
    triageEnabled: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  let url = $state(initialUrl);
  let pending = $state(false);

  async function run(task: () => ReturnType<typeof rotateIntakeToken>, success: string) {
    pending = true;
    try {
      const result = await task();
      if (!result) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      url = result.url;
      toast.success(success);
    } finally {
      pending = false;
    }
  }

  const embed = $derived(
    url
      ? `<iframe src="${url}" title="Submit a request" width="100%" height="720" style="border:0"></iframe>`
      : '',
  );
</script>

<section class="flex flex-col gap-6">
  <div class="flex items-start gap-3">
    <!-- Strictly controlled, as in React: the switch follows `url`, not the click. -->
    <Switch
      id="intake-enabled"
      bind:checked={() => !!url, (on) =>
        run(
          () => setIntakeEnabled({ projectId, enabled: on }),
          on ? 'Intake form enabled' : 'Intake form turned off',
        )}
      disabled={!canEdit || pending}
      class="mt-0.5"
    />
    <div>
      <Label for="intake-enabled">Accept requests</Label>
      <p class="mt-1 text-sm text-muted-foreground">
        Anyone with the link can submit a request without an account. Requests arrive as issues in
        {triageEnabled ? 'Triage' : 'your default state'}{triageEnabled
          ? ''
          : ' (turn on triage in Cycles & triage to review them first)'}.
      </p>
      <p class="mt-1 text-sm text-muted-foreground">
        When the submitter’s email domain matches one of your
        <a href={customersPath(projectId)} class="underline-offset-2 hover:underline">customers</a>, the
        request is linked to that customer automatically.
      </p>
    </div>
  </div>

  {#if url}
    <div class="flex flex-col gap-1.5">
      <Label for="intake-url">Public link</Label>
      <CopyField id="intake-url" value={url} label="Link" />
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <Button href={url} target="_blank" rel="noreferrer" variant="ghost" size="sm">
          <ExternalLinkIcon />
          Open form
        </Button>
        {#if canEdit}
          <AlertDialog>
            <AlertDialogTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" disabled={pending}>
                  {#if pending}<LoaderCircleIcon class="animate-spin" />{:else}<RefreshCwIcon />{/if}
                  Rotate link
                </Button>
              {/snippet}
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Rotate the public link?</AlertDialogTitle>
                <AlertDialogDescription>
                  The current link and any embedded forms stop working immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onclick={() => run(() => rotateIntakeToken({ projectId }), 'New link generated')}>
                  Rotate link
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        {/if}
      </div>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="intake-embed">Embed on your site</Label>
      <CopyField id="intake-embed" value={embed} label="Snippet" multiline />
    </div>
  {/if}
</section>
