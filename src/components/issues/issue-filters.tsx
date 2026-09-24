'use client';

import { useSearchParams } from 'next/navigation';
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
  parseIssueFilters,
  type IssueAssignee,
  type IssueFilters as Filters,
  type TicketStatus,
} from '@/lib/issue-model';

const ANYONE = '__anyone';

// Native history updates sync with useSearchParams without a server request —
// view, filter and pane state are all client-side.
export function setSearchParams(changes: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

export function useIssueFilters(): Filters {
  const searchParams = useSearchParams();
  return parseIssueFilters({
    status: searchParams.get('status') ?? undefined,
    assignee: searchParams.get('assignee') ?? undefined,
  });
}

export function applyFilters(next: Filters) {
  setSearchParams({
    status: next.statuses.length ? next.statuses.join(',') : null,
    assignee: next.assignee,
  });
}

export function IssueFilters({ members }: { members: IssueAssignee[] }) {
  const filters = useIssueFilters();

  const toggleStatus = (status: TicketStatus, checked: boolean) => {
    const next = checked
      ? [...filters.statuses, status]
      : filters.statuses.filter((s) => s !== status);
    applyFilters({ ...filters, statuses: STATUS_ORDER.filter((s) => next.includes(s)) });
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
              applyFilters({ ...filters, assignee: value === ANYONE ? null : value })
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
          onClick={() => applyFilters({ statuses: [], assignee: null })}
          className="text-muted-foreground"
        >
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
