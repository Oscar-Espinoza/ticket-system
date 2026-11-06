import { slugify } from '@/lib/document-model';

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
