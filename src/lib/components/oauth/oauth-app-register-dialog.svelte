<!--
  "Register OAuth app" dialog — the non-exported RegisterAppDialog of
  src/components/oauth/oauth-app-settings.tsx. Mounted only while open.
-->
<script lang="ts">
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
  import { APP_NAME_MAX, REDIRECT_URIS_MAX, type OAuthAppView } from '@/lib/components/oauth/oauth-model';

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
        <DialogTitle>Register OAuth app</DialogTitle>
        <DialogDescription>People see the name and logo when they authorize your app.</DialogDescription>
      </DialogHeader>

      <Field id="oauth-name" label="Name" error={errors.name}>
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

      <Field id="oauth-redirects" label="Redirect URIs" hint={`One per line, up to ${REDIRECT_URIS_MAX}. https, or http for localhost.`} error={errors.redirectUris}>
        <Textarea
          id="oauth-redirects"
          bind:value={redirectUris}
          oninput={() => clear('redirectUris')}
          rows={3}
          spellcheck={false}
          placeholder="https://example.com/oauth/callback"
          class="font-mono text-xs"
          aria-invalid={!!errors.redirectUris}
        />
      </Field>

      <div class="grid gap-4 sm:grid-cols-2">
        <Field id="oauth-homepage" label="Homepage (optional)" error={errors.homepageUrl}>
          <Input
            id="oauth-homepage"
            bind:value={homepageUrl}
            oninput={() => clear('homepageUrl')}
            placeholder="https://example.com"
            autocomplete="off"
            aria-invalid={!!errors.homepageUrl}
          />
        </Field>
        <Field id="oauth-logo" label="Logo URL (optional)" error={errors.logoUrl}>
          <Input
            id="oauth-logo"
            bind:value={logoUrl}
            oninput={() => clear('logoUrl')}
            placeholder="https://example.com/logo.png"
            autocomplete="off"
            aria-invalid={!!errors.logoUrl}
          />
        </Field>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">App type</legend>
        <RadioGroup bind:value={() => kind, (v) => (kind = v as typeof kind)}>
          <label class="flex items-start gap-2.5 text-sm">
            <RadioGroupItem value="confidential" class="mt-0.5" />
            <span>
              Confidential
              <span class="block text-xs text-muted-foreground">A server that can keep a client secret.</span>
            </span>
          </label>
          <label class="flex items-start gap-2.5 text-sm">
            <RadioGroupItem value="public" class="mt-0.5" />
            <span>
              Public
              <span class="block text-xs text-muted-foreground">
                A single-page, desktop or mobile app — no secret, PKCE only.
              </span>
            </span>
          </label>
        </RadioGroup>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="ghost" onclick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending || !name.trim() || !redirectUris.trim()}>
          {#if pending}<Loader2Icon class="animate-spin" />{/if}
          Register app
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
