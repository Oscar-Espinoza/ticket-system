'use client';

// Owner: B1 (replaces this with the markdown editor + preview). Working
// default: a plain textarea that saves on blur and resets to the saved value
// whenever it changes underneath (including an optimistic rollback).

import { Textarea } from '@/components/ui/textarea';
import type { IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useDraft } from '../use-draft';

export function DescriptionEditor({
  issue,
  mutations,
  readOnly = false,
}: {
  issue: IssueRow;
  mutations: IssueMutations;
  readOnly?: boolean;
}) {
  const [description, setDescription] = useDraft(issue.description ?? '');

  const save = () => {
    const next = description.trim();
    if (next !== (issue.description ?? '')) {
      mutations.update(issue, { description: next || null });
    }
  };

  return (
    <Textarea
      aria-label="Description"
      value={description}
      placeholder="Add a description…"
      maxLength={10_000}
      readOnly={readOnly}
      onChange={(e) => setDescription(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="min-h-32 resize-none border-transparent bg-transparent px-1 shadow-none hover:border-border dark:bg-transparent"
    />
  );
}
