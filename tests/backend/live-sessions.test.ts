import { describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import { TerminalSessionManager } from "../../src/backend/session-manager.js";
import { createLiveSessions } from "../../src/backend/live-sessions.js";
import { manifest } from "./helpers";

const log = { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeFakeWs() {
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
  } as unknown as import("ws").WebSocket;
}

function setup(permissions: string[], recording = false) {
  const manager = new TerminalSessionManager({
    log,
    getTimeoutMinutes: () => 30,
    getRecordings: async () =>
      recording
        ? {
            open: async () => ({
              append: async () => {},
              persist: async () => {},
              discard: () => {},
            }),
          }
        : null,
  });
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    permissions,
  });
  const live = createLiveSessions(mock.ctx, manager, () => 30);
  const id = manager.createSession("owner", 1, "box", 80, 24);
  const session = manager.getSession(id)!;
  session.isConnected = true;
  return { manager, mock, live, id, session };
}

describe("sessions.live for monitors", () => {
  it("lists every session only with monitor", async () => {
    const plain = setup(["sessions"]);
    expect(
      await plain.mock.actAs("auditor", () => plain.live.listAll()),
    ).toEqual([]);
    const monitor = setup(["sessions", "monitor"]);
    const all = await monitor.mock.actAs("auditor", () =>
      monitor.live.listAll(),
    );
    expect(all.map((row) => row.userId)).toEqual(["owner"]);
  });

  it("refuses watching someone else's session without monitor", async () => {
    const { mock, live, id } = setup(["sessions"]);
    await expect(
      mock.actAs("other", () => live.subscribe(id, () => {})),
    ).rejects.toThrow(/Not allowed/);
    await expect(mock.actAs("other", () => live.snapshot(id))).rejects.toThrow(
      /Not allowed/,
    );
  });

  it("lets the owner and a monitor watch", async () => {
    const { manager, mock, live, id } = setup(["sessions", "monitor"]);
    const seen: string[] = [];
    const stop = await mock.actAs("auditor", () =>
      live.subscribe(id, (data) => seen.push(data)),
    );
    manager.bufferOutput(id, "hello");
    stop();
    manager.bufferOutput(id, "after");
    expect(seen).toEqual(["hello"]);
    expect(await mock.actAs("auditor", () => live.snapshot(id))).toBe(
      "helloafter",
    );
    await expect(
      mock.actAs("owner", () => live.subscribe(id, () => {})),
    ).resolves.toBeTypeOf("function");
  });

  it("never lets a monitor type", async () => {
    const { mock, live, id, session } = setup(["sessions", "monitor"]);
    const write = vi.fn();
    session.sshStream = { destroyed: false, write } as never;
    expect(
      await mock.actAs("auditor", async () => live.write(id, "ls\r")),
    ).toBe(false);
    expect(await mock.actAs("owner", async () => live.write(id, "ls\r"))).toBe(
      true,
    );
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("ends a session for its owner or a monitor only", async () => {
    const denied = setup(["sessions"]);
    await expect(
      denied.mock.actAs("other", () =>
        denied.live.ownerEndSession(denied.id, "x"),
      ),
    ).rejects.toThrow(/Not allowed/);
    expect(denied.manager.getSession(denied.id)).not.toBeNull();

    const allowed = setup(["sessions", "monitor"]);
    await allowed.mock.actAs("auditor", () =>
      allowed.live.ownerEndSession(allowed.id, "Ended by auditor"),
    );
    expect(allowed.manager.getSession(allowed.id)).toBeNull();
  });

  it("flags and announces a recorded session", async () => {
    const { manager, live, id } = setup(["sessions"], true);
    const ws = makeFakeWs();
    manager.attachWs(id, "owner", ws);
    await vi.waitFor(() => expect(live.getSession(id)?.recording).toBe(true));
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "recording", active: true }),
    );
  });
});
