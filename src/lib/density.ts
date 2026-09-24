// Interface density preference: a per-browser setting (like the theme), kept in
// localStorage and mirrored onto <html data-density> so CSS can react to it.

export type Density = 'comfortable' | 'compact';

export const DENSITY_KEY = 'density';

// Runs inline while the HTML parses, before first paint, so compact mode never
// flashes comfortable first. Must stay dependency-free.
export const DENSITY_BOOT_SCRIPT = `try{if(localStorage.getItem('${DENSITY_KEY}')==='compact')document.documentElement.dataset.density='compact'}catch(e){}`;

// Tailwind v4 sizes spacing and type in rem, so shrinking the root font size
// tightens the whole UI with one rule.
export const DENSITY_CSS = `html[data-density='compact']{font-size:93.75%}`;

export function readDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

export function applyDensity(density: Density) {
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // Storage blocked: applies for this page view only.
  }
  if (density === 'compact') document.documentElement.dataset.density = 'compact';
  else delete document.documentElement.dataset.density;
}
