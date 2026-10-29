import { describe, expect, it } from "vitest";
import { stripTerminalQueries } from "../../src/backend/terminal-queries.js";

const ESC = "\x1b";

describe("stripTerminalQueries", () => {
  it("drops device attribute and cursor position queries", () => {
    expect(
      stripTerminalQueries(`a${ESC}[cb${ESC}[>c${ESC}[0c${ESC}[6n${ESC}[?6nd`),
    ).toBe("abd");
  });

  it("drops color, version and capability queries", () => {
    expect(
      stripTerminalQueries(
        `x${ESC}]11;?\x07${ESC}]10;?${ESC}\\${ESC}[>q${ESC}P+q544e${ESC}\\${ESC}[?2004$p${ESC}[?uy`,
      ),
    ).toBe("xy");
  });

  it("keeps what draws on screen", () => {
    const drawing = `${ESC}[31mred${ESC}[0m ${ESC}[2J${ESC}[H${ESC}[?25l${ESC}[8;24;80t`;
    expect(stripTerminalQueries(drawing)).toBe(drawing);
  });

  it("passes empty values through", () => {
    expect(stripTerminalQueries("")).toBe("");
    expect(stripTerminalQueries(null)).toBeNull();
  });
});
