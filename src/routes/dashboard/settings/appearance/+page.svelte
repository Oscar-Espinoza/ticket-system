<script lang="ts">
  import { m } from '@/lib/i18n';
  import AppearanceForm from '@/lib/components/settings/appearance-form.svelte';
</script>

<svelte:head>
  <title>{m.settings_page_appearance_title()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_appearance()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">{m.settings_page_appearance_desc()}</p>
<AppearanceForm />
