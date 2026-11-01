import { describe, expect, it } from "vitest";
import {
  ALERT_GAP_MS,
  createWatchTracker,
  validateWatchRule,
  type WatchRule,
} from "../../../../src/frontend/terminal-tools/watch/match";

const match = (pattern: string, regex = false): WatchRule => ({
  id: "r",
  name: "rule",
  kind: "match",
  pattern,
  regex,
});
const quiet: WatchRule = { id: "q", name: "q", kind: "quiet", seconds: 10 };
const activity: WatchRule = { id: "a", name: "a", kind: "activity" };

describe("validateWatchRule", () => {
  it("needs a name, a pattern and sane seconds", () => {
    expect(validateWatchRule({ ...match("x"), name: " " })).toBe(
      "terminalTools.watch.nameRequired",
    );
    expect(validateWatchRule(match(""))).toBe(
      "terminalTools.watch.patternRequired",
    );
    expect(validateWatchRule({ ...quiet, seconds: 0 })).toBe(
      "terminalTools.watch.secondsRequired",
    );
    expect(validateWatchRule(match("ok"))).toBeNull();
    expect(validateWatchRule(activity)).toBeNull();
  });

  it("rejects a bad regex but takes the same text as plain text", () => {
    expect(validateWatchRule(match("(", true))).toBe(
      "terminalTools.watch.badRegex",
    );
    expect(validateWatchRule(match("("))).toBeNull();
  });
});

describe("match rules", () => {
  it("finds text in a line, ignoring case", () => {
    const tracker = createWatchTracker(match("error"));
    expect(tracker.feed("all good\r\n", 0, false)).toBeNull();
    expect(tracker.feed("Fatal ERROR here\r\n", 1, false)).toEqual({
      line: "Fatal ERROR here",
    });
  });

  it("treats text as literal unless regex is on", () => {
    const literal = createWatchTracker(match("a.c"));
    expect(literal.feed("abc\n", 0, false)).toBeNull();
    expect(
      createWatchTracker(match("a.c", true)).feed("abc\n", 0, false),
    ).not.toBeNull();
  });

  it("finds text split across chunks", () => {
    const tracker = createWatchTracker(match("failed"));
    expect(tracker.feed("job fai", 0, false)).toBeNull();
    expect(tracker.feed("led\r\n", 1, false)).toEqual({ line: "job failed" });
  });

  it("sees through color codes, even split across chunks", () => {
    const tracker = createWatchTracker(match("failed"));
    expect(tracker.feed("job \x1b[3", 0, false)).toBeNull();
    expect(tracker.feed("1mfai\x1b[0mled\n", 1, false)).toEqual({
      line: "job failed",
    });
  });

  it("matches a line with no newline yet, like a prompt", () => {
    const tracker = createWatchTracker(match("continue?"));
    expect(tracker.feed("Do you want to continue? ", 0, false)).not.toBeNull();
  });

  it("fires once in the alert gap, then again", () => {
    const tracker = createWatchTracker(match("x"));
    expect(tracker.feed("x\n", 0, false)).not.toBeNull();
    expect(tracker.feed("x\n", ALERT_GAP_MS - 1, false)).toBeNull();
    expect(tracker.feed("x\n", ALERT_GAP_MS, false)).not.toBeNull();
  });

  it("does not fire again as an unfinished line grows", () => {
    const tracker = createWatchTracker(match("x"));
    expect(tracker.feed("x", 0, false)).not.toBeNull();
    expect(tracker.feed("yz\n", ALERT_GAP_MS + 1, false)).toBeNull();
  });
});

describe("quiet rules", () => {
  it("fires after the quiet time, once, when you are away", () => {
    const tracker = createWatchTracker(quiet);
    tracker.feed("output", 1000, false);
    expect(tracker.tick(5000, true)).toBeNull();
    expect(tracker.tick(11_000, true)).toEqual({});
    expect(tracker.tick(12_000, true)).toBeNull();
  });

  it("waits while you are looking at the terminal", () => {
    const tracker = createWatchTracker(quiet);
    tracker.feed("output", 1000, false);
    expect(tracker.tick(11_000, false)).toBeNull();
    expect(tracker.tick(12_000, true)).toEqual({});
  });

  it("ignores the echo of what you typed", () => {
    const tracker = createWatchTracker(quiet);
    tracker.noteInput(1000);
    tracker.feed("l", 1100, false);
    expect(tracker.tick(20_000, true)).toBeNull();
  });

  it("never fires with no output", () => {
    expect(createWatchTracker(quiet).tick(60_000, true)).toBeNull();
  });
});

describe("activity rules", () => {
  it("fires only when you are away", () => {
    const tracker = createWatchTracker(activity);
    expect(tracker.feed("x", 0, false)).toBeNull();
    expect(tracker.feed("x", 1, true)).toEqual({});
    expect(tracker.feed("x", 2, true)).toBeNull();
  });
});
