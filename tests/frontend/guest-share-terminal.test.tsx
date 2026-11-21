import { afterEach, describe, expect, it } from "vitest";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import { guestQuery } from "../../src/frontend/terminal/GuestShareTerminal";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;
let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

describe("guest pages", () => {
  it("register nothing but the shared terminal part", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales, guest: true });
    expect(rendered.registered.tabs()).toEqual([]);
    expect(rendered.registered.panels()).toEqual([]);
    expect(rendered.registered.actions()).toEqual([]);
  });

  it("pass only a guest's own tokens to the socket", () => {
    expect(guestQuery("shareToken=abc")).toBe("shareToken=abc");
    expect(guestQuery("?roomGuestToken=r1")).toBe("roomGuestToken=r1");
    expect(guestQuery("shareToken=abc&hostId=1&token=x")).toBe(
      "shareToken=abc",
    );
    expect(guestQuery("hostId=1")).toBeNull();
    expect(guestQuery("")).toBeNull();
  });
});
