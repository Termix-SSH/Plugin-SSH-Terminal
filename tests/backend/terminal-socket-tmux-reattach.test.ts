import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { createTerminalSocket } from "../../src/backend/terminal-socket.js";
import type { TmuxSessionsV1 } from "../../src/backend/services.js";
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

const HOST_ID = 3;
const host = {
  id: HOST_ID,
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  userId: "user-1",
  authType: "none",
};

const session = (name: string, created: number) => ({
  name,
  created,
  lastActivity: created,
  windows: 1,
  attachedClients: 0,
});

// The host's sessions: one renamed since the tab created it (created 200).
const SESSIONS = [
  session("main", 100),
  session("Fix the login page", 200),
  session("build", 300),
];

async function connect(options: {
  sessions: ReturnType<typeof session>[];
  tmuxReattach?: unknown;
  until: (ws: FakeSocket, tmux: TmuxSessionsV1) => void;
}) {
  const { ctx } = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    sshHosts: [host],
  });
  await ctx.settings.setHost(HOST_ID, "autoTmux", true);

  let created: string | null = null;
  const tmux = {
    detect: vi.fn(async () => ({
      available: true,
      sessions: created
        ? [...options.sessions, session(created, 400)]
        : options.sessions,
    })),
    attachOrCreate: vi.fn(async () => {}),
    waitForSession: vi.fn(async (_client: unknown, name: string) => {
      created = name;
      return name;
    }),
  } satisfies TmuxSessionsV1;

  const terminal = createTerminalSocket({
    ctx,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      success: vi.fn(),
    } as never,
    sessionManager: {
      createSession: () => "session-1",
      getSession: () => null,
      destroySession: vi.fn(),
      setSSHState: vi.fn(),
      attachWs: vi.fn(),
      removeParticipant: vi.fn(),
      detachWs: vi.fn(),
      bufferInput: vi.fn(),
      bufferOutput: vi.fn(),
      broadcast: vi.fn(),
    } as never,
    getTmux: async () => tmux,
    getSharing: async () => null,
    getGuests: async () => null,
  });

  const ws = new FakeSocket();
  await terminal.handleConnection({
    socket: ws,
    request: { url: "/terminal", headers: {} },
    userId: "user-1",
    clientIp: "10.0.0.1",
    requestOrigin: "",
    isDataUnlocked: () => true,
  } as never);

  ws.message("connectToHost", {
    hostConfig: host,
    tmuxReattach: options.tmuxReattach,
    cols: 80,
    rows: 24,
  });

  await vi.waitFor(() =>
    expect(FakeSshClient.instances.at(-1)?.connectConfig).toBeTruthy(),
  );
  FakeSshClient.instances.at(-1)!.emit("ready");
  await vi.waitFor(() => options.until(ws, tmux));

  terminal.closeAll();
  return { ws, tmux };
}

const sentOfType = (ws: FakeSocket, type: string) =>
  ws.messages().find((m) => m.type === type);

afterEach(() => {
  FakeSshClient.instances = [];
});

describe("terminal socket tmux reattach after a new login", () => {
  it("attaches the tab's session again, found by creation time after a rename", async () => {
    const { ws, tmux } = await connect({
      sessions: SESSIONS,
      tmuxReattach: { name: "termix-3-ab12", created: 200 },
      until: (_ws, t) => expect(t.attachOrCreate).toHaveBeenCalled(),
    });
    expect((tmux.attachOrCreate.mock.calls[0] as unknown[])[1]).toBe(
      "Fix the login page",
    );
    await vi.waitFor(() =>
      expect(sentOfType(ws, "tmux_session_attached")).toEqual({
        type: "tmux_session_attached",
        sessionName: "Fix the login page",
        created: 200,
      }),
    );
    expect(sentOfType(ws, "tmux_sessions_available")).toBeUndefined();
  });

  it("shows the picker as before when the tab's session is gone", async () => {
    const { ws, tmux } = await connect({
      sessions: SESSIONS,
      tmuxReattach: { name: "closed", created: 250 },
      until: (w) =>
        expect(sentOfType(w, "tmux_sessions_available")).toBeTruthy(),
    });
    expect(tmux.attachOrCreate).not.toHaveBeenCalled();
  });

  it("shows the picker for a new tab with several sessions", async () => {
    const { tmux } = await connect({
      sessions: SESSIONS,
      until: (w) =>
        expect(sentOfType(w, "tmux_sessions_available")).toBeTruthy(),
    });
    expect(tmux.attachOrCreate).not.toHaveBeenCalled();
  });

  it("ignores a malformed remembered session", async () => {
    const { tmux } = await connect({
      sessions: SESSIONS,
      tmuxReattach: { name: 42, created: 200 },
      until: (w) =>
        expect(sentOfType(w, "tmux_sessions_available")).toBeTruthy(),
    });
    expect(tmux.attachOrCreate).not.toHaveBeenCalled();
  });

  it("sends the creation time of a session it creates", async () => {
    const { ws } = await connect({
      sessions: [],
      until: (w) => expect(sentOfType(w, "tmux_session_created")).toBeTruthy(),
    });
    expect(sentOfType(ws, "tmux_session_created")).toMatchObject({
      sessionName: expect.stringMatching(/^termix-3-/),
      created: 400,
    });
  });
});

