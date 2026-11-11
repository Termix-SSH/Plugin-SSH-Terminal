/**
 * Only a brand new shell is marked as one. A reattached tab or a joined share
 * gets "connected" without the flag, so the client never types its setup again.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { createTerminalSocket } from "../../src/backend/terminal-socket.js";
import { manifest } from "./helpers.js";
import { FakeSocket, FakeSshClient } from "./socket-fakes.js";

vi.mock("ssh2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ssh2")>();
  const { FakeSshClient: Fake } = await import("./socket-fakes.js");
  return {
    ...actual,
    default: {
      ...(actual as unknown as { default: object }).default,
      Client: Fake,
    },
    Client: Fake,
  };
});

const host = {
  id: 1,
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  userId: "user-1",
  authType: "none",
};

function setup() {
  const live = {
    id: "live-session",
    sshStream: { write: vi.fn(), setWindow: vi.fn() },
    sshConn: { exec: vi.fn() },
    cols: 80,
    rows: 24,
    createdAt: Date.now(),
    participants: new Map<string, unknown>(),
  };
  const sessionManager = {
    createSession: () => "session-1",
    getSession: (id: string | null) => (id === live.id ? live : null),
    getUserSessions: () => [],
    destroySession: vi.fn(),
    setSSHState: vi.fn(),
    attachWs: (id: string) => (id === live.id ? live : null),
    joinAsParticipant: () => live,
    getParticipantForWs: () => null,
    removeParticipant: vi.fn(),
    detachWs: vi.fn(),
    resizeSession: vi.fn(),
    getBuffer: () => "",
    bufferInput: vi.fn(),
    bufferOutput: vi.fn(),
    broadcast: vi.fn(),
  };
  const sharing = {
    authorizeJoin: async () => ({
      share: { id: "share-1", sessionId: live.id, permissionLevel: "control" },
      displayName: "guest",
    }),
    recordJoin: async () => {},
  };
  const { ctx } = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    sshHosts: [host],
  });
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  };
  return createTerminalSocket({
    ctx,
    log: log as never,
    sessionManager: sessionManager as never,
    getTmux: () => null,
    getSharing: () => sharing as never,
    getGuests: () => null,
  });
}

async function openSocket(terminal: ReturnType<typeof setup>) {
  const ws = new FakeSocket();
  await terminal.handleConnection({
    socket: ws,
    request: { url: "/terminal", headers: {} },
    userId: "user-1",
    clientIp: "10.0.0.1",
    requestOrigin: "",
    isDataUnlocked: () => true,
  } as never);
  return ws;
}

const connected = (ws: FakeSocket) =>
  ws.messages().filter((m) => m.type === "connected");

afterEach(() => {
  FakeSshClient.instances = [];
});

describe("GHSA-q5v9-x2h3-7hv4 reattach does not rerun setup", () => {
  it("marks a brand new shell", async () => {
    const terminal = setup();
    const ws = await openSocket(terminal);
    ws.message("connectToHost", { hostConfig: host, cols: 80, rows: 24 });
    await vi.waitFor(() =>
      expect(FakeSshClient.instances.at(-1)?.connectConfig).toBeTruthy(),
    );
    FakeSshClient.instances.at(-1)!.emit("ready");
    await vi.waitFor(() => expect(connected(ws)).toHaveLength(1));
    expect(connected(ws)[0].newSession).toBe(true);
    terminal.closeAll();
  });

  it("does not mark a reattached session", async () => {
    const terminal = setup();
    const ws = await openSocket(terminal);
    ws.message("attachSession", {
      sessionId: "live-session",
      cols: 80,
      rows: 24,
    });
    await vi.waitFor(() => expect(connected(ws)).toHaveLength(1));
    expect(connected(ws)[0].newSession).toBeUndefined();
    terminal.closeAll();
  });

  it("does not mark a joined share", async () => {
    const terminal = setup();
    const ws = await openSocket(terminal);
    ws.message("joinSharedSession", { shareId: "share-1" });
    await vi.waitFor(() => expect(connected(ws)).toHaveLength(1));
    expect(connected(ws)[0].newSession).toBeUndefined();
    terminal.closeAll();
  });
});
