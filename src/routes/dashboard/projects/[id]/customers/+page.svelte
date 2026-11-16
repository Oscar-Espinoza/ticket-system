<script lang="ts">
  import { m } from '@/lib/i18n';
  import CustomersList from '@/lib/components/customers/customers-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.auth_customers_page_title()}</title>
</svelte:head>

<CustomersList customers={data.customers} tiers={data.tiers} />
