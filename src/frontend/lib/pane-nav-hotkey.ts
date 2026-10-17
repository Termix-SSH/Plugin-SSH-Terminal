import { isMacPlatform } from "@termix-ssh/plugin-sdk/ui";

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

/**
 * Core's split pane shortcut: Cmd+Option+Arrow on macOS, where Option+Arrow
 * moves the shell cursor by word, Alt+Arrow elsewhere.
 */
export function isPaneNavHotkey(e: KeyboardEvent): boolean {
  if (!ARROWS.includes(e.code) || e.ctrlKey || e.shiftKey || !e.altKey) {
    return false;
  }
  return e.metaKey === isMacPlatform();
}
