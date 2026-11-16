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

// The same host as the sync server stores it. A linked desktop app has its
// own numbering, so it sends a different id with the same syncId.
const SERVER_HOST_ID = 9;
const DESKTOP_HOST_ID = 25;
const serverHost = {
  id: SERVER_HOST_ID,
  syncId: "sync-host-1",
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  userId: "user-1",
  authType: "none",
};

async function connect(options: {
  sessions: Array<{ name: string }>;
  tmuxAttachSession?: string;
}) {
  const { ctx } = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    sshHosts: [serverHost],
  });
  // Host settings live on the server under the server's id.
  await ctx.settings.setHost(SERVER_HOST_ID, "autoTmux", true);

  const tmux = {
    detect: vi.fn(async () => ({
      available: true,
      sessions: options.sessions as never,
    })),
    attachOrCreate: vi.fn(async () => {}),
    waitForSession: vi.fn(async (_client: unknown, name: string) => name),
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
    hostConfig: { ...serverHost, id: DESKTOP_HOST_ID },
    tmuxAttachSession: options.tmuxAttachSession,
    cols: 80,
    rows: 24,
  });

  await vi.waitFor(() =>
    expect(FakeSshClient.instances.at(-1)?.connectConfig).toBeTruthy(),
  );
  FakeSshClient.instances.at(-1)!.emit("ready");
  await vi.waitFor(() => expect(tmux.attachOrCreate).toHaveBeenCalled());

  terminal.closeAll();
  return tmux.attachOrCreate.mock.calls[0] as unknown[];
}

afterEach(() => {
  FakeSshClient.instances = [];
});

// attachOrCreate reads the tmux plugin's host settings (mouse support) by the
// host id it is given, so it must be the server's id, the same one autoTmux
// was read with, not the id from the desktop app's database.
describe("terminal socket tmux attach from a linked desktop app", () => {
  it("passes the server host id when creating a session", async () => {
    const call = await connect({ sessions: [] });
    expect(call[3]).toBe(SERVER_HOST_ID);
  });

  it("passes the server host id when attaching the only session", async () => {
    const call = await connect({ sessions: [{ name: "main" }] });
    expect(call[1]).toBe("main");
    expect(call[3]).toBe(SERVER_HOST_ID);
  });

  it("passes the server host id for a direct attach", async () => {
    const call = await connect({ sessions: [], tmuxAttachSession: "work" });
    expect(call[1]).toBe("work");
    expect(call[3]).toBe(SERVER_HOST_ID);
  });
});
