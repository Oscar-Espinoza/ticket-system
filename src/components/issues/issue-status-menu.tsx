'use client';

import type { ReactNode } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusIcon } from '@/components/ui-icons';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  isTicketStatus,
  type TicketStatus,
} from '@/lib/issue-model';

export function IssueStatusMenu({
  status,
  onChange,
  open,
  onOpenChange,
  children,
  align = 'start',
  onCloseAutoFocus,
}: {
  status: TicketStatus;
  onChange: (status: TicketStatus) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The trigger element (rendered via asChild). */
  children: ReactNode;
  align?: 'start' | 'end';
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-44"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => {
            if (isTicketStatus(value)) onChange(value);
          }}
        >
          {STATUS_ORDER.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              <StatusIcon status={s} size={14} />
              {STATUS_LABEL[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
