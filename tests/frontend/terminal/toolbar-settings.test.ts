import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOLBAR_SETTINGS,
  arrangeButtons,
  countFittingButtons,
  readButtonLayout,
  readToolbarSettings,
  visibleButtons,
} from "../../../src/frontend/terminal/toolbar-settings";

const hostWith = (values: Record<string, unknown>) => ({
  pluginSettings: { "ssh-terminal": values },
});

describe("readToolbarSettings", () => {
  it("falls back to defaults for a host without settings", () => {
    expect(readToolbarSettings({})).toEqual(DEFAULT_TOOLBAR_SETTINGS);
    expect(readToolbarSettings(null)).toEqual(DEFAULT_TOOLBAR_SETTINGS);
  });

  it("reads saved values", () => {
    expect(
      readToolbarSettings(
        hostWith({
          terminalToolbarPosition: "top",
          terminalToolbarLabels: "icons",
          terminalToolbarShowStatus: false,
          terminalToolbarButtons: { order: ["b", "a"], hidden: ["c"] },
        }),
      ),
    ).toEqual({
      position: "top",
      labels: "icons",
      showStatus: false,
      buttons: { order: ["b", "a"], hidden: ["c"] },
    });
  });

  it("maps the older corner positions and display mode", () => {
    const settings = readToolbarSettings(
      hostWith({
        terminalToolbarPosition: "top-left",
        terminalToolbarDisplay: "icon",
      }),
    );
    expect(settings.position).toBe("top");
    expect(settings.labels).toBe("icons");
    expect(
      readToolbarSettings(hostWith({ terminalToolbarPosition: "bottom-right" }))
        .position,
    ).toBe("bottom");
  });

  it("ignores unknown values", () => {
    const settings = readToolbarSettings(
      hostWith({
        terminalToolbarPosition: "middle",
        terminalToolbarLabels: "huge",
        terminalToolbarShowStatus: "no",
        terminalToolbarButtons: "not json",
      }),
    );
    expect(settings).toEqual(DEFAULT_TOOLBAR_SETTINGS);
  });
});

describe("readButtonLayout", () => {
  it("reads a JSON string and drops anything that is not an id", () => {
    expect(
      readButtonLayout(JSON.stringify({ order: ["a", 3, "b"], hidden: null })),
    ).toEqual({ order: ["a", "b"], hidden: [] });
  });
});

describe("button order", () => {
  const items = ["files", "docker", "ai", "image"].map((id) => ({ id }));

  it("keeps the natural order with no layout", () => {
    expect(
      arrangeButtons(items, { order: [], hidden: [] }).map((i) => i.id),
    ).toEqual(["files", "docker", "ai", "image"]);
  });

  it("follows the saved order and puts new buttons at the end", () => {
    expect(
      arrangeButtons(items, { order: ["image", "files"], hidden: [] }).map(
        (i) => i.id,
      ),
    ).toEqual(["image", "files", "docker", "ai"]);
  });

  it("skips saved ids for buttons that are gone", () => {
    expect(
      arrangeButtons(items, { order: ["gone", "ai"], hidden: [] }).map(
        (i) => i.id,
      ),
    ).toEqual(["ai", "files", "docker", "image"]);
  });

  it("leaves hidden buttons out of the strip", () => {
    expect(
      visibleButtons(items, { order: [], hidden: ["docker"] }).map((i) => i.id),
    ).toEqual(["files", "ai", "image"]);
  });
});

describe("countFittingButtons", () => {
  it("fits everything without reserving the overflow button", () => {
    expect(countFittingButtons([30, 30, 30], 90, 30)).toBe(3);
  });

  it("reserves room for the overflow button when something spills", () => {
    expect(countFittingButtons([30, 30, 30], 89, 30)).toBe(1);
    expect(countFittingButtons([30, 30, 30, 30], 100, 30)).toBe(2);
  });

  it("returns zero when only the overflow button fits", () => {
    expect(countFittingButtons([50, 50], 60, 30)).toBe(0);
  });
});
