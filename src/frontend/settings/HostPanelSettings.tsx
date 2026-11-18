import { ArrowDown, ArrowUp, PanelRight, RotateCcw } from "lucide-react";
import {
  Button,
  FakeSwitch,
  HostDefaultBadge,
  HostDefaultField,
  SectionCard,
  Select2,
  SettingRow,
  cn,
} from "@termix-ssh/plugin-sdk/ui";
import {
  useCompanions,
  useTranslation,
  type HostEditorSectionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { arrangeButtons } from "../terminal/toolbar-settings";
import { readPanelValues } from "../terminal/panel-settings";

const PLUGIN_ID = "ssh-terminal";

type HostPluginSettings = Record<string, Record<string, unknown>>;

const SELECT =
  "flex h-8 w-40 border border-border bg-(--field) px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

/** The host editor's panel bar card: on or off, side, and which panels. */
export function HostPanelSettings({
  form,
  updateForm,
}: Pick<HostEditorSectionProps, "form" | "updateForm">) {
  const { t } = useTranslation();
  const stored = ((form?.pluginSettings as HostPluginSettings)?.[PLUGIN_ID] ??
    {}) as Record<string, unknown>;
  const settings = readPanelValues(stored);
  const catalog = useCompanions("terminal");
  const ordered = arrangeButtons(catalog, settings.buttons);
  const hidden = new Set(settings.buttons.hidden);

  const write = (values: Record<string, unknown>) =>
    updateForm((current) => {
      const all = (current.pluginSettings ?? {}) as HostPluginSettings;
      return {
        ...current,
        pluginSettings: {
          ...all,
          [PLUGIN_ID]: { ...(all[PLUGIN_ID] ?? {}), ...values },
        },
      };
    });
  const writeButtons = (next: { order: string[]; hidden: string[] }) =>
    write({ terminalPanelButtons: next });

  const move = (index: number, offset: number) => {
    const ids = ordered.map((panel) => panel.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    writeButtons({ ...settings.buttons, order: ids });
  };
  const toggle = (id: string, visible: boolean) =>
    writeButtons({
      ...settings.buttons,
      hidden: visible
        ? settings.buttons.hidden.filter((entry) => entry !== id)
        : [...settings.buttons.hidden, id],
    });

  return (
    <SectionCard
      title={t("terminalPanels.settingsTitle")}
      icon={<PanelRight className="size-3.5" />}
    >
      <SettingRow
        label={t("settings.host.enableTerminalPanels.label")}
        description={t("settings.host.enableTerminalPanels.description")}
        defaultKey="enableTerminalPanels"
      >
        <FakeSwitch
          checked={settings.enabled}
          onChange={(value) => write({ enableTerminalPanels: value })}
        />
      </SettingRow>
      {settings.enabled && (
        <>
          <SettingRow
            label={t("settings.host.terminalPanelSide.label")}
            description={t("settings.host.terminalPanelSide.description")}
            defaultKey="terminalPanelSide"
          >
            <Select2
              value={settings.side}
              onChange={(event) =>
                write({ terminalPanelSide: event.target.value })
              }
              className={SELECT}
            >
              <option value="right">
                {t("settings.host.terminalPanelSide.right")}
              </option>
              <option value="left">
                {t("settings.host.terminalPanelSide.left")}
              </option>
              <option value="bottom">
                {t("settings.host.terminalPanelSide.bottom")}
              </option>
            </Select2>
          </SettingRow>
          <HostDefaultField settingKey="terminalPanelButtons">
            <div className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {t("settings.host.terminalPanelButtons.label")}
                    <HostDefaultBadge settingKey="terminalPanelButtons" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.host.terminalPanelButtons.description")}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={
                    settings.buttons.order.length === 0 &&
                    settings.buttons.hidden.length === 0
                  }
                  onClick={() => writeButtons({ order: [], hidden: [] })}
                >
                  <RotateCcw className="size-3.5" />
                  {t("settings.host.terminalPanelButtons.reset")}
                </Button>
              </div>
              <div className="flex flex-col border border-border">
                {ordered.map((panel, index) => {
                  const Icon = panel.icon;
                  const visible = !hidden.has(panel.id);
                  return (
                    <div
                      key={panel.id}
                      className={cn(
                        "flex items-center gap-2 border-b border-border/40 px-2 py-1.5 last:border-b-0",
                        index % 2 === 1 && "bg-muted/15",
                      )}
                    >
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label={t(
                            "settings.host.terminalPanelButtons.moveUp",
                          )}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label={t(
                            "settings.host.terminalPanelButtons.moveDown",
                          )}
                          disabled={index === ordered.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                      <span
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold",
                          !visible && "opacity-60",
                        )}
                      >
                        {Icon && (
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{t(panel.titleKey)}</span>
                      </span>
                      <FakeSwitch
                        checked={visible}
                        onChange={(value) => toggle(panel.id, value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </HostDefaultField>
        </>
      )}
    </SectionCard>
  );
}
