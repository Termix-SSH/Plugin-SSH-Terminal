import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { tmuxHandle } from "../../src/backend/tmux-handle.js";

function fakeConn(stdout: string, code: number) {
  return {
    exec: vi.fn((_command: string, cb: (e: unknown, c: unknown) => void) => {
      const channel = Object.assign(new EventEmitter(), {
        stderr: new EventEmitter(),
      });
      cb(undefined, channel);
      setImmediate(() => {
        channel.emit("data", Buffer.from(stdout));
        channel.emit("exit", code);
        channel.emit("close");
      });
    }),
  };
}

describe("tmux shell handle", () => {
  it("keeps one key per connection and runs commands on it", async () => {
    const conn = fakeConn("tmux 3.4\n", 0);
    const first = tmuxHandle(conn as never);
    const second = tmuxHandle(conn as never);
    expect(first.termixShellKey).toBe(second.termixShellKey);
    await expect(first.exec("tmux -V")).resolves.toEqual({
      stdout: "tmux 3.4\n",
      stderr: "",
      code: 0,
    });
    expect(conn.exec).toHaveBeenCalledWith("tmux -V", expect.any(Function));
  });

  it("writes to the shell only while it is writable", () => {
    const write = vi.fn();
    tmuxHandle(null, { writable: true, write } as never).write("a");
    tmuxHandle(null, { writable: false, write } as never).write("b");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("a");
  });

  it("refuses a command with no connection", async () => {
    await expect(tmuxHandle(null).exec("ls")).rejects.toThrow(
      /No SSH connection/,
    );
  });
});
