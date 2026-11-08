import { cleanup, render } from "@testing-library/react";
import { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ref: { current: null as HTMLElement | null },
}));
vi.mock("react-xtermjs", () => ({
  useXTerm: () => ({ instance: null, ref: state.ref }),
}));
vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  usePluginApi: () => null,
}));
vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  useAppTheme: () => ({ theme: "dark" }),
  ComponentSlot: () => null,
  Select2: () => null,
}));
vi.mock("../../../src/frontend/terminal-api", () => ({
  getDefaultAppearance: () => new Promise(() => {}),
}));
vi.mock("../../../src/frontend/terminal-tools/TerminalContextMenu", () => ({
  TerminalContextMenu: () => null,
}));

import { LocalTerminal } from "../../../src/frontend/local-terminal/LocalTerminal";

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("local terminal fitting inside its padded pane", () => {
  it.each([300, 301, 400, 600, 601, 800])(
    "keeps every fitted row inside a %dpx pane",
    (height) => {
      const { container } = render(
        <LocalTerminal instanceId="local" isVisible />,
      );
      const style = document.createElement("style");
      style.textContent = "* { box-sizing: border-box } .p-2 { padding: 8px }";
      container.append(style);
      const mount = state.ref.current!;
      const wrapper = mount.parentElement!;
      const element = document.createElement("div");
      element.style.padding = "0px";
      mount.append(element);
      const computed = window.getComputedStyle.bind(window);
      const inset = (node: Element) => {
        const css = computed(node);
        return (
          (parseFloat(css.paddingTop) || 0) +
          (parseFloat(css.paddingBottom) || 0)
        );
      };
      const mountHeight = height - inset(wrapper);
      // jsdom has no layout engine. Supply the mount's border-box dimensions;
      // keep production markup, padding and FitAddon measurement logic real.
      vi.spyOn(window, "getComputedStyle").mockImplementation((node) => {
        const css = computed(node);
        if (node === mount) {
          return new Proxy(css, {
            get(target, property) {
              if (property === "getPropertyValue")
                return (name: string) =>
                  name === "height"
                    ? `${mountHeight}px`
                    : name === "width"
                      ? "900px"
                      : target.getPropertyValue(name);
              return Reflect.get(target, property);
            },
          });
        }
        return css;
      });
      const terminal = {
        element,
        options: { scrollback: 1000 },
        _core: {
          _renderService: {
            dimensions: { css: { cell: { width: 8, height: 16 } } },
          },
        },
      };
      const fit = new FitAddon();
      fit.activate(terminal as unknown as Terminal);
      const dimensions = fit.proposeDimensions()!;
      expect(dimensions.rows * 16 + inset(mount)).toBeLessThanOrEqual(
        mountHeight,
      );
      expect(inset(wrapper) + inset(mount)).toBe(16);
      expect(dimensions.rows).toBe(Math.floor((height - 16) / 16));
    },
  );
});
