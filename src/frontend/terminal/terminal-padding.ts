/** Largest padding the settings offer, in px. */
export const MAX_TERMINAL_PADDING = 32;

/**
 * Puts space around the terminal text. The padding goes on xterm's own
 * element, which the fit addon subtracts, so the grid still fits the tab.
 */
export function applyTerminalPadding(
  terminal: { element?: HTMLElement },
  padding: unknown,
): void {
  if (!terminal.element) return;
  const value =
    typeof padding === "number" && Number.isFinite(padding)
      ? Math.min(Math.max(Math.round(padding), 0), MAX_TERMINAL_PADDING)
      : 0;
  terminal.element.style.padding = value > 0 ? `${value}px` : "";
}
