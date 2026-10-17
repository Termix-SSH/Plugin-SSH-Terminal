import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const saveCommandToHistory = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({
  usePluginApi: () => ({}),
}));
vi.mock("../../../../src/frontend/terminal-api", () => ({
  saveCommandToHistory: (...args: unknown[]) => saveCommandToHistory(...args),
}));

const { useCommandTracker } =
  await import("../../../../src/frontend/terminal/command-history/useCommandTracker");

function tracker(options: Record<string, unknown> = {}) {
  const executed: string[] = [];
  const { result } = renderHook(() =>
    useCommandTracker({
      hostId: 1,
      onCommandExecuted: (command) => executed.push(command),
      ...options,
    }),
  );
  return { ...result.current, executed };
}

describe("useCommandTracker", () => {
  it("drops arrow keys sent in application cursor mode", () => {
    const t = tracker();
    t.trackInput("ls");
    t.trackInput("\x1bOA\x1bOB\x1b[1;5C");
    expect(t.getCurrentCommand()).toBe("ls");
  });

  it("drops mouse and bracketed paste sequences", () => {
    const t = tracker();
    t.trackInput("\x1b[<64;10;5M");
    t.trackInput("\x1b[200~echo hi\x1b[201~");
    expect(t.getCurrentCommand()).toBe("echo hi");
  });

  it("keeps nothing typed into a full-screen app", () => {
    let fullScreen = true;
    const t = tracker({ isFullScreen: () => fullScreen });
    t.trackInput("jjjkkk:wq\r");
    expect(t.executed).toEqual([]);
    fullScreen = false;
    t.trackInput("uptime\r");
    expect(t.executed).toEqual(["uptime"]);
  });
});
