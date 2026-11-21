import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  webglThrows: false,
  webglDisposed: 0,
  imageDisposed: 0,
  contextLoss: null as null | (() => void),
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    constructor() {
      if (state.webglThrows) throw new Error("no webgl2");
    }
    onContextLoss(cb: () => void) {
      state.contextLoss = cb;
      return { dispose() {} };
    }
    activate() {}
    dispose() {
      state.webglDisposed++;
    }
  },
}));

vi.mock("@xterm/addon-image", () => ({
  ImageAddon: class {
    activate() {}
    dispose() {
      state.imageDisposed++;
    }
  },
}));

import { loadRendererAddons } from "../../../src/frontend/terminal/terminal-renderers";

function fakeTerminal() {
  const loaded: string[] = [];
  return {
    loaded,
    loadAddon: vi.fn((addon: object) => {
      loaded.push(addon.constructor.name);
    }),
  };
}

describe("loadRendererAddons", () => {
  beforeEach(() => {
    state.webglThrows = false;
    state.webglDisposed = 0;
    state.imageDisposed = 0;
    state.contextLoss = null;
  });

  it("loads WebGL and images when both are on", () => {
    const terminal = fakeTerminal();
    const addons = loadRendererAddons(terminal as never, {
      gpuRendering: true,
      inlineImages: true,
    });
    expect(terminal.loadAddon).toHaveBeenCalledTimes(2);
    addons.dispose();
    expect(state.webglDisposed).toBe(1);
    expect(state.imageDisposed).toBe(1);
  });

  it("loads nothing when both are off", () => {
    const terminal = fakeTerminal();
    loadRendererAddons(terminal as never, {
      gpuRendering: false,
      inlineImages: false,
    });
    expect(terminal.loadAddon).not.toHaveBeenCalled();
  });

  it("keeps the DOM renderer when WebGL can't start", () => {
    state.webglThrows = true;
    const terminal = fakeTerminal();
    loadRendererAddons(terminal as never, {
      gpuRendering: true,
      inlineImages: true,
    });
    expect(terminal.loadAddon).toHaveBeenCalledTimes(1);
  });

  it("drops WebGL when its context is lost", () => {
    const terminal = fakeTerminal();
    loadRendererAddons(terminal as never, {
      gpuRendering: true,
      inlineImages: false,
    });
    state.contextLoss?.();
    expect(state.webglDisposed).toBe(1);
  });
});
