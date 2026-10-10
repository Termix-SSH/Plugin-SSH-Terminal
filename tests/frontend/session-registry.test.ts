import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerSession,
  sendToActive,
  setActiveSession,
} from "../../src/frontend/session-registry";
import type { TerminalHandle } from "../../src/frontend/terminal/terminal-types";

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  setActiveSession(null);
});

function open(id: string) {
  const ref = { sendInput: vi.fn(), paste: vi.fn() };
  const dispose = registerSession(
    { id, hostId: null },
    ref as unknown as TerminalHandle,
  );
  disposers.push(dispose);
  return { ref, dispose };
}

describe("sendToActive", () => {
  it("returns false with no sessions", () => {
    expect(sendToActive("ls", { run: true })).toBe(false);
  });

  it("sends to the focused session", () => {
    const a = open("a");
    const b = open("b");
    setActiveSession("a");
    expect(sendToActive("ls", { run: true })).toBe(true);
    expect(a.ref.sendInput).toHaveBeenCalledWith("ls\r");
    expect(b.ref.sendInput).not.toHaveBeenCalled();
  });

  it("falls back to an open session when none was focused", () => {
    const a = open("a");
    expect(sendToActive("ls")).toBe(true);
    expect(a.ref.paste).toHaveBeenCalledWith("ls");
  });

  it("moves to another session when the focused one closes", () => {
    const a = open("a");
    const b = open("b");
    setActiveSession("b");
    b.dispose();
    expect(sendToActive("ls", { run: true })).toBe(true);
    expect(a.ref.sendInput).toHaveBeenCalledWith("ls\r");
  });
});
