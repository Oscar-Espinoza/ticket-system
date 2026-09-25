'use client';

// "New doc" button + template menu (Blank / Spec / RFC / Meeting notes). Also
// registers the "New document" palette command while mounted.

import { useEffect, useEffectEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { createDocument } from '@/app/actions/documents';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { DOCUMENT_TEMPLATES, documentPath, type DocumentTemplateId } from './document-model';

export function useCreateDocument(projectId: string, epicId?: string | null) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const create = (template: DocumentTemplateId) =>
    startTransition(async () => {
      const result = await createDocument({ projectId, template, epicId: epicId ?? undefined });
      if (!result.ok) toast.error(result.error);
      else router.push(documentPath(projectId, result.id));
    });
  return { create, pending };
}

export function NewDocumentMenu({
  projectId,
  epicId,
  className,
}: {
  projectId: string;
  epicId?: string | null;
  className?: string;
}) {
  const { create, pending } = useCreateDocument(projectId, epicId);
  const [open, setOpen] = useState(false);
  const onBlank = useEffectEvent(() => create('blank'));
  const onTemplate = useEffectEvent(() => setOpen(true));

  useEffect(
    () =>
      registerPaletteCommands([
        { id: 'new-document', label: 'New document', section: 'Docs', keywords: ['create', 'doc', 'page', 'write'], run: () => onBlank() },
        {
          id: 'new-document-template',
          label: 'New document from template…',
          section: 'Docs',
          keywords: ['spec', 'rfc', 'meeting notes', 'template'],
          run: () => onTemplate(),
        },
      ]),
    [],
  );

  return (
    <div className={className}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <div className="flex items-center">
          <Button size="sm" className="rounded-r-none" disabled={pending} onClick={() => create('blank')}>
            <Plus />
            New doc
          </Button>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
              disabled={pending}
              aria-label="New doc from a template"
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">New document</DropdownMenuLabel>
          {DOCUMENT_TEMPLATES.map((template, index) => (
            <div key={template.id}>
              {index === 1 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => create(template.id)} className="items-start">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-sm leading-none">
                  {template.icon ?? <FileText className="text-muted-foreground" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span>{template.label}</span>
                  <span className="text-xs text-muted-foreground">{template.description}</span>
                </span>
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
