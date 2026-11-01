import type { TerminalBufferLine } from "../../terminal/terminal-types";

export const MAX_FIND_RESULTS = 500;
const LINES_PER_BATCH = 2000;
/** A very long line is cut here, so one line can't stall the page. */
const MAX_LINE_LENGTH = 4096;

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FindSource {
  id: string;
  lines: () => TerminalBufferLine[];
}

export interface FindResult {
  sessionId: string;
  firstRow: number;
  lastRow: number;
  text: string;
}

/** A test for one line, or null while the query is empty or a bad regex. */
export function buildLineMatcher(
  query: string,
  options: FindOptions,
): ((text: string) => boolean) | null {
  if (!query) return null;
  const source = options.regex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = options.wholeWord ? `\\b(?:${source})\\b` : source;
  try {
    const regex = new RegExp(pattern, options.caseSensitive ? "" : "i");
    return (text) => regex.test(text.slice(0, MAX_LINE_LENGTH));
  } catch {
    return null;
  }
}

/**
 * Searches each terminal's scrollback, giving the page a turn between
 * batches. isCancelled ends it early when the query changes.
 */
export async function searchTerminals(
  sources: readonly FindSource[],
  matches: (text: string) => boolean,
  isCancelled: () => boolean = () => false,
): Promise<{ results: FindResult[]; capped: boolean }> {
  const results: FindResult[] = [];
  let sinceYield = 0;
  for (const source of sources) {
    for (const line of source.lines()) {
      if (matches(line.text)) {
        if (results.length === MAX_FIND_RESULTS) {
          return { results, capped: true };
        }
        results.push({
          sessionId: source.id,
          firstRow: line.firstRow,
          lastRow: line.lastRow,
          text: line.text.trim().slice(0, 300),
        });
      }
      if (++sinceYield >= LINES_PER_BATCH) {
        sinceYield = 0;
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (isCancelled()) return { results, capped: false };
      }
    }
  }
  return { results, capped: false };
}
