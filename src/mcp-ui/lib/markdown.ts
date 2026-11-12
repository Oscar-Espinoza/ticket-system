// What the views allow in user-written Markdown (descriptions, comments).
// Rendering is svelte-exmarkdown with raw HTML off; on top of that:
// - links keep only http(s) and mailto targets (`javascript:`, `data:`,
//   `vbscript:`, `file:` … render as plain text), and open through the host
//   (`ui/open-link`), never by navigating the iframe;
// - images are not loaded (the CSP only allows the app's own origin, and a
//   Markdown image is an arbitrary external URL): the alt text shows instead;
// - any `raw` HTML node that reaches the tree is dropped.

const ALLOWED = /^(?:https?:|mailto:)/i;
// C0 controls and space, DEL/C1 controls, zero-width and line/paragraph separators.
// eslint-disable-next-line no-control-regex
const STRIPPED = /[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;

/** The href if it is safe to hand to the host, else null. */
export function safeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  // Browsers strip tabs/newlines and leading C0/space before reading the scheme.
  const cleaned = href.replace(STRIPPED, '');
  if (!ALLOWED.test(cleaned)) return null;
  try {
    const url = new URL(cleaned);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' ? cleaned : null;
  } catch {
    return null;
  }
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const URL_PROPERTIES = ['href', 'src', 'cite', 'action', 'formAction', 'poster', 'data', 'xlinkHref'];

/** Last rehype plugin: no raw HTML, no unsafe URLs left in the tree. */
export function rehypeSafe() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      if (!node.children) return;
      node.children = node.children.filter((child) => child.type !== 'raw');
      for (const child of node.children) {
        if (child.type === 'element' && child.properties) {
          for (const name of URL_PROPERTIES) {
            if (Object.hasOwn(child.properties, name) && safeHref(String(child.properties[name])) === null) {
              delete child.properties[name];
            }
          }
          // Event handlers and inline styles never come from Markdown; drop them if a plugin adds one.
          for (const name of Object.keys(child.properties)) {
            if (/^on/i.test(name) || name === 'style') delete child.properties[name];
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}
