/**
 * Terminal sessions across this plugin's frames (Termix 26.11.2 and newer).
 *
 * Every frame runs its own copy of this plugin: a terminal tab registers its
 * session in its own frame, while actions (terminal.sendToSession for
 * snippets) run in the background frame and panels (macros) in theirs. So
 * the background frame keeps a copy of each tab's session: the tab publishes
 * it with an input-only handle, and other frames reach it from there.
 */

import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type { TerminalSessionInfo } from "./session-registry";

const PUBLISH = "ssh-terminal.sessions.publish";
const FOCUS = "ssh-terminal.sessions.focus";
const WATCH = "ssh-terminal.sessions.watch";
const CALL = "ssh-terminal.sessions.call";

/** What a tab hands the background frame: calls come back as promises. */
export interface RemoteInput {
  sendInput: (data: string) => unknown;
  paste: (text: string) => unknown;
  isConnected: () => unknown;
  subscribeOutput: (listener: (data: string) => void) => unknown;
}

type RemoteMethod = keyof RemoteInput;
const METHODS = new Set<string>([
  "sendInput",
  "paste",
  "isConnected",
  "subscribeOutput",
]);

interface RemoteSession extends TerminalSessionInfo {
  ref: RemoteInput;
}

type Invoke = TermixApp["invokeAction"];

// Only this plugin's frames may call these (Termix 26.11.3 and newer).
const PRIVATE = { private: true } as { permission?: string };

/** In a view frame: how it reaches the background frame. */
let invoke: Invoke | null = null;

/** In the background frame: every tab's published session. */
const remote = new Map<string, RemoteSession>();
let remoteActive: string | null = null;
const watchers = new Set<(sessions: TerminalSessionInfo[]) => unknown>();

function info({ ref: _ref, ...rest }: RemoteSession): TerminalSessionInfo {
  return rest;
}

function remoteList(): TerminalSessionInfo[] {
  return [...remote.values()].map(info);
}

function tellWatchers(): void {
  const list = remoteList();
  for (const watcher of [...watchers]) {
    void Promise.resolve(watcher(list)).catch(() => watchers.delete(watcher));
  }
}

function drop(id: string, session: RemoteSession): void {
  if (remote.get(id) !== session) return;
  remote.delete(id);
  if (remoteActive === id) remoteActive = null;
  tellWatchers();
}

function publish(session: TerminalSessionInfo, ref: RemoteInput): () => void {
  const entry = { ...session, ref };
  remote.set(session.id, entry);
  tellWatchers();
  return () => drop(session.id, entry);
}

/**
 * Wires this frame to the others. The background frame keeps the sessions;
 * a view frame publishes to it. Run once from activate.
 */
export function connectSessionHub(app: TermixApp): void {
  if (!app.frame) return;
  if (app.frame.role === "view") {
    invoke = app.invokeAction;
    return;
  }
  app.registerAction(PUBLISH, publish as never, PRIVATE);
  app.registerAction(
    FOCUS,
    ((id: string) => {
      remoteActive = id;
    }) as never,
    PRIVATE,
  );
  app.registerAction(
    WATCH,
    ((watcher: (sessions: TerminalSessionInfo[]) => unknown) => {
      watchers.add(watcher);
      void Promise.resolve(watcher(remoteList())).catch(() =>
        watchers.delete(watcher),
      );
      return () => watchers.delete(watcher);
    }) as never,
    PRIVATE,
  );
  app.registerAction(
    CALL,
    ((id: string, method: string, ...args: unknown[]) => {
      const session = remote.get(id);
      if (!session || !METHODS.has(method)) return undefined;
      return callRemote(id, session, method as RemoteMethod, args);
    }) as never,
    PRIVATE,
  );
  // A shell subscription keeps this frame running, so what tabs published
  // here stays while they are open.
  app.tabs.onChange(() => {});
}

