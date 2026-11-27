import { StringDecoder } from "node:string_decoder";
import type { Client, ClientChannel } from "ssh2";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  TerminalSession,
  TerminalSessionManager,
} from "./session-manager.js";

const COLS = 120;
const ROWS = 32;
// The reader is a model, so what it gets back has to fit in what it can take.
const MAX_TEXT = 32 * 1024;
const QUIET_MS = 400;

// Colors, cursor moves and window titles mean nothing without a screen.
// eslint-disable-next-line no-control-regex
const ESCAPES =
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]/g;

export function plainText(raw: string): string {
  return raw.replace(ESCAPES, "").replace(/\r\n?/g, "\n").slice(-MAX_TEXT);
}

function openShell(client: Client): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.shell(
      { rows: ROWS, cols: COLS, term: "xterm-256color" },
      (error, stream) => (error ? reject(error) : resolve(stream)),
    );
  });
}

/**
 * Terminal sessions a model drives through actions instead of a browser. They
 * are ordinary sessions of the user who asked, so that user can open one in a
 * tab to watch it or take over.
 */
export function createAgentSessions(
  ctx: PluginContext,
  manager: () => TerminalSessionManager,
) {
  const owned = (sessionId: string | undefined, hostId: number) => {
    const session = manager().getSession(sessionId ?? null);
    if (
      !session?.sshStream ||
      session.userId !== ctx.currentActor() ||
      session.hostId !== hostId
    ) {
      throw new Error("No such terminal session. Open one first.");
    }
    return session as TerminalSession & { sshStream: ClientChannel };
  };

  return {
    async open(hostId: number): Promise<string> {
      const userId = ctx.currentActor();
      if (!userId) throw new Error("This needs a user");
      const connection = await ctx.ssh.connect<Client>(hostId, {
        purpose: "terminal",
        profile: "terminal",
      });
      const sessions = manager();
      let id: string;
      try {
        const stream = await openShell(connection.client);
        id = sessions.createSession(
          userId,
          hostId,
          String(connection.host.name ?? connection.host.ip),
          COLS,
          ROWS,
        );
        sessions.setSSHState(
          id,
          connection.client,
          stream,
          connection.jumpClient,
        );
        sessions.markAgent(id);

        const decoder = new StringDecoder("utf-8");
        stream.on("data", (chunk: Buffer) => {
          const text = decoder.write(chunk);
          if (!text) return;
          sessions.bufferOutput(id, text);
          sessions.broadcast(id, { type: "data", data: text });
          sessions.applyBackpressure(id, stream);
        });
        stream.on("close", (code: number | null) => {
          sessions.broadcast(id, { type: "session_ended", code: code ?? 0 });
          sessions.destroySession(id);
          connection.dispose();
        });
      } catch (error) {
        connection.dispose();
        throw error;
      }
      // Nobody is watching yet, so the idle timer starts now.
      sessions.keepAlive(id);
      return id;
    },

    /** Types into the session and gives back what the host printed after it. */
    send(
      sessionId: string | undefined,
      hostId: number,
      text: string,
      waitMs: number,
      signal: AbortSignal,
    ): Promise<string> {
      const session = owned(sessionId, hostId);
      const sessions = manager();
      sessions.keepAlive(session.id);
      return new Promise((resolve) => {
        let seen = "";
        let quiet: NodeJS.Timeout | null = null;
        const finish = () => {
          clearTimeout(limit);
          if (quiet) clearTimeout(quiet);
          session.dataListeners.delete(onData);
          signal.removeEventListener("abort", finish);
          resolve(plainText(seen));
        };
        const onData = (data: string) => {
          seen += data;
          if (quiet) clearTimeout(quiet);
          quiet = setTimeout(finish, QUIET_MS);
        };
        const limit = setTimeout(finish, waitMs);
        signal.addEventListener("abort", finish);
        session.dataListeners.add(onData);
        sessions.bufferInput(session.id, text);
        session.sshStream.write(text);
      });
    },

    read(sessionId: string | undefined, hostId: number): string {
      const session = owned(sessionId, hostId);
      return plainText(manager().getBuffer(session) ?? "");
    },

    close(sessionId: string | undefined, hostId: number): void {
      manager().destroySession(owned(sessionId, hostId).id);
    },
  };
}

export type AgentSessions = ReturnType<typeof createAgentSessions>;
