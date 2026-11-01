import type { TerminalBufferLine } from "../terminal/terminal-types";

/** The parts of an xterm buffer the tools read. */
export interface ReadableBuffer {
  length: number;
  getLine: (
    index: number,
  ) =>
    | { isWrapped: boolean; translateToString: (trimRight?: boolean) => string }
    | undefined;
}

/** The buffer's text, with rows the terminal wrapped joined back into one line. */
export function readBufferLines(buffer: ReadableBuffer): TerminalBufferLine[] {
  const lines: TerminalBufferLine[] = [];
  for (let row = 0; row < buffer.length; row++) {
    const line = buffer.getLine(row);
    if (!line) continue;
    const wrapsOn = buffer.getLine(row + 1)?.isWrapped === true;
    const text = line.translateToString(!wrapsOn);
    const last = lines[lines.length - 1];
    if (line.isWrapped && last) {
      last.text += text;
      last.lastRow = row;
    } else {
      lines.push({ text, firstRow: row, lastRow: row });
    }
  }
  return lines;
}

/** The lines as one text, without the empty rows at the bottom of the screen. */
export function linesToText(lines: readonly TerminalBufferLine[]): string {
  let end = lines.length;
  while (end > 0 && !lines[end - 1].text.trim()) end--;
  return lines
    .slice(0, end)
    .map((line) => line.text)
    .join("\n");
}
