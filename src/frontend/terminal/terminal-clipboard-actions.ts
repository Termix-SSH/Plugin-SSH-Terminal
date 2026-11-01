import type { RightClickAction } from "../../shared/terminal-settings";

export type TerminalContextMenuAction =
  "native" | "copy" | "paste" | "app" | "menu";

export function resolveTerminalContextMenuAction({
  rightClickAction,
  copyOnSelect,
  hasSelection,
  mouseTracking = false,
  shiftKey = false,
}: {
  rightClickAction: RightClickAction;
  copyOnSelect: boolean;
  hasSelection: boolean;
  /** The program in the terminal (tmux with mouse on, a TUI) has mouse reporting enabled. */
  mouseTracking?: boolean;
  shiftKey?: boolean;
}): TerminalContextMenuAction {
  // The right button belongs to the program, which opens its own menu; Shift
  // keeps the terminal behavior, as it does for selecting text.
  if (mouseTracking && !shiftKey) return "app";
  // With no program to get past, Shift reaches the other way of working.
  const chosen =
    shiftKey && !mouseTracking
      ? rightClickAction === "menu"
        ? "copyPaste"
        : "menu"
      : rightClickAction;
  if (chosen === "native") return "native";
  if (chosen === "menu") return "menu";
  return hasSelection && !copyOnSelect ? "copy" : "paste";
}

export function selectedTextToCopy({
  copyOnSelect,
  button,
  selection,
}: {
  copyOnSelect: boolean;
  button: number;
  selection: string;
}): string | null {
  return copyOnSelect && button === 0 && selection ? selection : null;
}
