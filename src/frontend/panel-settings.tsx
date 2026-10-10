import type { ReactNode } from "react";
import { Rows3, SlidersHorizontal } from "lucide-react";
import {
  useTranslation,
  type SettingsState,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  FakeSwitch,
  InlineView,
  SectionCard,
  SettingRow,
} from "@termix-ssh/plugin-sdk/ui";

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

/** Display settings page for a sidebar panel's list. */
export function PanelSettings({
  settings,
  settingKey,
  title,
  onBack,
}: {
  settings: SettingsState;
  settingKey: ActionsSettingKey;
  title: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <InlineView
      open
      onOpenChange={(open) => !open && onBack()}
      icon={<SlidersHorizontal className="size-4" />}
      title={title}
    >
      <SectionCard
        title={t("settings.user.displayTitle")}
        icon={<Rows3 className="size-3.5" />}
      >
        <SettingRow
          label={t(`settings.user.${settingKey}.label`)}
          description={t(`settings.user.${settingKey}.description`)}
        >
          <FakeSwitch
            checked={settings.values[settingKey] === true}
            onChange={(v) =>
              void settings.save({ ...settings.values, [settingKey]: v })
            }
          />
        </SettingRow>
      </SectionCard>
    </InlineView>
  );
}
