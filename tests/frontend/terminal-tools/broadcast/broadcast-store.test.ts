import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fillPasswords,
  getBroadcastState,
  mirrorTypedInput,
  reportPasswordPrompt,
  resetBroadcastStore,
  sendToBroadcastGroup,
  setBroadcastMembers,
  setBroadcastPaused,
  stopBroadcast,
  toggleBroadcast,
} from "../../../../src/frontend/terminal-tools/broadcast/broadcast-store";
import { registerSession } from "../../../../src/frontend/session-registry";
import type { TerminalHandle } from "../../../../src/frontend/terminal/terminal-types";

const disposers: Array<() => void> = [];

afterEach(() => {
  resetBroadcastStore();
  for (const dispose of disposers.splice(0)) dispose();
});

function open(
  id: string,
  overrides: Partial<Record<keyof TerminalHandle, unknown>> = {},
) {
  const handle = {
    isConnected: vi.fn(() => true),
    isAtPasswordPrompt: vi.fn(() => false),
    getInputModes: vi.fn(() => ({
      applicationCursor: false,
      bracketedPaste: true,
      backspace: "normal",
    })),
    injectInput: vi.fn(),
    fillPassword: vi.fn(async () => "filled"),
    ...overrides,
  };
  const dispose = registerSession(
    { id, hostId: 1 },
    handle as unknown as TerminalHandle,
  );
  disposers.push(dispose);
  return { handle, dispose };
}

describe("broadcast group", () => {
  it("starts, adds a terminal, and ends from a member", () => {
    open("a");
    open("b");
    toggleBroadcast("a");
    expect(getBroadcastState().members).toEqual(["a"]);
    toggleBroadcast("b");
    expect(getBroadcastState().members).toEqual(["a", "b"]);
    toggleBroadcast("b");
    expect(getBroadcastState().members).toEqual([]);
  });

  it("drops a closed tab and keeps going while others remain", () => {
    open("a");
    open("b");
    const c = open("c");
    setBroadcastMembers(["a", "b", "c"]);
    c.dispose();
    expect(getBroadcastState().members).toEqual(["a", "b"]);
  });

  it("ends when a closed tab leaves one member", () => {
    open("a");
    const b = open("b");
    setBroadcastMembers(["a", "b"]);
    b.dispose();
    expect(getBroadcastState().members).toEqual([]);
  });

  it("ends when the only member of a group of one closes", () => {
    const a = open("a");
    open("b");
    toggleBroadcast("a");
    a.dispose();
    expect(getBroadcastState().members).toEqual([]);
    // Nothing is left watching the sessions, so a later close is a no op.
    open("c").dispose();
    expect(getBroadcastState().members).toEqual([]);
  });

  it("keeps a group of one that is still choosing its targets", () => {
    open("a");
    open("b");
    toggleBroadcast("a");
    const other = open("c");
    other.dispose();
    expect(getBroadcastState().members).toEqual(["a"]);
  });

  it("keeps an offline member, so it rejoins after reconnecting", () => {
    const connected = vi.fn(() => false);
    open("a");
    const b = open("b", { isConnected: connected });
    setBroadcastMembers(["a", "b"]);
    mirrorTypedInput("a", "x");
    expect(b.handle.injectInput).not.toHaveBeenCalled();
    connected.mockReturnValue(true);
    mirrorTypedInput("a", "y");
    expect(b.handle.injectInput).toHaveBeenCalledWith("y");
  });
});

