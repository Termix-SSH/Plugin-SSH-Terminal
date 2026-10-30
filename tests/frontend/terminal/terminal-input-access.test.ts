import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalInputAccess } from "../../../src/frontend/terminal/terminal-input-access";

let terminal: Terminal | undefined;
afterEach(() => terminal?.dispose());

const write = (data: string) =>
  new Promise<void>((resolve) => terminal!.write(data, resolve));

describe("createTerminalInputAccess", () => {
  it("reads the prompt line up to the cursor", async () => {
    terminal = new Terminal({ cols: 40, rows: 5 });
    await write("$ ls\r\nfile\r\n$ echo hi");
    expect(createTerminalInputAccess(terminal).getTextToCursor()).toBe(
      "$ ls\nfile\n$ echo hi",
    );
  });

  it("follows the shell's bracketed paste and alternate screen modes", async () => {
    terminal = new Terminal({ cols: 40, rows: 5 });
    const input = createTerminalInputAccess(terminal);
    expect(input.isBracketedPaste()).toBe(false);
    expect(input.isAlternateScreen()).toBe(false);
    await write("\x1b[?2004h\x1b[?1049h");
    expect(input.isBracketedPaste()).toBe(true);
    expect(input.isAlternateScreen()).toBe(true);
  });

  it("pastes through xterm, which brackets it when the shell asked", () => {
    // xterm's paste needs an opened terminal; what matters here is that the
    // text goes through it rather than straight to the socket.
    const paste = vi.fn();
    createTerminalInputAccess({ paste } as unknown as Terminal).paste("a\nb");
    expect(paste).toHaveBeenCalledWith("a\nb");
  });

  it("does nothing without a terminal", () => {
    const input = createTerminalInputAccess(null);
    expect(input.getTextToCursor()).toBe("");
    expect(input.isAlternateScreen()).toBe(false);
    expect(input.isBracketedPaste()).toBe(false);
    expect(() => input.paste("x")).not.toThrow();
  });
});
