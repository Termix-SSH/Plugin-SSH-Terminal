import type { TerminalSession } from "./session-manager.js";

export interface LiveSessionRow {
  id: string;
  hostId: number;
  hostName: string;
  connected: boolean;
  createdAt: number;
  lastDetachedAt: number | null;
  tmuxSessionName: string | null;
}

export function toLiveRow(session: TerminalSession): LiveSessionRow {
  return {
    id: session.id,
    hostId: session.hostId,
    hostName: session.hostName,
    connected: session.isConnected,
    createdAt: session.createdAt,
    lastDetachedAt: session.lastDetachedAt,
    tmuxSessionName: session.tmuxSessionName,
  };
}
