// The view's side of the MCP Apps protocol (spec 2026-01-26): JSON-RPC 2.0
// over postMessage to the host that embeds this iframe. A hand-written client
// instead of the SDK's `App` class: `App` drags the MCP client, core and zod
// into the bundle (~290 KB alone, over the whole 250 KB budget). Only the
// methods this view uses are here. The server never sees this code run: the
// host forwards `tools/call` to /mcp with the user's token, so no credential
// is ever in the iframe (docs/mcp/PLAN.md D7).

import type { CallToolResult } from '@modelcontextprotocol/server';

import { safeHref } from './markdown';

export type Theme = 'light' | 'dark';
export type DisplayMode = 'inline' | 'fullscreen' | 'pip';

export interface HostContext {
  theme?: Theme;
  styles?: { variables?: Record<string, string | undefined>; css?: { fonts?: string } };
  displayMode?: DisplayMode;
  availableDisplayModes?: DisplayMode[];
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
  locale?: string;
  timeZone?: string;
  [key: string]: unknown;
}

interface HostCapabilities {
  openLinks?: object;
  serverTools?: object;
  updateModelContext?: object;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const PROTOCOL_VERSION = '2026-01-26';
export const REQUEST_TIMEOUT_MS = 60_000;

/** JSON-RPC "Method not found", the answer to a host request this view doesn't implement. */
const METHOD_NOT_FOUND = -32601;

/**
 * No answer from the host in time. The request may still have reached the
 * server, so a write that ends this way is "may have been saved", not "refused".
 */
export class HostTimeoutError extends Error {
  constructor() {
    super('The host did not answer in time.');
    this.name = 'HostTimeoutError';
  }
}

export interface HostHandlers {
  onToolResult?: (result: CallToolResult) => void;
  onToolCancelled?: (reason?: string) => void;
  onContext?: (context: HostContext) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
};

export class Host {
  context: HostContext = {};
  capabilities: HostCapabilities = {};
  private nextId = 1;
  private pending = new Map<number | string, Pending>();
  private target: Window;
  private handlers: HostHandlers;
  private timeoutMs: number;

  /** `requestTimeoutMs` is for tests (a real timeout is a minute). */
  constructor(handlers: HostHandlers, target: Window = window.parent, requestTimeoutMs = REQUEST_TIMEOUT_MS) {
    this.handlers = handlers;
    this.target = target;
    this.timeoutMs = requestTimeoutMs;
    window.addEventListener('message', (event) => this.receive(event));
  }

  /** `ui/initialize` handshake, then `ui/notifications/initialized` and automatic resizing. */
  async connect(): Promise<void> {
    const result = (await this.request('ui/initialize', {
      appInfo: { name: 'ticket-system-views', version: '1.0.0' },
      appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
      protocolVersion: PROTOCOL_VERSION,
    })) as { hostCapabilities?: HostCapabilities; hostContext?: HostContext };
    this.capabilities = result.hostCapabilities ?? {};
    this.context = result.hostContext ?? {};
    this.handlers.onContext?.(this.context);
    this.notify('ui/notifications/initialized', {});
    this.autoResize();
  }

  get canOpenLinks() {
    return this.capabilities.openLinks !== undefined;
  }

  get canUpdateModelContext() {
    return this.capabilities.updateModelContext !== undefined;
  }

  /** The host forwards `tools/call` to the server: reads, expanding rows and writes all need it. */
  get canCallTools() {
    return this.capabilities.serverTools !== undefined;
  }

  get canFullscreen() {
    return this.context.availableDisplayModes?.includes('fullscreen') === true;
  }

  /** A tool of the same server, through the host (which holds the token). */
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.request('tools/call', { name, arguments: args }) as Promise<CallToolResult>;
  }

  /** Ask the host to open an http(s) URL in the user's browser. Resolves false if it refused. */
  async openLink(url: string): Promise<boolean> {
    // The same rule as the Markdown links (markdown.ts `safeHref`), the one owner.
    const safe = safeHref(url);
    if (!safe) return false;
    try {
      const result = (await this.request('ui/open-link', { url: safe })) as { isError?: boolean } | undefined;
      return !result?.isError;
    } catch {
      return false;
    }
  }

  /** Tell the model what changed in the view (replaces the previous update). Best effort. */
  async updateModelContext(text: string): Promise<void> {
    if (!this.canUpdateModelContext) return;
    try {
      await this.request('ui/update-model-context', { content: [{ type: 'text', text }] });
    } catch {
      // The host may refuse; the write itself already happened.
    }
  }

  async requestDisplayMode(mode: DisplayMode): Promise<DisplayMode | null> {
    try {
      const result = (await this.request('ui/request-display-mode', { mode })) as { mode?: DisplayMode };
      return result?.mode ?? null;
    } catch {
      return null;
    }
  }

  private post(message: Record<string, unknown>) {
    this.target.postMessage({ jsonrpc: '2.0', ...message }, '*');
  }

  private notify(method: string, params: Record<string, unknown>) {
    this.post({ method, params });
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HostTimeoutError());
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.post({ id, method, params });
    });
  }

  private receive(event: MessageEvent) {
    // Only the embedding host speaks to us.
    if (event.source !== this.target) return;
    const message = event.data as JsonRpcMessage | null;
    if (!message || message.jsonrpc !== '2.0') return;

    if (message.method === undefined && message.id !== undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message ?? 'Request failed.'));
      else entry.resolve(message.result);
      return;
    }

    const params = isRecord(message.params) ? message.params : null;
    switch (message.method) {
      case 'ui/notifications/tool-result':
        // A result carries `content` and/or `structuredContent`; anything else is not one.
        if (params && (Array.isArray(params.content) || isRecord(params.structuredContent))) {
          this.handlers.onToolResult?.(params as unknown as CallToolResult);
        }
        break;
      case 'ui/notifications/tool-cancelled':
        this.handlers.onToolCancelled?.(typeof params?.reason === 'string' ? params.reason : undefined);
        break;
      case 'ui/notifications/host-context-changed':
        if (params) {
          this.context = { ...this.context, ...(params as HostContext) };
          this.handlers.onContext?.(this.context);
        }
        break;
      case 'ui/resource-teardown':
      case 'ping':
        // Requests the host expects an (empty) answer to.
        if (message.id !== undefined) this.post({ id: message.id, result: {} });
        break;
      default:
        // A request (it has an id) for something this view doesn't do: say so now
        // rather than leave the host waiting for its own timeout. Notifications
        // we don't know are ignored, as JSON-RPC says.
        if (message.id !== undefined && message.method !== undefined) {
          this.post({ id: message.id, error: { code: METHOD_NOT_FOUND, message: `Method not found: ${message.method}` } });
        }
    }
  }

  /** `ui/notifications/size-changed` whenever the document's height or width changes. */
  private autoResize() {
    let scheduled = false;
    let lastWidth = 0;
    let lastHeight = 0;
    const measure = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const root = document.documentElement;
        const previous = root.style.height;
        root.style.height = 'max-content';
        const height = Math.ceil(root.getBoundingClientRect().height);
        root.style.height = previous;
        const width = Math.ceil(window.innerWidth);
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        this.notify('ui/notifications/size-changed', { width, height });
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(document.body);
  }
}
