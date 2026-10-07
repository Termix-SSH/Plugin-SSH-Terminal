/**
 * Keyboard-interactive rounds end to end through the terminal socket: the
 * prompt message the client sees and the answer that reaches ssh2. This is
 * the JumpCloud shape, a menu choice followed by a press-enter confirm whose
 * answer is an empty string.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockCtx } from "@termix-ssh/plugin-sdk/testing";
import type {
  PluginContext,
  PluginKeyboardInteractiveDecision,
  PluginSshHost,
} from "@termix-ssh/plugin-sdk/backend";
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

const HOST: PluginSshHost = {
  id: 1,
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  userId: "user-1",
  authType: "none",
};

/**
 * Core's classifier is not part of this plugin, so stand in for its verdict:
 * a press-enter prompt is a confirm-only push, anything else is typed.
 */
function classify(round: {
  prompts: Array<{ prompt: string }>;
}): PluginKeyboardInteractiveDecision {
  const prompt = round.prompts[0]?.prompt ?? "";
  return { kind: "input", promptIndex: 0, isPush: /press enter/i.test(prompt) };
}

function createSocket() {
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    sshHosts: [HOST],
  });
  const ssh = new Proxy(mock.ctx.ssh, {
    get: (target, key, receiver) =>
      key === "classifyKeyboardInteractive"
        ? classify
        : Reflect.get(target, key, receiver),
  });
  const ctx = new Proxy(mock.ctx, {
    get: (target, key, receiver) =>
      key === "ssh" ? ssh : Reflect.get(target, key, receiver),
  }) as PluginContext;

  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  };
  const sessionManager = {
    getSession: () => null,
    getUserSessions: () => [],
    destroySession: vi.fn(),
    getParticipantForWs: () => null,
    removeParticipant: vi.fn(),
    detachWs: vi.fn(),
    attachWs: vi.fn(),
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

/** Opens a socket and drives it up to the SSH connect, where ssh2 takes over. */
async function connect(terminal: ReturnType<typeof createSocket>) {
  const ws = new FakeSocket();
  await terminal.handleConnection({
    socket: ws,
    request: { url: "/terminal", headers: {} },
    userId: "user-1",
    clientIp: "10.0.0.1",
    requestOrigin: "",
    isDataUnlocked: () => true,
  } as never);
  const before = FakeSshClient.instances.length;
  ws.message("connectToHost", {
    hostConfig: { id: 1, ip: "10.0.0.1", port: 22, username: "root" },
    cols: 80,
    rows: 24,
  });
  await vi.waitFor(() => {
    expect(FakeSshClient.instances.length).toBeGreaterThan(before);
    expect(FakeSshClient.instances.at(-1)?.connectConfig).toBeTruthy();
  });
  return { ws, client: FakeSshClient.instances.at(-1)! };
}

function round(client: FakeSshClient, prompt: string) {
  const finish = vi.fn();
  client.emit(
    "keyboard-interactive",
    "",
    "",
    "",
    [{ prompt, echo: true }],
    finish,
  );
  return finish;
}

const prompts = (ws: FakeSocket) =>
  ws.messages().filter((m) => m.type === "password_required");
const errors = (ws: FakeSocket) =>
  ws.messages().filter((m) => m.type === "error");

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  FakeSshClient.instances = [];
});

describe("terminal socket keyboard-interactive prompts", () => {
  it("answers a menu choice, then a push confirm with an empty string", async () => {
    const terminal = createSocket();
    cleanup.push(() => terminal.closeAll());
    const { ws, client } = await connect(terminal);

    const menuFinish = round(client, "Choose [1] Push, or [2] TOTP:");
    await vi.waitFor(() => expect(prompts(ws)).toHaveLength(1));
    expect(prompts(ws)[0]).toEqual({
      type: "password_required",
      prompt: "Choose [1] Push, or [2] TOTP:",
      echo: true,
      isPush: false,
    });

    ws.message("password_response", { code: "1" });
    await vi.waitFor(() => expect(menuFinish).toHaveBeenCalledWith(["1"]));

    const confirmFinish = round(client, "Press enter to send Push");
    await vi.waitFor(() => expect(prompts(ws)).toHaveLength(2));
    expect(prompts(ws)[1]).toEqual({
      type: "password_required",
      prompt: "Press enter to send Push",
      echo: true,
      isPush: true,
    });

    ws.message("password_response", { code: "" });
    await vi.waitFor(() => expect(confirmFinish).toHaveBeenCalledWith([""]));
    expect(errors(ws)).toEqual([]);
  });

  it("still rejects a response that carries no answer at all", async () => {
    const terminal = createSocket();
    cleanup.push(() => terminal.closeAll());
    const { ws, client } = await connect(terminal);

    const finish = round(client, "Press enter to send Push");
    await vi.waitFor(() => expect(prompts(ws)).toHaveLength(1));

    ws.message("password_response", {});
    await vi.waitFor(() => expect(errors(ws)).toHaveLength(1));
    expect(finish).not.toHaveBeenCalled();
    expect(errors(ws)[0].message).toMatch(/state lost/i);
  });
});
