'use client';

// Search input + filters. Everything lives in the URL (q, project, archived) so
// results are server-rendered and shareable; typing replaces the URL after a
// short pause instead of on every key. `q` may carry filter syntax
// (label:bug assignee:me …) — see the "?" popover.

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SearchSyntaxHelp, SearchTermChips, appendToken } from '@/components/views/search-syntax-help';

const ALL = '__all';
const DEBOUNCE_MS = 250;

export function SearchControls({
  query,
  projectId,
  includeArchived,
  projects,
}: {
  query: string;
  projectId: string | null;
  includeArchived: boolean;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const navigate = (next: { q?: string; project?: string | null; archived?: boolean }) => {
    const params = new URLSearchParams();
    const q = (next.q ?? text).trim();
    const project = next.project === undefined ? projectId : next.project;
    const archived = next.archived ?? includeArchived;
    if (q) params.set('q', q);
    if (project) params.set('project', project);
    if (archived) params.set('archived', '1');
    const search = params.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  };

  const onType = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value }), DEBOUNCE_MS);
  };
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          clearTimeout(timer.current);
          navigate({ q: text });
        }}
      >
        <InputGroup className="h-10">
          <InputGroupAddon>
            {pending ? <Loader2 className="animate-spin" /> : <Search />}
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            name="q"
            aria-label="Search issues"
            ref={inputRef}
            placeholder="Search issues and comments — try label:bug assignee:me, or a key like APP-12"
            autoFocus
            autoComplete="off"
            value={text}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && text) {
                event.preventDefault();
                onType('');
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <SearchSyntaxHelp
              note="Free text matches titles, descriptions and comments."
              onInsert={(token) => {
                onType(appendToken(text, token));
                inputRef.current?.focus();
              }}
            />
          </InputGroupAddon>
        </InputGroup>
      </form>
      <SearchTermChips query={query} />

      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={projectId ?? ALL}
          onValueChange={(value) => navigate({ project: value === ALL ? null : value })}
        >
          <SelectTrigger size="sm" aria-label="Project" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id="search-archived"
            size="sm"
            checked={includeArchived}
            onCheckedChange={(checked) => navigate({ archived: checked })}
          />
          <Label htmlFor="search-archived" className="text-xs font-normal text-muted-foreground">
            Include archived
          </Label>
        </div>
      </div>
    </div>
  );
}
