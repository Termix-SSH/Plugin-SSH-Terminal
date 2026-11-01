import { describe, expect, it } from "vitest";
import {
  buildLineMatcher,
  MAX_FIND_RESULTS,
  searchTerminals,
} from "../../../../src/frontend/terminal-tools/find-all/buffer-search";

const options = { caseSensitive: false, wholeWord: false, regex: false };
const line = (text: string, row: number) => ({
  text,
  firstRow: row,
  lastRow: row,
});

describe("buildLineMatcher", () => {
  it("needs a query", () => {
    expect(buildLineMatcher("", options)).toBeNull();
  });

  it("treats the query as text unless regex is on", () => {
    expect(buildLineMatcher("a.c", options)?.("abc")).toBe(false);
    expect(buildLineMatcher("a.c", options)?.("a.c")).toBe(true);
    expect(buildLineMatcher("a.c", { ...options, regex: true })?.("abc")).toBe(
      true,
    );
  });

  it("answers null for a bad regex", () => {
    expect(buildLineMatcher("(", { ...options, regex: true })).toBeNull();
  });

  it("follows the case and whole word options", () => {
    expect(buildLineMatcher("ERR", options)?.("err")).toBe(true);
    expect(
      buildLineMatcher("ERR", { ...options, caseSensitive: true })?.("err"),
    ).toBe(false);
    expect(
      buildLineMatcher("err", { ...options, wholeWord: true })?.("error"),
    ).toBe(false);
    expect(
      buildLineMatcher("err", { ...options, wholeWord: true })?.("an err!"),
    ).toBe(true);
  });
});

describe("searchTerminals", () => {
  it("returns matches from each terminal with their rows", async () => {
    const { results, capped } = await searchTerminals(
      [
        { id: "a", lines: () => [line("nope", 0), line("hit one", 1)] },
        {
          id: "b",
          lines: () => [{ text: "  hit two", firstRow: 4, lastRow: 6 }],
        },
      ],
      (text) => text.includes("hit"),
    );
    expect(capped).toBe(false);
    expect(results).toEqual([
      { sessionId: "a", firstRow: 1, lastRow: 1, text: "hit one" },
      { sessionId: "b", firstRow: 4, lastRow: 6, text: "hit two" },
    ]);
  });

  it("stops at the result cap", async () => {
    const lines = Array.from({ length: MAX_FIND_RESULTS + 5 }, (_, row) =>
      line("hit", row),
    );
    const { results, capped } = await searchTerminals(
      [{ id: "a", lines: () => lines }],
      () => true,
    );
    expect(results).toHaveLength(MAX_FIND_RESULTS);
    expect(capped).toBe(true);
  });

  it("stops early when cancelled between batches", async () => {
    const lines = Array.from({ length: 5000 }, (_, row) => line("x", row));
    const { results } = await searchTerminals(
      [{ id: "a", lines: () => lines }],
      () => false,
      () => true,
    );
    expect(results).toEqual([]);
  });
});
