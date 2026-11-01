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

function createTerminal() {
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
  const sessionManager = {
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
  };

  return createTerminalSocket({
    ctx,
    log: log as never,
    sessionManager: sessionManager as never,
    getTmux: () => null,
    getSharing: () => null,
    getGuests: () => null,
  });
}

async function connectWithTcpNoDelay(tcpNoDelay?: boolean) {
  const terminal = createTerminal();
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
    hostConfig: {
      ...host,
      pluginSettings: {
        "ssh-terminal": {
          ...(tcpNoDelay === undefined ? {} : { tcpNoDelay }),
        },
      },
    },
    cols: 80,
    rows: 24,
  });

  await vi.waitFor(() =>
    expect(FakeSshClient.instances.at(-1)?.connectConfig).toBeTruthy(),
  );
  const client = FakeSshClient.instances.at(-1)!;
  client.emit("ready");
  await vi.waitFor(() => expect(client.noDelayCalls).toHaveLength(1));

  terminal.closeAll();
  return client.noDelayCalls[0];
}

afterEach(() => {
  FakeSshClient.instances = [];
});

describe("terminal socket TCP_NODELAY setting", () => {
  it("applies the per-host value and defaults to false", async () => {
    await expect(connectWithTcpNoDelay(true)).resolves.toBe(true);
    FakeSshClient.instances = [];
    await expect(connectWithTcpNoDelay()).resolves.toBe(false);
  });
});
