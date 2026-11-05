<script lang="ts">
  import CustomersList from '@/lib/components/customers/customers-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Customers · Ticket System</title>
</svelte:head>

<CustomersList customers={data.customers} tiers={data.tiers} />
