<script lang="ts">
  import CustomerDetail from '@/lib/components/customers/customer-detail.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.customer.name}</title>
</svelte:head>

<CustomerDetail customer={data.customer} requests={data.requests} issues={data.issues} tiers={data.tiers} />
