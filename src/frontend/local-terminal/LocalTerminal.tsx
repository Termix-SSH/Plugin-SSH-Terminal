import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { useXTerm } from "react-xtermjs";
import { toast } from "sonner";
import { getMacLineNavigationSequence } from "../lib/mac-line-navigation";
import {
  handleTerminalClipboardKeyEvent,
  createTerminalContextMenuHandler,
  createTerminalSelectionMouseUpHandler,
} from "../terminal/terminal-clipboard";
import {
  useAppTheme as useTheme,
  RobustClipboardProvider,
  copyToClipboard,
  readFromClipboard,
  Select2,
  pluginWsUrl,
  ComponentSlot,
} from "@termix-ssh/plugin-sdk/ui";
import { resolveTermixThemeColors } from "../look/terminal-theme";
import {
  DEFAULT_TERMINAL_CONFIG,
  TERMINAL_FONTS,
} from "../look/terminal-themes";
import { ensureTerminalFontsLoaded } from "../look/terminal-global-styles";
import { usePluginApi, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { getDefaultAppearance } from "../terminal-api";
import { resolveTerminalFontFamily } from "../look/terminal-themes";
import {
  TERMINAL_OVERLAY_SLOT,
  type TerminalOverlayProps,
  type TerminalSessionMessage,
} from "../terminal/terminal-slots";
import { createTerminalInputAccess } from "../terminal/terminal-input-access";

export function LocalTerminal({
  instanceId,
  isVisible,
}: {
  instanceId: string;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  // Read via a ref inside the session-lifecycle effect below so a language
  // change (which gives react-i18next a new `t` identity) doesn't tear down
  // the running local shell and spawn a new session.
  const tRef = useRef(t);
  tRef.current = t;
  const { theme: appTheme } = useTheme();
  const api = usePluginApi();
  // The same look as SSH terminals get from the user's host defaults.
  const [appearance, setAppearance] = useState<Awaited<
    ReturnType<typeof getDefaultAppearance>
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDefaultAppearance(api)
      .then((value) => {
        if (!cancelled) setAppearance(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);
  const { instance: terminal, ref: xtermRef } = useXTerm();
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sendFrame = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);
  const sessionReadyRef = useRef(false);
  const sessionListenersRef = useRef(
    new Set<(message: TerminalSessionMessage) => void>(),
  );
  const emitSessionMessage = useCallback((message: TerminalSessionMessage) => {
    for (const listener of sessionListenersRef.current) {
      try {
        listener(message);
      } catch (error) {
        console.error("[local-terminal] overlay listener threw", error);
      }
    }
  }, []);
  const visibleRef = useRef(isVisible);
  visibleRef.current = isVisible;
  const focusFrameRef = useRef<number | null>(null);
  const [isWindows, setIsWindows] = useState(false);
  const [shell, setShell] = useState<"default" | "wsl">("default");

  useEffect(() => {
    window.electronAPI?.getPlatform().then((platform) => {
      setIsWindows(platform === "win32");
    });
  }, []);

  // The same overlay slot as SSH terminals, so plugins that work at the
  // prompt (a command editor) work here too. There is no host and no
  // connection flow: only the shell's own input.
  const overlayProps = useMemo<TerminalOverlayProps>(
    () => ({
      host: undefined,
      subscribe: (listener) => {
        sessionListenersRef.current.add(listener);
        return () => {
          sessionListenersRef.current.delete(listener);
        };
      },
      holdConnectTimeout: () => {},
      fail: (message) => terminal?.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`),
      disconnect: () => socketRef.current?.close(),
      send: (type, data) => sendFrame({ type, data }),
      connectPayload: () => ({}),
      input: createTerminalInputAccess(terminal),
    }),
    [sendFrame, terminal],
  );

  const fit = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    fitAddon.fit();
    sendFrame({ type: "resize", cols: terminal.cols, rows: terminal.rows });
  }, [sendFrame, terminal]);

  const focusWhenReady = useCallback(() => {
    if (!terminal || !sessionReadyRef.current || !visibleRef.current) return;
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
    }
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      if (!sessionReadyRef.current || !visibleRef.current) return;
      fit();
      terminal.focus();
    });
  }, [fit, terminal]);

  useEffect(() => {
    if (!terminal) return;
    if (!appearance) {
      const font = TERMINAL_FONTS.find(
        (item) => item.value === DEFAULT_TERMINAL_CONFIG.fontFamily,
      );
      ensureTerminalFontsLoaded(font?.value ?? TERMINAL_FONTS[0].value);
      terminal.options.theme = resolveTermixThemeColors("termix", appTheme);
      terminal.options.fontFamily =
        font?.fallback ?? TERMINAL_FONTS[0].fallback;
      terminal.options.fontSize = DEFAULT_TERMINAL_CONFIG.fontSize;
      return;
    }
    ensureTerminalFontsLoaded(appearance.fontFamily || TERMINAL_FONTS[0].value);
    terminal.options.theme = resolveTermixThemeColors(
      appearance.theme,
      appTheme,
      appearance.customThemeColors,
    );
    terminal.options.fontFamily = resolveTerminalFontFamily(
      appearance.fontFamily,
    );
    terminal.options.fontSize = appearance.fontSize;
    terminal.options.cursorBlink = appearance.cursorBlink;
    terminal.options.cursorStyle = appearance.cursorStyle;
    terminal.options.scrollback = appearance.scrollback;
    terminal.options.letterSpacing = appearance.letterSpacing;
    terminal.options.lineHeight = appearance.lineHeight;
    terminal.options.minimumContrastRatio = appearance.minimumContrastRatio;
    fit();
  }, [appTheme, appearance, fit, terminal]);

  useEffect(() => {
    if (!terminal || !window.electronAPI?.isElectron) return;
    const fitAddon = new FitAddon();
    const clipboardProvider = new RobustClipboardProvider();
    const clipboardAddon = new ClipboardAddon(undefined, clipboardProvider);
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(clipboardAddon);
    fitAddon.fit();

    async function writeTextToClipboard(text: string): Promise<boolean> {
      const ok = await copyToClipboard(text);
      if (!ok) toast.error(tRef.current("terminal.clipboardWriteFailed"));
      return ok;
    }

    async function readTextFromClipboard(): Promise<string> {
      const text = await readFromClipboard();
      if (!text) toast.error(tRef.current("terminal.clipboardReadFailed"));
      return text;
    }

    const clipboardActions = { writeTextToClipboard, readTextFromClipboard };

    terminal.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
      if (e.type !== "keydown") return true;
      const sequence = getMacLineNavigationSequence(e);
      if (sequence) {
        e.preventDefault();
        e.stopPropagation();
        terminal.input(sequence, true);
        return false;
      }
      // No native "paste" event listener here (unlike the SSH terminal), so
      // plain Ctrl/Cmd+V reads the clipboard explicitly rather than relying
      // on the browser's own paste event.
      return handleTerminalClipboardKeyEvent(e, terminal, clipboardActions, {
        plainPasteMode: "explicit",
      });
    });

    const handleContextMenu = createTerminalContextMenuHandler(
      terminal,
      clipboardActions,
    );
    const element = xtermRef.current;
    element?.addEventListener("contextmenu", handleContextMenu);
    const handleSelectionMouseUp = createTerminalSelectionMouseUpHandler(
      terminal,
      clipboardActions,
    );
    element?.addEventListener("mouseup", handleSelectionMouseUp);

    let disposed = false;
    sessionReadyRef.current = false;
    const input = terminal.onData((data) => {
      sendFrame({ type: "input", data });
    });

    const query = new URLSearchParams({
      cols: String(terminal.cols),
      rows: String(terminal.rows),
      shell,
    });
    pluginWsUrl("ssh-terminal", `/local-terminal?${query}`, {
      origin: "local",
    })
      .then((target) => {
        if (disposed) return;
        if (!target) throw new Error("The local backend is not reachable");
        const socket = new WebSocket(target.url, target.protocols);
        socketRef.current = socket;
        socket.onmessage = (event) => {
          let frame: Record<string, unknown>;
          try {
            frame = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (frame.type === "data" && typeof frame.data === "string") {
            terminal.write(frame.data);
          } else if (frame.type === "exit") {
            emitSessionMessage({ type: "session_closed" });
            terminal.write(
              `

[33mProcess exited (${String(frame.exitCode)})[0m

`,
            );
          } else if (frame.type === "error") {
            terminal.write(`

[31m${String(frame.message)}[0m

`);
          } else if (frame.type === "started") {
            sendFrame({ type: "ready" });
            sessionReadyRef.current = true;
            focusWhenReady();
          }
        };
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        terminal.write(`

[31m${message}[0m

`);
      });

    const observer = new ResizeObserver(() => fit());
    if (xtermRef.current) observer.observe(xtermRef.current);
    return () => {
      disposed = true;
      sessionReadyRef.current = false;
      if (focusFrameRef.current !== null) {
        cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }
      terminal.attachCustomKeyEventHandler(() => true);
      observer.disconnect();
      input.dispose();
      element?.removeEventListener("contextmenu", handleContextMenu);
      element?.removeEventListener("mouseup", handleSelectionMouseUp);
      clipboardProvider.dispose();
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      fitAddonRef.current = null;
      fitAddon.dispose();
    };
  }, [
    emitSessionMessage,
    fit,
    focusWhenReady,
    instanceId,
    sendFrame,
    shell,
    terminal,
    xtermRef,
  ]);

  useEffect(() => {
    if (!isVisible) return;
    focusWhenReady();
  }, [focusWhenReady, isVisible]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {isWindows && (
        <div className="flex justify-end border-b border-border px-2 py-1">
          <Select2
            aria-label={t("terminal.localShell")}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={shell}
            onChange={(event) =>
              setShell(event.target.value === "wsl" ? "wsl" : "default")
            }
          >
            <option value="default">PowerShell</option>
            <option value="wsl">WSL</option>
          </Select2>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={xtermRef} className="h-full w-full p-2" />
        <ComponentSlot
          slotId={TERMINAL_OVERLAY_SLOT}
          when={{ host: undefined }}
          props={overlayProps as unknown as Record<string, unknown>}
        />
      </div>
    </div>
  );
}
