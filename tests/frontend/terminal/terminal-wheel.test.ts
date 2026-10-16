import { describe, expect, it } from "vitest";
import {
  terminalWheelAction,
  tmuxScrollLines,
  wheelHasNothingToScroll,
  wheelPixels,
} from "../../../src/frontend/terminal/terminal-wheel";

const keys = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe("terminalWheelAction", () => {
  it("zooms with Ctrl or Cmd unless wheel zoom is off", () => {
    const cfg = { wheelZoom: true, fastScrollModifier: "alt" } as const;
    expect(terminalWheelAction({ ...keys, metaKey: true }, cfg)).toBe("zoom");
    expect(terminalWheelAction({ ...keys, ctrlKey: true }, cfg)).toBe("zoom");
    expect(
      terminalWheelAction(
        { ...keys, metaKey: true },
        { ...cfg, wheelZoom: false },
      ),
    ).toBe("default");
  });

  it("fast scrolls with the chosen modifier", () => {
    expect(
      terminalWheelAction(
        { ...keys, ctrlKey: true },
        { wheelZoom: false, fastScrollModifier: "ctrl" },
      ),
    ).toBe("fast");
    expect(
      terminalWheelAction(
        { ...keys, altKey: true },
        { wheelZoom: true, fastScrollModifier: "alt" },
      ),
    ).toBe("fast");
    expect(
      terminalWheelAction(keys, { wheelZoom: true, fastScrollModifier: "alt" }),
    ).toBe("default");
  });
});

describe("wheelHasNothingToScroll", () => {
  it("drops the wheel on a normal buffer with no scrollback yet", () => {
    expect(wheelHasNothingToScroll({ type: "normal", baseY: 0 })).toBe(true);
    expect(wheelHasNothingToScroll({ type: "normal", baseY: 12 })).toBe(false);
  });

  it("leaves the alternate screen alone so less and vim still scroll", () => {
    expect(wheelHasNothingToScroll({ type: "alternate", baseY: 0 })).toBe(
      false,
    );
  });
});

describe("tmux wheel scrolling", () => {
  it("turns line and page deltas into pixels", () => {
    expect(wheelPixels(100, 0)).toBe(100);
    expect(wheelPixels(3, 1)).toBe(120);
    expect(wheelPixels(1, 2)).toBe(800);
  });

  it("scrolls at least one step per batch", () => {
    expect(tmuxScrollLines(-5)).toBe(3);
    expect(tmuxScrollLines(-120)).toBe(9);
  });
});
