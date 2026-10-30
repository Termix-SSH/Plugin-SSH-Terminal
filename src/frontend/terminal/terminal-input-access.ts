import type { Terminal } from "@xterm/xterm";
import { getTerminalTextToCursor } from "./terminal-buffer-text";
import type { TerminalInputAccess } from "./terminal-slots";

/** The prompt of one xterm, for the "terminal.overlay" slot. */
export function createTerminalInputAccess(
  terminal: Terminal | null | undefined,
): TerminalInputAccess {
  return {
    getTextToCursor: () => getTerminalTextToCursor(terminal),
    paste: (text) => terminal?.paste(text),
    isAlternateScreen: () => terminal?.buffer.active.type === "alternate",
    isBracketedPaste: () => terminal?.modes.bracketedPasteMode ?? false,
  };
}
