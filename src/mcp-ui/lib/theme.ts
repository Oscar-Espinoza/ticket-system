// Applies the host's theme, style variables, fonts and safe-area insets.
// Same effect as the SDK's applyDocumentTheme / applyHostStyleVariables /
// applyHostFonts, without importing the SDK. Every colour and size the views
// use reads one of these variables with its own fallback (app.css), so a host
// that sends none still gets a correct light or dark view.

import type { HostContext } from './host';

/** Host variable names the views may receive; anything else (e.g. our own --tk-* tokens) is ignored. */
const HOST_VARIABLE = /^--(?:color|font|border|shadow)-[a-z0-9-]+$/;

export function applyHostContext(context: HostContext, root: HTMLElement = document.documentElement) {
  if (context.theme === 'light' || context.theme === 'dark') {
    root.setAttribute('data-theme', context.theme);
    root.style.colorScheme = context.theme;
  }
  for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
    if (HOST_VARIABLE.test(name) && typeof value === 'string' && value.length < 400) root.style.setProperty(name, value);
  }
  const fonts = context.styles?.css?.fonts;
  if (typeof fonts === 'string' && fonts && !document.getElementById('host-fonts')) {
    const style = document.createElement('style');
    style.id = 'host-fonts';
    style.textContent = fonts;
    document.head.append(style);
  }
  const insets = context.safeAreaInsets;
  if (insets) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const px = Number(insets[side]);
      if (Number.isFinite(px)) root.style.setProperty(`--sa-${side}`, `${Math.max(0, px)}px`);
    }
  }
}
