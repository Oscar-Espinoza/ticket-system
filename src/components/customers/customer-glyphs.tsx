// Small customer glyphs: logo tile, status chip, importance meter, request source.

import { CodeXml, Hash, Inbox, PenLine } from 'lucide-react';

import { LabelChip } from '@/components/ui-icons';
import { cn } from '@/lib/utils';
import {
  CUSTOMER_STATUS_LABEL,
  IMPORTANCE_LABEL,
  REQUEST_SOURCE_LABEL,
  type CustomerStatus,
  type Importance,
  type RequestSource,
} from './customer-model';

// Deterministic tile hue from the name, so a customer is recognisable at a glance.
function hueOf(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function CustomerLogo({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: 16 | 20 | 28;
  className?: string;
}) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded font-medium text-white',
        size === 16 && 'size-4 text-[9px]',
        size === 20 && 'size-5 text-[10px]',
        size === 28 && 'size-7 text-sm',
        className,
      )}
      style={{ backgroundColor: `oklch(0.6 0.12 ${hueOf(name)})` }}
    >
      {initial}
    </span>
  );
}

const STATUS_COLOR = { active: 'done', lead: 'in_progress', churned: 'default' } as const;

export function CustomerStatusChip({
  status,
  className,
}: {
  status: CustomerStatus;
  className?: string;
}) {
  return (
    <LabelChip color={STATUS_COLOR[status]} className={className}>
      {CUSTOMER_STATUS_LABEL[status]}
    </LabelChip>
  );
}

export const STATUS_DOT_CLASS: Record<CustomerStatus, string> = {
  active: 'bg-status-done',
  lead: 'bg-status-in-progress',
  churned: 'bg-muted-foreground',
};

const IMPORTANCE_LEVEL: Record<Importance, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/** Four bars, filled up to the level — reads like the priority glyph. */
export function ImportanceIcon({
  importance,
  className,
}: {
  importance: Importance | null;
  className?: string;
}) {
  const level = importance ? IMPORTANCE_LEVEL[importance] : 0;
  return (
    <svg
      viewBox="0 0 16 16"
      role="img"
      aria-label={importance ? `${IMPORTANCE_LABEL[importance]} importance` : 'No importance'}
      className={cn(
        'size-3.5 shrink-0',
        importance === 'critical' ? 'text-destructive' : 'text-foreground',
        className,
      )}
    >
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={1 + i * 3.75}
          y={11 - i * 3}
          width={2.5}
          height={4 + i * 3}
          rx={0.75}
          fill="currentColor"
          opacity={i < level ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

const SOURCE_ICON = { intake: Inbox, slack: Hash, manual: PenLine, api: CodeXml } as const;

export function RequestSourceIcon({
  source,
  className,
}: {
  source: RequestSource;
  className?: string;
}) {
  const Icon = SOURCE_ICON[source];
  return (
    <Icon
      role="img"
      aria-label={REQUEST_SOURCE_LABEL[source]}
      className={cn('size-3.5 shrink-0 text-muted-foreground', className)}
    />
  );
}
