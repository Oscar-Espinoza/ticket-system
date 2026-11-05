// Client-safe document types, paths and the "new doc" templates.

export interface DocumentUser {
  id: string;
  name: string;
  image: string | null;
}

export interface DocumentSummary {
  id: string;
  projectId: string;
  title: string;
  icon: string | null;
  epic: { id: string; name: string; color: string | null } | null;
  /** First ~200 characters of the markdown, for search and previews. */
  excerpt: string;
  updatedBy: DocumentUser | null;
  createdBy: DocumentUser | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  content: string;
}

export interface DocumentBacklink {
  id: string;
  key: string;
  title: string;
  projectId: string;
  state: { name: string; type: string; color: string };
}

export const TITLE_MAX = 200;
export const CONTENT_MAX = 200_000;
export const ICON_MAX = 16;

export const documentsPath = (projectId: string) => `/dashboard/projects/${projectId}/docs`;
export const documentPath = (projectId: string, documentId: string) => `${documentsPath(projectId)}/${documentId}`;

export type DocumentTemplateId = 'blank' | 'spec' | 'rfc' | 'meeting';

export interface DocumentTemplate {
  id: DocumentTemplateId;
  label: string;
  description: string;
  icon: string | null;
  title: string;
  content: () => string;
}

const today = () => new Date().toISOString().slice(0, 10);

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  { id: 'blank', label: 'Blank document', description: 'Start from scratch', icon: null, title: 'Untitled', content: () => '' },
  {
    id: 'spec',
    label: 'Spec',
    description: 'Problem, goals, solution, open questions',
    icon: '📐',
    title: 'Untitled spec',
    content: () =>
      [
        '## Problem',
        'What is broken or missing, and for whom?',
        '## Goals',
        '- ',
        '## Non-goals',
        '- ',
        '## Proposed solution',
        'How it works, key screens and flows.',
        '## Open questions',
        '- [ ] ',
      ].join('\n\n'),
  },
  {
    id: 'rfc',
    label: 'RFC',
    description: 'Context, proposal, alternatives, rollout',
    icon: '💡',
    title: 'Untitled RFC',
    content: () =>
      [
        '**Status:** Draft',
        '## Context',
        'Why this needs a decision now.',
        '## Proposal',
        'What we want to do.',
        '## Alternatives considered',
        '- ',
        '## Risks',
        '- ',
        '## Rollout plan',
        '1. ',
      ].join('\n\n'),
  },
  {
    id: 'meeting',
    label: 'Meeting notes',
    description: 'Attendees, agenda, decisions, action items',
    icon: '🗓️',
    title: `Meeting notes ${today()}`,
    content: () =>
      [
        `**Date:** ${today()}`,
        '## Attendees',
        '- ',
        '## Agenda',
        '1. ',
        '## Notes',
        '## Decisions',
        '- ',
        '## Action items',
        '- [ ] ',
      ].join('\n\n'),
  },
];

export function isTemplateId(value: unknown): value is DocumentTemplateId {
  return DOCUMENT_TEMPLATES.some((t) => t.id === value);
}

export const DOCUMENT_ICONS = [
  '📄', '📝', '📐', '💡', '🗓️', '📌', '🚀', '🎯', '🧭', '🧪', '🐛', '🔒',
  '📊', '📈', '🧩', '⚙️', '🛠️', '🎨', '📣', '✅', '❓', '🔥', '⭐', '📚',
];

export function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'document'
  );
}

/** Downloads the doc as `<title>.md` (title as a top-level heading). */
export function downloadMarkdown(title: string, content: string) {
  const body = `# ${title.trim() || 'Untitled'}\n\n${content.trim()}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(title)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Markdown → a one-line plain preview. */
export function excerptOf(markdown: string, max = 200): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+\d.\s[\]x]+/gim, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
