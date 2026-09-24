// Extension point for context-specific palette commands (built-ins are passed as props).

export interface PaletteCommand {
  /** Unique — re-registering the same id replaces it (idempotent HMR). */
  id: string;
  label: string;
  /** Group heading in the palette (default "General"). */
  section?: string;
  /** Extra cmdk filter terms (not shown in the UI). */
  keywords?: string[];
  run: () => void;
}

let commands: PaletteCommand[] = [];
const listeners = new Set<() => void>();
let snapshot: PaletteCommand[] = [];

function publish() {
  snapshot = [...commands];
  listeners.forEach((listener) => listener());
}

/** Register commands; returns an idempotent cleanup (useEffect return). */
export function registerPaletteCommands(next: PaletteCommand[]): () => void {
  const ids = new Set(next.map((command) => command.id));
  commands = [...commands.filter((command) => !ids.has(command.id)), ...next];
  publish();
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    commands = commands.filter((command) => !ids.has(command.id));
    publish();
  };
}

/** Immutable snapshot of extension commands (built-ins are passed as props). */
export function getPaletteCommands(): PaletteCommand[] {
  return snapshot;
}

/** useSyncExternalStore subscribe function. */
export function subscribePaletteCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
