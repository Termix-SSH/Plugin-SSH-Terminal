import { describe, expect, it } from "vitest";
import { terminalWheelAction } from "../../../src/frontend/terminal/terminal-wheel";

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
