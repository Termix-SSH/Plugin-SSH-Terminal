// @vitest-environment node
import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = fs.readFileSync(
  new URL("../../../src/frontend/terminal/Terminal.tsx", import.meta.url),
  "utf8",
);
const start = source.indexOf('if (msg.type === "sessionTakenOver") {');
const branch = source.slice(
  start,
  source.indexOf('} else if (msg.type === "tmux_sessions_available")', start),
);

describe("a session another window took over", () => {
  it("stays stopped instead of taking the session straight back", () => {
    const context = {
      msg: { type: "sessionTakenOver" },
      t: (key: string) => key,
      terminal: { cols: 80, rows: 24, clear: vi.fn() },
      sessionIdRef: { current: "s1" },
      shouldNotReconnectRef: { current: false },
      webSocketRef: { current: { close: vi.fn() } },
      setIsConnected: vi.fn(),
      setIsConnecting: vi.fn(),
      updateConnectionError: vi.fn(),
      addLog: vi.fn(),
      connectToHost: vi.fn(),
    };
    vm.runInNewContext(`${branch}}`, context);

    expect(context.connectToHost).not.toHaveBeenCalled();
    expect(context.shouldNotReconnectRef.current).toBe(true);
    expect(context.sessionIdRef.current).toBeNull();
    expect(context.setIsConnecting).toHaveBeenCalledWith(false);
    expect(context.updateConnectionError).toHaveBeenCalledWith(
      "terminal.sessionTakenOver",
    );
    expect(context.webSocketRef.current.close).toHaveBeenCalledOnce();
  });
});
