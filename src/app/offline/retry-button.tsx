'use client';

import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function RetryButton() {
  return (
    <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
      <RotateCw />
      Try again
    </Button>
  );
}
