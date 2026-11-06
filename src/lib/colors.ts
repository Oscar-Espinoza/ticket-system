/** `#rrggbb` swatch colours, as stored for labels, states and epics. */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_RE.test(value);
