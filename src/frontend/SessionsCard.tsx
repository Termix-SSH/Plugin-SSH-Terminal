import { useCallback, useEffect, useState } from "react";
import { SquareTerminal } from "lucide-react";
import {
  useHosts,
  usePermission,
  usePluginApi,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  PanelList,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";

interface LiveRow {
  id: string;
  hostId: number;
  hostName: string;
  connected: boolean;
  createdAt: number;
  tmuxSessionName: string | null;
}

const POLL_MS = 30_000;

/** Dashboard card: the terminal sessions open on the server for this user. */
export function SessionsCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("sessions");
  const api = usePluginApi();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<LiveRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<LiveRow[]>("/sessions");
      setRows(data);
    } catch {
      setRows([]);
    }
  }, [api]);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (!allowed) return null;
  if (!rows) {
    return <LoadingState compact label={t("card.loading")} />;
  }

  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
      }
    >
      {rows.map((row, index) => {
        const host = hosts.find((h) => Number(h.id) === row.hostId);
        return (
          <ListRow
            key={row.id}
            stripe={index}
            tone={row.connected ? "success" : "warning"}
            icon={<SquareTerminal className="size-3.5" />}
            title={host?.name || row.hostName}
            badges={
              <ListBadge tone={row.connected ? "success" : "warning"}>
                {row.connected ? t("card.connected") : t("card.detached")}
              </ListBadge>
            }
            meta={
              row.tmuxSessionName
                ? t("card.tmux", { name: row.tmuxSessionName })
                : new Date(row.createdAt).toLocaleString()
            }
            onClick={() => host && tabs.openTab(host, "terminal")}
          />
        );
      })}
    </PanelList>
  );
}
