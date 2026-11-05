<script lang="ts">
  import { MarkdownEditor } from '@/lib/components/editor';

  let {
    value,
    onChange,
    onSubmit,
    onCancel,
    placeholder,
    autoFocus,
    maxLength,
    class: className,
    'aria-label': ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    /** ⌘/Ctrl+Enter. */
    onSubmit?: () => void;
    /** Esc. */
    onCancel?: () => void;
    placeholder?: string;
    autoFocus?: boolean;
    maxLength?: number;
    class?: string;
    'aria-label': string;
  } = $props();
</script>

<MarkdownEditor
  {value}
  {onChange}
  {onSubmit}
  {onCancel}
  {placeholder}
  {autoFocus}
  {maxLength}
  class={className}
  aria-label={ariaLabel}
/>
