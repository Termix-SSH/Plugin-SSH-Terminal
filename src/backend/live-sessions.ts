import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  TerminalSession,
  TerminalSessionManager,
} from "./session-manager.js";
import type { LiveSessionInfo, LiveSessionsV1 } from "./services.js";

export function toInfo(session: TerminalSession): LiveSessionInfo {
  return {
    id: session.id,
    userId: session.userId,
    hostId: session.hostId,
    hostName: session.hostName,
    isConnected: session.isConnected,
    createdAt: session.createdAt,
    lastDetachedAt: session.lastDetachedAt,
    tabInstanceId:
      session.attachedTabInstanceId ?? session.tabInstanceId ?? null,
    tmuxSessionName: session.tmuxSessionName,
    cols: session.cols,
    rows: session.rows,
    recording: session.recording,
  };
}

/** sessions.live as the "ssh" provider. */
export function createLiveSessions(
  ctx: PluginContext,
  sessionManager: TerminalSessionManager,
  timeoutMinutes: () => number,
): LiveSessionsV1 {
  // A plugin caller reaches a session only as its owner, or as a monitor
  // (read only). Core calls with no actor.
  const mayWatch = async (session: { userId: string }): Promise<boolean> => {
    const actor = ctx.currentActor();
    if (!actor || actor === session.userId) return true;
    return ctx.rbac.has("monitor");
  };
  const isOwnerOrCore = (session: { userId: string }): boolean => {
    const actor = ctx.currentActor();
    return !actor || actor === session.userId;
  };

  return {
    getSession: (sessionId) => {
      const session = sessionManager.getSession(sessionId);
      return session ? toInfo(session) : null;
    },
    listForUser: (userId) => {
      // A plugin caller only ever sees its actor's sessions; core calls this
      // outside any actor, for the user its own route authenticated.
      const actor = ctx.currentActor();
      if (actor && actor !== userId) return [];
      return sessionManager.getUserSessions(userId).map(toInfo);
    },
    listAll: async () => {
      if (!(await ctx.rbac.has("monitor"))) return [];
      return sessionManager.getAllSessions().map(toInfo);
    },
    ownerEndSession: async (sessionId, reason) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) return;
      if (!isOwnerOrCore(session) && !(await ctx.rbac.has("monitor"))) {
        throw new Error("Not allowed to end this session");
      }
      sessionManager.ownerEndSession(sessionId, reason);
    },
    disconnectParticipants: (sessionId, shareId, options) =>
      sessionManager.disconnectShareParticipants(sessionId, shareId, options),
    listGuests: (sessionId, shareId) =>
      sessionManager.listShareGuests(sessionId, shareId),
    setRoomShareControl: (sessionId, shareId, controllerUserId) =>
      sessionManager.setRoomShareControl(sessionId, shareId, controllerUserId),
    subscribe: async (sessionId, onData) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) return () => {};
      if (!(await mayWatch(session))) {
        throw new Error("Not allowed to watch this session");
      }
      session.dataListeners.add(onData);
      return () => session.dataListeners.delete(onData);
    },
    snapshot: async (sessionId) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) return null;
      if (!(await mayWatch(session))) {
        throw new Error("Not allowed to watch this session");
      }
      return sessionManager.getBuffer(session);
    },
    write: (sessionId, data) => {
      const session = sessionManager.getSession(sessionId);
      if (!session?.sshStream || session.sshStream.destroyed) return false;
      if (!isOwnerOrCore(session)) return false;
      sessionManager.bufferInput(sessionId, data);
      session.sshStream.write(data);
      return true;
    },
    idleTimeoutMinutes: () => timeoutMinutes(),
  };
}
