<!--
  "Register OAuth app" dialog. Mounted only while open.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { createOAuthApp } from '@/lib/actions/oauth-apps';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { APP_NAME_MAX, REDIRECT_URIS_MAX, type OAuthAppView } from '@/lib/oauth-model';

  let {
    onClose,
    onCreated,
  }: {
    onClose: () => void;
    onCreated: (app: OAuthAppView, secret: string | null) => void;
  } = $props();

  let name = $state('');
  let redirectUris = $state('');
  let homepageUrl = $state('');
  let logoUrl = $state('');
  let kind = $state<'confidential' | 'public'>('confidential');
  let errors = $state<Partial<Record<string, string>>>({});
  let pending = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    pending = true;
    try {
      const result = await createOAuthApp({ name, redirectUris, homepageUrl, logoUrl, kind });
      if (result.ok) onCreated(result.app, result.clientSecret);
      else if (result.field) errors = { [result.field]: result.error };
      else toast.error(result.error);
    } finally {
      pending = false;
    }
  }

  const clear = (field: string) => (errors = { ...errors, [field]: undefined });
</script>

<Dialog open onOpenChange={(open) => !open && onClose()}>
  <DialogContent>
    <form onsubmit={submit} novalidate class="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{m.settings_oauth_register_title()}</DialogTitle>
        <DialogDescription>{m.settings_oauth_register_desc()}</DialogDescription>
      </DialogHeader>

      <Field id="oauth-name" label={m.common_name()} error={errors.name}>
        <Input
          id="oauth-name"
          bind:value={name}
          oninput={() => clear('name')}
          maxlength={APP_NAME_MAX}
          autofocus
          autocomplete="off"
          aria-invalid={!!errors.name}
        />
      </Field>

      <Field id="oauth-redirects" label={m.settings_oauth_redirect_uris()} hint={m.settings_oauth_redirect_hint({ max: REDIRECT_URIS_MAX })} error={errors.redirectUris}>
        <Textarea
          id="oauth-redirects"
          bind:value={redirectUris}
          oninput={() => clear('redirectUris')}
          rows={3}
          spellcheck={false}
          placeholder={'https://example.com/oauth/callback'}
          class="font-mono text-xs"
          aria-invalid={!!errors.redirectUris}
        />
      </Field>

      <div class="grid gap-4 sm:grid-cols-2">
        <Field id="oauth-homepage" label={m.settings_oauth_homepage()} error={errors.homepageUrl}>
          <Input
            id="oauth-homepage"
            bind:value={homepageUrl}
            oninput={() => clear('homepageUrl')}
            placeholder={'https://example.com'}
            autocomplete="off"
            aria-invalid={!!errors.homepageUrl}
          />
        </Field>
        <Field id="oauth-logo" label={m.settings_oauth_logo_url()} error={errors.logoUrl}>
          <Input
            id="oauth-logo"
            bind:value={logoUrl}
            oninput={() => clear('logoUrl')}
            placeholder={'https://example.com/logo.png'}
            autocomplete="off"
            aria-invalid={!!errors.logoUrl}
          />
        </Field>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">{m.settings_oauth_app_type()}</legend>
        <RadioGroup bind:value={() => kind, (v) => (kind = v as typeof kind)}>
          <label class="flex items-start gap-2.5 text-sm">
            <RadioGroupItem value="confidential" class="mt-0.5" />
            <span>
              {m.settings_oauth_confidential()}
              <span class="block text-xs text-muted-foreground">{m.settings_oauth_confidential_desc()}</span>
            </span>
          </label>
          <label class="flex items-start gap-2.5 text-sm">
            <RadioGroupItem value="public" class="mt-0.5" />
            <span>
              {m.settings_oauth_public()}
              <span class="block text-xs text-muted-foreground">
                {m.settings_oauth_public_desc()}
              </span>
            </span>
          </label>
        </RadioGroup>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="ghost" onclick={onClose}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={pending || !name.trim() || !redirectUris.trim()}>
          {#if pending}<Loader2Icon class="animate-spin" />{/if}
          {m.settings_oauth_register_app()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
