'use client';

import Link from 'next/link';
import { FileText, Settings2 } from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { projectHref } from '@/components/app-shell/routes';
import { useTemplates, type IssueTemplate } from './templates-store';

/** "Template" dropdown in the new-issue dialog header. */
export function TemplateMenu({
  enabled,
  onApply,
}: {
  /** Load the templates (the dialog is open). */
  enabled: boolean;
  onApply: (template: IssueTemplate) => void;
}) {
  const { project } = useProjectData();
  const templates = useTemplates(project.id, enabled);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground">
          <FileText />
          Template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Apply template</DropdownMenuLabel>
        {templates === undefined ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : templates.length === 0 ? (
          <DropdownMenuItem disabled>No templates yet</DropdownMenuItem>
        ) : (
          templates.map((template) => (
            <DropdownMenuItem key={template.id} onSelect={() => onApply(template)}>
              <FileText />
              <span className="truncate">{template.name}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={projectHref(project.id, 'settings/templates')}>
            <Settings2 />
            Manage templates
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
