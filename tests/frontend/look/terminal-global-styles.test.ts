import { describe, expect, it, vi } from "vitest";
import {
  ensureTerminalFontsLoaded,
  installTerminalGlobalStyles,
  repaintTerminal,
} from "../../../src/frontend/look/terminal-global-styles";

describe("installTerminalGlobalStyles", () => {
  it("adds the font faces while the plugin runs and removes them after", () => {
    const dispose = installTerminalGlobalStyles();
    const style = document.head.querySelector(
      "style[data-termix-terminal-styles]",
    );
    expect(style?.innerHTML).toContain("Caskaydia Cove Nerd Font Mono");
    dispose();
    expect(
      document.head.querySelector("style[data-termix-terminal-styles]"),
    ).toBeNull();
  });
});

describe("ensureTerminalFontsLoaded", () => {
  it("requests regular, bold, italic, and bold-italic variants for the given font", () => {
    const load = vi.fn().mockResolvedValue([]);
    const originalFonts = document.fonts;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load },
    });

    try {
      ensureTerminalFontsLoaded("Caskaydia Cove Nerd Font Mono");

      expect(load).toHaveBeenCalledWith(
        '400 16px "Caskaydia Cove Nerd Font Mono"',
      );
      expect(load).toHaveBeenCalledWith(
        '700 16px "Caskaydia Cove Nerd Font Mono"',
      );
      expect(load).toHaveBeenCalledWith(
        'italic 400 16px "Caskaydia Cove Nerd Font Mono"',
      );
      expect(load).toHaveBeenCalledWith(
        'italic 700 16px "Caskaydia Cove Nerd Font Mono"',
      );
      expect(load).toHaveBeenCalledTimes(4);
    } finally {
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: originalFonts,
      });
    }
  });

  it("does not throw when document.fonts is unavailable", () => {
    const originalFonts = document.fonts;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: undefined,
    });

    try {
      expect(() => ensureTerminalFontsLoaded("JetBrains Mono")).not.toThrow();
    } finally {
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: originalFonts,
      });
    }
  });

  it("swallows rejected font load promises", async () => {
    const load = vi.fn().mockRejectedValue(new Error("network error"));
    const originalFonts = document.fonts;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load },
    });

    try {
      expect(() => ensureTerminalFontsLoaded("Fira Code")).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: originalFonts,
      });
    }
  });
});

describe("terminal font loading in Chrome", () => {
  it("resolves only once every face has loaded, even when one fails", async () => {
    const pending: Array<(value: unknown) => void> = [];
    const load = vi.fn(
      () => new Promise((resolve) => pending.push(resolve as never)),
    );
    const originalFonts = document.fonts;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load },
    });
    try {
      let done = false;
      const loaded = ensureTerminalFontsLoaded("Caskaydia Cove Nerd Font Mono");
      void loaded.then(() => (done = true));
      await Promise.resolve();
      expect(done).toBe(false);
      pending.forEach((resolve) => resolve([]));
      await loaded;
      expect(done).toBe(true);

      load.mockImplementation(() => Promise.resolve([]));
      load.mockImplementationOnce(() => Promise.reject(new Error("404")));
      await expect(
        ensureTerminalFontsLoaded("Caskaydia Cove Nerd Font Mono"),
      ).resolves.toBeUndefined();
    } finally {
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: originalFonts,
      });
    }
  });

  it("drops glyphs cached before the font arrived and redraws", () => {
    const terminal = { rows: 24, clearTextureAtlas: vi.fn(), refresh: vi.fn() };
    repaintTerminal(terminal);
    expect(terminal.clearTextureAtlas).toHaveBeenCalledOnce();
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
  });

  it("ignores a terminal that closed before the font arrived", () => {
    const terminal = {
      rows: 24,
      clearTextureAtlas: () => {
        throw new Error("disposed");
      },
      refresh: vi.fn(),
    };
    expect(() => repaintTerminal(terminal)).not.toThrow();
  });
});
