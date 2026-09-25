'use client';

// Template picker for the create-project dialogs. Templates load the first
// time a dialog opens and are shared by every dialog on the page; saving /
// deleting a template calls `invalidateProjectTemplates()`.

import { useEffect, useState } from 'react';

import { listProjectTemplates, type ProjectTemplateRow } from '@/app/actions/project-templates';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

let cache: Promise<ProjectTemplateRow[]> | null = null;

function loadTemplates(): Promise<ProjectTemplateRow[]> {
  cache ??= listProjectTemplates().then(
    (result) => (result.ok ? result.templates : []),
    () => {
      cache = null;
      return [];
    },
  );
  return cache;
}

export function invalidateProjectTemplates() {
  cache = null;
}

/** Usable templates once `enabled` (dialog open); undefined while loading. */
export function useProjectTemplates(enabled: boolean): ProjectTemplateRow[] | undefined {
  const [templates, setTemplates] = useState<ProjectTemplateRow[] | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadTemplates().then((list) => {
      if (live) setTemplates(list);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return templates;
}

const DEFAULT = 'default';

export function TemplateSelect({
  id,
  templates,
  value,
  onChange,
}: {
  id?: string;
  templates: ProjectTemplateRow[] | undefined;
  /** '' = default workflow. */
  value: string;
  onChange: (templateId: string) => void;
}) {
  const known = !value || templates?.some((t) => t.id === value);
  return (
    <Select
      value={known ? value || DEFAULT : DEFAULT}
      onValueChange={(next) => onChange(next === DEFAULT ? '' : next)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT}>Default workflow</SelectItem>
        {templates === undefined ? (
          <SelectItem value="__loading" disabled>
            Loading templates…
          </SelectItem>
        ) : (
          templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              <span className="truncate">{template.name}</span>
              {template.workspaceName && (
                <span className="text-xs text-muted-foreground">· {template.workspaceName}</span>
              )}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
