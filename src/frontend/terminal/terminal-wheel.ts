import type { TerminalBehavior } from "../../shared/terminal-settings";

type WheelKeys = Pick<
  WheelEvent,
  "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

/** What a wheel event over the terminal does: zoom, fast scroll or a normal scroll. */
export function terminalWheelAction(
  ev: WheelKeys,
  cfg: Pick<TerminalBehavior, "wheelZoom" | "fastScrollModifier">,
): "zoom" | "fast" | "default" {
  if ((ev.ctrlKey || ev.metaKey) && cfg.wheelZoom !== false) return "zoom";
  const mod = cfg.fastScrollModifier;
  const modHeld =
    (mod === "alt" && ev.altKey) ||
    (mod === "ctrl" && ev.ctrlKey) ||
    (mod === "shift" && ev.shiftKey);
  return modHeld ? "fast" : "default";
}

type WheelBuffer = { type: "normal" | "alternate"; baseY: number };

/**
 * A plain wheel on a normal buffer with nothing scrolled off yet. xterm turns
 * that into an arrow key, which walks shell history, so it is dropped. The
 * alternate screen keeps the arrow keys: that is how less and vim scroll.
 */
export function wheelHasNothingToScroll(buffer: WheelBuffer): boolean {
  return buffer.type === "normal" && buffer.baseY === 0;
}

/** Pixels per scrolled line, the same step xterm uses for one wheel line. */
const PIXELS_PER_LINE = 40;

/** A wheel delta in pixels, whatever unit the browser reported it in. */
export function wheelPixels(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * PIXELS_PER_LINE;
  if (deltaMode === 2) return deltaY * PIXELS_PER_LINE * 20;
  return deltaY;
}

/** How many tmux lines a batch of wheel pixels scrolls. */
export function tmuxScrollLines(pixels: number): number {
  return Math.max(1, Math.round(Math.abs(pixels) / PIXELS_PER_LINE)) * 3;
}
