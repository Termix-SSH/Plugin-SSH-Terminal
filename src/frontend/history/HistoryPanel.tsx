import { useState, useEffect } from "react";
import { Copy, Terminal, Trash2 } from "lucide-react";
import {
  copyToClipboard,
  Button,
  EmptyState,
  Facts,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import {
  usePluginApi,
  useTranslation,
  type PanelProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  clearCommandHistory,
  deleteCommandFromHistory,
  getCommandHistory,
  hostSetting,
} from "../terminal-api";

/** Command history for the terminal the user is working in. */
export function HistoryPanel({ targetTab }: PanelProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const api = usePluginApi();
  const [search, setSearch] = useState("");
  const [commands, setCommands] = useState<string[]>([]);

  const activeTab = targetTab;
  const activeIsTerminal = !!activeTab;
  const hostId = activeTab?.host?.id ? parseInt(activeTab.host.id, 10) : null;
  const trackingEnabled = hostSetting(
    activeTab?.host,
    "enableCommandHistory",
    true,
  );

  useEffect(() => {
    if (!hostId || !trackingEnabled) {
      setCommands([]);
      return;
    }
    getCommandHistory(api, hostId)
      .then(setCommands)
      .catch(() => setCommands([]));
  }, [api, hostId, trackingEnabled]);

  if (activeIsTerminal && !trackingEnabled) {
    return (
      <EmptyState
        icon={Terminal}
        title={t("history.trackingDisabled")}
        hint={t("history.trackingDisabledHint")}
        className="flex-1"
      />
    );
  }

  if (!activeIsTerminal) {
    return (
      <EmptyState
        icon={Terminal}
        title={t("history.noTerminalSelected")}
        hint={t("history.noTerminalSelectedHint")}
        className="flex-1"
      />
    );
  }

  const filtered = search
    ? commands.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : commands;

  async function handleDelete(cmd: string) {
    if (!hostId) return;
    const ok = await confirm({
      title: t("history.deleteConfirm"),
      description: cmd,
    });
    if (!ok) return;
    try {
      await deleteCommandFromHistory(api, hostId, cmd);
      setCommands((prev) => prev.filter((c) => c !== cmd));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <PanelSearch
            value={search}
            onChange={setSearch}
            placeholder={t("history.searchPlaceholder")}
            fill
          />
          <Button
            variant="outline"
            size="icon"
            title={t("history.clearAll")}
            aria-label={t("history.clearAll")}
            disabled={commands.length === 0}
            className="hover:text-destructive"
            onClick={async () => {
              if (!hostId) return;
              try {
                await clearCommandHistory(api, hostId);
              } catch {
                /* ignore */
              }
              setCommands([]);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <Facts className="text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Terminal className="size-3 text-accent-brand" />
            {activeTab.label}
          </span>
          <span>{t("history.commandCount", { count: filtered.length })}</span>
        </Facts>
      </div>
      <PanelList empty={<EmptyState title={t("history.noHistoryEntries")} />}>
        {filtered.map((cmd, i) => (
          <ListRow
            key={i}
            stripe={i}
            tone="muted"
            title={<span className="font-mono text-xs font-normal">{cmd}</span>}
            actions={
              <>
                <ListRowAction
                  label={t("common.copy")}
                  onClick={() => copyToClipboard(cmd)}
                >
                  <Copy />
                </ListRowAction>
                <ListRowAction
                  label={t("common.delete")}
                  tone="destructive"
                  onClick={() => handleDelete(cmd)}
                >
                  <Trash2 />
                </ListRowAction>
              </>
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
