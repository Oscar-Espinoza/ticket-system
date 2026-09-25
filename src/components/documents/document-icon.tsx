import { FileText } from 'lucide-react';

import { cn } from '@/lib/utils';

/** The doc's emoji, or a quiet page glyph. */
export function DocumentIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  if (icon) {
    return (
      <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center text-sm leading-none', className)}>
        {icon}
      </span>
    );
  }
  return <FileText aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground', className)} />;
}
