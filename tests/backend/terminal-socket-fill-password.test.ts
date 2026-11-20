import { describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { createTerminalSocket } from "../../src/backend/terminal-socket.js";
import { manifest } from "./helpers.js";
import { FakeSocket } from "./socket-fakes.js";

const host = {
  id: 7,
  ip: "10.0.0.7",
  port: 22,
  username: "admin",
  userId: "user-1",
  authType: "password",
  password: "login-secret",
  sudoPassword: "sudo-secret",
};

// The terminal view runs in a frame that never gets saved passwords, so the
// backend types them at the prompt instead (Plugin-SSH-Terminal#65).
async function attach(outputTail: string, owner = "user-1") {
  const { ctx } = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    sshHosts: [host],
  });
  const stream = { write: vi.fn(), setWindow: vi.fn() };
  const session = {
    id: "session-1",
    userId: owner,
    hostId: host.id,
    cols: 80,
    rows: 24,
    outputTail,
    sshStream: stream,
    sshConn: null,
  };
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
      attachWs: () => session,
      getSession: () => session,
      getBuffer: () => "",
      resizeSession: vi.fn(),
      getParticipantForWs: () => null,
      destroySession: vi.fn(),
      detachWs: vi.fn(),
      removeParticipant: vi.fn(),
    } as never,
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
  ws.message("attachSession", { sessionId: "session-1", cols: 80, rows: 24 });
  await vi.waitFor(() =>
    expect(ws.sent.some((m) => m.includes("sessionAttached"))).toBe(true),
  );

  const fill = async (kind: string) => {
    ws.message("fill_password", { kind });
    await vi.waitFor(() =>
      expect(ws.sent.some((m) => m.includes("fill_password_result"))).toBe(
        true,
      ),
    );
    const result = ws.sent.find((m) => m.includes("fill_password_result"))!;
    ws.sent = [];
    return JSON.parse(result).ok as boolean;
  };
  return { fill, stream, close: () => terminal.closeAll() };
}

describe("fill_password", () => {
  it("types the saved sudo password at a sudo prompt", async () => {
    const t = await attach("$ sudo -v\r\n[sudo] password for admin: ");
    expect(await t.fill("sudo")).toBe(true);
    expect(t.stream.write).toHaveBeenCalledWith("sudo-secret\n");
    t.close();
  });

  it("types the login password at a plain password prompt", async () => {
    const t = await attach("Password: ");
    expect(await t.fill("login")).toBe(true);
    expect(t.stream.write).toHaveBeenCalledWith("login-secret\n");
    t.close();
  });

  it("sends nothing when the terminal is not at a password prompt", async () => {
    const t = await attach("admin@box:~$ cat\r\n");
    expect(await t.fill("sudo")).toBe(false);
    expect(t.stream.write).not.toHaveBeenCalled();
    t.close();
  });

  it("sends nothing into a session someone else owns", async () => {
    const t = await attach("[sudo] password for admin: ", "user-2");
    expect(await t.fill("sudo")).toBe(false);
    expect(t.stream.write).not.toHaveBeenCalled();
    t.close();
  });
});
