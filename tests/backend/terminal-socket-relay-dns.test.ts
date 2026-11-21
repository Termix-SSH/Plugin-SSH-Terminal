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

vi.mock("dns/promises", () => {
  const lookup = async () => {
    throw Object.assign(new Error("getaddrinfo ENOTFOUND only-on-server"), {
      code: "ENOTFOUND",
    });
  };
  return { default: { lookup }, lookup };
});

const host = {
  id: 1,
  ip: "only-on-server",
  port: 2222,
  username: "root",
  userId: "user-1",
  authType: "none",
};

async function connect(via: string) {
  const { ctx } = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    sshHosts: [host],
  });
  const openTransport = vi.fn(async () => ({ jumpClient: null, via }));
  (ctx.ssh as { openTransport: unknown }).openTransport = openTransport;
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
  const terminal = createTerminalSocket({
    ctx,
    log: log as never,
    sessionManager: sessionManager as never,
    getTmux: async () => null,
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
  ws.message("connectToHost", { hostConfig: host, cols: 80, rows: 24 });
  return { terminal, ws, openTransport };
}

afterEach(() => {
  FakeSshClient.instances = [];
});

describe("terminal DNS with a relayed host", () => {
  it("connects through a transport provider when the name only resolves on the server", async () => {
    const { terminal, ws, openTransport } = await connect("provided");
    await vi.waitFor(() =>
      expect(FakeSshClient.instances.at(-1)?.connectConfig).toBeTruthy(),
    );
    expect(openTransport).toHaveBeenCalledTimes(1);
    expect(ws.messages().some((m) => m.type === "error")).toBe(false);
    terminal.closeAll();
  });

  it("still shows the DNS error on a direct connection", async () => {
    const { terminal, ws } = await connect("direct");
    await vi.waitFor(() =>
      expect(ws.messages()).toContainEqual(
        expect.objectContaining({
          type: "error",
          message:
            "SSH error: Could not resolve hostname from the Termix server container.",
        }),
      ),
    );
    expect(FakeSshClient.instances.at(-1)?.connectConfig).toBeFalsy();
    terminal.closeAll();
  });
});
