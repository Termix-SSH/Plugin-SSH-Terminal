import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSessionHandle,
  listSessions,
  registerSession,
  sendToActive,
  sendToSession,
  setActiveSession,
  subscribeSessions,
  updateSession,
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

describe("updateSession", () => {
  it("keeps the list order and the focused session", () => {
    open("a");
    const b = open("b");
    open("c");
    setActiveSession("b");
    const next = { sendInput: vi.fn(), paste: vi.fn() };
    updateSession("a", { ref: next as unknown as TerminalHandle });
    expect(listSessions().map((session) => session.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sendToActive("ls", { run: true })).toBe(true);
    expect(b.ref.sendInput).toHaveBeenCalledWith("ls\r");
    expect(getSessionHandle("a")).toBe(next);
  });

  it("does not tell listeners when nothing changed", () => {
    open("a");
    updateSession("a", { label: "web" });
    const listener = vi.fn();
    const unsubscribe = subscribeSessions(listener);
    updateSession("a", { label: "web" });
    expect(listener).not.toHaveBeenCalled();
    updateSession("a", { label: "db" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("a closed connection", () => {
  function openClosed(id: string) {
    const ref = {
      sendInput: vi.fn(),
      paste: vi.fn(),
      isConnected: () => false,
    };
    disposers.push(
      registerSession({ id, hostId: null }, ref as unknown as TerminalHandle),
    );
    return ref;
  }

  it("answers false and sends nothing", () => {
    const ref = openClosed("a");
    setActiveSession("a");
    expect(sendToActive("ls", { run: true })).toBe(false);
    expect(sendToSession("a", "ls")).toBe(false);
    expect(ref.sendInput).not.toHaveBeenCalled();
    expect(ref.paste).not.toHaveBeenCalled();
  });
});

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
