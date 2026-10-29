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
        rightClickCopyPaste: true,
        copyOnSelect: true,
        hasSelection: true,
      }),
    ).toBe("paste");
  });

  it("preserves existing right-click and native-menu behavior", () => {
    expect(
      resolveTerminalContextMenuAction({
        rightClickCopyPaste: true,
        copyOnSelect: false,
        hasSelection: true,
      }),
    ).toBe("copy");
    expect(
      resolveTerminalContextMenuAction({
        rightClickCopyPaste: false,
        copyOnSelect: true,
        hasSelection: true,
      }),
    ).toBe("native");
  });

  it("leaves the right button to a program that reports the mouse", () => {
    for (const rightClickCopyPaste of [true, false]) {
      expect(
        resolveTerminalContextMenuAction({
          rightClickCopyPaste,
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
        rightClickCopyPaste: true,
        copyOnSelect: false,
        hasSelection: false,
        mouseTracking: true,
        shiftKey: true,
      }),
    ).toBe("paste");
    expect(
      resolveTerminalContextMenuAction({
        rightClickCopyPaste: false,
        copyOnSelect: false,
        hasSelection: false,
        mouseTracking: true,
        shiftKey: true,
      }),
    ).toBe("native");
  });
});
