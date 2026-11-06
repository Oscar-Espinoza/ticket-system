<!-- The intake form itself: useActionState → state + pending. -->
<script lang="ts">
  import { tick } from 'svelte';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

  import { submitIntakeRequest, type IntakeField, type IntakeFormState } from '@/lib/actions/intake';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Textarea } from '@/lib/components/ui/textarea';

  let { token, stamp, onAgain }: { token: string; stamp: string; onAgain: () => void } = $props();

  let formState = $state.raw<IntakeFormState>({});
  let pending = $state(false);
  const errors = $derived(formState.errors ?? {});
  const values = $derived(formState.values ?? {});

  async function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    pending = true;
    try {
      const next = await submitIntakeRequest(formState, data);
      if (next) formState = next;
    } finally {
      pending = false;
    }
    // React 19 resets a <form action> after the action: fields go back to their
    // defaultValue, which is now the server's echo of what was sent.
    await tick();
    if (form.isConnected) form.reset();
  }

  const describedBy = (field: IntakeField) => (errors[field] ? `intake-${field}-error` : undefined);
</script>

{#if formState.status === 'success'}
  <div class="flex flex-col items-center gap-3 py-8 text-center" role="status">
    <CircleCheckIcon aria-hidden="true" class="size-8 text-emerald-500" />
    <p class="text-base font-medium">Thanks — your request was received.</p>
    <p class="max-w-sm text-sm text-muted-foreground">
      The team will review it and follow up by email if they need more details.
    </p>
    <Button variant="outline" size="sm" class="mt-2" onclick={onAgain}>Submit another request</Button>
  </div>
{:else}
  <form {onsubmit} class="flex flex-col gap-5" novalidate>
    <input type="hidden" name="token" value={token} />
    <input type="hidden" name="stamp" value={stamp} />
    <!-- Honeypot: invisible to people, irresistible to form-filling bots. -->
    <div aria-hidden="true" class="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label for="intake-website">Website</label>
      <input id="intake-website" name="website" type="text" tabindex={-1} autocomplete="off" />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <Field id="intake-name" label="Name" error={errors.name}>
        <Input
          id="intake-name"
          name="name"
          defaultValue={values.name}
          maxlength={100}
          autocomplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={describedBy('name')}
        />
      </Field>
      <Field id="intake-email" label="Email" error={errors.email}>
        <Input
          id="intake-email"
          name="email"
          type="email"
          defaultValue={values.email}
          maxlength={200}
          autocomplete="email"
          required
          aria-invalid={!!errors.email}
          aria-describedby={describedBy('email')}
        />
      </Field>
    </div>
    <Field id="intake-title" label="Summary" error={errors.title}>
      <Input
        id="intake-title"
        name="title"
        defaultValue={values.title}
        maxlength={200}
        placeholder="What do you need?"
        required
        aria-invalid={!!errors.title}
        aria-describedby={describedBy('title')}
      />
    </Field>
    <Field
      id="intake-description"
      label="Details"
      hint="Steps to reproduce, links, what you expected — anything that helps."
      error={errors.description}
    >
      <Textarea
        id="intake-description"
        name="description"
        defaultValue={values.description}
        maxlength={8000}
        rows={6}
        aria-invalid={!!errors.description}
        aria-describedby={describedBy('description')}
      />
    </Field>

    {#if errors.server}
      <p
        role="alert"
        class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {errors.server}
      </p>
    {/if}

    <div>
      <Button type="submit" disabled={pending}>
        {#if pending}<LoaderCircleIcon class="animate-spin" />{/if}
        Send request
      </Button>
    </div>
  </form>
{/if}
