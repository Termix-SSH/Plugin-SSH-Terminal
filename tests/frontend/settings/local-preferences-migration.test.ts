import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const preferences = vi.hoisted(() => ({}) as Record<string, string>);

vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getClientPreference: (name: string) => preferences[name],
  setClientPreference: (name: string, value: string) => {
    preferences[name] = value;
  },
}));

import {
  moveClipboardPreferences,
  moveLocalTerminalPreferences,
} from "../../../src/frontend/settings/local-preferences-migration";
import { resetTerminalClientSettings } from "../../../src/frontend/terminal-settings";

function api(user: Record<string, unknown>) {
  return {
    get: vi.fn(async () => ({ data: { user } })),
    put: vi.fn(async () => ({ data: {} })),
  };
}

beforeEach(() => {
  localStorage.clear();
  for (const key of Object.keys(preferences)) delete preferences[key];
  resetTerminalClientSettings();
});

afterEach(() => resetTerminalClientSettings());

describe("moveClipboardPreferences", () => {
  const defaults = {
    rightClickAction: "copyPaste",
    ctrlVPaste: true,
    copyOnSelect: false,
  };

  it("moves the old cookies to the account once", async () => {
    preferences.rightClickCopyPaste = "false";
    preferences.ctrlVPaste = "false";
    preferences.copyOnSelect = "true";
    const client = api(defaults);

    await moveClipboardPreferences({ api: client as never });

    expect(client.put).toHaveBeenCalledWith("/user-settings", {
      rightClickAction: "native",
      ctrlVPaste: false,
      copyOnSelect: true,
    });
    await moveClipboardPreferences({ api: client as never });
    expect(client.put).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a choice already made on the account", async () => {
    preferences.rightClickCopyPaste = "false";
    const client = api({ ...defaults, rightClickAction: "menu" });
    await moveClipboardPreferences({ api: client as never });
    expect(client.put).not.toHaveBeenCalled();
    expect(preferences.terminalClipboardMoved).toBe("true");
  });

  it("sends nothing when the browser kept the defaults", async () => {
    preferences.rightClickCopyPaste = "true";
    const client = api(defaults);
    await moveClipboardPreferences({ api: client as never });
    expect(client.put).not.toHaveBeenCalled();
  });

  it("tries again next time when saving fails", async () => {
    preferences.copyOnSelect = "true";
    const client = api(defaults);
    client.put.mockRejectedValueOnce(new Error("offline"));
    await moveClipboardPreferences({ api: client as never });
    expect(preferences.terminalClipboardMoved).toBeUndefined();
  });
});

describe("moveLocalTerminalPreferences", () => {
  it("does nothing when the browser kept nothing", async () => {
    const client = api({});
    await moveLocalTerminalPreferences({ api: client as never });
    expect(client.get).not.toHaveBeenCalled();
  });

  it("moves the browser's values into settings still at their default, once", async () => {
    localStorage.setItem("commandAutocomplete", "true");
    const client = api({ commandAutocomplete: false });

    await moveLocalTerminalPreferences({ api: client as never });

    expect(client.put).toHaveBeenCalledWith("/user-settings", {
      commandAutocomplete: true,
    });
    expect(localStorage.getItem("commandAutocomplete")).toBeNull();
  });

  it("keeps a value the user already changed on the server", async () => {
    localStorage.setItem("commandAutocomplete", "false");
    const client = api({ commandAutocomplete: true });
    await moveLocalTerminalPreferences({ api: client as never });
    expect(client.put).not.toHaveBeenCalled();
    expect(localStorage.getItem("commandAutocomplete")).toBeNull();
  });

  it("keeps the browser values for next time when the server is unreachable", async () => {
    localStorage.setItem("commandAutocomplete", "true");
    const client = {
      get: vi.fn(async () => {
        throw new Error("offline");
      }),
      put: vi.fn(),
    };
    await moveLocalTerminalPreferences({ api: client as never });
    expect(localStorage.getItem("commandAutocomplete")).toBe("true");
  });
});
