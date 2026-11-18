import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { rememberTmuxSession } from "../../../src/frontend/terminal/tmux-reattach";

describe("rememberTmuxSession", () => {
  it("keeps the name and creation time the backend sends", () => {
    expect(rememberTmuxSession(null, "termix-3-ab12", 200)).toEqual({
      name: "termix-3-ab12",
      created: 200,
    });
  });

  it("keeps the time of a session picked from the list", () => {
    const picked = { name: "build", created: 300 };
    expect(rememberTmuxSession(picked, "build", undefined)).toEqual(picked);
  });

  it("does not carry a time over to another session", () => {
    expect(
      rememberTmuxSession({ name: "build", created: 300 }, "main", undefined),
    ).toEqual({ name: "main" });
  });

  it("remembers nothing for a session without a name", () => {
    expect(rememberTmuxSession({ name: "build" }, "", 300)).toBe(null);
  });
});

const source = fs.readFileSync("src/frontend/terminal/Terminal.tsx", "utf8");
// The request a tab sends when its socket opens, as in reconnect-mouse.test.ts.
const openSession = source.slice(
  source.indexOf("        currentHostIdRef.current = hostConfig.id;"),
  source.indexOf(
    "        terminalInputDisposableRef.current?.dispose();",
    source.indexOf("    function setupWebSocketListeners("),
  ),
);

function open(
  remembered: { name: string; created?: number } | null,
  liveSessionId: string | null = null,
) {
  const ws = { send: vi.fn() };
  vm.runInNewContext(openSession, {
    terminal: { write: vi.fn() },
    ws,
    cols: 80,
    rows: 24,
    hostConfig: { id: 1, instanceId: "tab-1" },
    outboundHostConfig: { id: 1 },
    currentHostIdRef: { current: null },
    currentHostConfigRef: { current: null },
    pendingRestoredSessionIdRef: { current: null },
    sessionIdRef: { current: liveSessionId },
    isAttachingSessionRef: { current: false },
    termUserRef: { current: { zmodem: false } },
    initialPath: undefined,
    executeCommand: undefined,
    tmuxAttachSession: undefined,
    tmuxReattachRef: { current: remembered },
  });
  return JSON.parse(ws.send.mock.calls[0][0]);
}

describe("a tab logging in again", () => {
  it("asks for the tmux session it was showing", () => {
    const request = open({ name: "termix-1-ab12", created: 200 });
    expect(request.type).toBe("connectToHost");
    expect(request.data.tmuxReattach).toEqual({
      name: "termix-1-ab12",
      created: 200,
    });
  });

  it("asks for none when it showed none", () => {
    expect(open(null).data).not.toHaveProperty("tmuxReattach");
  });

  it("leaves a live session alone", () => {
    const request = open({ name: "main", created: 100 }, "live-session");
    expect(request.type).toBe("attachSession");
    expect(request.data).not.toHaveProperty("tmuxReattach");
  });
});

const attached = source.slice(
  source.indexOf('          } else if (msg.type === "sessionAttached") {') +
    "          } else ".length,
  source.indexOf('          } else if (msg.type === "sessionExpired") {'),
);

function reattach(
  tmuxSession: unknown,
  remembered: { name: string; created?: number } | null = null,
) {
  const tmuxReattachRef = { current: remembered };
  vm.runInNewContext(`${attached}}`, {
    msg: { type: "sessionAttached", tmuxSession },
    t: (key: string) => key,
    rememberTmuxSession,
    tmuxReattachRef,
    isAttachingSessionRef: { current: true },
    wasConnectedRef: { current: false },
    isConnectingRef: { current: true },
    shouldNotReconnectRef: { current: true },
    connectionTimeoutRef: { current: null },
    reconnectTimeoutRef: { current: null },
    reconnectAttempts: { current: 0 },
    isReconnectingRef: { current: false },
    setIsConnected: vi.fn(),
    setIsConnecting: vi.fn(),
    updateConnectionError: vi.fn(),
    logTerminalActivity: vi.fn(),
    addLog: vi.fn(),
  });
  return tmuxReattachRef.current;
}

describe("a tab reattached to its live session", () => {
  it("learns the tmux session the server has for it", () => {
    expect(reattach({ name: "Fix the login page", created: 200 })).toEqual({
      name: "Fix the login page",
      created: 200,
    });
  });

  it("forgets a tmux session the server no longer shows", () => {
    expect(reattach(null, { name: "main", created: 100 })).toBe(null);
  });
});