function callRemote(
  id: string,
  session: RemoteSession,
  method: RemoteMethod,
  args: unknown[],
): Promise<unknown> {
  const fn = session.ref[method] as (...a: unknown[]) => unknown;
  // A tab whose frame went away without saying so answers nothing.
  return Promise.resolve()
    .then(() => fn(...args))
    .catch((error: unknown) => {
      drop(id, session);
      throw error;
    });
}

// --- Background frame: the sessions other frames published --------------

/** A published session by id, for the actions. */
export function remoteSession(
  id: string,
): { info: TerminalSessionInfo; call: CallRemote } | null {
  const session = remote.get(id);
  return session ? { info: info(session), call: caller(id, session) } : null;
}

/** The focused published session, or the newest. */
export function activeRemoteSession(): ReturnType<typeof remoteSession> {
  const id = remoteActive ?? [...remote.keys()].pop() ?? null;
  return id ? remoteSession(id) : null;
}

export function listRemoteSessions(): TerminalSessionInfo[] {
  return remoteList();
}

type CallRemote = (
  method: RemoteMethod,
  ...args: unknown[]
) => Promise<unknown>;

function caller(id: string, session: RemoteSession): CallRemote {
  return (method, ...args) => callRemote(id, session, method, args);
}

// --- View frames ---------------------------------------------------------

/** Whether this frame hands its sessions to the background frame. */
export function publishesSessions(): boolean {
  return invoke !== null;
}

/**
 * Publishes a tab's session. `current` reads the live terminal at call time,
 * since a tab's handle changes on every reconnect. Returns the unpublish.
 */
export function publishSession(
  session: TerminalSessionInfo,
  current: () => {
    sendInput: (data: string) => void;
    paste: (text: string) => void;
    isConnected?: () => boolean;
    subscribeOutput?: (listener: (data: string) => void) => () => void;
  } | null,
): () => void {
  if (!invoke) return () => {};
  const ref: RemoteInput = {
    sendInput: (data) => current()?.sendInput(data),
    paste: (text) => current()?.paste(text),
    isConnected: () => current()?.isConnected?.() ?? current() !== null,
    subscribeOutput: (listener) =>
      current()?.subscribeOutput?.(listener) ?? (() => {}),
  };
  let unpublish: (() => unknown) | null = null;
  let gone = false;
  void invoke(PUBLISH, session, ref)
    .then((done) => {
      unpublish = done as () => unknown;
      if (gone) void Promise.resolve(unpublish()).catch(() => {});
    })
    .catch(() => {});
  return () => {
    gone = true;
    if (unpublish) void Promise.resolve(unpublish()).catch(() => {});
  };
}

export function publishFocus(id: string): void {
  if (invoke) void invoke(FOCUS, id).catch(() => {});
}

/**
 * Follows the published sessions from a view frame. Returns the stop.
 * Nothing happens in the background frame, which holds them itself.
 */
export function watchRemoteSessions(
  listener: (sessions: TerminalSessionInfo[]) => void,
): () => void {
  if (!invoke) return () => {};
  let stop: (() => unknown) | null = null;
  let stopped = false;
  void invoke(WATCH, listener)
    .then((done) => {
      stop = done as () => unknown;
      if (stopped) void Promise.resolve(stop()).catch(() => {});
    })
    .catch(() => {});
  return () => {
    stopped = true;
    if (stop) void Promise.resolve(stop()).catch(() => {});
  };
}

/** Input for a session another frame holds, through the background frame. */
export function remoteInput(id: string): {
  sendInput: (data: string) => void;
  subscribeOutput: (listener: (data: string) => void) => () => void;
} | null {
  const call = invoke;
  if (!call) return null;
  return {
    sendInput: (data) => void call(CALL, id, "sendInput", data).catch(() => {}),
    subscribeOutput: (listener) => {
      let off: (() => unknown) | null = null;
      let stopped = false;
      void call(CALL, id, "subscribeOutput", listener)
        .then((done) => {
          if (typeof done !== "function") return;
          off = done as () => unknown;
          if (stopped) void Promise.resolve(off()).catch(() => {});
        })
        .catch(() => {});
      return () => {
        stopped = true;
        if (off) void Promise.resolve(off()).catch(() => {});
      };
    },
  };
}
