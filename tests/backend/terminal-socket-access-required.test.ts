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
  id: 9,
  syncId: "sync-host-1",
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  userId: "user-1",
  authType: "password",
};

afterEach(() => {
  FakeSshClient.instances = [];
});

describe("terminal socket with a login behind a locked vault", () => {
  it("offers the unlock tab and never connects", async () => {
    const { ctx } = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities,
      sshHosts: [host],
    });
    // What core throws (Termix 26.11.3) when a bw:// reference needs the
    // user to unlock their vault first.
    vi.spyOn(ctx.ssh, "resolveHost").mockRejectedValue(
      Object.assign(new Error("Unlock your vault"), {
        code: "access-required",
        requestTab: "vault-unlock",
        requestKind: "verify",
      }),
    );

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
      getTmux: async () => null,
      getSharing: async () => null,
      getGuests: async () => null,
    } as never);

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
      hostConfig: { ...host, password: "bw://web/password" },
      cols: 80,
      rows: 24,
    });

    await vi.waitFor(() =>
      expect(ws.messages()).toContainEqual({
        type: "access_required",
        code: "access-required",
        message: "Unlock your vault",
        requestTab: "vault-unlock",
        requestKind: "verify",
        hostId: 9,
      }),
    );
    expect(FakeSshClient.instances.some((client) => client.connectConfig)).toBe(
      false,
    );
    terminal.closeAll();
  });
});
