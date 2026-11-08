import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSessionHandle,
  registerLocalSession,
  listInputSessions,
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

describe("local input sessions", () => {
  it("keeps local and SSH targets separate and never exposes an SSH tool handle", () => {
    const ssh = open("ssh");
    const local = {
      sendInput: vi.fn(),
      paste: vi.fn(),
      isConnected: () => true,
    };
    const other = {
      sendInput: vi.fn(),
      paste: vi.fn(),
      isConnected: () => true,
    };
    const remove = registerLocalSession({ id: "local", label: "Local" }, local);
    disposers.push(remove, registerLocalSession({ id: "other" }, other));
    expect(listInputSessions().map((s) => s.id)).toEqual([
      "ssh",
      "local",
      "other",
    ]);
    expect(listSessions().map((s) => s.id)).toEqual(["ssh"]);
    expect(getSessionHandle("local")).toBeNull();
    setActiveSession("local");
    expect(sendToActive("local command", { run: true })).toBe(true);
    expect(local.sendInput).toHaveBeenCalledWith("local command\r");
    expect(ssh.ref.sendInput).not.toHaveBeenCalled();
    expect(other.sendInput).not.toHaveBeenCalled();
    remove();
    expect(sendToActive("closed active", { run: true })).toBe(false);
    expect(sendToSession("local", "closed", { run: true })).toBe(false);
    expect(ssh.ref.sendInput).not.toHaveBeenCalled();
    setActiveSession("ssh");
    expect(sendToActive("ssh command", { run: true })).toBe(true);
    expect(ssh.ref.sendInput).toHaveBeenCalledWith("ssh command\r");
  });

  it("does not unregister a replacement with a reused tab ID", () => {
    const ref = { sendInput: vi.fn(), paste: vi.fn(), isConnected: () => true };
    const old = registerLocalSession({ id: "reused" }, ref);
    disposers.push(registerLocalSession({ id: "reused" }, ref));
    old();
    expect(sendToSession("reused", "ok")).toBe(true);
  });
});
