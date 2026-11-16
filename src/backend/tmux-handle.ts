import { randomUUID } from "node:crypto";
import type { Client, ClientChannel } from "ssh2";

/**
 * What the tmux.sessions service gets for a connection: plain functions,
 * since an ssh2 client or channel can't cross to another plugin's process.
 * The key stays the same for one connection, so the service can keep what it
 * learned about the host's shell.
 */
export interface TmuxShellHandle {
  termixShellKey: string;
  exec: (
    command: string,
  ) => Promise<{ stdout: string; stderr: string; code: number | null }>;
  write: (data: string) => void;
}

const keys = new WeakMap<object, string>();

/** Most a command's output may hold before it is cut off. */
const MAX_OUTPUT = 1024 * 1024;

export function tmuxHandle(
  conn: Client | null | undefined,
  stream?: ClientChannel | null,
): TmuxShellHandle {
  let key = conn ? keys.get(conn) : undefined;
  if (conn && !key) {
    key = randomUUID();
    keys.set(conn, key);
  }
  return {
    termixShellKey: key ?? randomUUID(),
    exec: (command) =>
      new Promise((resolve, reject) => {
        if (!conn) {
          reject(new Error("No SSH connection"));
          return;
        }
        conn.exec(command, (error, channel) => {
          if (error) {
            reject(error);
            return;
          }
          let stdout = "";
          let stderr = "";
          let code: number | null = null;
          channel.on("data", (chunk: Buffer) => {
            if (stdout.length < MAX_OUTPUT) stdout += chunk.toString("utf8");
          });
          channel.stderr.on("data", (chunk: Buffer) => {
            if (stderr.length < MAX_OUTPUT) stderr += chunk.toString("utf8");
          });
          channel.on("exit", (exitCode: number | null) => {
            code = exitCode;
          });
          channel.on("close", () => resolve({ stdout, stderr, code }));
        });
      }),
    write: (data) => {
      if (stream && stream.writable) stream.write(data);
    },
  };
}
