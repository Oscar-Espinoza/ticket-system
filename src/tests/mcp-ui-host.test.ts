// The view's postMessage client (src/mcp-ui/lib/host.ts): who it listens to,
// how it matches answers to requests, what it does when the host doesn't
// answer, and how it treats messages it doesn't understand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Host, HostTimeoutError, REQUEST_TIMEOUT_MS, type HostHandlers } from '../mcp-ui/lib/host';

type Listener = (event: { source: unknown; data: unknown }) => void;

let listeners: Listener[] = [];
const hostWindow = { postMessage: vi.fn() };
const otherWindow = { postMessage: vi.fn() };

const deliver = (data: unknown, source: unknown = hostWindow) => {
  for (const listener of listeners) listener({ source, data });
};
const sent = () => hostWindow.postMessage.mock.calls.map((call) => call[0] as { id?: number; method?: string; params?: unknown; error?: { code: number } });

function makeHost(handlers: HostHandlers = {}, timeoutMs?: number) {
  return new Host(handlers, hostWindow as unknown as Window, timeoutMs);
}

beforeEach(() => {
  listeners = [];
  hostWindow.postMessage.mockClear();
  vi.stubGlobal('window', { addEventListener: (_: string, fn: Listener) => listeners.push(fn) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Host messages', () => {
  it('ignores messages from any window but the embedding host', async () => {
    const host = makeHost();
    const call = host.callTool('get_issue', { key: 'WEB-1' });
    const id = sent()[0]!.id!;
    deliver({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'forged' }] } }, otherWindow);
    deliver({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'real' }] } });
    await expect(call).resolves.toEqual({ content: [{ type: 'text', text: 'real' }] });
  });

  it('matches an answer to its request by id, in any order, and drops an unknown id', async () => {
    const host = makeHost();
    const first = host.callTool('a', {});
    const second = host.callTool('b', {});
    const [one, two] = sent().map((m) => m.id!);
    deliver({ jsonrpc: '2.0', id: 999, result: 'stray' });
    deliver({ jsonrpc: '2.0', id: two, result: 'for b' });
    deliver({ jsonrpc: '2.0', id: one, result: 'for a' });
    await expect(first).resolves.toBe('for a');
    await expect(second).resolves.toBe('for b');
  });

  it('rejects a request the host answers with an error', async () => {
    const host = makeHost();
    const call = host.callTool('a', {});
    deliver({ jsonrpc: '2.0', id: sent()[0]!.id, error: { code: -32000, message: 'nope' } });
    await expect(call).rejects.toThrow('nope');
  });

  it('times out as "unknown", not as a refusal, and forgets the request', async () => {
    vi.useFakeTimers();
    const host = makeHost({}, REQUEST_TIMEOUT_MS);
    const call = host.callTool('add_comment', {});
    const settled = expect(call).rejects.toBeInstanceOf(HostTimeoutError);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await settled;
    // A late answer to the dropped request changes nothing.
    deliver({ jsonrpc: '2.0', id: sent()[0]!.id, result: 'late' });
  });

  it('answers a host request it does not implement with -32601 right away', () => {
    makeHost();
    deliver({ jsonrpc: '2.0', id: 7, method: 'ui/something-new', params: {} });
    expect(sent()).toEqual([{ jsonrpc: '2.0', id: 7, error: { code: -32601, message: 'Method not found: ui/something-new' } }]);
  });

  it('answers ping and teardown with an empty result, and ignores unknown notifications', () => {
    makeHost();
    deliver({ jsonrpc: '2.0', id: 1, method: 'ping' });
    deliver({ jsonrpc: '2.0', id: 2, method: 'ui/resource-teardown', params: {} });
    deliver({ jsonrpc: '2.0', method: 'ui/notifications/something-new', params: {} });
    expect(sent()).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, result: {} },
    ]);
  });

  it('ignores malformed notifications instead of throwing in the handler', () => {
    const onToolResult = vi.fn();
    const onContext = vi.fn();
    makeHost({ onToolResult, onContext });
    expect(() => {
      deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result' });
      deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: 'text' });
      deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { unrelated: true } });
      deliver({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed' });
      deliver({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: [1] });
      deliver(null);
      deliver('hello');
      deliver({ method: 'ui/notifications/tool-result', params: { content: [] } }); // not JSON-RPC 2.0
    }).not.toThrow();
    expect(onToolResult).not.toHaveBeenCalled();
    expect(onContext).not.toHaveBeenCalled();

    deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: 'ok' }] } });
    expect(onToolResult).toHaveBeenCalledOnce();
  });
});

describe('Host capabilities and links', () => {
  it('offers tool calls only when the host forwards them', () => {
    const host = makeHost();
    expect(host.canCallTools).toBe(false);
    host.capabilities = { serverTools: {} };
    expect(host.canCallTools).toBe(true);
  });

  it('asks the host to open http(s) links only (the Markdown rule), never mailto or script URLs', async () => {
    const host = makeHost();
    for (const bad of ['mailto:a@example.com', 'javascript:alert(1)', 'file:///etc/passwd', '/relative']) {
      await expect(host.openLink(bad), bad).resolves.toBe(false);
    }
    expect(sent()).toEqual([]);
    const opened = host.openLink('https://example.com/a');
    deliver({ jsonrpc: '2.0', id: sent()[0]!.id, result: {} });
    await expect(opened).resolves.toBe(true);
    expect(sent()[0]).toMatchObject({ method: 'ui/open-link', params: { url: 'https://example.com/a' } });
  });
});
