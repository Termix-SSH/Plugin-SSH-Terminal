import type { TerminalHandle } from "./terminal/terminal-types";

export interface TerminalSessionInfo {
  id: string;
  hostId: number | null;
  hostName?: string;
  /** The tab's title. */
  label?: string;
  ip?: string;
  username?: string;
  port?: number;
  /** The host's folder path. */
  folder?: string;
  /** The socket is open. */
  connected?: boolean;
  /** Shown on screen rather than behind another tab. */
  visible?: boolean;
}

interface Session extends TerminalSessionInfo {
  ref: TerminalHandle;
}

const sessions = new Map<string, Session>();
let activeId: string | null = null;
const listeners = new Set<() => void>();
let snapshot: TerminalSessionInfo[] = [];

function notify(): void {
  snapshot = listSessions();
  for (const listener of [...listeners]) listener();
}

/** The open sessions, the same array until one changes. */
export function sessionsSnapshot(): TerminalSessionInfo[] {
  return snapshot;
}

/** Called by the terminal tab wrapper on mount/unmount and focus change. */
export function registerSession(
  info: TerminalSessionInfo,
  ref: TerminalHandle,
): () => void {
  sessions.set(info.id, { ...info, ref });
  notify();
  return () => {
    sessions.delete(info.id);
    if (activeId === info.id) activeId = [...sessions.keys()].pop() ?? null;
    notify();
  };
}

/** Updates a session in place, so its place in the list and focus stay put. */
export function updateSession(
  id: string,
  changes: Partial<Omit<Session, "id">>,
): void {
  const session = sessions.get(id);
  if (!session) return;
  const changed = (Object.keys(changes) as Array<keyof typeof changes>).some(
    (key) => session[key] !== changes[key],
  );
  if (!changed) return;
  sessions.set(id, { ...session, ...changes });
  notify();
}

/** Called whenever a session opens, closes or changes. Returns the unsubscribe. */
export function subscribeSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The live terminal of a session, for tools that type into several at once. */
export function getSessionHandle(sessionId: string): TerminalHandle | null {
  return sessions.get(sessionId)?.ref ?? null;
}

export function getSessionInfo(sessionId: string): TerminalSessionInfo | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const { ref: _ref, ...info } = session;
  return info;
}

export function setActiveSession(id: string | null): void {
  activeId = id;
}

export function getActiveSessionId(): string | null {
  return activeId;
}

export function listSessions(): TerminalSessionInfo[] {
  return [...sessions.values()].map(({ ref: _ref, ...info }) => info);
}

// Older test fakes and embedders may not report a connection state.
function isOpen(session: Session): boolean {
  return session.ref.isConnected?.() ?? true;
}

function send(session: Session, text: string, run?: boolean): boolean {
  if (!isOpen(session)) return false;
  if (run) session.ref.sendInput(text + "\r");
  else session.ref.paste(text);
  return true;
}

export function sendToActive(text: string, opts?: { run?: boolean }): boolean {
  // Falls back to the newest session when none was focused yet.
  const session =
    (activeId ? sessions.get(activeId) : undefined) ??
    [...sessions.values()].pop();
  if (!session) return false;
  return send(session, text, opts?.run);
}

export function sendToSession(
  sessionId: string,
  text: string,
  opts?: { run?: boolean },
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  return send(session, text, opts?.run);
}
