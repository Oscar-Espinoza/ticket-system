<!-- Password input for the two-factor dialogs (PasswordField in two-factor-settings.tsx). -->
<script lang="ts">
  import Field from '@/lib/components/settings/field.svelte';
  import { Input } from '@/lib/components/ui/input';

  let {
    value,
    error,
    onChange,
  }: {
    value: string;
    error?: string;
    onChange: (value: string) => void;
  } = $props();
</script>

<Field id="two-factor-password" label="Password" {error}>
  <Input
    id="two-factor-password"
    type="password"
    autocomplete="current-password"
    autofocus
    bind:value={() => value, onChange}
    aria-invalid={!!error}
    aria-describedby={error ? 'two-factor-password-error' : undefined}
  />
</Field>
