import type { TerminalInputModes } from "../../terminal/terminal-types";

// xterm sends these through onData too, but they answer the terminal's own
// program. Typed into another shell they show up as garbage.
const TERMINAL_REPLIES = new RegExp(
  [
    "\\x1b\\[<[0-9;]*[mM]", // SGR mouse
    "\\x1b\\[M[\\s\\S]{3}", // X10 mouse
    "\\x1b\\[[IO]", // focus in and out
    "\\x1b\\[\\??[0-9]+;[0-9]+R", // cursor position
    "\\x1b\\[[?>][0-9;]*c", // device attributes
    "\\x1b\\[\\??[0-9;]*\\$y", // mode reports
    "\\x1b\\[[0-9]n", // status report
    "\\x1b\\[[0-9;]+t", // window reports
    "\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)", // OSC replies
    "\\x1bP[^\\x1b]*\\x1b\\\\", // DCS replies
  ].join("|"),
  "g",
);

const SIGNAL_KEYS = new Set(["\x03", "\x04", "\x1a", "\x1c"]);
const CURSOR_KEY = /\x1b[[O]([ABCDHF])/g;
const PASTE_MARKERS = /\x1b\[20[01]~/g;

/** Only what the user typed, or an empty string. */
export function stripTerminalReplies(data: string): string {
  return data.replace(TERMINAL_REPLIES, "");
}

/** Ctrl+C, Ctrl+D, Ctrl+Z and Ctrl+\ still reach a terminal asking for a password. */
export function isSignalKey(data: string): boolean {
  return SIGNAL_KEYS.has(data);
}

/** Rewrites typed input for a terminal whose modes differ from the source's. */
export function translateInput(
  data: string,
  source: TerminalInputModes,
  target: TerminalInputModes,
): string {
  let output = data;
  if (source.applicationCursor !== target.applicationCursor) {
    const prefix = target.applicationCursor ? "\x1bO" : "\x1b[";
    output = output.replace(CURSOR_KEY, (_match, key) => prefix + key);
  }
  if (source.backspace !== target.backspace) {
    if (output === "\x7f" && target.backspace === "control-h") output = "\x08";
    else if (output === "\x08" && target.backspace === "normal") {
      output = "\x7f";
    }
  }
  if (!target.bracketedPaste) output = output.replace(PASTE_MARKERS, "");
  return output;
}

/** Text as one paste, so several lines stay together where the shell allows it. */
export function formatPaste(text: string, bracketedPaste: boolean): string {
  const body = text.replace(/\r?\n/g, "\r");
  return bracketedPaste ? `\x1b[200~${body}\x1b[201~` : body;
}
