import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventEmitter } from "events";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import {
  REMOTE_FILE_DIR,
  REMOTE_IMAGE_DIR,
  remoteFileWriteTimeoutMs,
  selectImageStorageMode,
  storeFileViaSftp,
  storeImageLocally,
  storeImageViaSftp,
  TerminalImageStorageError,
  type ImageSftpClient,
} from "../../../src/backend/images/image-storage.js";
import type { TerminalImageStorageSettings } from "../../../src/backend/images/image-storage-settings.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function settings(
  overrides: Partial<TerminalImageStorageSettings>,
): TerminalImageStorageSettings {
  return {
    mode: "local",
    localDir: "/nonexistent",
    hostPath: "/tmp/termix-image-v0",
    ttlMs: 3_600_000,
    maxCount: 100,
    maxBytes: 5_368_709_120,
    localMappingConfigured: false,
    ...overrides,
  };
}

describe("selectImageStorageMode", () => {
  it("keeps explicit modes deterministic regardless of capability", () => {
    expect(
      selectImageStorageMode(settings({ mode: "local" }), {
        remoteSftpAvailable: true,
      }),
    ).toBe("local");
    expect(
      selectImageStorageMode(settings({ mode: "remote-sftp" }), {
        remoteSftpAvailable: false,
      }),
    ).toBe("remote-sftp");
  });

  it("falls back on capability only in auto mode", () => {
    expect(
      selectImageStorageMode(settings({ mode: "auto" }), {
        remoteSftpAvailable: true,
      }),
    ).toBe("remote-sftp");
    expect(
      selectImageStorageMode(settings({ mode: "auto" }), {
        remoteSftpAvailable: false,
      }),
    ).toBe("unavailable");
    expect(
      selectImageStorageMode(
        settings({ mode: "auto", localMappingConfigured: true }),
        { remoteSftpAvailable: false, localHostVisible: true },
      ),
    ).toBe("local");
  });
});

describe("storeImageLocally", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "termix-images-test-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function seedFile(bytes: number, mtimeMs?: number): Promise<string> {
    const name = `${randomUUID()}.png`;
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, Buffer.alloc(bytes));
    if (mtimeMs !== undefined) {
      const date = new Date(mtimeMs);
      await fs.utimes(filePath, date, date);
    }
    return name;
  }

  it("writes a UUID-named PNG and returns the agent-visible host path", async () => {
    const stored = await storeImageLocally(
      PNG_BYTES,
      settings({ localDir: dir, hostPath: "/host-view/images" }),
    );

    expect(stored.storage).toBe("local");
    expect(stored.filename).toBe(`${stored.id}.png`);
    expect(stored.shellPath).toBe(
      path.posix.join("/host-view/images", stored.filename),
    );
    expect(stored.shellPath).not.toContain(dir);
    await expect(fs.readFile(path.join(dir, stored.filename))).resolves.toEqual(
      PNG_BYTES,
    );
  });

  it("rejects with IMAGE_STORAGE_LIMIT_REACHED when the count cap is full", async () => {
    await seedFile(10);
    const error = await storeImageLocally(
      PNG_BYTES,
      settings({ localDir: dir, maxCount: 1 }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_STORAGE_LIMIT_REACHED",
    );
  });

  it("rejects with IMAGE_STORAGE_LIMIT_REACHED when the byte cap is full", async () => {
    await seedFile(900);
    const error = await storeImageLocally(
      Buffer.alloc(200),
      settings({ localDir: dir, maxBytes: 1_000 }),
    ).catch((caught: unknown) => caught);

    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_STORAGE_LIMIT_REACHED",
    );
  });

  it("cleans expired files during upload so they no longer count", async () => {
    await seedFile(10, Date.now() - 2 * 3_600_000);
    const stored = await storeImageLocally(
      PNG_BYTES,
      settings({ localDir: dir, maxCount: 1, ttlMs: 3_600_000 }),
    );

    expect(stored.storage).toBe("local");
    const remaining = await fs.readdir(dir);
    expect(remaining).toEqual([stored.filename]);
  });

  it("fails closed when local storage inspection is unavailable", async () => {
    const blocked = path.join(dir, "blocked-file");
    await fs.writeFile(blocked, "not a directory");

    const error = await storeImageLocally(
      PNG_BYTES,
      settings({ localDir: blocked }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_LOCAL_INSPECTION_FAILED",
    );
  });
  it("reports inspection failures before attempting a write", async () => {
    const blocked = path.join(dir, "blocked");
    await fs.writeFile(blocked, "not a directory");

    const error = await storeImageLocally(
      PNG_BYTES,
      settings({ localDir: path.join(blocked, "images") }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_LOCAL_INSPECTION_FAILED",
    );
  });
});

