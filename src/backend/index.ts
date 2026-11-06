import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createTerminalLogger } from "./helpers.js";
import { hostImportNormalizer, hostPayloadLegacy } from "./host-import.js";
import { createHistoryRepository } from "./history-repository.js";
import { registerOperations } from "./operations.js";
import { toLiveRow } from "./live-list.js";
import { createLiveSessions } from "./live-sessions.js";
import { registerTerminalRoutes } from "./routes.js";
import { registerCloudflareTransport } from "./cloudflare-transport.js";
import {
  DEFAULT_TIMEOUT_MINUTES,
  TerminalSessionManager,
} from "./session-manager.js";
import {
  SESSION_GUESTS_KEY,
  type RecordingsWriterV1,
  type SessionGuestsV1,
  type SessionSharingV1,
  type TerminalHistoryV1,
  type TmuxSessionsV1,
} from "./services.js";
import { ADMIN_KEYS } from "./settings.js";
import { commandHistory } from "./tables.js";
import { createTerminalSocket } from "./terminal-socket.js";
import { createLocalTerminalSocket } from "./local-terminal.js";
import {
  validateAdminSettings,
  validateUserSettings,
} from "./settings-validation.js";

/**
 * A service another plugin may or may not provide. The handle always exists;
 * whether its provider is up is asked through the proxy's `in` check.
 */
function optionalService<T extends object>(
  ctx: PluginContext,
  service: string,
  probe: keyof T & string,
): T | null {
  const handle = ctx.services.get<T>(service);
  return probe in handle ? handle : null;
}

export async function activate(ctx: PluginContext) {
  const log = createTerminalLogger(ctx.log);
  ctx.settings.onValidate("admin", validateAdminSettings);
  ctx.settings.onValidate("user", validateUserSettings);

  const table = await ctx.db.define(commandHistory);
  const history = createHistoryRepository(ctx.db, table);
  registerOperations(ctx, history, (userId) =>
    sessionManager.getUserSessions(userId).map(toLiveRow),
  );

  // Read on every detach, so it is kept current rather than awaited there.
  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  const applyTimeout = (value: unknown) => {
    const minutes = Number(value);
    timeoutMinutes =
      Number.isFinite(minutes) && minutes > 0
        ? minutes
        : DEFAULT_TIMEOUT_MINUTES;
  };
  const refreshTimeout = async () =>
    applyTimeout(await ctx.settings.get(ADMIN_KEYS.sessionTimeoutMinutes));
  await refreshTimeout();
  ctx.settings.onChange(ADMIN_KEYS.sessionTimeoutMinutes, applyTimeout);

  const sessionManager = new TerminalSessionManager({
    log,
    getTimeoutMinutes: () => timeoutMinutes,
    getRecordings: () =>
      optionalService<RecordingsWriterV1>(ctx, "recordings.writer", "open"),
  });
  ctx.disposables.add(() => sessionManager.destroyAll());

  const cloudflare = registerCloudflareTransport(ctx);
  const socket = createTerminalSocket({
    ctx,
    cloudflareClaims: cloudflare.claims,
    log,
    sessionManager,
    getTmux: () =>
      optionalService<TmuxSessionsV1>(ctx, "tmux.sessions", "detect"),
    getSharing: () =>
      optionalService<SessionSharingV1>(
        ctx,
        "sessions.sharing",
        "authorizeJoin",
      ),
    getGuests: () =>
      ctx.registry.consume<SessionGuestsV1>(SESSION_GUESTS_KEY) ?? null,
  });

  // Public with optional auth: a share-link guest arrives with a share token
  // instead of a session, so that check happens where the token is understood.
  ctx.ws.route(
    "/terminal",
    (connection) => {
      // Also picks up a value the boot migration wrote after activation.
      void refreshTimeout().catch(() => {});
      return socket.handleConnection(connection);
    },
    {
      public: true,
      optionalAuth: true,
    },
  );
  ctx.disposables.add(() => socket.closeAll());

  // The desktop app's own shell. Refuses on a server.
  const localTerminal = createLocalTerminalSocket(ctx);
  ctx.ws.route("/local-terminal", (connection) =>
    localTerminal.handleConnection(connection),
  );
  ctx.disposables.add(() => localTerminal.closeAll());

  registerTerminalRoutes(ctx.http.router<Router>({ rawBody: true }), {
    ctx,
    log,
    sessionManager,
    history,
  });

  const liveSessions = createLiveSessions(
    ctx,
    sessionManager,
    () => timeoutMinutes,
  );
  // sessions.live is keyed by session type; remote desktop provides the others.
  ctx.services.provide("sessions.live", liveSessions, { name: "ssh" });

  const terminalHistory: TerminalHistoryV1 = {
    list: async (hostId, limit = 200) => {
      const userId = ctx.currentActor();
      if (!userId) return [];
      return history.listCommandsForHost(userId, hostId, limit);
    },
  };
  ctx.services.provide("terminal.history", terminalHistory);

  ctx.registry.provide(
    "ssh-terminal.hostImportNormalizer",
    hostImportNormalizer,
  );
  ctx.registry.provide("ssh-terminal.hostPayloadLegacy", hostPayloadLegacy);

  ctx.log.info("SSH terminal mounted at /plugin-ws/ssh-terminal/terminal");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
