// CSV column mapping: which column feeds which issue field, auto-detected from
// header names (generic CSV, our own export, Jira's export), and turning mapped
// rows into ImportRecords. Client-safe — runs in the import wizard.

import { isDateString, toDateString } from '@/lib/dates';
import type { Priority } from '@/lib/issue-model';
import { unguardCell } from './csv';
import type { ImportRecord, ImportSourceKind } from './records';

export type ImportField =
  | 'ignore'
  | 'title'
  | 'description'
  | 'state'
  | 'priority'
  | 'assignee'
  | 'labels'
  | 'estimate'
  | 'dueDate'
  | 'id'
  | 'url'
  | 'createdAt';

export const IMPORT_FIELDS: { value: ImportField; label: string }[] = [
  { value: 'ignore', label: "Don't import" },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'state', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee (email)' },
  { value: 'labels', label: 'Labels' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'id', label: 'Source ID (skip duplicates)' },
  { value: 'url', label: 'Source link' },
  { value: 'createdAt', label: 'Created date' },
];

/** Several columns may feed labels (Jira repeats the Labels header per label). */
const MULTI: ReadonlySet<ImportField> = new Set(['labels']);

export type CsvPreset = Extract<ImportSourceKind, 'csv' | 'jira'>;

const normalize = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

// Earlier synonyms win when several columns could match one field.
const SYNONYMS: Record<Exclude<ImportField, 'ignore'>, string[]> = {
  title: ['title', 'summary', 'issuetitle', 'name', 'subject'],
  description: ['description', 'body', 'details', 'content'],
  state: ['status', 'state', 'workflowstate'],
  priority: ['priority'],
  assignee: ['assigneeemail', 'assignee', 'assignedto', 'owner'],
  labels: ['labels', 'label', 'tags', 'tag'],
  estimate: [
    'estimate',
    'storypoints',
    'customfieldstorypoints',
    'storypointestimate',
    'customfieldstorypointestimate',
    'points',
  ],
  dueDate: ['duedate', 'due', 'deadline'],
  id: ['issuekey', 'key', 'id', 'identifier', 'issueid'],
  url: ['url', 'link'],
  createdAt: ['created', 'createdat', 'datecreated'],
};

export function detectMapping(headers: string[]): ImportField[] {
  const keys = headers.map(normalize);
  const mapping: ImportField[] = headers.map(() => 'ignore');
  for (const [field, synonyms] of Object.entries(SYNONYMS) as [ImportField, string[]][]) {
    if (MULTI.has(field)) {
      keys.forEach((key, i) => {
        if (mapping[i] === 'ignore' && synonyms.includes(key)) mapping[i] = field;
      });
      continue;
    }
    for (const synonym of synonyms) {
      const i = keys.findIndex((key, j) => key === synonym && mapping[j] === 'ignore');
      if (i !== -1) {
        mapping[i] = field;
        break;
      }
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

const PRIORITY_WORDS: Record<string, Priority> = {
  none: 'none',
  nopriority: 'none',
  '0': 'none',
  urgent: 'urgent',
  highest: 'urgent',
  critical: 'urgent',
  blocker: 'urgent',
  p0: 'urgent',
  '1': 'urgent',
  high: 'high',
  major: 'high',
  p1: 'high',
  '2': 'high',
  medium: 'medium',
  normal: 'medium',
  p2: 'medium',
  '3': 'medium',
  low: 'low',
  lowest: 'low',
  minor: 'low',
  trivial: 'low',
  p3: 'low',
  p4: 'low',
  '4': 'low',
};

/** Linear numbers (0–4), Jira names (Highest…Lowest) and P0–P4. */
export function parsePriority(raw: string): Priority | null {
  const key = normalize(raw);
  return key ? (PRIORITY_WORDS[key] ?? null) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function ymd(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  const value = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isDateString(value) ? value : null;
}

/** ISO, Jira (12/Mar/24 10:15 AM), US m/d/y, else whatever Date understands. */
export function parseDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return ymd(+iso[1], +iso[2], +iso[3]);
  const jira = /^(\d{1,2})[/ -]([A-Za-z]{3})[a-z]*[/ -](\d{2,4})/.exec(value);
  if (jira) {
    const month = MONTHS.indexOf(jira[2].toLowerCase());
    return month === -1 ? null : ymd(+jira[3], month + 1, +jira[1]);
  }
  const slash = /^(\d{1,4})[/.](\d{1,2})[/.](\d{1,4})/.exec(value);
  if (slash) {
    return slash[1].length === 4
      ? ymd(+slash[1], +slash[2], +slash[3])
      : ymd(+slash[3], +slash[1], +slash[2]);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toDateString(date);
}

const TSHIRT: Record<string, number> = { xs: 1, s: 2, m: 3, l: 5, xl: 8 };

/** Points ("3", "2.5" → 3) or t-shirt sizes; the server snaps to the project scale. */
export function parseEstimate(raw: string): number | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value in TSHIRT) return TSHIRT[value];
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function splitLabels(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Rows → records
// ---------------------------------------------------------------------------

export interface BuiltRecords {
  records: ImportRecord[];
  /** Data rows dropped because they had no title. */
  untitled: number;
}

/** `rows` are data rows (header excluded). */
export function buildRecords(
  rows: string[][],
  mapping: ImportField[],
  preset: CsvPreset,
): BuiltRecords {
  const records: ImportRecord[] = [];
  let untitled = 0;

  for (const row of rows) {
    const one = (field: ImportField) => {
      for (let i = 0; i < mapping.length; i++) {
        if (mapping[i] !== field) continue;
        const value = unguardCell(row[i] ?? '').trim();
        if (value) return value;
      }
      return '';
    };
    const title = one('title');
    if (!title) {
      untitled++;
      continue;
    }

    const labelNames = new Map<string, string>();
    mapping.forEach((field, i) => {
      if (field !== 'labels') return;
      for (const name of splitLabels(unguardCell(row[i] ?? ''))) {
        labelNames.set(name.toLowerCase(), name);
      }
    });

    const id = one('id');
    const created = one('createdAt');
    records.push({
      title,
      description: one('description') || null,
      state: one('state') || null,
      priority: parsePriority(one('priority')),
      assignee: one('assignee') || null,
      labels: [...labelNames.values()].map((name) => ({ name })),
      estimate: parseEstimate(one('estimate')),
      dueDate: parseDate(one('dueDate')),
      source: id
        ? {
            kind: preset,
            id,
            url: one('url') || null,
            createdAt: created ? (parseDate(created) ?? created) : null,
          }
        : null,
    });
  }
  return { records, untitled };
}
