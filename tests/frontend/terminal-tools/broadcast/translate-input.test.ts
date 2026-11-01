import { describe, expect, it } from "vitest";
import {
  formatPaste,
  isSignalKey,
  stripTerminalReplies,
  translateInput,
} from "../../../../src/frontend/terminal-tools/broadcast/translate-input";
import type { TerminalInputModes } from "../../../../src/frontend/terminal/terminal-types";

const plain: TerminalInputModes = {
  applicationCursor: false,
  bracketedPaste: true,
  backspace: "normal",
};

describe("stripTerminalReplies", () => {
  it.each([
    ["cursor position", "\x1b[24;80R"],
    ["device attributes", "\x1b[?1;2c"],
    ["secondary attributes", "\x1b[>0;276;0c"],
    ["status", "\x1b[0n"],
    ["mode report", "\x1b[?2004;2$y"],
    ["SGR mouse", "\x1b[<0;10;20M"],
    ["X10 mouse", "\x1b[M !!"],
    ["focus in", "\x1b[I"],
    ["focus out", "\x1b[O"],
    ["OSC color", "\x1b]11;rgb:0000/0000/0000\x1b\\"],
    ["DCS", "\x1bP1$r0m\x1b\\"],
  ])("drops a %s reply", (_name, reply) => {
    expect(stripTerminalReplies(reply)).toBe("");
  });

  it.each([
    ["text", "ls -la\r"],
    ["arrow", "\x1b[A"],
    ["application arrow", "\x1bOA"],
    ["function key", "\x1b[15~"],
    ["shift tab", "\x1b[Z"],
    ["alt key", "\x1bb"],
    ["ctrl c", "\x03"],
  ])("keeps typed %s", (_name, typed) => {
    expect(stripTerminalReplies(typed)).toBe(typed);
  });
});

describe("translateInput", () => {
  it("leaves input alone when the modes match", () => {
    expect(translateInput("\x1b[A", plain, plain)).toBe("\x1b[A");
  });

  it("converts arrows to the target's cursor mode, both ways", () => {
    const app = { ...plain, applicationCursor: true };
    expect(translateInput("\x1b[A", plain, app)).toBe("\x1bOA");
    expect(translateInput("\x1bOD", app, plain)).toBe("\x1b[D");
    expect(translateInput("\x1b[H", plain, app)).toBe("\x1bOH");
  });

  it("does not touch arrows with modifiers", () => {
    const app = { ...plain, applicationCursor: true };
    expect(translateInput("\x1b[1;5C", plain, app)).toBe("\x1b[1;5C");
  });

  it("converts backspace to the target's mode", () => {
    const controlH = { ...plain, backspace: "control-h" as const };
    expect(translateInput("\x7f", plain, controlH)).toBe("\x08");
    expect(translateInput("\x08", controlH, plain)).toBe("\x7f");
  });

  it("does not rewrite backspace bytes inside longer input", () => {
    const controlH = { ...plain, backspace: "control-h" as const };
    expect(translateInput("a\x7fb", plain, controlH)).toBe("a\x7fb");
  });

  it("removes paste markers for a target without bracketed paste", () => {
    const noBracket = { ...plain, bracketedPaste: false };
    expect(translateInput("\x1b[200~a\rb\x1b[201~", plain, noBracket)).toBe(
      "a\rb",
    );
    expect(translateInput("\x1b[200~a\x1b[201~", plain, plain)).toBe(
      "\x1b[200~a\x1b[201~",
    );
  });
});

describe("isSignalKey", () => {
  it("knows the keys that may reach a password prompt", () => {
    for (const key of ["\x03", "\x04", "\x1a", "\x1c"]) {
      expect(isSignalKey(key)).toBe(true);
    }
    for (const key of ["a", "\r", "\x1b[A", "\x03\x03"]) {
      expect(isSignalKey(key)).toBe(false);
    }
  });
});

describe("formatPaste", () => {
  it("wraps text when the terminal takes bracketed paste", () => {
    expect(formatPaste("a\nb", true)).toBe("\x1b[200~a\rb\x1b[201~");
  });

  it("sends carriage returns otherwise", () => {
    expect(formatPaste("a\r\nb\nc", false)).toBe("a\rb\rc");
  });
});
