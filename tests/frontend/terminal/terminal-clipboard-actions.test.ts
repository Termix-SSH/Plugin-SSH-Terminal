import { describe, expect, it } from "vitest";
import {
  resolveTerminalContextMenuAction,
  selectedTextToCopy,
} from "../../../src/frontend/terminal/terminal-clipboard-actions";

describe("terminal clipboard actions", () => {
  it("copies a completed left-button selection when enabled", () => {
    expect(
      selectedTextToCopy({
        copyOnSelect: true,
        button: 0,
        selection: "selected output",
      }),
    ).toBe("selected output");
    expect(
      selectedTextToCopy({ copyOnSelect: false, button: 0, selection: "x" }),
    ).toBeNull();
  });

  it("pastes on right-click after copy-on-select", () => {
    expect(
      resolveTerminalContextMenuAction({
        rightClickAction: "copyPaste",
        copyOnSelect: true,
        hasSelection: true,
      }),
    ).toBe("paste");
  });

  it("preserves existing right-click and native-menu behavior", () => {
    expect(
      resolveTerminalContextMenuAction({
        rightClickAction: "copyPaste",
        copyOnSelect: false,
        hasSelection: true,
      }),
    ).toBe("copy");
    expect(
      resolveTerminalContextMenuAction({
        rightClickAction: "native",
        copyOnSelect: true,
        hasSelection: true,
      }),
    ).toBe("native");
  });

  it("leaves the right button to a program that reports the mouse", () => {
    for (const rightClickAction of ["copyPaste", "menu", "native"] as const) {
      expect(
        resolveTerminalContextMenuAction({
          rightClickAction,
          copyOnSelect: false,
          hasSelection: false,
          mouseTracking: true,
        }),
      ).toBe("app");
    }
  });

  it("keeps the terminal behavior with Shift while the mouse is reported", () => {
    expect(
      resolveTerminalContextMenuAction({
        rightClickAction: "copyPaste",
        copyOnSelect: false,
        hasSelection: false,
        mouseTracking: true,
        shiftKey: true,
      }),
    ).toBe("paste");
    expect(
      resolveTerminalContextMenuAction({
        rightClickAction: "native",
        copyOnSelect: false,
        hasSelection: false,
        mouseTracking: true,
        shiftKey: true,
      }),
    ).toBe("native");
  });

  it("opens the menu when the setting asks for it", () => {
    expect(
      resolveTerminalContextMenuAction({
        rightClickAction: "menu",
        copyOnSelect: false,
        hasSelection: true,
      }),
    ).toBe("menu");
  });

  it("uses Shift to reach the other way of working", () => {
    const shifted = (rightClickAction: "copyPaste" | "menu" | "native") =>
      resolveTerminalContextMenuAction({
        rightClickAction,
        copyOnSelect: false,
        hasSelection: false,
        shiftKey: true,
      });
    expect(shifted("copyPaste")).toBe("menu");
    expect(shifted("native")).toBe("menu");
    expect(shifted("menu")).toBe("paste");
  });

  it("runs the chosen action with Shift while the mouse is reported", () => {
    expect(
      resolveTerminalContextMenuAction({
        rightClickAction: "menu",
        copyOnSelect: false,
        hasSelection: false,
        mouseTracking: true,
        shiftKey: true,
      }),
    ).toBe("menu");
  });
});
