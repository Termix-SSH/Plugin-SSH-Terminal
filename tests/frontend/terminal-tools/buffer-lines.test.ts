import { describe, expect, it } from "vitest";
import {
  linesToText,
  readBufferLines,
} from "../../../src/frontend/terminal-tools/buffer-lines";
import { outputFileName } from "../../../src/frontend/terminal-tools/save-output";

function buffer(rows: Array<{ text: string; isWrapped?: boolean }>) {
  return {
    length: rows.length,
    getLine: (index: number) => {
      const row = rows[index];
      return (
        row && {
          isWrapped: row.isWrapped ?? false,
          translateToString: (trimRight?: boolean) =>
            trimRight ? row.text.trimEnd() : row.text,
        }
      );
    },
  };
}

describe("readBufferLines", () => {
  it("joins wrapped rows and keeps their row range", () => {
    expect(
      readBufferLines(
        buffer([
          { text: "one  " },
          { text: "long " },
          { text: "line  ", isWrapped: true },
          { text: "next" },
        ]),
      ),
    ).toEqual([
      { text: "one", firstRow: 0, lastRow: 0 },
      { text: "long line", firstRow: 1, lastRow: 2 },
      { text: "next", firstRow: 3, lastRow: 3 },
    ]);
  });

  it("keeps spaces at a wrap point", () => {
    expect(
      readBufferLines(
        buffer([{ text: "a " }, { text: "b", isWrapped: true }]),
      )[0].text,
    ).toBe("a b");
  });
});

describe("linesToText", () => {
  it("drops the empty rows at the bottom but keeps gaps", () => {
    const lines = ["a", "", "b", "", " "].map((text, row) => ({
      text,
      firstRow: row,
      lastRow: row,
    }));
    expect(linesToText(lines)).toBe("a\n\nb");
  });

  it("is empty for an empty buffer", () => {
    expect(linesToText([])).toBe("");
  });
});

describe("outputFileName", () => {
  const at = new Date(2026, 10, 1, 9, 5, 7);

  it("names the host, date and time", () => {
    expect(outputFileName("web-01", at)).toBe("web-01-2026-11-01-090507.txt");
  });

  it("makes the host safe to save", () => {
    expect(outputFileName("../my host/é", at)).toBe(
      "my-host-2026-11-01-090507.txt",
    );
    expect(outputFileName("", at)).toBe("terminal-2026-11-01-090507.txt");
  });
});
