<script module lang="ts">
  export interface ProfileFormProps {
    email: string;
    name: string;
    image: string;
    title: string;
    bio: string;
    timezone: string;
    timezones: string[];
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { updateProfile, type ProfileState } from '@/lib/actions/profile';
  import { MAX_NAME_LENGTH } from '@/lib/auth-rules';
  import { Avatar } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { createActionState } from './action-state.svelte';
  import Field from './field.svelte';
  import TimezonePicker from './timezone-picker.svelte';

  let { email, name, image, title, bio, timezone, timezones }: ProfileFormProps = $props();

  const form = createActionState<ProfileState>(updateProfile, {});
  // Live preview of the typed name / avatar URL (seeded once from the props).
  let preview = $state(untrack(() => ({ name, image })));
  const errors = $derived(form.state.errors ?? {});

  // The sidebar user menu reads the session user from the layout; the
  // updateProfile wrapper already refreshes the page data after it resolves.
  $effect(() => {
    const state = form.state;
    if (state.success) toast.success('Profile saved');
    else if (state.errors?.server) toast.error(state.errors.server);
  });
</script>

<form onsubmit={form.onsubmit} class="flex flex-col gap-5" novalidate>
  <div class="flex items-center gap-3">
    <Avatar name={preview.name || email} src={preview.image || null} class="size-10 text-sm" />
    <div class="min-w-0">
      <p class="truncate text-sm font-medium">{preview.name || 'Unnamed'}</p>
      <p class="truncate text-xs text-muted-foreground">{email}</p>
    </div>
  </div>

  <Field id="profile-email" label="Email" hint="Your sign-in email can't be changed here.">
    <Input id="profile-email" value={email} readonly disabled />
  </Field>

  <Field id="profile-name" label="Name" error={errors.name}>
    <Input
      id="profile-name"
      name="name"
      value={name}
      maxlength={MAX_NAME_LENGTH}
      required
      aria-invalid={!!errors.name}
      aria-describedby={errors.name ? 'profile-name-error' : undefined}
      oninput={(e) => (preview = { ...preview, name: e.currentTarget.value })}
    />
  </Field>

  <Field
    id="profile-image"
    label="Avatar URL"
    hint="Link to a square image. Leave empty to use your initials."
    error={errors.image}
  >
    <Input
      id="profile-image"
      name="image"
      type="url"
      inputmode="url"
      placeholder="https://…"
      value={image}
      aria-invalid={!!errors.image}
      aria-describedby={errors.image ? 'profile-image-error' : undefined}
      oninput={(e) => (preview = { ...preview, image: e.currentTarget.value.trim() })}
    />
  </Field>

  <Field id="profile-title" label="Title" hint="e.g. Frontend engineer" error={errors.title}>
    <Input
      id="profile-title"
      name="title"
      value={title}
      maxlength={100}
      aria-invalid={!!errors.title}
    />
  </Field>

  <Field id="profile-bio" label="Bio" error={errors.bio}>
    <Textarea
      id="profile-bio"
      name="bio"
      value={bio}
      maxlength={1000}
      rows={3}
      aria-invalid={!!errors.bio}
    />
  </Field>

  <Field
    id="profile-timezone"
    label="Timezone"
    hint="Used for due dates, cycles and reminders."
    error={errors.timezone}
  >
    <TimezonePicker id="profile-timezone" name="timezone" {timezones} defaultValue={timezone} />
  </Field>

  <div>
    <Button type="submit" disabled={form.pending}>
      {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
      Save changes
    </Button>
  </div>
</form>
