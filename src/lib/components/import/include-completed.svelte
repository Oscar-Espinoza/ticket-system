<script lang="ts">
  import { m } from '@/lib/i18n';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';

  let {
    checked,
    onChange,
    disabled,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  } = $props();

  const id = $props.id();
</script>

<div class="flex h-8 items-center gap-2">
  <Switch {id} bind:checked={() => checked, onChange} {disabled} />
  <Label for={id} class="font-normal">{m.auth_import_include_completed()}</Label>
</div>
