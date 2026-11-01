import { stripAnsi } from "../../terminal/password-prompt";

export type WatchKind = "match" | "quiet" | "activity";

export interface WatchRule {
  id: string;
  name: string;
  kind: WatchKind;
  /** The text or regex a match rule looks for. */
  pattern?: string;
  regex?: boolean;
  /** How long a quiet rule waits after the last output. */
  seconds?: number;
}

export const ALERT_GAP_MS = 30_000;
const MAX_LINE_LENGTH = 4096;
// Output right after a key press is usually just its echo.
const ECHO_WINDOW_MS = 500;
// An escape code cut off at the end of a chunk continues in the next one.
const PARTIAL_ESCAPE = /\x1b(?:\[[0-9:;<=>?!]*|\][^\x07\x1b]*|[()#%*+])?$/;

function compile(rule: WatchRule): RegExp | null {
  if (!rule.pattern) return null;
  const source = rule.regex
    ? rule.pattern
    : rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

/** An i18n key when the rule can't be saved, otherwise null. */
export function validateWatchRule(rule: WatchRule): string | null {
  if (!rule.name.trim()) return "terminalTools.watch.nameRequired";
  if (rule.kind === "match") {
    if (!rule.pattern) return "terminalTools.watch.patternRequired";
    if (!compile(rule)) return "terminalTools.watch.badRegex";
  }
  if (rule.kind === "quiet" && !((rule.seconds ?? 0) >= 1)) {
    return "terminalTools.watch.secondsRequired";
  }
  return null;
}

export interface WatchHit {
  /** The line that matched. Stays in the browser, it can hold secrets. */
  line?: string;
}

export interface WatchTracker {
  noteInput: (now: number) => void;
  /** Away means the terminal is behind another tab or the window has no focus. */
  feed: (chunk: string, now: number, away: boolean) => WatchHit | null;
  tick: (now: number, away: boolean) => WatchHit | null;
}

export function createWatchTracker(rule: WatchRule): WatchTracker {
  const regex = rule.kind === "match" ? compile(rule) : null;
  const quietMs = (rule.seconds ?? 0) * 1000;
  let carry = "";
  let line = "";
  let lastFired = -Infinity;
  let lastInput = -Infinity;
  let lastOutput = 0;
  let armed = false;

  function fire(now: number, hit: WatchHit): WatchHit | null {
    if (now - lastFired < ALERT_GAP_MS) return null;
    lastFired = now;
    return hit;
  }

  function scan(chunk: string, now: number): WatchHit | null {
    if (!regex) return null;
    let raw = carry + chunk;
    carry = raw.match(PARTIAL_ESCAPE)?.[0] ?? "";
    if (carry) raw = raw.slice(0, -carry.length);
    const parts = (line + stripAnsi(raw)).split(/\r\n|\n|\r/);
    line = (parts.pop() ?? "").slice(-MAX_LINE_LENGTH);
    let hit: WatchHit | null = null;
    for (const part of [...parts, line]) {
      if (!hit && regex.test(part.slice(-MAX_LINE_LENGTH))) {
        hit = { line: part.trim().slice(0, 300) };
      }
    }
    if (!hit) return null;
    // The unfinished line counted once, so it can't fire again as it grows.
    line = "";
    return fire(now, hit);
  }

  return {
    noteInput(now) {
      lastInput = now;
    },
    feed(chunk, now, away) {
      if (rule.kind === "match") return scan(chunk, now);
      if (rule.kind === "activity") return away ? fire(now, {}) : null;
      lastOutput = now;
      if (now - lastInput > ECHO_WINDOW_MS) armed = true;
      return null;
    },
    tick(now, away) {
      if (rule.kind !== "quiet" || !armed || !away) return null;
      if (now - lastOutput < quietMs) return null;
      armed = false;
      return fire(now, {});
    },
  };
}
