import { describe, expect, it } from "vitest";
import {
  applyTerminalPadding,
  MAX_TERMINAL_PADDING,
} from "../../../src/frontend/terminal/terminal-padding";

function term() {
  return { element: document.createElement("div") };
}

describe("applyTerminalPadding", () => {
  it("puts the padding on xterm's element", () => {
    const t = term();
    applyTerminalPadding(t, 12);
    expect(t.element.style.padding).toBe("12px");
  });

  it("clears it at 0 and for bad values", () => {
    const t = term();
    applyTerminalPadding(t, 8);
    applyTerminalPadding(t, 0);
    expect(t.element.style.padding).toBe("");
    applyTerminalPadding(t, "wide");
    expect(t.element.style.padding).toBe("");
  });

  it("keeps it in range", () => {
    const t = term();
    applyTerminalPadding(t, 500);
    expect(t.element.style.padding).toBe(`${MAX_TERMINAL_PADDING}px`);
    applyTerminalPadding(t, -4);
    expect(t.element.style.padding).toBe("");
  });

  it("waits for the terminal to be opened", () => {
    expect(() => applyTerminalPadding({}, 10)).not.toThrow();
  });
});
