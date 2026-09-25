'use client';

// Audit log filters (actor, category, date range, issue key) mirrored to the
// URL — the server page re-queries on every change — plus CSV / JSON export
// links carrying the same filters.

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar } from '@/components/ui-icons';

const ALL = 'all';

export interface AuditActorOption {
  id: string;
  name: string;
  image: string | null;
}

export function AuditFilterBar({
  actors,
  categories,
  systemActor,
  exportHref,
}: {
  actors: AuditActorOption[];
  categories: { value: string; label: string }[];
  /** Sentinel value for "no user" (integrations, automations). */
  systemActor: string;
  /** `/api/audit?…` with the current filters, without `format`. */
  exportHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [issue, setIssue] = useState(searchParams.get('issue') ?? '');

  const value = (name: string) => searchParams.get(name) ?? '';
  const active = ['actor', 'category', 'from', 'to', 'issue'].some((name) => value(name));

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [name, v] of Object.entries(changes)) {
      if (v) next.set(name, v);
      else next.delete(name);
    }
    // New filters start from the newest page.
    next.delete('before');
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function applyIssue() {
    const key = issue.trim().toUpperCase();
    if (key !== value('issue')) update({ issue: key || null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value('actor') || ALL}
        onValueChange={(v) => update({ actor: v === ALL ? null : v })}
      >
        <SelectTrigger size="sm" className="min-w-36" aria-label="Actor">
          <SelectValue placeholder="Anyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Anyone</SelectItem>
          <SelectItem value={systemActor}>System &amp; integrations</SelectItem>
          {actors.length > 0 && <SelectSeparator />}
          {actors.map((actor) => (
            <SelectItem key={actor.id} value={actor.id}>
              <Avatar name={actor.name} src={actor.image} size={20} />
              {actor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value('category') || ALL}
        onValueChange={(v) => update({ category: v === ALL ? null : v })}
      >
        <SelectTrigger size="sm" className="min-w-36" aria-label="Event type">
          <SelectValue placeholder="All events" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All events</SelectItem>
          <SelectSeparator />
          {categories.map((category) => (
            <SelectItem key={category.value} value={category.value}>
              {category.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Input
          type="date"
          aria-label="From date"
          className="h-7 w-36 text-xs"
          value={value('from')}
          max={value('to') || undefined}
          onChange={(e) => update({ from: e.target.value || null })}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          aria-label="To date"
          className="h-7 w-36 text-xs"
          value={value('to')}
          min={value('from') || undefined}
          onChange={(e) => update({ to: e.target.value || null })}
        />
      </div>

      <Input
        aria-label="Issue key"
        placeholder="Issue, e.g. APP-12"
        className="h-7 w-36 font-mono text-xs"
        value={issue}
        onChange={(e) => setIssue(e.target.value)}
        onBlur={applyIssue}
        onKeyDown={(e) => {
          if (e.key === 'Enter') applyIssue();
        }}
      />

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIssue('');
            update({ actor: null, category: null, from: null, to: null, issue: null });
          }}
        >
          <X />
          Clear
        </Button>
      )}
      {pending && <Loader2 aria-label="Loading" className="size-3.5 animate-spin text-muted-foreground" />}

      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" asChild>
          <a href={`${exportHref}&format=csv`} download>
            <Download />
            CSV
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={`${exportHref}&format=json`} download>
            <Download />
            JSON
          </a>
        </Button>
      </div>
    </div>
  );
}