describe("mirrorTypedInput", () => {
  it("reaches the other members only, through injectInput", () => {
    const a = open("a");
    const b = open("b");
    const c = open("c");
    const outside = open("d");
    setBroadcastMembers(["a", "b", "c"]);
    mirrorTypedInput("a", "ls\r");
    expect(a.handle.injectInput).not.toHaveBeenCalled();
    expect(b.handle.injectInput).toHaveBeenCalledWith("ls\r");
    expect(c.handle.injectInput).toHaveBeenCalledWith("ls\r");
    expect(outside.handle.injectInput).not.toHaveBeenCalled();
  });

  it("ignores a terminal outside the group", () => {
    open("a");
    const b = open("b");
    open("d");
    setBroadcastMembers(["a", "b"]);
    mirrorTypedInput("d", "x");
    expect(b.handle.injectInput).not.toHaveBeenCalled();
  });

  it("sends nothing while paused", () => {
    open("a");
    const b = open("b");
    setBroadcastMembers(["a", "b"]);
    setBroadcastPaused(true);
    mirrorTypedInput("a", "x");
    expect(b.handle.injectInput).not.toHaveBeenCalled();
  });

  it("does not type terminal replies into other shells", () => {
    open("a");
    const b = open("b");
    setBroadcastMembers(["a", "b"]);
    mirrorTypedInput("a", "\x1b[24;80R");
    expect(b.handle.injectInput).not.toHaveBeenCalled();
  });

  it("converts for each target's modes", () => {
    open("a");
    const b = open("b", {
      getInputModes: () => ({
        applicationCursor: true,
        bracketedPaste: true,
        backspace: "normal",
      }),
    });
    setBroadcastMembers(["a", "b"]);
    mirrorTypedInput("a", "\x1b[A");
    expect(b.handle.injectInput).toHaveBeenCalledWith("\x1bOA");
  });

  it("never sends what is typed at a password prompt", () => {
    open("a", { isAtPasswordPrompt: () => true });
    const b = open("b");
    setBroadcastMembers(["a", "b"]);
    for (const typed of ["hunter2", "\r"]) mirrorTypedInput("a", typed);
    expect(b.handle.injectInput).not.toHaveBeenCalled();
  });

  it("still sends Ctrl+C from a password prompt", () => {
    open("a", { isAtPasswordPrompt: () => true });
    const b = open("b");
    setBroadcastMembers(["a", "b"]);
    mirrorTypedInput("a", "\x03");
    expect(b.handle.injectInput).toHaveBeenCalledWith("\x03");
  });

  it("skips text for a target at a password prompt but not Ctrl+C", () => {
    open("a");
    const b = open("b", { isAtPasswordPrompt: () => true });
    setBroadcastMembers(["a", "b"]);
    mirrorTypedInput("a", "rm -rf x\r");
    expect(b.handle.injectInput).not.toHaveBeenCalled();
    mirrorTypedInput("a", "\x03");
    expect(b.handle.injectInput).toHaveBeenCalledWith("\x03");
  });
});

describe("sendToBroadcastGroup", () => {
  it("sends one paste to each member and presses Enter when asked", () => {
    const a = open("a");
    const b = open("b", {
      getInputModes: () => ({
        applicationCursor: false,
        bracketedPaste: false,
        backspace: "normal",
      }),
    });
    setBroadcastMembers(["a", "b"]);
    expect(sendToBroadcastGroup("x\ny", { run: true })).toEqual({
      sent: 2,
      skipped: 0,
    });
    expect(a.handle.injectInput).toHaveBeenCalledWith(
      "\x1b[200~x\ry\x1b[201~\r",
    );
    expect(b.handle.injectInput).toHaveBeenCalledWith("x\ry\r");
  });

  it("counts members it skipped", () => {
    open("a");
    open("b", { isConnected: () => false });
    open("c", { isAtPasswordPrompt: () => true });
    setBroadcastMembers(["a", "b", "c"]);
    expect(sendToBroadcastGroup("x")).toEqual({ sent: 1, skipped: 2 });
  });

  it("sends a raw key without paste markers", () => {
    const a = open("a");
    const b = open("b", { isAtPasswordPrompt: () => true });
    setBroadcastMembers(["a", "b"]);
    expect(sendToBroadcastGroup("\x03", { raw: true }).sent).toBe(2);
    expect(a.handle.injectInput).toHaveBeenCalledWith("\x03");
    expect(b.handle.injectInput).toHaveBeenCalledWith("\x03");
  });
});

describe("reportPasswordPrompt", () => {
  it("lists members that are asking", () => {
    open("a");
    open("b");
    setBroadcastMembers(["a", "b"]);
    reportPasswordPrompt("b", true);
    expect(getBroadcastState().atPrompt).toEqual(["b"]);
    reportPasswordPrompt("b", false);
    expect(getBroadcastState().atPrompt).toEqual([]);
  });

  it("remembers a prompt from before a terminal joined", () => {
    open("a");
    open("b");
    reportPasswordPrompt("b", true);
    setBroadcastMembers(["a", "b"]);
    expect(getBroadcastState().atPrompt).toEqual(["b"]);
    stopBroadcast();
    expect(getBroadcastState().atPrompt).toEqual([]);
  });
});

describe("fillPasswords", () => {
  it("counts each terminal's result", async () => {
    open("a");
    open("b", { fillPassword: async () => "no-prompt" });
    open("c", { fillPassword: async () => "no-password" });
    open("d", { fillPassword: () => Promise.reject(new Error("offline")) });
    expect(await fillPasswords(["a", "b", "c", "d", "gone"])).toEqual({
      filled: 1,
      notAsking: 2,
      noPassword: 2,
    });
  });
});
