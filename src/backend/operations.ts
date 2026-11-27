import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { createHistoryRepository } from "./history-repository.js";
import type { AgentSessions } from "./agent-sessions.js";
import type { LiveSessionRow } from "./live-list.js";

type History = ReturnType<typeof createHistoryRepository>;

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

// Per stream. The reader is often a model, so keep it well under a context.
const MAX_COMMAND_OUTPUT = 64 * 1024;

/** Terminal actions that need no open terminal. */
export function registerOperations(
  ctx: PluginContext,
  history: History,
  listSessions: (userId: string) => LiveSessionRow[] = () => [],
  agent?: AgentSessions,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("ssh-terminal.check-login", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      // The Terminal setting and the host's SSH switch are separate, so a
      // host with SSH turned off can still match this action's when rule.
      const host = await ctx.hosts?.get?.(hostId).catch(() => null);
      if (host?.enableSsh === false) {
        return {
          summary: "SSH is off",
          data: { value: null, status: "unknown", label: "SSH is off" },
        };
      }
      const started = Date.now();
      try {
        const result = await ctx.ssh.exec(hostId, "exit 0", {
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

  ctx.operations.register("ssh-terminal.run-command", {
    run: async (input, context) => {
      const result = await ctx.ssh.exec(
        requireHost(context),
        String(input.command),
        {
          purpose: "run-command",
          timeoutMs: Number(input.timeoutSec) * 1000,
          maxOutputBytes: MAX_COMMAND_OUTPUT,
        },
      );
      const summary = result.timedOut
        ? "Timed out"
        : `Exit ${result.code ?? "unknown"}`;
      return { summary, changed: true, data: result };
    },
  });

  ctx.operations.register("ssh-terminal.open-session", {
    run: async (_input, context) => {
      const sessionId = await agent!.open(requireHost(context));
      return {
        summary: "Opened a terminal session",
        changed: true,
        data: { sessionId },
      };
    },
  });

  ctx.operations.register("ssh-terminal.send-input", {
    run: async (input, context) => {
      const text = String(input.text) + (input.enter === false ? "" : "\r");
      const output = await agent!.send(
        context.resourceKey,
        requireHost(context),
        text,
        Number(input.waitSec) * 1000,
        context.signal,
      );
      return { summary: "Sent", changed: true, data: { output } };
    },
  });

  ctx.operations.register("ssh-terminal.read-screen", {
    run: (_input, context) => ({
      summary: "Read the terminal",
      data: { output: agent!.read(context.resourceKey, requireHost(context)) },
    }),
  });

  ctx.operations.register("ssh-terminal.close-session", {
    run: (_input, context) => {
      agent!.close(context.resourceKey, requireHost(context));
      return { summary: "Closed the terminal session", changed: true };
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
