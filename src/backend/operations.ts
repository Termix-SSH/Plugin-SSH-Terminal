import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { createHistoryRepository } from "./history-repository.js";
import type { LiveSessionRow } from "./live-list.js";

type History = ReturnType<typeof createHistoryRepository>;

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

/** Terminal actions that need no open terminal. */
export function registerOperations(
  ctx: PluginContext,
  history: History,
  listSessions: (userId: string) => LiveSessionRow[] = () => [],
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("ssh-terminal.check-login", {
    run: async (_input, context) => {
      const started = Date.now();
      try {
        const result = await ctx.ssh.exec(requireHost(context), "true", {
          purpose: "ssh-login-check",
          timeoutMs: 20000,
        });
        const ms = Date.now() - started;
        // Some servers close the channel without an exit status. Getting this
        // far still means the login worked.
        const ok = result.code === 0 || result.code === null;
        const label = ok ? `Works (${ms} ms)` : `Exit ${result.code}`;
        return {
          summary: label,
          data: { value: ms, status: ok ? "ok" : "warn", label },
        };
      } catch (error) {
        const label = error instanceof Error ? error.message : "Failed";
        return {
          summary: label,
          data: { value: null, status: "fail", label },
        };
      }
    },
  });

  ctx.operations.register("ssh-terminal.recent-commands", {
    run: async (_input, context) => {
      const userId = ctx.currentActor();
      if (!userId) throw new Error("This needs a user");
      const rows = await history.listCommandsForHost(
        userId,
        requireHost(context),
        50,
      );
      return {
        summary: `${rows.length} recent commands`,
        data: {
          rows: rows.map((row, index) => ({
            id: String(index),
            command: row.command,
            ran: row.executedAt,
          })),
        },
      };
    },
  });

  ctx.operations.register("ssh-terminal.sessions", {
    run: async (_input, context) => {
      const userId = ctx.currentActor();
      if (!userId) throw new Error("This needs a user");
      const hostId = requireHost(context);
      const rows = listSessions(userId).filter((row) => row.hostId === hostId);
      return {
        summary: `${rows.length} open sessions`,
        data: {
          rows: rows.map((row) => ({
            id: row.id,
            name: row.tmuxSessionName ?? row.hostName,
            state: row.connected ? "connected" : "detached",
            started: new Date(row.createdAt).toISOString(),
          })),
        },
      };
    },
  });
}
