/**
 * A signed-in user who joined someone else's session read-only, then sent
 * "disconnect", must not be able to type into the owner's shell afterwards.
 */

import { describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { createTerminalSocket } from "../../src/backend/terminal-socket.js";
import { isMessageAllowedForParticipant } from "../../src/backend/session-manager.js";
import { manifest } from "./helpers.js";
import { FakeSocket } from "./socket-fakes.js";

function setup() {
  const ownerStream = { write: vi.fn() };
  const ownerConn = { exec: vi.fn() };
  const session = {
    id: "owner-session",
    sshStream: ownerStream,
    sshConn: ownerConn,
    participants: new Map<string, unknown>(),
  };
  const participants = new Map<unknown, Record<string, unknown>>();
  const sessionManager = {
    getSession: (id: string | null) => (id === session.id ? session : null),
    getUserSessions: () => [],
    destroySession: vi.fn(),
    getParticipantForWs: (_s: unknown, ws: unknown) =>
      participants.get(ws) ?? null,
    joinAsParticipant: (_id: string, ws: unknown, info: object) => {
      participants.set(ws, { ...info, isOwner: false });
      return session;
    },
    removeParticipant: vi.fn((_id: string, ws: unknown) => {
      participants.delete(ws);
    }),
    getBuffer: () => "",
    bufferInput: vi.fn(),
    detachWs: vi.fn(),
    attachWs: vi.fn(),
    broadcast: vi.fn(),
  };
  const sharing = {
    authorizeJoin: async () => ({
      share: {
        id: "share-1",
        sessionId: session.id,
        permissionLevel: "read-only",
      },
      displayName: "guest",
    }),
    recordJoin: async () => {},
  };
  const { ctx } = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
  });
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  };
  const terminal = createTerminalSocket({
    ctx,
    log: log as never,
    sessionManager: sessionManager as never,
    getTmux: () => null,
    getSharing: () => sharing as never,
    getGuests: () => null,
  });
  return { terminal, ownerStream, ownerConn };
}

describe("signed-in share joiner", () => {
  it("cannot type into the owner's shell after leaving", async () => {
    const { terminal, ownerStream, ownerConn } = setup();
    const ws = new FakeSocket();
    await terminal.handleConnection({
      socket: ws,
      request: { url: "/terminal", headers: {} },
      userId: "user-2",
      clientIp: "10.0.0.2",
      requestOrigin: "",
      isDataUnlocked: () => true,
    } as never);

    ws.message("joinSharedSession", { shareId: "share-1" });
    await vi.waitFor(() =>
      expect(ws.messages().some((m) => m.type === "sessionAttached")).toBe(
        true,
      ),
    );

    ws.message("input", "id\n");
    ws.message("disconnect");
    ws.message("input", "touch /tmp/pwned\n");
    ws.message("get_cwd");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(ownerStream.write).not.toHaveBeenCalled();
    expect(ownerConn.exec).not.toHaveBeenCalled();
    terminal.closeAll();
  });

  it("keeps the null participant rule for the owner's own socket", () => {
    expect(isMessageAllowedForParticipant(null, "connectToHost")).toBe(true);
  });
});
