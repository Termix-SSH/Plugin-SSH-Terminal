import { useSyncExternalStore } from "react";
import { Wrench } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  getSessionHandle,
  sessionsSnapshot,
  subscribeSessions,
} from "../session-registry";
import { useBroadcast } from "./broadcast/broadcast-store";
import { sessionLabel } from "./broadcast/BroadcastTargets";
import { buildToolEntries, ToolsMenuItems } from "./ToolsMenu";
import { useWatchCount } from "./watch/watch-store";

/**
 * The terminal tools, in the tab bar beside split view. They act on the
 * terminal the user worked in last, named at the top of the menu.
 */
export function TabBarToolsButton({
  targetTab,
  className,
}: {
  targetTab?: { id: string };
  className?: string;
}) {
  const { t } = useTranslation();
  const sessions = useSyncExternalStore(subscribeSessions, sessionsSnapshot);
  const broadcast = useBroadcast();
  const session = sessions.find((item) => item.id === targetTab?.id);
  const watchCount = useWatchCount(session?.id);
  const broadcasting = broadcast.members.length > 0;
  const label = t("terminalToolbar.tools");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={!session}
          title={session ? label : t("terminalTools.openTerminalFirst")}
          aria-label={label}
          className={cn(
            "relative text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
            className,
          )}
          style={broadcasting ? { color: "var(--warning)" } : undefined}
        >
          <Wrench className="size-4" />
          {watchCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-2.5 min-w-3.5 rounded-full bg-accent-brand px-1 text-[9px] leading-3.5 font-medium text-white"
            >
              {watchCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      {session && (
        <DropdownMenuContent
          align="end"
          sideOffset={1}
          className="min-w-56 border-t-0 [clip-path:inset(0px_-4px_-4px_-4px)]"
        >
          <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
            {sessionLabel(session)}
          </DropdownMenuLabel>
          {watchCount > 0 && (
            <DropdownMenuItem
              onSelect={() => getSessionHandle(session.id)?.openTool("watch")}
            >
              {t("terminalTools.watch.active", { count: watchCount })}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <ToolsMenuItems
            entries={buildToolEntries(t, {
              sessionId: session.id,
              hostName: session.hostName || session.ip || "",
              handle: () => getSessionHandle(session.id),
            })}
            sendKeyLabel={t("terminalTools.keys.title")}
          />
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
