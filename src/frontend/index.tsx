// The terminal surfaces need xterm's own stylesheet.
import "@xterm/xterm/css/xterm.css";
import { lazy, Suspense, type ComponentType } from "react";
import { toast } from "sonner";
import {
  Braces,
  Copy,
  History,
  Laptop,
  SquareTerminal,
  Terminal,
} from "lucide-react";
import type {
  PanelProps,
  PluginHostRecord,
  PluginTabRecord,
  StandaloneViewProps,
  TabProps,
  TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { isElectron } from "@termix-ssh/plugin-sdk/ui";
import { loadTerminal } from "./terminal/TerminalTabContent";
import TerminalApp from "./terminal/TerminalApp";
import {
  TERMINAL_OVERLAY_SLOT,
  TERMINAL_SIDE_PANEL_SLOT,
  TERMINAL_TOOLBAR_SLOT,
  TERMINAL_TOOLBAR_STATUS_SLOT,
} from "./terminal/terminal-slots";
import { TerminalTabWithRegistry } from "./TerminalTabWithRegistry";
import {
  getActiveSessionId,
  getSessionHandle,
  getSessionInfo,
  listSessions,
  sendToActive,
  sendToSession,
} from "./session-registry";
import { TerminalView } from "./TerminalView";
import { HistoryPanel } from "./history/HistoryPanel";
import { TouchInputSettings } from "./settings/TouchInputSettings";
import { ImageStorageTest } from "./settings/ImageStorageTest";
import { HostTerminalSection } from "./settings/HostTerminalSection";
import { resetTouchInputSettingsCache } from "./terminal/touch-input-settings-store";
import { hostSetting } from "./terminal-api";
import { readPanelSettings } from "./terminal/panel-settings";
import {
  resetBroadcastStore,
  toggleBroadcast,
} from "./terminal-tools/broadcast/broadcast-store";
import { buildToolEntries } from "./terminal-tools/ToolsMenu";
import {
  resetWatchStore,
  setWatchAlertSender,
} from "./terminal-tools/watch/watch-store";
import { TabBarToolsButton } from "./terminal-tools/TabBarToolsButton";
import { MacrosPanel } from "./macros/MacrosPanel";
import {
  TERMINAL_KEYBINDING_DEFAULTS,
  validateSendControlCode,
  validateSendText,
} from "./lib/keybinding-dispatch";
import {
  PasteNote,
  SendControlCodeEditor,
  SendTextEditor,
} from "./lib/keybinding-editors";
import { TerminalPreview } from "./look/TerminalPreview";
import { installTerminalGlobalStyles } from "./look/terminal-global-styles";
import {
  listTerminalThemes,
  resolveTerminalLook,
  type ResolveLookRequest,
} from "./look/look-actions";
import {
  invalidateTerminalClientSettings,
  loadTerminalClientSettings,
  resetTerminalClientSettings,
} from "./terminal-settings";
import {
  moveClipboardPreferences,
  moveLocalTerminalPreferences,
} from "./settings/local-preferences-migration";

const LocalTerminal = lazy(() =>
  import("./local-terminal/LocalTerminal").then((m) => ({
    default: m.LocalTerminal,
  })),
);

interface TerminalOpenOptions {
  /** Exact tmux session name to attach to in the newly opened tab. */
  tmuxSession?: string;
  path?: string;
  joinSharedSessionId?: string;
  joinShareId?: string;
  label?: string;
}

/** `?view=terminal` full-screen links. */
function TerminalStandalone({ hostId, params }: StandaloneViewProps) {
  return (
    <TerminalApp
      hostId={hostId}
      tmuxSession={params.get("tmuxSession") ?? undefined}
    />
  );
}

/** The desktop app's own shell, one tab per open. */
function LocalTerminalTab({ tab, isVisible }: TabProps) {
  return (
    <Suspense fallback={null}>
      <LocalTerminal
        instanceId={(tab.instanceId as string | undefined) ?? tab.id}
        isVisible={isVisible}
      />
    </Suspense>
  );
}

/**
 * The SSH terminal: its tab, the desktop app's local terminal, the command
 * history panel and the places other plugins can plug into a session.
 */
export function activate(app: TermixApp): void {
  app.onDispose(installTerminalGlobalStyles());
  app.registerTab(
    "terminal",
    TerminalTabWithRegistry as unknown as ComponentType<TabProps>,
    {
      icon: Terminal,
      titleKey: "nav.terminal",
      persistent: true,
      session: true,
      commandTarget: true,
      ownBackground: true,
      restore: (host) => !!host.enableSsh,
      activityTypes: ["terminal"],
      standalone: TerminalStandalone,
      preload: loadTerminal,
    },
  );

  app.registerAction(
    "terminal.duplicateTab",
    ((_handle: unknown, tab?: PluginTabRecord) => {
      if (tab?.type === "terminal" && tab.host) {
        app.tabs.openTab(tab.host, "terminal", { forceNewTab: true });
      }
    }) as never,
    { permission: "use" },
  );
  app.registerSlotContribution("tab.menu", {
    actionId: "terminal.duplicateTab",
    titleKey: "terminal.duplicateTab",
    icon: Copy,
    kind: "button",
    when: ({ tab }) => {
      const target = tab as PluginTabRecord | undefined;
      return target?.type === "terminal" && !!target.host;
    },
  });

  // The tools in the tab bar, beside split view (Classic Layout 1.1.1+).
  app.registerSlotContribution("tabbar.actions", {
    actionId: "terminal.tools",
    titleKey: "terminalToolbar.tools",
    kind: "component",
    component: TabBarToolsButton as unknown as ComponentType<
      Record<string, unknown>
    >,
  });

  // The terminal's tools in the command palette, on the active terminal.
  const toolsFor = (sessionId: string) => {
    const session = getSessionInfo(sessionId);
    return buildToolEntries(app.t, {
      sessionId,
      hostName: session?.hostName || session?.ip || "",
      handle: () => getSessionHandle(sessionId),
    });
  };
  app.registerPaletteGroup({
    id: "terminal-tools",
    titleKey: "terminalToolbar.tools",
    order: 20,
    load: () =>
      toolsFor("palette")
        .filter((entry) => entry.group !== "keys")
        .map((entry) => ({
          id: entry.key,
          title: entry.label,
          icon: entry.icon,
          needsTarget: true,
          run: ({ targetTab }) => {
            if (!targetTab) return;
            toolsFor(targetTab.id)
              .find((tool) => tool.key === entry.key)
              ?.run();
          },
        })),
  });

  app.registerHostAction({
    id: "terminal",
    titleKey: "nav.terminal",
    icon: Terminal,
    kind: "connect",
    priority: 100,
    order: 10,
    tabType: "terminal",
    copyUrlView: "terminal",
    when: (host) =>
      !!host.enableSsh && hostSetting(host, "enableTerminal", true),
  });

  app.registerCompanionLayout("terminal", (host) => {
    const panels = readPanelSettings(host);
    return {
      enabled: panels.enabled,
      side: panels.side,
      order: panels.buttons.order,
      hidden: panels.buttons.hidden,
    };
  });

  app.registerHostEditorSection({
    id: "terminal",
    group: "ssh",
    titleKey: "hosts.tabTerminal",
    icon: SquareTerminal,
    order: 10,
    defaults: true,
    component: HostTerminalSection,
  });

  if (isElectron()) {
    app.registerTab("local-terminal", LocalTerminalTab, {
      icon: Laptop,
      titleKey: "nav.localTerminal",
      hostless: true,
      session: true,
      ownBackground: true,
      multiInstance: true,
      inLayouts: false,
    });
    app.registerKeybindingAction({
      id: "openLocalTerminal",
      titleKey: "keybindings.openLocalTerminal",
      scope: "global",
      run: () => app.tabs.openSingletonTab("local-terminal"),
    });
    app.registerRailItem({
      id: "local-terminal",
      icon: Laptop,
      titleKey: "nav.localTerminal",
      kind: "tab",
      electronOnly: true,
      hideable: true,
      separatorAfter: true,
    });
    app.registerPaletteEntry({
      id: "local-terminal",
      titleKey: "palette.localTerminal",
      icon: Laptop,
      keywords: ["local", "shell", "terminal"],
      scope: "global",
      run: (shell) => shell.openSingletonTab("local-terminal"),
    });
  }

  app.registerPanel(
    "history",
    HistoryPanel as unknown as ComponentType<PanelProps>,
  );
  app.registerRailItem({
    id: "history",
    icon: History,
    titleKey: "nav.history",
    hideable: true,
    promotable: true,
    rightDockable: true,
    separatorAfter: true,
  });

  app.registerPanel(
    "macros",
    MacrosPanel as unknown as ComponentType<PanelProps>,
  );
  app.registerRailItem({
    id: "macros",
    icon: Braces,
    titleKey: "nav.macros",
    after: "quick-connect",
    hideable: true,
    promotable: true,
    rightDockable: true,
    separatorAfter: true,
  });

  // The keys a user can bind to the terminal's own actions, and its
  // built-in keys they can rebind. The terminal runs these itself.
  app.registerKeybindingAction({ id: "copy", titleKey: "keybindings.copy" });
  app.registerKeybindingAction({
    id: "paste",
    titleKey: "keybindings.paste",
    editor: PasteNote,
  });
  app.registerKeybindingAction({
    id: "clearConsole",
    titleKey: "keybindings.clearConsole",
  });
  app.registerKeybindingAction({
    id: "sendControlCode",
    titleKey: "keybindings.sendControlCode",
    editor: SendControlCodeEditor,
    validate: validateSendControlCode,
  });
  app.registerKeybindingAction({
    id: "sendText",
    titleKey: "keybindings.sendText",
    editor: SendTextEditor,
    validate: validateSendText,
  });
  app.registerKeybindingAction({
    id: "toggleBroadcast",
    titleKey: "keybindings.toggleBroadcast",
    run: () => {
      const sessionId = getActiveSessionId();
      if (sessionId) toggleBroadcast(sessionId);
    },
  });
  for (const binding of TERMINAL_KEYBINDING_DEFAULTS) {
    app.registerKeybindingDefault(binding);
  }

  // Places other plugins can fill: toolbar buttons and readouts, a side
  // panel and overlays that follow the session's connection flow.
  app.declareActionSlot({ id: TERMINAL_TOOLBAR_SLOT, accepts: ["button"] });
  app.declareActionSlot({
    id: TERMINAL_TOOLBAR_STATUS_SLOT,
    accepts: ["component"],
  });
  app.declareActionSlot({
    id: TERMINAL_SIDE_PANEL_SLOT,
    accepts: ["component"],
  });
  app.declareActionSlot({ id: TERMINAL_OVERLAY_SLOT, accepts: ["component"] });

  // A terminal other code can embed (collab rooms, the homepage widget, the
  // tmux monitor, the file manager's window) without importing this plugin.
  app.registerComponent(
    "terminal.view",
    TerminalView as unknown as ComponentType<Record<string, unknown>>,
  );

  // Lets another plugin (snippets) push text into a live terminal session
  // without reaching into the shell's tab state itself.
  app.registerAction("terminal.listSessions", () => listSessions());
  app.registerAction("terminal.sendToActive", ((
    text: string,
    opts?: { run?: boolean },
  ) => sendToActive(text, opts)) as never);
  app.registerAction("terminal.sendToSession", ((
    sessionId: string,
    text: string,
    opts?: { run?: boolean },
  ) => sendToSession(sessionId, text, opts)) as never);
  // Opens a new terminal tab on a host: at a path (the file manager), or
  // joining someone else's shared session (the connections panel).
  app.registerAction("terminal.open", ((
    host: Parameters<TermixApp["tabs"]["openTab"]>[0],
    options: TerminalOpenOptions = {},
  ) =>
    app.tabs.openTab(host, "terminal", {
      forceNewTab: true,
      label: options.label,
      data: {
        ...(options.path ? { initialPath: options.path } : {}),
        ...(options.tmuxSession ? { tmuxSession: options.tmuxSession } : {}),
        ...(options.joinSharedSessionId
          ? {
              joinSharedSessionId: options.joinSharedSessionId,
              joinShareId: options.joinShareId ?? null,
            }
          : {}),
      },
    })) as never);

  // The terminal look for other terminal-like surfaces (docker, serial,
  // proxmox), which must not import this plugin. Each answers undefined
  // while this plugin is off, and the caller falls back to plain colors.
  app.registerComponent(
    "terminal.preview",
    TerminalPreview as unknown as ComponentType<Record<string, unknown>>,
  );
  app.registerAction("terminal.resolveTheme", (async (
    request: ResolveLookRequest & { hostId?: number | string } = {},
  ) => {
    let host: PluginHostRecord | null | undefined = request.host;
    if (!host && request.hostId !== undefined) {
      host =
        app.getHost(request.hostId) ??
        (await app.listHosts().catch(() => [])).find(
          (entry) => String(entry.id) === String(request.hostId),
        );
    }
    return resolveTerminalLook({ ...request, host });
  }) as never);
  app.registerAction("terminal.themes", () => listTerminalThemes());

  app.registerSettingsComponent("touchInput", TouchInputSettings);
  app.registerSettingsComponent("imageStorageTest", ImageStorageTest);

  app.onSettingsChanged(() => invalidateTerminalClientSettings());
  if (!app.guest) {
    void moveLocalTerminalPreferences(app);
    void moveClipboardPreferences(app);
    // The clipboard settings are read on each click, with no hook to wait in.
    void loadTerminalClientSettings(app.api).catch(() => {});
  }

  setWatchAlertSender((sessionId, rule, hit) => {
    const session = getSessionInfo(sessionId);
    const host = session?.hostName || session?.ip || "";
    toast.info(app.t("terminalTools.watch.fired", { rule: rule.name, host }), {
      description: hit.line,
    });
    if (app.guest || !session?.hostId) return;
    void app.api
      .post("/watch-alert", { hostId: session.hostId, rule: rule.name })
      .catch(() => {
        // The toast already told the user.
      });
  });

  app.onDispose(resetTouchInputSettingsCache);
  app.onDispose(resetTerminalClientSettings);
  app.onDispose(resetBroadcastStore);
  app.onDispose(resetWatchStore);
}
