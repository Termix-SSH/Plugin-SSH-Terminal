import type { IDisposable, Terminal } from "@xterm/xterm";
import { ImageAddon } from "@xterm/addon-image";
import { WebglAddon } from "@xterm/addon-webgl";

export interface RendererOptions {
  gpuRendering: boolean;
  inlineImages: boolean;
}

// Caps so one big picture can't eat the tab's memory.
const IMAGE_OPTIONS = {
  pixelLimit: 4096 * 4096,
  storageLimit: 64,
  sixelSizeLimit: 25_000_000,
  iipSizeLimit: 20_000_000,
};

/**
 * Loads the WebGL renderer and the image addon after terminal.open(). WebGL
 * falls back to the DOM renderer when it can't start or loses its context.
 */
export function loadRendererAddons(
  terminal: Terminal,
  options: RendererOptions,
): IDisposable {
  const loaded: IDisposable[] = [];

  if (options.gpuRendering) {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
      loaded.push(webgl);
    } catch {
      // DOM renderer stays in place.
    }
  }

  if (options.inlineImages) {
    try {
      const images = new ImageAddon(IMAGE_OPTIONS);
      terminal.loadAddon(images);
      loaded.push(images);
    } catch {
      // Images just don't show.
    }
  }

  return {
    dispose: () => {
      for (const addon of loaded.splice(0)) {
        try {
          addon.dispose();
        } catch {
          // Already gone with the terminal.
        }
      }
    },
  };
}
