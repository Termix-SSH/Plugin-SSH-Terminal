export type ToolbarPosition = "top" | "bottom";
export type ToolbarLabels = "labeled" | "icons";

/** Which buttons a host shows and in what order, by button id. */
export interface ToolbarButtonLayout {
  order: string[];
  hidden: string[];
}

export interface ToolbarSettings {
  position: ToolbarPosition;
  labels: ToolbarLabels;
  showStatus: boolean;
  buttons: ToolbarButtonLayout;
}

export const DEFAULT_TOOLBAR_SETTINGS: ToolbarSettings = {
  position: "bottom",
  labels: "labeled",
  showStatus: true,
  buttons: { order: [], hidden: [] },
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export function readButtonLayout(value: unknown): ToolbarButtonLayout {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object") return { order: [], hidden: [] };
  const layout = parsed as Partial<Record<keyof ToolbarButtonLayout, unknown>>;
  return { order: stringList(layout.order), hidden: stringList(layout.hidden) };
}

/** The toolbar's host settings, as the host payload carries them. */
export function readToolbarSettings(
  host: object | null | undefined,
): ToolbarSettings {
  const values =
    (
      host as {
        pluginSettings?: Record<string, Record<string, unknown>>;
      } | null
    )?.pluginSettings?.["ssh-terminal"] ?? {};
  return readToolbarValues(values);
}

/** Same as readToolbarSettings, from this plugin's own host values. */
export function readToolbarValues(
  values: Record<string, unknown>,
): ToolbarSettings {
  const position = values.terminalToolbarPosition;
  // Older hosts saved a corner ("top-left") or a display mode instead.
  const labels =
    values.terminalToolbarLabels ??
    (values.terminalToolbarDisplay === "icon" ? "icons" : undefined);
  return {
    position:
      typeof position === "string" && position.startsWith("top")
        ? "top"
        : "bottom",
    labels: labels === "icons" ? "icons" : "labeled",
    showStatus:
      typeof values.terminalToolbarShowStatus === "boolean"
        ? values.terminalToolbarShowStatus
        : DEFAULT_TOOLBAR_SETTINGS.showStatus,
    buttons: readButtonLayout(values.terminalToolbarButtons),
  };
}

/**
 * Orders the available buttons by the saved layout. Buttons the layout has
 * never seen (a plugin installed later) keep their natural place at the end.
 */
export function arrangeButtons<T extends { id: string }>(
  available: T[],
  layout: ToolbarButtonLayout,
): T[] {
  const rank = new Map(layout.order.map((id, index) => [id, index]));
  return available
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rankA = rank.get(a.item.id) ?? layout.order.length + a.index;
      const rankB = rank.get(b.item.id) ?? layout.order.length + b.index;
      return rankA - rankB;
    })
    .map(({ item }) => item);
}

export function visibleButtons<T extends { id: string }>(
  available: T[],
  layout: ToolbarButtonLayout,
): T[] {
  const hidden = new Set(layout.hidden);
  return arrangeButtons(available, layout).filter(
    (item) => !hidden.has(item.id),
  );
}

/**
 * How many buttons fit in the space left, given each button's width. The
 * overflow menu's width is only reserved when something spills into it.
 */
export function countFittingButtons(
  widths: number[],
  available: number,
  overflowWidth: number,
): number {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= available) return widths.length;
  let used = overflowWidth;
  let count = 0;
  for (const width of widths) {
    if (used + width > available) break;
    used += width;
    count += 1;
  }
  return count;
}
