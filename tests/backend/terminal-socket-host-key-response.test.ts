import { describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { createTerminalSocket } from "../../src/backend/terminal-socket.js";
import { manifest } from "./helpers.js";
import { FakeSocket } from "./socket-fakes.js";

describe("host_key_verification_response", () => {
  it("is left to core's host key check without an unknown message warning", async () => {
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
      sessionManager: {} as never,
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

    ws.message("host_key_verification_response", { action: "accept" });
    ws.message("no_such_message", {});
    await vi.waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith(
        "Unknown message type received",
        expect.objectContaining({ messageType: "no_such_message" }),
      ),
    );
    expect(log.warn).not.toHaveBeenCalledWith(
      "Unknown message type received",
      expect.objectContaining({
        messageType: "host_key_verification_response",
      }),
    );
    terminal.closeAll();
  });
});
