'use client';

// Read-only value + Copy button (API keys, webhook secrets, intake links and
// embed snippets). Falls back to selecting the text when the clipboard API is
// unavailable (insecure origins, some embedded browsers).

import { useRef } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function CopyField({
  id,
  value,
  label = 'Text',
  multiline = false,
  className,
}: {
  id?: string;
  value: string;
  /** Toast noun, e.g. "Link" → "Link copied". */
  label?: string;
  multiline?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      ref.current?.select();
      toast.error('Copy failed — the text is selected, copy it manually');
    }
  }

  const common = {
    id,
    ref,
    value,
    readOnly: true,
    spellCheck: false,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.select(),
    className: 'font-mono text-xs',
  };

  return (
    <div className={cn('flex items-start gap-2', className)}>
      {multiline ? <Textarea rows={3} {...common} /> : <Input {...common} />}
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        <Copy />
      </Button>
    </div>
  );
}
