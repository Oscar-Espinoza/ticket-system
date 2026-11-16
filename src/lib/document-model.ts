// Client-safe document types, paths and the "new doc" templates.

import { m } from '@/lib/i18n';

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

/** The "new doc" templates, in the current language (titles and starter text follow it). */
export function documentTemplates(): DocumentTemplate[] {
  return [
    {
      id: 'blank',
      label: m.auth_docs_tpl_blank_label(),
      description: m.auth_docs_tpl_blank_description(),
      icon: null,
      title: m.auth_docs_untitled(),
      content: () => '',
    },
    {
      id: 'spec',
      label: m.auth_docs_tpl_spec_label(),
      description: m.auth_docs_tpl_spec_description(),
      icon: '📐',
      title: m.auth_docs_tpl_spec_title(),
      content: () =>
        [
          `## ${m.auth_docs_tpl_spec_problem()}`,
          m.auth_docs_tpl_spec_problem_hint(),
          `## ${m.auth_docs_tpl_spec_goals()}`,
          '- ',
          `## ${m.auth_docs_tpl_spec_non_goals()}`,
          '- ',
          `## ${m.auth_docs_tpl_spec_solution()}`,
          m.auth_docs_tpl_spec_solution_hint(),
          `## ${m.auth_docs_tpl_open_questions()}`,
          '- [ ] ',
        ].join('\n\n'),
    },
    {
      id: 'rfc',
      label: m.auth_docs_tpl_rfc_label(),
      description: m.auth_docs_tpl_rfc_description(),
      icon: '💡',
      title: m.auth_docs_tpl_rfc_title(),
      content: () =>
        [
          m.auth_docs_tpl_rfc_status(),
          `## ${m.auth_docs_tpl_rfc_context()}`,
          m.auth_docs_tpl_rfc_context_hint(),
          `## ${m.auth_docs_tpl_rfc_proposal()}`,
          m.auth_docs_tpl_rfc_proposal_hint(),
          `## ${m.auth_docs_tpl_rfc_alternatives()}`,
          '- ',
          `## ${m.auth_docs_tpl_rfc_risks()}`,
          '- ',
          `## ${m.auth_docs_tpl_rfc_rollout()}`,
          '1. ',
        ].join('\n\n'),
    },
    {
      id: 'meeting',
      label: m.auth_docs_tpl_meeting_label(),
      description: m.auth_docs_tpl_meeting_description(),
      icon: '🗓️',
      title: m.auth_docs_tpl_meeting_title({ date: today() }),
      content: () =>
        [
          m.auth_docs_tpl_meeting_date({ date: today() }),
          `## ${m.auth_docs_tpl_meeting_attendees()}`,
          '- ',
          `## ${m.auth_docs_tpl_meeting_agenda()}`,
          '1. ',
          `## ${m.auth_docs_tpl_meeting_notes()}`,
          `## ${m.auth_docs_tpl_meeting_decisions()}`,
          '- ',
          `## ${m.auth_docs_tpl_meeting_actions()}`,
          '- [ ] ',
        ].join('\n\n'),
    },
  ];
}

export function isTemplateId(value: unknown): value is DocumentTemplateId {
  return (['blank', 'spec', 'rfc', 'meeting'] as const).some((id) => id === value);
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
