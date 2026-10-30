import type { Terminal } from "@xterm/xterm";

/**
 * How much scrollback to hand out by default. Bounded on purpose: a
 * long-running session holds megabytes, and nothing consuming this wants all
 * of it.
 */
const DEFAULT_BUFFER_CONTEXT_LINES = 200;

/**
 * Serializes the tail of a terminal's buffer to plain text.
 *
 * Wrapped rows are joined back onto the line they continue. xterm splits one
 * logical line across several buffer rows when it wraps, so emitting a newline
 * per row would chop long commands in half.
 */
export function getTerminalBufferText(
  terminal: Terminal | null | undefined,
  maxLines: number = DEFAULT_BUFFER_CONTEXT_LINES,
): string {
  if (!terminal || maxLines <= 0) return "";

  try {
    const buffer = terminal.buffer.active;
    return joinRows(terminal, buffer.baseY + terminal.rows, maxLines);
  } catch {
    // Called from a click handler. A disposed terminal returns nothing
    // rather than breaking the click.
    return "";
  }
}

/**
 * The same text, but ending at the line the cursor is on: what is typed at
 * the prompt is the last line. Anything drawn below the cursor (a tmux status
 * bar, a prompt's second line) is left out.
 */
export function getTerminalTextToCursor(
  terminal: Terminal | null | undefined,
  maxLines: number = DEFAULT_BUFFER_CONTEXT_LINES,
): string {
  if (!terminal || maxLines <= 0) return "";

  try {
    const buffer = terminal.buffer.active;
    let end = buffer.baseY + buffer.cursorY + 1;
    // The cursor's row may be the start of a line that wraps further down.
    while (buffer.getLine(end)?.isWrapped) end++;
    return joinRows(terminal, end, maxLines);
  } catch {
    return "";
  }
}

function joinRows(terminal: Terminal, end: number, maxLines: number): string {
  const buffer = terminal.buffer.active;
  const start = Math.max(0, end - maxLines);

  const lines: string[] = [];
  for (let i = start; i < end; i++) {
    const line = buffer.getLine(i);
    if (!line) continue;
    const text = line.translateToString(true);
    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += text;
    } else {
      lines.push(text);
    }
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
