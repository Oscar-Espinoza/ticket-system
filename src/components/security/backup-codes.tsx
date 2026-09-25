'use client';

// One-time display of 2FA backup codes: a two-column mono grid with Copy all
// and Download (.txt). Shown right after enabling / regenerating — the server
// only keeps them encrypted and never shows them again.

import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

export function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Backup codes copied');
    } catch {
      toast.error('Copy failed — select the codes and copy them manually');
    }
  }

  function download() {
    const blob = new Blob(
      [`Ticket System — two-factor backup codes\nEach code works once.\n\n${text}\n`],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ticket-system-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-4 py-3 font-mono text-sm select-all"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy />
          Copy all
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download />
          Download
        </Button>
      </div>
    </div>
  );
}
