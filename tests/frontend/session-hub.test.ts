// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

type Registry = typeof import("../../src/frontend/session-registry");
type Hub = typeof import("../../src/frontend/session-hub");
type Handler = (...args: unknown[]) => unknown;

/** A fresh copy of the modules, like each frame of the plugin gets. */
async function frame(): Promise<{ registry: Registry; hub: Hub }> {
  vi.resetModules();
  const registry = await import("../../src/frontend/session-registry");
  const hub = await import("../../src/frontend/session-hub");
  return { registry, hub };
}

async function frames() {
  const actions = new Map<string, Handler>();
  const options = new Map<string, unknown>();
  const background = await frame();
  background.hub.connectSessionHub({
    frame: { role: "background", available: true },
    registerAction: (id: string, handler: Handler, opts: unknown) => {
      actions.set(id, handler);
      options.set(id, opts);
      return () => actions.delete(id);
    },
    tabs: { onChange: () => () => {} },
  } as never);
  // The shell hands calls between frames, always asynchronously.
  const invokeAction = async (id: string, ...args: unknown[]) => {
    const handler = actions.get(id);
    if (!handler) throw new Error(`${id} is not registered`);
    return handler(...args);
  };
  const view = async () => {
    const copy = await frame();
    copy.hub.connectSessionHub({
      frame: { role: "view", available: true },
      invokeAction,
    } as never);
    return copy;
  };
  return { background, view, options };
}

function terminal() {
  const output = new Set<(data: string) => void>();
  return {
    sendInput: vi.fn(),
    paste: vi.fn(),
    isConnected: () => true,
    subscribeOutput: (listener: (data: string) => void) => {
      output.add(listener);
      return () => output.delete(listener);
    },
    emit: (data: string) => output.forEach((listener) => listener(data)),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("sessions across frames", () => {
  it("lets the background frame's actions type into a tab's terminal", async () => {
    const { background, view } = await frames();
    const tab = await view();
    const handle = terminal();
    const unregister = tab.registry.registerSession(
      { id: "tab-1", hostId: 7, hostName: "web" },
      handle as never,
    );
    await flush();

    expect(background.registry.listInputSessions()).toEqual([
      { id: "tab-1", hostId: 7, hostName: "web" },
    ]);
    await expect(
      background.registry.sendToSession("tab-1", "uptime", { run: true }),
    ).resolves.toBe(true);
    expect(handle.sendInput).toHaveBeenCalledWith("uptime\r");

    await expect(background.registry.sendToActive("ls")).resolves.toBe(true);
    expect(handle.paste).toHaveBeenCalledWith("ls");

    unregister();
    await flush();
    expect(background.registry.sendToSession("tab-1", "ls")).toBe(false);
    expect(background.registry.listInputSessions()).toEqual([]);
  });

  it("sends to the tab focused last", async () => {
    const { background, view } = await frames();
    const first = await view();
    const second = await view();
    const a = terminal();
    const b = terminal();
    first.registry.registerSession({ id: "a", hostId: 1 }, a as never);
    second.registry.registerSession({ id: "b", hostId: 2 }, b as never);
    first.registry.setActiveSession("a");
    await flush();

    await background.registry.sendToActive("whoami", { run: true });
    expect(a.sendInput).toHaveBeenCalledWith("whoami\r");
    expect(b.sendInput).not.toHaveBeenCalled();
  });

  it("gives a panel in its own frame the tabs' sessions to run macros on", async () => {
    const { view } = await frames();
    const tab = await view();
    const panel = await view();
    const handle = terminal();
    tab.registry.registerSession({ id: "tab-1", hostId: 7 }, handle as never);
    await flush();

    const stop = panel.registry.subscribeInputSessions(() => {});
    await flush();
    expect(panel.registry.inputSessionsSnapshot()).toEqual([
      { id: "tab-1", hostId: 7 },
    ]);

    const input = panel.registry.getInputHandle("tab-1")!;
    const seen: string[] = [];
    const off = input.subscribeOutput((data) => seen.push(data));
    input.sendInput("make\r");
    await flush();
    expect(handle.sendInput).toHaveBeenCalledWith("make\r");
    handle.emit("done");
    await flush();
    expect(seen).toEqual(["done"]);

    off();
    stop();
  });

  it("forgets a tab whose frame stopped answering", async () => {
    const { background, view } = await frames();
    const tab = await view();
    tab.registry.registerSession({ id: "tab-1", hostId: 7 }, {
      ...terminal(),
      isConnected: () => {
        throw new Error("frame gone");
      },
    } as never);
    await flush();

    await expect(
      background.registry.sendToSession("tab-1", "ls"),
    ).resolves.toBe(false);
    expect(background.registry.listInputSessions()).toEqual([]);
  });

  it("keeps its actions to this plugin's own frames", async () => {
    const { options } = await frames();
    expect([...options.values()]).toSatisfy((all: unknown[]) =>
      all.every((value) => (value as { private?: boolean }).private === true),
    );
  });
});
