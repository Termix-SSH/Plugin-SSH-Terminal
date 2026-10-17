import { afterEach, describe, expect, it, vi } from "vitest";
import { isPaneNavHotkey } from "../../../src/frontend/lib/pane-nav-hotkey";

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    code: "ArrowLeft",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  } as KeyboardEvent;
}

afterEach(() => vi.unstubAllGlobals());

describe("isPaneNavHotkey", () => {
  it("leaves Option+Arrow to the shell on macOS", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(isPaneNavHotkey(keyEvent({ altKey: true }))).toBe(false);
    expect(isPaneNavHotkey(keyEvent({ altKey: true, metaKey: true }))).toBe(
      true,
    );
  });

  it("uses Alt+Arrow elsewhere", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    expect(isPaneNavHotkey(keyEvent({ code: "ArrowUp", altKey: true }))).toBe(
      true,
    );
    expect(isPaneNavHotkey(keyEvent({ altKey: true, metaKey: true }))).toBe(
      false,
    );
    expect(isPaneNavHotkey(keyEvent({ code: "KeyB", altKey: true }))).toBe(
      false,
    );
  });
});