// A tab that reattaches to its live server session (e.g. restored after an
// app restart) learns its tmux session, so it can find it after an expiry.
function setupLive(tmuxSessionName: string | null, created: number | null) {
  const live = {
    id: "live-session",
    hostId: HOST_ID,
    sshStream: { write: vi.fn(), setWindow: vi.fn() },
    sshConn: { exec: vi.fn() },
    cols: 80,
    rows: 24,
    createdAt: Date.now(),
    participants: new Map<string, unknown>(),
    tmuxSessionName,
    tmuxSessionCreated: created,
  };
  const tmux = {
    detect: vi.fn(async () => ({ available: true, sessions: SESSIONS })),
    attachOrCreate: vi.fn(async () => {}),
    waitForSession: vi.fn(async (_client: unknown, name: string) => name),
  } satisfies TmuxSessionsV1;
  const { ctx } = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    sshHosts: [host],
  });
  const terminal = createTerminalSocket({
    ctx,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      success: vi.fn(),
    } as never,
    sessionManager: {
      createSession: () => "session-1",
      getSession: (id: string | null) => (id === live.id ? live : null),
      getUserSessions: () => [],
      destroySession: vi.fn(),
      setSSHState: vi.fn(),
      attachWs: (id: string) => (id === live.id ? live : null),
      getParticipantForWs: () => null,
      removeParticipant: vi.fn(),
      detachWs: vi.fn(),
      resizeSession: vi.fn(),
      getBuffer: () => "",
      bufferInput: vi.fn(),
      bufferOutput: vi.fn(),
      broadcast: vi.fn(),
    } as never,
    getTmux: async () => tmux,
    getSharing: async () => null,
    getGuests: async () => null,
  });
  return { terminal, live };
}

async function attachLive(terminal: ReturnType<typeof setupLive>["terminal"]) {
  const ws = new FakeSocket();
  await terminal.handleConnection({
    socket: ws,
    request: { url: "/terminal", headers: {} },
    userId: "user-1",
    clientIp: "10.0.0.1",
    requestOrigin: "",
    isDataUnlocked: () => true,
  } as never);
  ws.message("attachSession", {
    sessionId: "live-session",
    cols: 80,
    rows: 24,
  });
  await vi.waitFor(() =>
    expect(sentOfType(ws, "sessionAttached")).toBeTruthy(),
  );
  return ws;
}

describe("terminal socket tmux session of a live session", () => {
  it("tells a reattached tab its tmux session", async () => {
    const { terminal } = setupLive("Fix the login page", 200);
    const ws = await attachLive(terminal);
    expect(sentOfType(ws, "sessionAttached")?.tmuxSession).toEqual({
      name: "Fix the login page",
      created: 200,
    });
    terminal.closeAll();
  });

  it("says when the live session is not in tmux", async () => {
    const { terminal } = setupLive(null, null);
    const ws = await attachLive(terminal);
    expect(sentOfType(ws, "sessionAttached")?.tmuxSession).toBeNull();
    terminal.closeAll();
  });

  it("keeps the creation time of a session picked from the list", async () => {
    const { terminal, live } = setupLive(null, null);
    const ws = await attachLive(terminal);
    ws.message("tmux_attach", { sessionName: "build", created: 300 });
    await vi.waitFor(() =>
      expect(sentOfType(ws, "tmux_session_attached")).toEqual({
        type: "tmux_session_attached",
        sessionName: "build",
        created: 300,
      }),
    );
    expect(live.tmuxSessionCreated).toBe(300);
    terminal.closeAll();
  });
});
