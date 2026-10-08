import { useMemo } from "react";
import { ArrowDown, ArrowUp, PanelBottom, RotateCcw } from "lucide-react";
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
  useTranslation,
  type HostEditorSectionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  arrangeButtons,
  readToolbarValues,
  type ToolbarButtonLayout,
} from "../terminal/toolbar-settings";
import {
  TMUX_DETACH_BUTTON,
  useToolbarButtons,
} from "../terminal/toolbar-buttons";

const PLUGIN_ID = "ssh-terminal";

type HostPluginSettings = Record<string, Record<string, unknown>>;

const SELECT =
  "flex h-8 w-40 border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

/** The host editor's toolbar card: where it sits and which buttons it has. */
export function HostToolbarSettings({
  form,
  updateForm,
  host,
}: Pick<HostEditorSectionProps, "form" | "updateForm" | "host">) {
  const { t } = useTranslation();
  const stored = ((form?.pluginSettings as HostPluginSettings)?.[PLUGIN_ID] ??
    {}) as Record<string, unknown>;
  const enabled = stored.enableTerminalToolbar !== false;
  const settings = readToolbarValues(stored);
  // The buttons are offered by what this host has switched on, so read
  // them from the form as it will save.
  const preview = useMemo(() => ({ ...(host ?? {}), ...form }), [host, form]);
  const catalog = useToolbarButtons(preview);
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
  const writeButtons = (next: ToolbarButtonLayout) =>
    write({ terminalToolbarButtons: next });

  const move = (index: number, offset: number) => {
    const ids = ordered.map((button) => button.id);
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
      title={t("terminalToolbar.settingsTitle")}
      icon={<PanelBottom className="size-3.5" />}
    >
      <SettingRow
        label={t("settings.host.enableTerminalToolbar.label")}
        description={t("settings.host.enableTerminalToolbar.description")}
        defaultKey="enableTerminalToolbar"
      >
        <FakeSwitch
          checked={enabled}
          onChange={(value) => write({ enableTerminalToolbar: value })}
        />
      </SettingRow>
      {enabled && (
        <>
          <SettingRow
            label={t("settings.host.terminalToolbarPosition.label")}
            description={t("settings.host.terminalToolbarPosition.description")}
            defaultKey="terminalToolbarPosition"
          >
            <Select2
              value={settings.position}
              onChange={(event) =>
                write({ terminalToolbarPosition: event.target.value })
              }
              className={SELECT}
            >
              <option value="bottom">
                {t("settings.host.terminalToolbarPosition.bottom")}
              </option>
              <option value="top">
                {t("settings.host.terminalToolbarPosition.top")}
              </option>
            </Select2>
          </SettingRow>
          <SettingRow
            label={t("settings.host.terminalToolbarLabels.label")}
            description={t("settings.host.terminalToolbarLabels.description")}
            defaultKey="terminalToolbarLabels"
          >
            <Select2
              value={settings.labels}
              onChange={(event) =>
                write({ terminalToolbarLabels: event.target.value })
              }
              className={SELECT}
            >
              <option value="labeled">
                {t("settings.host.terminalToolbarLabels.labeled")}
              </option>
              <option value="icons">
                {t("settings.host.terminalToolbarLabels.icons")}
              </option>
            </Select2>
          </SettingRow>
          <SettingRow
            label={t("settings.host.terminalToolbarShowStatus.label")}
            description={t(
              "settings.host.terminalToolbarShowStatus.description",
            )}
            defaultKey="terminalToolbarShowStatus"
          >
            <FakeSwitch
              checked={settings.showStatus}
              onChange={(value) => write({ terminalToolbarShowStatus: value })}
            />
          </SettingRow>
          <HostDefaultField settingKey="terminalToolbarButtons">
            <div className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {t("settings.host.terminalToolbarButtons.label")}
                    <HostDefaultBadge settingKey="terminalToolbarButtons" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.host.terminalToolbarButtons.description")}
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
                  {t("settings.host.terminalToolbarButtons.reset")}
                </Button>
              </div>
              <div className="flex flex-col border border-border">
                {ordered.map((button, index) => {
                  const Icon = button.icon;
                  const visible = !hidden.has(button.id);
                  return (
                    <div
                      key={button.id}
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
                            "settings.host.terminalToolbarButtons.moveUp",
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
                            "settings.host.terminalToolbarButtons.moveDown",
                          )}
                          disabled={index === ordered.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                      <div
                        className={cn(
                          "flex min-w-0 flex-1 flex-col gap-0.5",
                          !visible && "opacity-60",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                          {Icon && (
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{t(button.titleKey)}</span>
                        </span>
                        {button.id === TMUX_DETACH_BUTTON && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {t("settings.host.terminalToolbarButtons.tmuxHint")}
                          </span>
                        )}
                      </div>
                      <FakeSwitch
                        checked={visible}
                        onChange={(value) => toggle(button.id, value)}
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
