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
import { Avatar, StateIcon } from '@/components/ui-icons';
import { useProjectData } from '@/components/project/project-data';
import {
  EMPTY_FILTERS,
  UNASSIGNED,
  hasActiveFilters,
  parseIssueFilters,
  serializeIssueFilters,
  type IssueFilters as Filters,
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
  return parseIssueFilters(Object.fromEntries(searchParams.entries()));
}

export function applyFilters(next: Filters) {
  setSearchParams(serializeIssueFilters(next));
}

export function clearFilters() {
  applyFilters(EMPTY_FILTERS);
}

export function IssueFilters() {
  const { states, members } = useProjectData();
  const filters = useIssueFilters();

  const toggleState = (stateId: string, checked: boolean) => {
    const next = checked
      ? [...filters.stateIds, stateId]
      : filters.stateIds.filter((id) => id !== stateId);
    // Keep workflow order so the URL is stable.
    applyFilters({ ...filters, stateIds: states.map((s) => s.id).filter((id) => next.includes(id)) });
  };

  const selectedStates = states.filter((s) => filters.stateIds.includes(s.id));
  const assigneeLabel =
    filters.assignee === UNASSIGNED
      ? 'Unassigned'
      : (members.find((m) => m.id === filters.assignee)?.name ?? 'Assignee');
  const statusLabel =
    selectedStates.length === 1
      ? selectedStates[0].name
      : selectedStates.length > 1
        ? `${selectedStates.length} statuses`
        : 'Status';

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={selectedStates.length ? 'secondary' : 'ghost'}
            size="sm"
            aria-label="Filter by status"
          >
            {statusLabel}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {states.map((state) => (
            <DropdownMenuCheckboxItem
              key={state.id}
              checked={filters.stateIds.includes(state.id)}
              onCheckedChange={(checked) => toggleState(state.id, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              <StateIcon state={state} size={14} />
              {state.name}
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

      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
