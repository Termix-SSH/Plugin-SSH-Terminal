import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { createTerminalSocket } from "../../src/backend/terminal-socket.js";
import { HOST_LOGIN_REQUIRED_MESSAGE } from "../../src/backend/helpers.js";
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

// A shared host the user can reach but has no login for, as core hands it
// out when asked with allowMissingLogin.
const sharedHost = {
  id: 9,
  syncId: "sync-host-1",
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  userId: "owner",
  authType: "none",
  loginRequired: true,
};

afterEach(() => {
  FakeSshClient.instances = [];
});

describe("terminal socket with a shared host that has no login", () => {
  it("says a login is needed and never connects", async () => {
    const { ctx } = createMockCtx({
      pluginId: manifest.id,
      manifest,
      capabilities: manifest.capabilities,
      sshHosts: [sharedHost],
    });
    const resolveHost = vi.spyOn(ctx.ssh, "resolveHost");

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
      getTmux: () => null,
      getSharing: () => null,
      getGuests: () => null,
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
      hostConfig: { ...sharedHost, id: 25 },
      cols: 80,
      rows: 24,
    });

    await vi.waitFor(() =>
      expect(ws.messages()).toContainEqual({
        type: "error",
        message: HOST_LOGIN_REQUIRED_MESSAGE,
      }),
    );
    expect(resolveHost).toHaveBeenCalledWith(25, {
      syncId: "sync-host-1",
      allowMissingLogin: true,
    });
    expect(FakeSshClient.instances.some((client) => client.connectConfig)).toBe(
      false,
    );
    terminal.closeAll();
  });
});
