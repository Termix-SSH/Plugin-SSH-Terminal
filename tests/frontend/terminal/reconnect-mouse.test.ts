import fs from "node:fs";
import vm from "node:vm";
import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = fs.readFileSync("src/frontend/terminal/Terminal.tsx", "utf8");
// Exercise the production new-session/reattach selection with a real emulator,
// as the reconnect handle tests do for the surrounding React component.
const openSession = source.slice(
  source.indexOf("        currentHostIdRef.current = hostConfig.id;"),
  source.indexOf(
    "        terminalInputDisposableRef.current?.dispose();",
    source.indexOf("    function setupWebSocketListeners("),
  ),
);
const write = (terminal: Terminal, data: string) =>
  new Promise<void>((resolve) => terminal.write(data, resolve));
let terminal: Terminal;

afterEach(() => terminal?.dispose());

function open(restoredSessionId: string | null = null, shareId?: string) {
  const ws = { send: vi.fn() };
  vm.runInNewContext(openSession, {
    terminal,
    ws,
    cols: 80,
    rows: 24,
    hostConfig: { id: 1, instanceId: "tab-1", joinShareId: shareId },
    outboundHostConfig: { id: 1 },
    currentHostIdRef: { current: null },
    currentHostConfigRef: { current: null },
    pendingRestoredSessionIdRef: { current: null },
    sessionIdRef: { current: restoredSessionId },
    isAttachingSessionRef: { current: false },
    termUserRef: { current: { zmodem: false } },
    initialPath: undefined,
    executeCommand: undefined,
    tmuxAttachSession: undefined,
  });
  return JSON.parse(ws.send.mock.calls[0][0]);
}

describe("mouse reporting across SSH reconnects", () => {
  it.each([false, true])(
    "clears stale tracking before a fresh SSH session (clear screen=%s)",
    async (clear) => {
      terminal = new Terminal({ cols: 80, rows: 24 });
      await write(terminal, "saved output\r\n\x1b[?1003h\x1b[?1006h");
      if (clear) terminal.clear();
      // clear() only changes the viewport; the dead tmux client's modes remain.
      expect(terminal.modes.mouseTrackingMode).toBe("any");
      expect(open().type).toBe("connectToHost");
      await write(terminal, "\0");
      expect(terminal.modes.mouseTrackingMode).toBe("none");
      if (!clear)
        expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe(
          "saved output",
        );
      // Reattaching tmux on the fresh SSH shell can turn reporting on normally.
      await write(terminal, "\x1b[?1002h\x1b[?1006h");
      expect(terminal.modes.mouseTrackingMode).toBe("drag");
    },
  );

  it.each(["attachSession", "joinSharedSession"])(
    "preserves a live session's modes during %s",
    async (type) => {
      terminal = new Terminal({ cols: 80, rows: 24 });
      await write(terminal, "\x1b[?1003h\x1b[?1006h");
      const request =
        type === "attachSession" ? open("live-session") : open(null, "share-1");
      expect(request.type).toBe(type);
      await write(terminal, "\0");
      expect(terminal.modes.mouseTrackingMode).toBe("any");
    },
  );
});
