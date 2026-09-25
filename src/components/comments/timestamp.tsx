'use client';

import { relativeTime } from '@/components/issues/issue-properties';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** Relative time with the absolute date in a tooltip. Needs a TooltipProvider above. */
export function Timestamp({ date }: { date: Date }) {
  const value = new Date(date);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value.toISOString()} className="cursor-default whitespace-nowrap">
          {relativeTime(value)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{absolute.format(value)}</TooltipContent>
    </Tooltip>
  );
}
