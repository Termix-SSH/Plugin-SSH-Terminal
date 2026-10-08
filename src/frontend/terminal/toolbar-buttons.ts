import { useMemo, type ComponentType } from "react";
import { ImageIcon, LogOut } from "lucide-react";
import {
  useHostActions,
  useSlotContributions,
  type HostActionContribution,
  type PluginHostRecord,
  type SlotContribution,
} from "@termix-ssh/plugin-sdk/frontend";
import { TERMINAL_TOOLBAR_SLOT } from "./terminal-slots";

export const IMAGE_BUTTON = "terminal.image";
export const TMUX_DETACH_BUTTON = "terminal.tmuxDetach";

type Icon = ComponentType<{ className?: string }>;

export type ToolbarButtonSource =
  | { kind: "builtin" }
  | { kind: "action"; contribution: SlotContribution }
  | { kind: "link"; action: HostActionContribution };

export interface ToolbarButtonInfo {
  id: string;
  titleKey: string;
  icon?: Icon;
  source: ToolbarButtonSource;
}

/**
 * Every button the toolbar can show for this host: quick links to the
 * host's other tools, buttons other plugins add, then the terminal's own.
 * The host editor lists the same set so a host can hide or reorder them.
 */
export function useToolbarButtons(
  host: object | null | undefined,
): ToolbarButtonInfo[] {
  const contributions = useSlotContributions(TERMINAL_TOOLBAR_SLOT, { host });
  const hostActions = useHostActions();

  return useMemo(() => {
    const record = (host ?? {}) as PluginHostRecord;
    const links: ToolbarButtonInfo[] = hostActions
      .filter((action) => {
        if (action.kind !== "open" || action.items) return false;
        if (!action.run && !action.tabType) return false;
        try {
          return action.when(record);
        } catch {
          return false;
        }
      })
      .map((action) => ({
        id: action.id,
        titleKey: action.titleKey,
        icon: action.icon as Icon,
        source: { kind: "link", action },
      }));
    const actions: ToolbarButtonInfo[] = contributions
      .filter((contribution) => contribution.kind !== "component")
      .map((contribution) => ({
        id: contribution.actionId,
        titleKey: contribution.titleKey,
        icon: contribution.icon as Icon | undefined,
        source: { kind: "action", contribution },
      }));
    const builtins: ToolbarButtonInfo[] = [
      {
        id: IMAGE_BUTTON,
        titleKey: "terminalToolbar.image",
        icon: ImageIcon,
        source: { kind: "builtin" },
      },
      {
        id: TMUX_DETACH_BUTTON,
        titleKey: "terminalToolbar.detachTmux",
        icon: LogOut,
        source: { kind: "builtin" },
      },
    ];
    return [...links, ...actions, ...builtins];
  }, [contributions, hostActions, host]);
}
