'use client';

import { useState } from 'react';

// Local draft that resets whenever the saved value changes (including an
// optimistic rollback), without an effect.
export function useDraft(saved: string) {
  const [draft, setDraft] = useState(saved);
  const [base, setBase] = useState(saved);
  if (saved !== base) {
    setBase(saved);
    setDraft(saved);
  }
  return [draft, setDraft] as const;
}
