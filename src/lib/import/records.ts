// The normalized shape every importer (CSV, Jira CSV, GitHub Issues, Asana,
// Shortcut) produces and `importIssues` re-validates on the server. Client-safe.

import type { Priority } from '@/lib/issue-model';

export const IMPORT_SOURCE_KINDS = ['csv', 'jira', 'github', 'asana', 'shortcut'] as const;
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number];

export const IMPORT_SOURCE_LABEL: Record<ImportSourceKind, string> = {
  csv: 'CSV',
  jira: 'Jira',
  github: 'GitHub',
  asana: 'Asana',
  shortcut: 'Shortcut',
};

export function isImportSourceKind(value: unknown): value is ImportSourceKind {
  return typeof value === 'string' && (IMPORT_SOURCE_KINDS as readonly string[]).includes(value);
}

export interface ImportLabel {
  name: string;
  /** #rrggbb; a palette colour is picked when absent. */
  color?: string | null;
}

export interface ImportSource {
  kind: ImportSourceKind;
  /** Jira key, "owner/repo#12", Asana task gid, Shortcut story id, or the CSV's id column. */
  id: string;
  url?: string | null;
  /** Original creation date, kept in the footer (issues are created "now"). */
  createdAt?: string | null;
}

export interface ImportRecord {
  title: string;
  description: string | null;
  /** Workflow state name (matched case-insensitively, then by synonyms). */
  state: string | null;
  /** GitHub: closed issues land in the first completed state. */
  closed?: boolean;
  priority: Priority | null;
  /** Member email (or exact display name) → assignee. */
  assignee: string | null;
  labels: ImportLabel[];
  estimate: number | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  source: ImportSource | null;
  /**
   * The parent's source (Asana subtasks, Shortcut sub-tasks): the issue becomes
   * a sub-issue of whichever issue carries that source's marker — imported
   * earlier or earlier in the same run (parents are ordered first).
   */
  parent?: ImportSource | null;
}

export interface ImportFailure {
  /** Index within the chunk sent to importIssues. */
  index: number;
  title: string;
  error: string;
}

export interface ImportChunkResult {
  created: number;
  duplicates: number;
  failed: ImportFailure[];
}

/** Records per server-action call: keeps each call a few seconds long. */
export const IMPORT_CHUNK = 25;
export const IMPORT_MAX_ROWS = 5000;
export const GITHUB_IMPORT_CAP = 500;
/** Tasks / stories fetched per Asana or Shortcut import. */
export const EXTERNAL_IMPORT_CAP = 500;

function sourceRef(source: ImportSource): string {
  return source.url ? `[${source.id}](${source.url})` : source.id;
}

/**
 * The description footer, e.g. `_Imported from Jira (created 2024-03-12): ABC-12_`.
 * Its tail doubles as the duplicate marker (see sourceMarker).
 */
export function sourceFooter(source: ImportSource): string {
  const created = source.createdAt ? ` (created ${source.createdAt})` : '';
  return `_Imported from ${IMPORT_SOURCE_LABEL[source.kind]}${created}: ${sourceRef(source)}_`;
}

/** Unique per source item; the trailing `_` stops ABC-1 from matching ABC-12. */
export function sourceMarker(source: ImportSource): string {
  return `: ${sourceRef(source)}_`;
}
