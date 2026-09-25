// Embeddable link allowlist, shared by the editor's embed node and the
// markdown renderer. The iframe src is always rebuilt on a fixed origin from
// validated ids — never the pasted URL — so only these providers ever load.

export type EmbedProvider = 'figma' | 'youtube' | 'loom' | 'google' | 'miro';

export interface Embed {
  provider: EmbedProvider;
  /** "Figma", "Google Slides", … */
  label: string;
  src: string;
  /** CSS aspect-ratio. */
  aspect: string;
}

const FIGMA_KINDS = /^\/(file|design|proto|board|slides|deck)\/[A-Za-z0-9]{10,}(\/|$)/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const LOOM_ID = /^\/share\/([a-f0-9]{16,64})\/?$/;
const GOOGLE = /^\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{20,})(\/|$)/;
const GOOGLE_LABEL = { document: 'Google Docs', spreadsheets: 'Google Sheets', presentation: 'Google Slides' };
const MIRO = /^\/app\/board\/([A-Za-z0-9_=-]{6,})\/?$/;

function youtubeId(url: URL): string | null {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1);
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const match = /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

/** The embed for an allowlisted https URL, or null. */
export function embedFor(raw: string): Embed | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'figma.com' && FIGMA_KINDS.test(url.pathname)) {
    return {
      provider: 'figma',
      label: 'Figma',
      src: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url.href)}`,
      aspect: '16 / 10',
    };
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const id = youtubeId(url);
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return {
      provider: 'youtube',
      label: 'YouTube',
      src: `https://www.youtube-nocookie.com/embed/${id}`,
      aspect: '16 / 9',
    };
  }
  if (host === 'loom.com') {
    const match = LOOM_ID.exec(url.pathname);
    if (!match) return null;
    return { provider: 'loom', label: 'Loom', src: `https://www.loom.com/embed/${match[1]}`, aspect: '16 / 9' };
  }
  if (host === 'docs.google.com') {
    const match = GOOGLE.exec(url.pathname);
    if (!match) return null;
    const kind = match[1] as keyof typeof GOOGLE_LABEL;
    const view = kind === 'presentation' ? 'embed' : 'preview';
    return {
      provider: 'google',
      label: GOOGLE_LABEL[kind],
      src: `https://docs.google.com/${kind}/d/${match[2]}/${view}`,
      aspect: kind === 'presentation' ? '16 / 9.6' : '4 / 3',
    };
  }
  if (host === 'miro.com') {
    const match = MIRO.exec(url.pathname);
    if (!match) return null;
    return {
      provider: 'miro',
      label: 'Miro',
      src: `https://miro.com/app/live-embed/${match[1]}/`,
      aspect: '16 / 10',
    };
  }
  return null;
}

/** Sandbox for embed iframes: the providers need scripts and their own origin. */
export const EMBED_SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms';
export const EMBED_ALLOW = 'fullscreen; clipboard-write; encrypted-media; picture-in-picture';
