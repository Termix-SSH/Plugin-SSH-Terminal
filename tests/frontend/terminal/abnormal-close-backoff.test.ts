// @vitest-environment node
import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = fs.readFileSync(
  new URL("../../../src/frontend/terminal/Terminal.tsx", import.meta.url),
  "utf8",
);
// What the socket's close listener does with an abnormal close (1006).
const abnormalClose = source.slice(
  source.indexOf("        if (event.code === 1006) {"),
  source.indexOf("        if (event.code === 1008) {"),
);
// The effect that connects a visible tab that is neither connected nor connecting.
const effectStart = source.indexOf(
  "      if (!terminal || !hostConfig || !isVisible) return;",
);
const autoConnect = source.slice(
  effectStart,
  source.indexOf(
    "    }, [terminal, hostConfig.id, isVisible, isConnected, isConnecting]);",
    effectStart,
  ),
);

function close(state: { wasConnected: boolean; attempts: number }) {
  const context = {
    event: { code: 1006 },
    console: { warn: vi.fn() },
    t: (key: string) => key,
    addLog: vi.fn(),
    wasConnectedRef: { current: state.wasConnected },
    reconnectAttempts: { current: state.attempts },
    shouldNotReconnectRef: { current: false },
    attemptReconnection: vi.fn(),
    updateConnectionError: vi.fn(),
    setIsConnecting: vi.fn(),
  };
  vm.runInNewContext(`(() => {${abnormalClose}})()`, context);
  return context;
}

// The auto-connect effect right after that close: not connected, not connecting.
function autoConnectAfter(shouldNotReconnect: boolean) {
  const context = {
    terminal: { cols: 80, rows: 24 },
    hostConfig: { id: 1 },
    isVisible: true,
    isConnected: false,
    isConnecting: false,
    isReconnectingRef: { current: false },
    reconnectTimeoutRef: { current: null },
    shouldNotReconnectRef: { current: shouldNotReconnect },
    webSocketRef: { current: { readyState: 3 } },
    WebSocket: { OPEN: 1, CONNECTING: 0 },
    setIsConnecting: vi.fn(),
    fitTerminal: vi.fn(),
    scheduleNotify: vi.fn(),
    requestAnimationFrame: (fn: () => void) => fn(),
    connectToHost: vi.fn(),
  };
  vm.runInNewContext(`(() => {${autoConnect}})()`, context);
  return context.connectToHost;
}

describe("an abnormal close (1006)", () => {
  it("reconnects with backoff when the session was up", () => {
    const context = close({ wasConnected: true, attempts: 0 });
    expect(context.attemptReconnection).toHaveBeenCalledOnce();
    expect(context.setIsConnecting).not.toHaveBeenCalled();
  });

  it("keeps backing off when a reconnect attempt fails before connecting", () => {
    // E.g. right after the computer wakes, before the network is back.
    const context = close({ wasConnected: false, attempts: 2 });
    expect(context.attemptReconnection).toHaveBeenCalledOnce();
    expect(context.updateConnectionError).not.toHaveBeenCalled();
    expect(context.shouldNotReconnectRef.current).toBe(false);
  });

  it("stops at the error when a tab's first connection fails", () => {
    const context = close({ wasConnected: false, attempts: 0 });
    expect(context.attemptReconnection).not.toHaveBeenCalled();
    expect(context.updateConnectionError).toHaveBeenCalledWith(
      "terminal.websocketAbnormalClose",
    );
    expect(context.setIsConnecting).toHaveBeenCalledWith(false);
    expect(context.shouldNotReconnectRef.current).toBe(true);
    // So the auto-connect effect does not try again on the next frame.
    expect(autoConnectAfter(true)).not.toHaveBeenCalled();
  });

  it("is what keeps the auto-connect effect from retrying at once", () => {
    expect(autoConnectAfter(false)).toHaveBeenCalledWith(80, 24);
  });
});
