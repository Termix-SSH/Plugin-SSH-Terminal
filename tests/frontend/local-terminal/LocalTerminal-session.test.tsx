import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  listInputSessions,
  registerSession,
  setActiveSession,
  listSessions,
  sendToActive,
  sendToSession,
} from "../../../src/frontend/session-registry";

const state = vi.hoisted(() => ({
  ref: { current: null },
  available: true,
  data: undefined as undefined | ((data: string) => void),
  terminal: {
    options: {},
    cols: 80,
    rows: 24,
    loadAddon: vi.fn(),
    focus: vi.fn(),
    write: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    onData: vi.fn(),
    paste: vi.fn(),
    hasSelection: () => false,
  },
}));
vi.mock("react-xtermjs", () => ({
  useXTerm: () => ({
    instance: state.available ? state.terminal : null,
    ref: state.ref,
  }),
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
    dispose() {}
  },
}));
vi.mock("@xterm/addon-clipboard", () => ({ ClipboardAddon: class {} }));
vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  usePluginApi: () => null,
}));
vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  useAppTheme: () => ({ theme: "dark" }),
  ComponentSlot: () => null,
  Select2: () => null,
  RobustClipboardProvider: class {
    dispose() {}
  },
  pluginWsUrl: async () => ({ url: "ws://local", protocols: [] }),
}));
vi.mock("../../../src/frontend/terminal-api", () => ({
  getDefaultAppearance: () => new Promise(() => {}),
}));
vi.mock("../../../src/frontend/terminal-tools/TerminalContextMenu", () => ({
  TerminalContextMenu: () => null,
}));
import { LocalTerminal } from "../../../src/frontend/local-terminal/LocalTerminal";

class Socket {
  static OPEN = 1;
  static sockets: Socket[] = [];
  readyState = 1;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor() {
    Socket.sockets.push(this);
  }
  frame(frame: object) {
    act(() => this.onmessage?.({ data: JSON.stringify(frame) }));
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  Socket.sockets = [];
  state.available = true;
  state.terminal.onData.mockImplementation((listener) => {
    state.data = listener;
    return { dispose() {} };
  });
  state.terminal.paste.mockImplementation((text) => state.data?.(text));
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { isElectron: true, getPlatform: async () => "linux" },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.electronAPI;
});

it("registers a hostless input session and sends only after the PTY started", async () => {
  const view = render(
    <LocalTerminal
      instanceId="instance-1"
      sessionId="tab-1"
      label="Local"
      isVisible
      isFocusedPane
    />,
  );
  await waitFor(() => expect(Socket.sockets).toHaveLength(1));
  const socket = Socket.sockets[0];
  expect(listInputSessions()).toEqual([
    expect.objectContaining({
      id: "tab-1",
      hostId: null,
      kind: "local",
      label: "Local",
    }),
  ]);
  expect(listSessions()).toEqual([]);
  expect(sendToSession("tab-1", "echo before", { run: true })).toBe(false);
  socket.frame({ type: "started" });
  socket.send.mockClear();
  expect(sendToActive("echo '$x'\nnext", { run: true })).toBe(true);
  expect(socket.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "input", data: "echo '$x'\nnext\r" }),
  );
  view.rerender(
    <LocalTerminal
      instanceId="instance-1"
      sessionId="tab-1"
      label="Renamed"
      isVisible
      isFocusedPane
    />,
  );
  expect(sendToActive("after rename", { run: true })).toBe(true);
  expect(socket.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "input", data: "after rename\r" }),
  );
  view.rerender(
    <LocalTerminal
      instanceId="instance-1"
      sessionId="tab-1"
      label="Renamed"
      isVisible
      isFocusedPane={false}
    />,
  );
  expect(sendToActive("panel click", { run: true })).toBe(true);
  expect(socket.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "input", data: "panel click\r" }),
  );
  expect(sendToSession("tab-1", "plain note")).toBe(true);
  expect(state.terminal.paste).toHaveBeenCalledWith("plain note");
  socket.frame({ type: "exit", exitCode: 0 });
  socket.send.mockClear();
  expect(sendToSession("tab-1", "after exit", { run: true })).toBe(false);
  expect(socket.send).not.toHaveBeenCalled();
  view.unmount();
  expect(listInputSessions()).toEqual([]);
  expect(sendToSession("tab-1", "after close", { run: true })).toBe(false);
});

it("does not let a late closed socket disable a replacement session", async () => {
  const first = render(
    <LocalTerminal
      instanceId="first"
      sessionId="tab"
      isVisible
      isFocusedPane
    />,
  );
  await waitFor(() => expect(Socket.sockets).toHaveLength(1));
  const old = Socket.sockets[0];
  old.frame({ type: "started" });
  first.unmount();
  render(
    <LocalTerminal
      instanceId="second"
      sessionId="tab"
      isVisible
      isFocusedPane
    />,
  );
  await waitFor(() => expect(Socket.sockets).toHaveLength(2));
  const current = Socket.sockets[1];
  current.frame({ type: "started" });
  old.onclose?.();
  old.frame({ type: "exit", exitCode: 0 });
  current.send.mockClear();
  expect(sendToSession("tab", "ok", { run: true })).toBe(true);
  expect(current.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "input", data: "ok\r" }),
  );
  current.onclose?.();
  expect(sendToSession("tab", "no", { run: true })).toBe(false);
});

it("selects the focused local tab when xterm initializes after an SSH session", async () => {
  const ssh = { sendInput: vi.fn(), paste: vi.fn() };
  const remove = registerSession({ id: "ssh", hostId: 1 }, ssh as never);
  setActiveSession("ssh");
  state.available = false;
  const view = render(
    <LocalTerminal instanceId="delayed" isVisible isFocusedPane />,
  );
  state.available = true;
  view.rerender(<LocalTerminal instanceId="delayed" isVisible isFocusedPane />);
  await waitFor(() => expect(Socket.sockets).toHaveLength(1));
  Socket.sockets[0].frame({ type: "started" });
  expect(sendToActive("local", { run: true })).toBe(true);
  expect(ssh.sendInput).not.toHaveBeenCalled();
  expect(Socket.sockets[0].send).toHaveBeenCalledWith(
    JSON.stringify({ type: "input", data: "local\r" }),
  );
  remove();
});
