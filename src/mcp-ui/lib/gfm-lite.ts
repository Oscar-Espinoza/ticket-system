// The part of GitHub-flavoured Markdown the views render: tables,
// strikethrough and task lists. A remark plugin built from the same micromark
// and mdast packages `remark-gfm` bundles, minus bare-URL autolinks and
// footnotes: those two cost ~32 KB of the bundle, and a bare URL in an issue
// stays readable text instead of a link (links are written as [text](url)).

import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import { combineExtensions } from 'micromark-util-combine-extensions';

interface ParserData {
  micromarkExtensions?: unknown[];
  fromMarkdownExtensions?: unknown[];
}

/** unified calls a plugin with the processor as `this`. */
export function remarkGfmLite(this: { data(): object }) {
  const data = this.data() as ParserData;
  (data.micromarkExtensions ??= []).push(combineExtensions([gfmStrikethrough(), gfmTable(), gfmTaskListItem()]));
  (data.fromMarkdownExtensions ??= []).push([
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown(),
  ]);
}