describe("storeImageViaSftp", () => {
  function fakeSftp(behavior: {
    mkdirError?: Error;
    writeError?: Error;
    stallWrite?: boolean;
    stallLock?: boolean;
    stallReaddir?: boolean;
    stallRmdir?: boolean;
    stallUnlink?: boolean;
    readdirEntries?: Array<{ filename: string; mtime?: number; size?: number }>;
    readdirError?: Error;
    statMode?: number;
  }): {
    sftp: ImageSftpClient;
    written: Map<string, Buffer>;
    calls: {
      mkdir: Array<{ dir: string; mode?: number }>;
      createWriteStream: Array<{ path: string; mode?: number }>;
    };
    streams: Array<
      NodeJS.WritableStream & { destroy: () => void; destroyed: boolean }
    >;
  } {
    const written = new Map<string, Buffer>();
    const streams: Array<
      NodeJS.WritableStream & { destroy: () => void; destroyed: boolean }
    > = [];
    const calls = { mkdir: [], createWriteStream: [] } as {
      mkdir: Array<{ dir: string; mode?: number }>;
      createWriteStream: Array<{ path: string; mode?: number }>;
    };
    const sftp = {
      mkdir: (
        dir: string,
        attrsOrCallback: { mode?: number } | ((err?: Error) => void),
        maybeCallback?: (err?: Error) => void,
      ) => {
        const callback =
          typeof attrsOrCallback === "function"
            ? attrsOrCallback
            : maybeCallback!;
        calls.mkdir.push({
          dir,
          mode:
            typeof attrsOrCallback === "function"
              ? undefined
              : attrsOrCallback.mode,
        });
        if (
          behavior.stallLock &&
          dir === `${REMOTE_IMAGE_DIR}/.termix-write-lock`
        ) {
          return;
        }
        callback(dir === REMOTE_IMAGE_DIR ? behavior.mkdirError : undefined);
      },
      stat: (
        _dir: string,
        callback: (error: Error | undefined, attrs?: { mode?: number }) => void,
      ) => callback(undefined, { mode: behavior.statMode ?? 0o40700 }),
      chmod: (_dir: string, _mode: number, callback: (error?: Error) => void) =>
        callback(),
      readdir: (
        _dir: string,
        callback: (
          error: Error | undefined,
          entries: Array<{
            filename: string;
            attrs?: { mtime?: number; size?: number };
          }>,
        ) => void,
      ) => {
        if (behavior.stallReaddir) return;
        callback(
          behavior.readdirError,
          behavior.readdirEntries?.map((entry) => ({
            filename: entry.filename,
            attrs: entry,
          })) ?? [],
        );
      },
      createWriteStream: (remotePath: string, options?: { mode?: number }) => {
        calls.createWriteStream.push({ path: remotePath, mode: options?.mode });
        const stream = new EventEmitter() as NodeJS.WritableStream & {
          end: (data: Buffer) => void;
          destroy: () => void;
          destroyed: boolean;
        };
        stream.destroyed = false;
        stream.destroy = () => {
          stream.destroyed = true;
        };
        streams.push(stream);
        (stream as { end: unknown }).end = (data: Buffer) => {
          if (behavior.stallWrite) return;
          queueMicrotask(() => {
            if (behavior.writeError) {
              stream.emit("error", behavior.writeError);
              return;
            }
            written.set(remotePath, data);
            stream.emit("close");
          });
        };
        return stream;
      },
      unlink: (_remotePath: string, callback: (error?: Error) => void) => {
        if (behavior.stallUnlink) return;
        callback();
      },
      rmdir: (_dir: string, callback: (error?: Error) => void) => {
        if (behavior.stallRmdir) return;
        callback();
      },
    } as unknown as ImageSftpClient;
    return { sftp, written, calls, streams };
  }

  it("stores Windows images under the SSH user's home and returns a native drive path", async () => {
    const { sftp, written, calls } = fakeSftp({});
    sftp.realpath = (_path, callback) =>
      callback(undefined, "/C:/Users/Test User");
    const stored = await storeImageViaSftp(sftp, PNG_BYTES, {
      maxCount: 100,
      maxBytes: 1000000,
    });
    expect(stored.shellPath).toBe(
      `C:/Users/Test User/.termix-images/${stored.id}.png`,
    );
    expect(
      written.get(`/C:/Users/Test User/.termix-images/${stored.id}.png`),
    ).toEqual(PNG_BYTES);
    expect(calls.mkdir.map((c) => c.dir)).toEqual([
      "/C:/Users/Test User/.termix-images",
      "/C:/Users/Test User/.termix-images/.termix-write-lock",
    ]);
  });

  it("keeps Unix image storage in /tmp after resolving the home", async () => {
    const { sftp } = fakeSftp({});
    sftp.realpath = (_path, callback) => callback(undefined, "/home/user");
    expect((await storeImageViaSftp(sftp, PNG_BYTES)).shellPath).toMatch(
      /^\/tmp\/termix-images\//,
    );
  });

  it("reports a failed home lookup without writing or deleting another path", async () => {
    const { sftp, calls } = fakeSftp({});
    sftp.realpath = (_path, callback) =>
      callback(new Error("lookup failed"), "");
    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch((e) => e);
    expect(error.code).toBe("IMAGE_REMOTE_WRITE_FAILED");
    expect(calls.mkdir).toEqual([]);
    expect(calls.createWriteStream).toEqual([]);
  });

  it("writes into the remote image directory and returns its POSIX path", async () => {
    const { sftp, written } = fakeSftp({});
    const stored = await storeImageViaSftp(sftp, PNG_BYTES);

    expect(stored.storage).toBe("remote-sftp");
    expect(stored.shellPath).toBe(`${REMOTE_IMAGE_DIR}/${stored.id}.png`);
    expect(written.get(stored.shellPath)).toEqual(PNG_BYTES);
  });

  it("requests restrictive modes for the remote directory and file", async () => {
    const { sftp, calls } = fakeSftp({});
    const stored = await storeImageViaSftp(sftp, PNG_BYTES);

    expect(stored.storage).toBe("remote-sftp");
    expect(calls.mkdir).toEqual([
      { dir: REMOTE_IMAGE_DIR, mode: 0o700 },
      { dir: `${REMOTE_IMAGE_DIR}/.termix-write-lock`, mode: 0o700 },
    ]);
    expect(calls.createWriteStream).toEqual([
      { path: stored.shellPath, mode: 0o600 },
    ]);
  });
  it("removes expired UUID PNGs with best-effort remote retention", async () => {
    const nowMs = 10_000_000;
    const expiredName = `${randomUUID()}.png`;
    const freshName = `${randomUUID()}.png`;
    const unlinked: string[] = [];
    const base = fakeSftp({});
    const sftp = base.sftp as ImageSftpClient & {
      readdir: (
        dir: string,
        callback: (
          err: Error | undefined,
          entries: Array<{ filename: string; attrs?: { mtime?: number } }>,
        ) => void,
      ) => void;
      unlink: (remotePath: string, callback: (err?: Error) => void) => void;
    };
    sftp.readdir = (_dir, callback) =>
      callback(undefined, [
        { filename: expiredName, attrs: { mtime: (nowMs - 7_200_000) / 1000 } },
        { filename: freshName, attrs: { mtime: nowMs / 1000 } },
        { filename: "other.txt", attrs: { mtime: 0 } },
      ]);
    sftp.unlink = (remotePath, callback) => {
      unlinked.push(remotePath);
      callback();
    };

    await storeImageViaSftp(sftp, PNG_BYTES, {
      ttlMs: 3_600_000,
      nowMs,
    });

    expect(unlinked).toEqual([`${REMOTE_IMAGE_DIR}/${expiredName}`]);
  });
  it("fails closed when remote quota inspection fails", async () => {
    const { sftp } = fakeSftp({
      readdirError: new Error("remote listing failed"),
    });
    const error = await storeImageViaSftp(sftp, PNG_BYTES, {
      maxCount: 10,
      maxBytes: 1024,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_QUOTA_UNAVAILABLE",
    );
  });

  it("rejects remote writes at the configured count limit", async () => {
    const { sftp } = fakeSftp({
      readdirEntries: [{ filename: `${randomUUID()}.png`, size: 12 }],
    });
    const error = await storeImageViaSftp(sftp, PNG_BYTES, {
      maxCount: 1,
      maxBytes: 1024,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_STORAGE_LIMIT_REACHED",
    );
  });

  it("destroys a stalled SFTP write after its timeout", async () => {
    const { sftp, streams } = fakeSftp({ stallWrite: true });
    const error = await storeImageViaSftp(sftp, PNG_BYTES, {
      writeTimeoutMs: 25,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
    expect(streams[0]!.destroyed).toBe(true);
  });
  it("rejects an existing remote path that is not a directory", async () => {
    const { sftp } = fakeSftp({
      mkdirError: new Error("Failure: file already exists"),
      statMode: 0o100644,
    });
    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
  });

  it("preserves SFTP client context for directory inspection", async () => {
    const base = fakeSftp({ mkdirError: new Error("already exists") });
    const sftp = base.sftp;
    sftp.lstat = function (
      this: ImageSftpClient,
      _dir: string,
      callback: (error: Error | undefined, attrs?: { mode?: number }) => void,
    ) {
      if (this !== sftp) {
        callback(new Error("SFTP context lost"));
        return;
      }
      callback(undefined, { mode: 0o40700 });
    };
    const result = await storeImageViaSftp(sftp, PNG_BYTES);
    expect(result.storage).toBe("remote-sftp");
  });

  it("tolerates mkdir failures for an already-existing directory", async () => {
    const { sftp } = fakeSftp({
      mkdirError: new Error("Failure: file already exists"),
    });
    await expect(storeImageViaSftp(sftp, PNG_BYTES)).resolves.toMatchObject({
      storage: "remote-sftp",
    });
  });

  it("cleans up a partially created remote file after a write failure", async () => {
    const { sftp } = fakeSftp({ writeError: new Error("write failed") });
    const unlinked: string[] = [];
    (sftp as ImageSftpClient).unlink = (remotePath, callback) => {
      unlinked.push(remotePath);
      callback();
    };

    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0]).toMatch(
      new RegExp(`${REMOTE_IMAGE_DIR}/[0-9a-f-]+\\.png`),
    );
  });

  it("preserves the write error when partial-file cleanup stalls", async () => {
    const { sftp } = fakeSftp({
      writeError: new Error("write failed"),
      stallUnlink: true,
    });
    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
  }, 5_000);

  it("recovers a stale remote lock before writing", async () => {
    const base = fakeSftp({});
    const sftp = base.sftp as ImageSftpClient;
    const lockPath = `${REMOTE_IMAGE_DIR}/.termix-write-lock`;
    let lockAttempt = 0;
    const removed: string[] = [];
    const originalMkdir = sftp.mkdir.bind(sftp);
    sftp.mkdir = (dir, attrs, callback) => {
      if (dir === lockPath && lockAttempt++ === 0) {
        (typeof attrs === "function" ? attrs : callback!)(new Error("exists"));
        return;
      }
      originalMkdir(dir, attrs, callback);
    };
    sftp.lstat = (_dir, callback) =>
      callback(undefined, {
        mode: 0o40700,
        mtime: (Date.now() - 60_000) / 1000,
      });
    sftp.rmdir = (dir, callback) => {
      removed.push(dir);
      callback();
    };

    await expect(storeImageViaSftp(sftp, PNG_BYTES)).resolves.toMatchObject({
      storage: "remote-sftp",
    });
    expect(removed).toContain(lockPath);
  });

  it("does not replace a successful write with an unlock failure", async () => {
    const base = fakeSftp({});
    const sftp = base.sftp as ImageSftpClient;
    const lockPath = `${REMOTE_IMAGE_DIR}/.termix-write-lock`;
    const originalMkdir = sftp.mkdir.bind(sftp);
    sftp.mkdir = (dir, attrs, callback) => originalMkdir(dir, attrs, callback);
    sftp.rmdir = (dir, callback) => {
      if (dir === lockPath) callback(new Error("unlock failed"));
      else callback();
    };

    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
  });

  it("fails closed when remote lock acquisition stalls", async () => {
    const { sftp } = fakeSftp({ stallLock: true });
    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
  }, 12_000);

  it("fails closed when remote quota inspection stalls", async () => {
    const { sftp } = fakeSftp({ stallReaddir: true });
    const error = await storeImageViaSftp(sftp, PNG_BYTES, {
      maxCount: 10,
      maxBytes: 1024,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
  }, 7_000);

  it("fails closed when remote expiry cleanup stalls", async () => {
    const { sftp } = fakeSftp({ stallReaddir: true });
    const error = await storeImageViaSftp(sftp, PNG_BYTES, {
      ttlMs: 1_000,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
  }, 7_000);

  it("fails closed when remote lock release stalls", async () => {
    const { sftp } = fakeSftp({ stallRmdir: true });
    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
  }, 5_000);

  it("maps SFTP failures to IMAGE_REMOTE_WRITE_FAILED", async () => {
    const { sftp } = fakeSftp({ writeError: new Error("Permission denied") });
    const error = await storeImageViaSftp(sftp, PNG_BYTES).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(TerminalImageStorageError);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
    expect((error as TerminalImageStorageError).message).toBe(
      "Failed to write image to the remote host",
    );
  });
});

describe("storeFileViaSftp", () => {
  const DIR_MODE = 0o040700;
  const FILE_MODE = 0o100600;
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const PDF_BYTES = Buffer.from("%PDF-1.7\n\u0000binary\u00ff");

  /** A small in-memory SFTP host: folders, files, modes and times. */
  function memoryHost(options: { home?: string; writeError?: Error } = {}) {
    const nowSeconds = () => Math.floor(Date.now() / 1000);
    const dirs = new Map<string, { mtime: number }>([
      ["/tmp", { mtime: 0 }],
      ["/C:/Users/Test User", { mtime: 0 }],
    ]);
    const files = new Map<
      string,
      { data: Buffer; mtime: number; mode?: number }
    >();
    const unreadable = new Set<string>();
    const lstatModes = new Map<string, number>();
    const calls = {
      mkdir: [] as Array<{ dir: string; mode?: number }>,
      createWriteStream: [] as Array<{ path: string; mode?: number }>,
    };
    const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";
    const childrenOf = (dir: string) => [
      ...[...dirs.keys()].filter((d) => parentOf(d) === dir && d !== dir),
      ...[...files.keys()].filter((f) => parentOf(f) === dir),
    ];
    const touch = (dir: string) => {
      const entry = dirs.get(dir);
      if (entry) entry.mtime = nowSeconds();
    };

    const sftp: ImageSftpClient = {
      realpath: options.home
        ? (_path, callback) => callback(undefined, options.home!)
        : undefined,
      mkdir(dir, attrsOrCallback, maybeCallback) {
        const callback =
          typeof attrsOrCallback === "function"
            ? attrsOrCallback
            : maybeCallback!;
        calls.mkdir.push({
          dir,
          mode:
            typeof attrsOrCallback === "function"
              ? undefined
              : attrsOrCallback.mode,
        });
        if (dirs.has(dir) || files.has(dir)) {
          callback(new Error("EEXIST"));
          return;
        }
        if (!dirs.has(parentOf(dir))) {
          callback(new Error("ENOENT"));
          return;
        }
        dirs.set(dir, { mtime: nowSeconds() });
        touch(parentOf(dir));
        callback();
      },
      lstat(target, callback) {
        const mode = lstatModes.get(target);
        if (mode !== undefined) callback(undefined, { mode, mtime: 0 });
        else if (dirs.has(target))
          callback(undefined, { mode: DIR_MODE, ...dirs.get(target) });
        else if (files.has(target))
          callback(undefined, { mode: FILE_MODE, mtime: 0 });
        else callback(new Error("ENOENT"));
      },
      chmod: (_target, _mode, callback) => callback(),
      readdir(dir, callback) {
        if (!dirs.has(dir) || unreadable.has(dir)) {
          callback(new Error("EACCES"), []);
          return;
        }
        callback(
          undefined,
          childrenOf(dir).map((child) => {
            const filename = child.slice(dir.length + 1);
            const file = files.get(child);
            return file
              ? {
                  filename,
                  attrs: {
                    mode: FILE_MODE,
                    mtime: file.mtime,
                    size: file.data.length,
                  },
                }
              : {
                  filename,
                  attrs: {
                    mode: DIR_MODE,
                    mtime: dirs.get(child)!.mtime,
                    size: 4096,
                  },
                };
          }),
        );
      },
      createWriteStream(remotePath, writeOptions) {
        calls.createWriteStream.push({
          path: remotePath,
          mode: writeOptions?.mode,
        });
        const stream = new EventEmitter() as NodeJS.WritableStream & {
          destroy: () => void;
        };
        stream.destroy = () => undefined;
        (stream as { end: unknown }).end = (data: Buffer) => {
          queueMicrotask(() => {
            if (options.writeError || !dirs.has(parentOf(remotePath))) {
              // A real host has created the file by the time a write fails.
              if (dirs.has(parentOf(remotePath)))
                files.set(remotePath, { data: Buffer.alloc(0), mtime: 0 });
              stream.emit("error", options.writeError ?? new Error("ENOENT"));
              return;
            }
            files.set(remotePath, {
              data: Buffer.from(data),
              mtime: nowSeconds(),
              mode: writeOptions?.mode,
            });
            touch(parentOf(remotePath));
            stream.emit("close");
          });
        };
        return stream;
      },
      unlink(remotePath, callback) {
        if (files.delete(remotePath)) callback();
        else callback(new Error("ENOENT"));
      },
      rmdir(dir, callback) {
        if (!dirs.has(dir)) callback(new Error("ENOENT"));
        else if (childrenOf(dir).length > 0) callback(new Error("ENOTEMPTY"));
        else {
          dirs.delete(dir);
          callback();
        }
      },
    };

    /** An earlier upload: a folder named by an id, holding one file. */
    function seedUpload(bytes: number, ageSeconds: number, id = randomUUID()) {
      if (!dirs.has(REMOTE_FILE_DIR)) dirs.set(REMOTE_FILE_DIR, { mtime: 0 });
      const mtime = nowSeconds() - ageSeconds;
      dirs.set(`${REMOTE_FILE_DIR}/${id}`, { mtime });
      files.set(`${REMOTE_FILE_DIR}/${id}/data.bin`, {
        data: Buffer.alloc(bytes),
        mtime,
      });
      return `${REMOTE_FILE_DIR}/${id}`;
    }

    const uploadFolders = () =>
      [...dirs.keys()].filter((dir) =>
        UUID.test(dir.slice(REMOTE_FILE_DIR.length + 1)),
      );

    return {
      sftp,
      dirs,
      files,
      calls,
      unreadable,
      lstatModes,
      seedUpload,
      uploadFolders,
    };
  }

  it("stores the file in a new random folder under its sanitised name", async () => {
    const host = memoryHost();
    const stored = await storeFileViaSftp(
      host.sftp,
      PDF_BYTES,
      "Q3 report (final).pdf",
    );

    expect(stored.storage).toBe("remote-sftp");
    expect(stored.filename).toBe("Q3_report__final_.pdf");
    const [root, tmp, dir, id, name] = stored.shellPath.split("/");
    expect([root, tmp, dir, name]).toEqual([
      "",
      "tmp",
      "termix-files",
      "Q3_report__final_.pdf",
    ]);
    expect(id).toMatch(UUID);
    expect(id).toBe(stored.id);
  });

  it("writes the bytes as they are", async () => {
    const host = memoryHost();
    const stored = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf");
    expect(host.files.get(stored.shellPath)?.data).toEqual(PDF_BYTES);
  });

  it("gives each upload its own folder, so equal names never collide", async () => {
    const host = memoryHost();
    const first = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf");
    const second = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf");
    expect(first.shellPath).not.toBe(second.shellPath);
    expect(host.uploadFolders()).toHaveLength(2);
  });

  it("requests restrictive modes for the folders and the file", async () => {
    const host = memoryHost();
    const stored = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf");
    expect(host.calls.mkdir).toEqual([
      { dir: REMOTE_FILE_DIR, mode: 0o700 },
      { dir: `${REMOTE_FILE_DIR}/.termix-write-lock`, mode: 0o700 },
      { dir: `${REMOTE_FILE_DIR}/${stored.id}`, mode: 0o700 },
    ]);
    expect(host.calls.createWriteStream).toEqual([
      { path: stored.shellPath, mode: 0o600 },
    ]);
  });

  it("types a path with no newline, quote or extra path segment", async () => {
    const host = memoryHost();
    const stored = await storeFileViaSftp(
      host.sftp,
      PDF_BYTES,
      "-rf\n../x;$(id)'.sh",
    );
    expect(stored.filename).toBe("rf_.._x___id__.sh");
    expect(stored.shellPath).toBe(
      `${REMOTE_FILE_DIR}/${stored.id}/rf_.._x___id__.sh`,
    );
  });

  it("leaves the image folder alone", async () => {
    const host = memoryHost();
    await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf");
    expect(host.dirs.has(REMOTE_IMAGE_DIR)).toBe(false);
  });

  it("stores Windows files under the SSH user's home", async () => {
    const host = memoryHost({ home: "/C:/Users/Test User" });
    const stored = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf");
    expect(stored.shellPath).toBe(
      `C:/Users/Test User/.termix-files/${stored.id}/a.pdf`,
    );
    expect(
      host.files.get(`/C:/Users/Test User/.termix-files/${stored.id}/a.pdf`)
        ?.data,
    ).toEqual(PDF_BYTES);
  });

  it("removes expired upload folders with their files, and nothing else", async () => {
    const host = memoryHost();
    const expired = host.seedUpload(10, 7_200);
    const fresh = host.seedUpload(10, 60);
    host.dirs.set(`${REMOTE_FILE_DIR}/keep`, { mtime: 0 });
    host.files.set(`${REMOTE_FILE_DIR}/notes.txt`, {
      data: Buffer.alloc(1),
      mtime: 0,
    });

    await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf", {
      ttlMs: 3_600_000,
    });

    expect(host.dirs.has(expired)).toBe(false);
    expect(host.files.has(`${expired}/data.bin`)).toBe(false);
    expect(host.dirs.has(fresh)).toBe(true);
    expect(host.dirs.has(`${REMOTE_FILE_DIR}/keep`)).toBe(true);
    expect(host.files.has(`${REMOTE_FILE_DIR}/notes.txt`)).toBe(true);
  });

  it("counts upload folders against the count limit", async () => {
    const host = memoryHost();
    host.seedUpload(10, 60);
    const error = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf", {
      maxCount: 1,
      maxBytes: 1_000_000,
    }).catch((caught: unknown) => caught);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_STORAGE_LIMIT_REACHED",
    );
    expect(host.uploadFolders()).toHaveLength(1);
  });

  it("counts the bytes in upload folders against the size limit", async () => {
    const host = memoryHost();
    host.seedUpload(600, 60);
    const error = await storeFileViaSftp(
      host.sftp,
      Buffer.alloc(500),
      "a.bin",
      { maxCount: 100, maxBytes: 1_000 },
    ).catch((caught: unknown) => caught);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_STORAGE_LIMIT_REACHED",
    );

    const fits = await storeFileViaSftp(host.sftp, Buffer.alloc(400), "b.bin", {
      maxCount: 100,
      maxBytes: 1_000,
    });
    expect(host.files.has(fits.shellPath)).toBe(true);
  });

  it("frees the limits once expired uploads are removed", async () => {
    const host = memoryHost();
    host.seedUpload(10, 7_200);
    const stored = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf", {
      ttlMs: 3_600_000,
      maxCount: 1,
      maxBytes: 1_000_000,
    });
    expect(host.uploadFolders()).toEqual([`${REMOTE_FILE_DIR}/${stored.id}`]);
  });

  it("fails closed when an upload folder cannot be listed", async () => {
    const host = memoryHost();
    host.unreadable.add(host.seedUpload(10, 60));
    const error = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf", {
      maxCount: 100,
      maxBytes: 1_000_000,
    }).catch((caught: unknown) => caught);
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_QUOTA_UNAVAILABLE",
    );
    expect(host.calls.createWriteStream).toEqual([]);
  });

  it("removes the new folder when the write fails", async () => {
    const host = memoryHost({ writeError: new Error("disk full") });
    const error = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf").catch(
      (caught: unknown) => caught,
    );
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
    expect(host.uploadFolders()).toEqual([]);
    expect(host.dirs.has(`${REMOTE_FILE_DIR}/.termix-write-lock`)).toBe(false);
  });

  it("refuses a /tmp/termix-files that is a symlink, and writes nothing", async () => {
    const host = memoryHost();
    host.files.set(REMOTE_FILE_DIR, { data: Buffer.alloc(0), mtime: 0 });
    host.lstatModes.set(REMOTE_FILE_DIR, 0o120777);
    const error = await storeFileViaSftp(host.sftp, PDF_BYTES, "a.pdf").catch(
      (caught: unknown) => caught,
    );
    expect((error as TerminalImageStorageError).code).toBe(
      "IMAGE_REMOTE_WRITE_FAILED",
    );
    expect(host.calls.createWriteStream).toEqual([]);
  });

  it("gives a large file a second per MiB on top of the image write time", () => {
    expect(remoteFileWriteTimeoutMs(1_024)).toBe(11_000);
    expect(remoteFileWriteTimeoutMs(50 * 1024 * 1024)).toBe(60_000);
  });
});
