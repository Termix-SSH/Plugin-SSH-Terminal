export type TerminalContextMenuAction = "native" | "copy" | "paste" | "app";

export function resolveTerminalContextMenuAction({
  rightClickCopyPaste,
  copyOnSelect,
  hasSelection,
  mouseTracking = false,
  shiftKey = false,
}: {
  rightClickCopyPaste: boolean;
  copyOnSelect: boolean;
  hasSelection: boolean;
  /** The program in the terminal (tmux with mouse on, a TUI) has mouse reporting enabled. */
  mouseTracking?: boolean;
  shiftKey?: boolean;
}): TerminalContextMenuAction {
  // The right button belongs to the program, which opens its own menu; Shift
  // keeps the terminal behavior, as it does for selecting text.
  if (mouseTracking && !shiftKey) return "app";
  if (!rightClickCopyPaste) return "native";
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
