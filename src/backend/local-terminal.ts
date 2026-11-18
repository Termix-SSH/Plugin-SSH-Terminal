import type {
  PluginContext,
  PluginLocalPty,
  PluginWebSocketConnection,
} from "@termix-ssh/plugin-sdk/backend";

interface Socket {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
}

const OPEN = 1;
const MAX_BUFFERED = 1024 * 1024;
const MAX_WRITE = 64 * 1024;

function clampSize(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/**
 * One socket is one local shell. The shell dies with the socket, and only the
 * user who opened the socket can reach it.
 *
 * Client sends: {type:"ready"}, {type:"input",data}, {type:"resize",cols,rows}
 * Server sends: {type:"started",shell}, {type:"data",data}, {type:"exit",exitCode},
 * {type:"error",message}
 */
export function createLocalTerminalSocket(ctx: PluginContext) {
  const sockets = new Set<Socket>();

  async function handleConnection(
    connection: PluginWebSocketConnection,
  ): Promise<void> {
    const ws = connection.socket as Socket;
    const request = connection.request as { url?: string };
    sockets.add(ws);
    ws.on("close", (() => sockets.delete(ws)) as never);

    const send = (payload: Record<string, unknown>) => {
      if (ws.readyState === OPEN) ws.send(JSON.stringify(payload));
    };

    if (!connection.userId) {
      ws.close(1008, "Authentication required");
      return;
    }
    if (!(await ctx.desktop.local.available())) {
      send({
        type: "error",
        message: "The local terminal only works in the desktop app",
      });
      ws.close(1008, "Desktop only");
      return;
    }

    const params = new URL(request.url ?? "", "http://localhost").searchParams;
    const cols = clampSize(params.get("cols"), 2, 500, 80);
    const rows = clampSize(params.get("rows"), 1, 300, 24);
    const shell = params.get("shell") ?? undefined;

    let pty: PluginLocalPty;
    try {
      pty = await ctx.desktop.local.pty.spawn({ cols, rows, shell });
    } catch (error) {
      send({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      ws.close(1011, "Could not start");
      return;
    }

    let ready = false;
    let buffered = "";
    const stopData = pty.onData((data) => {
      if (!ready) {
        buffered = (buffered + data).slice(-MAX_BUFFERED);
        return;
      }
      send({ type: "data", data });
    });
    const stopExit = pty.onExit((exitCode) => {
      send({ type: "exit", exitCode });
      ws.close(1000, "Exited");
    });

    ws.on("message", ((raw: Buffer | string) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === "ready") {
        ready = true;
        if (buffered) {
          send({ type: "data", data: buffered });
          buffered = "";
        }
      } else if (
        message.type === "input" &&
        typeof message.data === "string" &&
        message.data.length <= MAX_WRITE
      ) {
        pty.write(message.data);
      } else if (message.type === "resize") {
        pty.resize(Number(message.cols), Number(message.rows));
      }
    }) as never);

    ws.on("close", (() => {
      stopData();
      stopExit();
      pty.kill();
    }) as never);

    send({ type: "started", shell: pty.shell });
  }

  function closeAll() {
    for (const ws of sockets) ws.close(1001, "Plugin stopped");
    sockets.clear();
  }

  return { handleConnection, closeAll };
}
