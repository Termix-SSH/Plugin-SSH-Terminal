import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOST_TERMINAL_SETTINGS,
  hostSettingsFromTerminalConfig,
  readHostTerminalSettings,
  readUserSettings,
  resolveTerminalSettings,
} from "../../src/shared/terminal-settings";

describe("hostSettingsFromTerminalConfig", () => {
  it("keeps behavior and drops what is not a terminal setting", () => {
    expect(
      hostSettingsFromTerminalConfig({
        autoMosh: true,
        fastScrollModifier: "ctrl",
        keepaliveInterval: 5,
      }),
    ).toEqual({ autoMosh: true, fastScrollModifier: "ctrl" });
  });

  it("drops values a select field would refuse", () => {
    expect(
      hostSettingsFromTerminalConfig({ bellStyle: "loud", cursorStyle: "bar" }),
    ).toEqual({ cursorStyle: "bar" });
  });

  it("reads nothing from garbage", () => {
    expect(hostSettingsFromTerminalConfig("{")).toEqual({});
  });
});

describe("resolveTerminalSettings", () => {
  it("runs with the host's values, which already follow its defaults", () => {
    const host = readHostTerminalSettings({ fontSize: 30, autoTmux: true });
    const resolved = resolveTerminalSettings(host);
    expect(resolved.fontSize).toBe(30);
    expect(resolved.autoTmux).toBe(true);
  });

  it("defaults echo and link clicks to concrete modes", () => {
    const resolved = resolveTerminalSettings(readHostTerminalSettings({}));
    expect(resolved.localEcho).toBe("auto");
    expect(resolved.linkClickBehavior).toBe("confirm");
  });

  it("falls back to the built-in defaults", () => {
    expect(resolveTerminalSettings(null).theme).toBe(
      DEFAULT_HOST_TERMINAL_SETTINGS.theme,
    );
  });
});

describe("readUserSettings", () => {
  it("types what it reads and drops broken saved themes", () => {
    expect(
      readUserSettings({
        customThemes: [{ id: "a", name: "A", colors: {} }, { id: 1 }],
        commandAutocomplete: "yes",
      }),
    ).toEqual({
      customThemes: [{ id: "a", name: "A", colors: {} }],
      commandAutocomplete: false,
    });
  });
});
