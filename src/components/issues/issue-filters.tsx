'use client';

import { useOptimistic, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, StatusIcon } from '@/components/ui-icons';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  UNASSIGNED,
  type IssueAssignee,
  type IssueFilters as Filters,
  type TicketStatus,
} from '@/lib/issue-model';

const ANYONE = '__anyone';

export function useSetSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}

export function IssueFilters({
  filters: serverFilters,
  members,
}: {
  filters: Filters;
  members: IssueAssignee[];
}) {
  const setParams = useSetSearchParams();
  // Rapid toggles must build on the pending selection, not the last server render.
  const [filters, setOptimisticFilters] = useOptimistic(serverFilters);
  const [, startTransition] = useTransition();

  const apply = (next: Filters) =>
    startTransition(() => {
      setOptimisticFilters(next);
      setParams({
        status: next.statuses.length ? next.statuses.join(',') : null,
        assignee: next.assignee,
      });
    });

  const toggleStatus = (status: TicketStatus, checked: boolean) => {
    const next = checked
      ? [...filters.statuses, status]
      : filters.statuses.filter((s) => s !== status);
    apply({ ...filters, statuses: STATUS_ORDER.filter((s) => next.includes(s)) });
  };

  const assigneeLabel =
    filters.assignee === UNASSIGNED
      ? 'Unassigned'
      : (members.find((m) => m.id === filters.assignee)?.name ?? 'Assignee');
  const statusLabel =
    filters.statuses.length === 1
      ? STATUS_LABEL[filters.statuses[0]]
      : filters.statuses.length > 1
        ? `${filters.statuses.length} statuses`
        : 'Status';
  const active = filters.statuses.length > 0 || filters.assignee !== null;

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={filters.statuses.length ? 'secondary' : 'ghost'}
            size="sm"
            aria-label="Filter by status"
          >
            {statusLabel}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {STATUS_ORDER.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.statuses.includes(status)}
              onCheckedChange={(checked) => toggleStatus(status, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              <StatusIcon status={status} size={14} />
              {STATUS_LABEL[status]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={filters.assignee ? 'secondary' : 'ghost'}
            size="sm"
            aria-label="Filter by assignee"
          >
            {assigneeLabel}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuRadioGroup
            value={filters.assignee ?? ANYONE}
            onValueChange={(value) =>
              apply({ ...filters, assignee: value === ANYONE ? null : value })
            }
          >
            <DropdownMenuRadioItem value={ANYONE}>Anyone</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value={UNASSIGNED}>Unassigned</DropdownMenuRadioItem>
            {members.length > 0 && <DropdownMenuSeparator />}
            {members.map((member) => (
              <DropdownMenuRadioItem key={member.id} value={member.id}>
                <Avatar name={member.name} src={member.image} size={20} />
                <span className="truncate">{member.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => apply({ statuses: [], assignee: null })}
          className="text-muted-foreground"
        >
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
