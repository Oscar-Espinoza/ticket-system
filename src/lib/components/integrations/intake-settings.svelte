<script lang="ts">
  import { m } from '@/lib/i18n';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import { toast } from 'svelte-sonner';

  import { customersPath } from '@/lib/customer-model';
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

  const customersParts = $derived(m.settings_int_intake_customers({ link: '\u0000' }).split('\u0000'));

  const embed = $derived(
    url
      ? `<iframe src="${url}" title="Submit a request" width="100%" height="720" style="border:0"></iframe>`
      : '',
  );
</script>

<section class="flex flex-col gap-6">
  <div class="flex items-start gap-3">
    <!-- Strictly controlled: the switch follows `url`, not the click. -->
    <Switch
      id="intake-enabled"
      bind:checked={() => !!url, (on) =>
        run(
          () => setIntakeEnabled({ projectId, enabled: on }),
          on ? m.settings_int_intake_enabled_toast() : m.settings_int_intake_off_toast(),
        )}
      disabled={!canEdit || pending}
      class="mt-0.5"
    />
    <div>
      <Label for="intake-enabled">{m.settings_int_intake_accept()}</Label>
      <p class="mt-1 text-sm text-muted-foreground">
        {triageEnabled ? m.settings_int_intake_accept_triage() : m.settings_int_intake_accept_default()}
      </p>
      <p class="mt-1 text-sm text-muted-foreground">
        {customersParts[0]}<a href={customersPath(projectId)} class="underline-offset-2 hover:underline">{m.settings_int_intake_customers_link()}</a>{customersParts[1]}
      </p>
    </div>
  </div>

  {#if url}
    <div class="flex flex-col gap-1.5">
      <Label for="intake-url">{m.settings_int_public_link()}</Label>
      <CopyField id="intake-url" value={url} label={m.settings_int_link_label()} />
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <Button href={url} target="_blank" rel="noreferrer" variant="ghost" size="sm">
          <ExternalLinkIcon />
          {m.settings_int_open_form()}
        </Button>
        {#if canEdit}
          <AlertDialog>
            <AlertDialogTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" disabled={pending}>
                  {#if pending}<LoaderCircleIcon class="animate-spin" />{:else}<RefreshCwIcon />{/if}
                  {m.settings_int_rotate_link()}
                </Button>
              {/snippet}
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>{m.settings_int_rotate_title()}</AlertDialogTitle>
                <AlertDialogDescription>
                  {m.settings_int_rotate_desc()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                <AlertDialogAction onclick={() => run(() => rotateIntakeToken({ projectId }), m.settings_int_new_link_toast())}>
                  {m.settings_int_rotate_link()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        {/if}
      </div>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="intake-embed">{m.settings_int_embed()}</Label>
      <CopyField id="intake-embed" value={embed} label={m.settings_int_snippet_label()} multiline />
    </div>
  {/if}
</section>
