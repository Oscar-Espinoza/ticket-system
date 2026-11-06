// localStorage that never throws: private mode, blocked site data, quota or a
// server render (no `window`) read as "nothing stored" and drop writes.

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The value just isn't remembered.
  }
}
