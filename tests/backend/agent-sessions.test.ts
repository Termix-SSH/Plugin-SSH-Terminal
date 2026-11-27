import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  createAgentSessions,
  plainText,
} from "../../src/backend/agent-sessions.js";
import { TerminalSessionManager } from "../../src/backend/session-manager.js";

class FakeStream extends EventEmitter {
  written: string[] = [];
  destroyed = false;
  write(data: string) {
    this.written.push(data);
    return true;
  }
  end() {
    this.destroyed = true;
    this.emit("close", 0);
  }
  pause() {}
  resume() {}
}

function setup(actor = "alice") {
  const stream = new FakeStream();
  const dispose = vi.fn();
  const client = {
    shell: (_pty: unknown, done: (error: null, s: FakeStream) => void) =>
      done(null, stream),
    end: vi.fn(),
  };
  const ctx = {
    currentActor: () => actor,
    ssh: {
      connect: async () => ({
        client,
        jumpClient: null,
        host: { name: "web", ip: "192.0.2.1" },
        dispose,
      }),
    },
  } as unknown as PluginContext;
  const log = { info() {}, warn() {}, error() {}, debug() {}, success() {} };
  const manager = new TerminalSessionManager({
    log: log as never,
    getTimeoutMinutes: () => 30,
    getRecordings: async () => null,
  });
  return {
    stream,
    dispose,
    manager,
    ctx,
    agent: createAgentSessions(ctx, () => manager),
  };
}

const live: TerminalSessionManager[] = [];
afterEach(() => {
  for (const manager of live.splice(0)) manager.destroyAll();
  vi.useRealTimers();
});

describe("agent terminal sessions", () => {
  it("strips what only a screen can show", () => {
    expect(plainText("\x1b[1;32mok\x1b[0m\r\n\x1b]0;title\x07$ ")).toBe(
      "ok\n$ ",
    );
  });

  it("opens a session its user can attach to", async () => {
    const { agent, manager } = setup();
    live.push(manager);
    const id = await agent.open(1);
    const session = manager.getSession(id)!;
    expect(session).toMatchObject({
      userId: "alice",
      hostId: 1,
      agent: true,
      isConnected: true,
    });
    // Nobody watches yet, so it has to time out on its own.
    expect(session.detachTimeout).not.toBeNull();
  });

  it("types and returns what came back", async () => {
    vi.useFakeTimers();
    const { agent, manager, stream } = setup();
    live.push(manager);
    const id = await agent.open(1);
    const sent = agent.send(id, 1, "ls\r", 3000, new AbortController().signal);
    expect(stream.written).toEqual(["ls\r"]);
    stream.emit("data", Buffer.from("\x1b[34mdocs\x1b[0m\r\n$ "));
    await vi.advanceTimersByTimeAsync(500);
    expect(await sent).toBe("docs\n$ ");
    expect(agent.read(id, 1)).toBe("docs\n$ ");
  });

  it("answers after the wait when the host prints nothing", async () => {
    vi.useFakeTimers();
    const { agent, manager } = setup();
    live.push(manager);
    const id = await agent.open(1);
    const sent = agent.send(id, 1, "x", 1000, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await sent).toBe("");
  });

  it("keeps other users and other hosts out", async () => {
    const first = setup("alice");
    live.push(first.manager);
    const id = await first.agent.open(1);
    expect(() => first.agent.read(id, 2)).toThrow();
    const other = createAgentSessions(
      { ...first.ctx, currentActor: () => "bob" } as PluginContext,
      () => first.manager,
    );
    expect(() => other.read(id, 1)).toThrow();
    expect(() => first.agent.read("nope", 1)).toThrow();
  });

  it("closes the session and the connection", async () => {
    const { agent, manager, dispose } = setup();
    live.push(manager);
    const id = await agent.open(1);
    agent.close(id, 1);
    expect(manager.getSession(id)).toBeNull();
    expect(dispose).toHaveBeenCalled();
  });
});
