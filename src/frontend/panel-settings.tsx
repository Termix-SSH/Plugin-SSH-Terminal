import type { ReactNode } from "react";
import { usePluginId, useTabs } from "@termix-ssh/plugin-sdk/frontend";

export type ActionsSettingKey =
  "macrosAlwaysShowActions" | "historyAlwaysShowActions";

// Buttons go under the row when always shown, otherwise in the hover tray.
export function rowActionProps(always: boolean, actions: ReactNode) {
  return always
    ? {
        children: (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-wrap items-center gap-[1.75px] border-t border-border/30 pt-[3.5px]"
          >
            {actions}
          </div>
        ),
      }
    : { actions };
}

/** Opens this plugin's page in Settings. */
export function useOpenSettingsPage() {
  const tabs = useTabs();
  const pluginId = usePluginId();
  return () =>
    tabs.openSingletonTab("settings", {
      data: { section: `plugin:${pluginId}` },
    });
}
