import type { TerminalHandle } from "./terminal/terminal-types";
import {
  activeRemoteSession,
  listRemoteSessions,
  publishFocus,
  publishSession,
  publishesSessions,
  remoteInput,
  remoteSession,
  watchRemoteSessions,
} from "./session-hub";

export interface TerminalSessionInfo {
  id: string;
  hostId: number | null;
  kind?: "local";
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

type InputHandle = Pick<TerminalHandle, "sendInput" | "paste" | "isConnected">;
interface InputSession extends TerminalSessionInfo {
  ref: InputHandle;
}

const sessions = new Map<string, Session>();
const localSessions = new Map<string, InputSession>();
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
  const unpublish = publishSession(
    info,
    () => sessions.get(info.id)?.ref ?? null,
  );
  return () => {
    unpublish();
    sessions.delete(info.id);
    if (activeId === info.id) activeId = [...sessions.keys()].pop() ?? null;
    notify();
  };
}

/** Local shells expose input only, not SSH tools, sharing or saved credentials. */
export function registerLocalSession(
  info: Omit<TerminalSessionInfo, "hostId" | "kind">,
  ref: InputHandle,
): () => void {
  const session = { ...info, hostId: null, kind: "local" as const, ref };
  localSessions.set(info.id, session);
  const unpublish = publishSession(session, () => ref);
  return () => {
    unpublish();
    if (localSessions.get(info.id) !== session) return;
    localSessions.delete(info.id);
    // Keep a missing active target missing until focus explicitly selects another.
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
  if (id) publishFocus(id);
}

export function getActiveSessionId(): string | null {
  return activeId;
}

export function listSessions(): TerminalSessionInfo[] {
  return [...sessions.values()].map(({ ref: _ref, ...info }) => info);
}

export function listInputSessions(): TerminalSessionInfo[] {
  const own = [...sessions.values(), ...localSessions.values()].map(
    ({ ref: _ref, ...info }) => info,
  );
  const ids = new Set(own.map((session) => session.id));
  return [
    ...own,
    ...listRemoteSessions().filter((session) => !ids.has(session.id)),
  ];
}

// Older test fakes and embedders may not report a connection state.
function isOpen(session: InputSession): boolean {
  return session.ref.isConnected?.() ?? true;
}

function send(session: InputSession, text: string, run?: boolean): boolean {
  if (!isOpen(session)) return false;
  if (run) session.ref.sendInput(text + "\r");
  else session.ref.paste(text);
  return true;
}

/** Sends to a session a tab in another frame published here. */
async function sendRemote(
  session: NonNullable<ReturnType<typeof remoteSession>>,
  text: string,
  run?: boolean,
): Promise<boolean> {
  try {
    if ((await session.call("isConnected")) === false) return false;
    if (run) await session.call("sendInput", text + "\r");
    else await session.call("paste", text);
    return true;
  } catch {
    return false;
  }
}

export function sendToActive(
  text: string,
  opts?: { run?: boolean },
): boolean | Promise<boolean> {
  // Falls back to the newest session when none was focused yet.
  const session = activeId
    ? (sessions.get(activeId) ?? localSessions.get(activeId))
    : [...sessions.values()].pop();
  if (session) return send(session, text, opts?.run);
  const published = activeRemoteSession();
  return published ? sendRemote(published, text, opts?.run) : false;
}

export function sendToSession(
  sessionId: string,
  text: string,
  opts?: { run?: boolean },
): boolean | Promise<boolean> {
  const session = sessions.get(sessionId) ?? localSessions.get(sessionId);
  if (session) return send(session, text, opts?.run);
  const published = remoteSession(sessionId);
  return published ? sendRemote(published, text, opts?.run) : false;
}

// --- Sessions with input, across frames (the macros panel) --------------

let mirrored: TerminalSessionInfo[] = [];
let inputSnapshot: TerminalSessionInfo[] = [];
const inputListeners = new Set<() => void>();
let stopFollowing: (() => void) | null = null;

function refreshInputSnapshot(): void {
  const own = listSessions();
  const ids = new Set(own.map((session) => session.id));
  inputSnapshot = [...own, ...mirrored.filter((item) => !ids.has(item.id))];
  for (const listener of [...inputListeners]) listener();
}

function follow(): () => void {
  const stopLocal = subscribeSessions(refreshInputSnapshot);
  const stopRemote = publishesSessions()
    ? watchRemoteSessions((list) => {
        mirrored = list;
        refreshInputSnapshot();
      })
    : () => {};
  return () => {
    stopLocal();
    stopRemote();
    mirrored = [];
  };
}

/**
 * Like subscribeSessions, plus the sessions tabs in other frames hold, for
 * a panel that only types into them.
 */
export function subscribeInputSessions(listener: () => void): () => void {
  inputListeners.add(listener);
  stopFollowing ??= follow();
  refreshInputSnapshot();
  return () => {
    inputListeners.delete(listener);
    if (inputListeners.size > 0 || !stopFollowing) return;
    stopFollowing();
    stopFollowing = null;
  };
}

export function inputSessionsSnapshot(): TerminalSessionInfo[] {
  return inputSnapshot;
}

/** Typing and output for a session, here or in another frame. */
export function getInputHandle(sessionId: string): {
  sendInput: (data: string) => void;
  subscribeOutput: (listener: (data: string) => void) => () => void;
} | null {
  const own = sessions.get(sessionId)?.ref;
  if (own) return own;
  return mirrored.some((item) => item.id === sessionId)
    ? remoteInput(sessionId)
    : null;
}
