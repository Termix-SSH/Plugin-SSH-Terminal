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
