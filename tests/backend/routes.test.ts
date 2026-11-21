import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PNG } from "pngjs";
import { startServer, type TestServer } from "./helpers";
import {
  BLUE,
  closeTo,
  halves,
  jpegClaiming,
  jpegImage,
  noisyJpeg,
  pixelAt,
  pngImage,
  RED,
  WEBP_BYTES,
} from "./images/image-fixtures";

let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

const history = (s: TestServer) =>
  s.db.sqlite
    .prepare(
      "SELECT user_id, host_id, command FROM p_ssh_terminal_command_history ORDER BY id",
    )
    .all();

const host = (id: number, userId = "user-1") => ({
  id,
  userId,
  name: `h${id}`,
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  tags: null,
  folder: null,
  authType: "password",
});
const hosts = [host(1), host(2)];

describe("command history routes", () => {
  it("saves, lists newest first without duplicates, deletes and clears", async () => {
    server = await startServer({ hosts });
    for (const command of ["ls", "pwd", "ls"]) {
      const saved = await server.request("POST", "/command-history", {
        body: { hostId: 1, command },
      });
      expect(saved.status).toBe(201);
    }
    await server.request("POST", "/command-history", {
      user: "user-2",
      body: { hostId: 1, command: "whoami" },
    });

    const listed = await server.request("GET", "/command-history/1");
    expect(listed.body).toEqual(["ls", "pwd"]);

    await server.request("POST", "/command-history/delete", {
      body: { hostId: 1, command: "pwd" },
    });
    expect((await server.request("GET", "/command-history/1")).body).toEqual([
      "ls",
    ]);

    await server.request("DELETE", "/command-history/1");
    expect(history(server)).toEqual([
      { user_id: "user-2", host_id: 1, command: "whoami" },
    ]);
    expect(server.db.persisted).toBeGreaterThan(0);
  });

  it("refuses a host the user can't reach without database details", async () => {
    server = await startServer({ hosts: [host(1)] });
    const missing = await server.request("POST", "/command-history", {
      body: { hostId: 2, command: "ls" },
    });
    expect(missing.status).toBe(404);
    expect(JSON.stringify(missing.body)).not.toMatch(/constraint|sqlite/i);
    const bad = await server.request("POST", "/command-history", {
      body: { hostId: "1; ls", command: "ls" },
    });
    expect(bad.status).toBe(400);
    expect(history(server)).toEqual([]);
  });

  it("acknowledges but never stores a command that looks like a secret", async () => {
    server = await startServer();
    const saved = await server.request("POST", "/command-history", {
      body: { hostId: 1, command: "export API_TOKEN=abc" },
    });
    expect(saved.status).toBe(201);
    expect(history(server)).toEqual([]);
  });

  it("stores nothing while command history is off globally", async () => {
    server = await startServer({ settings: { commandHistoryEnabled: false } });
    await server.request("POST", "/command-history", {
      body: { hostId: 1, command: "ls" },
    });
    expect(history(server)).toEqual([]);
  });

  it("stores nothing for a host that turned command history off", async () => {
    server = await startServer({ hosts });
    await server.mock.ctx.settings.setHost(2, "enableCommandHistory", false);
    await server.request("POST", "/command-history", {
      body: { hostId: 2, command: "ls" },
    });
    await server.request("POST", "/command-history", {
      body: { hostId: 1, command: "ls" },
    });
    expect(history(server)).toEqual([
      { user_id: "user-1", host_id: 1, command: "ls" },
    ]);
  });

  it("rejects a request missing its fields", async () => {
    server = await startServer();
    const saved = await server.request("POST", "/command-history", {
      body: { hostId: 1 },
    });
    expect(saved.status).toBe(400);
  });

  it("needs hosts.view for the recent list", async () => {
    server = await startServer({ permissions: [] });
    const denied = await server.request("GET", "/command-history/1/recent");
    expect(denied.status).toBe(403);
  });

  it("lists recent commands with duplicates for a hosts.view holder", async () => {
    server = await startServer({ permissions: ["hosts.view"], hosts });
    for (const command of ["uptime", "uptime"]) {
      await server.request("POST", "/command-history", {
        body: { hostId: 1, command },
      });
    }
    const allowed = await server.request("GET", "/command-history/1/recent");
    expect(allowed.body).toEqual(["uptime", "uptime"]);
  });
});

describe("client settings and image storage", () => {
  it("serves the terminal's settings to any signed-in user", async () => {
    server = await startServer({
      settings: { sessionTimeoutMinutes: 45, sessionPersistence: false },
    });
    const { body } = await server.request("GET", "/client-settings");
    expect(body.sessionTimeoutMinutes).toBe(45);
    expect(body.sessionPersistence).toBe(false);
    expect(body.commandHistoryEnabled).toBe(true);
    expect(body.touchInput.enabled).toBe(true);
  });

  it("refuses the image storage test to a non-admin", async () => {
    server = await startServer({ permissions: [] });
    const denied = await server.request("POST", "/image-storage/test", {
      body: { instanceId: "tab-1" },
    });
    expect(denied.status).toBe(403);
  });

  it("reports an unconnected session to an admin", async () => {
    server = await startServer({ permissions: ["admin.plugins.manage"] });
    const result = await server.request("POST", "/image-storage/test", {
      body: { instanceId: "tab-1" },
    });
    expect(result.status).toBe(200);
    expect(result.body.connected).toBe(false);
  });
});

describe("file upload", () => {
  const upload = (instanceId = "tab-1") => {
    const form = new FormData();
    form.append("file", new Blob(["%PDF"]), "report.pdf");
    form.append("instanceId", instanceId);
    return form;
  };

  it("needs a file", async () => {
    server = await startServer();
    const form = new FormData();
    form.append("instanceId", "tab-1");
    const result = await server.request("POST", "/file-upload", { body: form });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("FILE_MISSING");
  });

  it("needs the terminal tab it is for", async () => {
    server = await startServer();
    const result = await server.request("POST", "/file-upload", {
      body: upload(""),
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("FILE_SESSION_MISSING");
  });

  it("refuses files while image storage is set to local", async () => {
    server = await startServer({ settings: { imageStorageMode: "local" } });
    const result = await server.request("POST", "/file-upload", {
      body: upload(),
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("FILE_LOCAL_STORAGE_UNSUPPORTED");
  });

  it("says when the terminal is not connected", async () => {
    server = await startServer();
    const result = await server.request("POST", "/file-upload", {
      body: upload(),
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("FILE_TERMINAL_NOT_CONNECTED");
  });

  it("takes the upload in a field named file only", async () => {
    server = await startServer();
    const form = new FormData();
    form.append("image", new Blob(["%PDF"]), "report.pdf");
    form.append("instanceId", "tab-1");
    const result = await server.request("POST", "/file-upload", { body: form });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("LIMIT_UNEXPECTED_FILE");
  });
});

describe("image upload", () => {
  let dir: string | null = null;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = null;
  });

  /** Uploads one image with storage in a local folder; returns the stored file. */
  async function uploadImage(bytes: Buffer, name: string) {
    // Forward slashes: the storage settings refuse a path with a backslash.
    dir = (
      await fs.mkdtemp(path.join(os.tmpdir(), "termix-image-upload-"))
    ).replaceAll("\\", "/");
    server = await startServer({
      settings: {
        imageStorageMode: "local",
        imageLocalDir: dir,
        imageHostPath: "/mnt/termix-images",
      },
    });
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(bytes)]), name);
    form.append("instanceId", "tab-1");
    form.append("source", "file");
    const result = await server.request("POST", "/image-upload", {
      body: form,
    });
    const stored =
      result.status === 200
        ? await fs.readFile(path.join(dir, result.body.filename))
        : null;
    return { ...result, stored };
  }

  it("stores a PNG as a PNG", async () => {
    const pixels = halves(8, 4);
    const result = await uploadImage(pngImage(8, 4, pixels), "shot.png");
    expect(result.status).toBe(200);
    expect(result.body.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(result.body.shellPath).toBe(
      `/mnt/termix-images/${result.body.filename}`,
    );
    const png = PNG.sync.read(result.stored!);
    expect(png.data).toEqual(pixels);
  });

  it("stores a JPEG with EXIF orientation 6 as an upright PNG", async () => {
    const result = await uploadImage(jpegImage(32, 16, 6), "photo.jpg");
    expect(result.status).toBe(200);
    expect(result.body.filename).toMatch(/\.png$/);
    const png = PNG.sync.read(result.stored!);
    expect([png.width, png.height]).toEqual([16, 32]);
    expect(closeTo(pixelAt(png, 8, 4), RED)).toBe(true);
    expect(closeTo(pixelAt(png, 8, 28), BLUE)).toBe(true);
  });

  it("stores a WebP as it came", async () => {
    // Named .png on purpose: the type comes from the bytes.
    const result = await uploadImage(WEBP_BYTES, "sticker.png");
    expect(result.status).toBe(200);
    expect(result.body.filename).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(result.stored).toEqual(WEBP_BYTES);
  });

  it("stores a JPEG over 16 MP as it came", async () => {
    const jpeg = jpegClaiming(4200, 4000, 6);
    const result = await uploadImage(jpeg, "photo.jpg");
    expect(result.status).toBe(200);
    expect(result.body.filename).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(result.stored).toEqual(jpeg);
  });

  it("stores a photo as it came when its PNG would be over 10 MB", async () => {
    // About 7 MB as a JPEG and 12 MB as a PNG.
    const jpeg = noisyJpeg(2000, 2000);
    const result = await uploadImage(jpeg, "photo.jpg");
    expect(result.status).toBe(200);
    expect(result.body.filename).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(result.stored!.equals(jpeg)).toBe(true);
  });

  it("refuses an image over 10 MB without converting it", async () => {
    // A small picture with 11 MB after it, like a photo with a video inside.
    const jpeg = Buffer.concat([
      jpegImage(32, 16, 6),
      Buffer.alloc(11 * 1024 * 1024),
    ]);
    const result = await uploadImage(jpeg, "photo.jpg");
    expect(result.status).toBe(413);
    expect(result.body).toEqual({
      error: "Image is larger than 10 MB",
      code: "IMAGE_NORMALIZED_SIZE_LIMIT",
    });
  });

  it("refuses a file that is not an image it knows", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const result = await uploadImage(svg, "logo.png");
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("IMAGE_FORMAT_UNSUPPORTED");
  });
});

describe("terminal settings routes", () => {
  it("gives a host-less terminal the user's default look", async () => {
    server = await startServer();
    await server.mock.ctx.settings.setUser("user-1", "theme", "dracula");
    await server.mock.ctx.settings.setUser("user-1", "fontSize", 18);
    const { status, body } = await server.request("GET", "/default-appearance");
    expect(status).toBe(200);
    expect(body.theme).toBe("dracula");
    expect(body.fontSize).toBe(18);
  });

  it("hands every user their own terminal settings", async () => {
    server = await startServer();
    await server.mock.ctx.settings.setUser(
      "user-1",
      "commandAutocomplete",
      true,
    );
    const { body } = await server.request("GET", "/client-settings");
    expect(body.user).toEqual({
      customThemes: [],
      commandAutocomplete: true,
      zmodem: true,
      rightClickAction: "copyPaste",
      ctrlVPaste: true,
      copyOnSelect: false,
      gpuRendering: true,
      inlineImages: true,
    });
    expect(body).not.toHaveProperty("newHostDefaults");
    const other = await server.request("GET", "/client-settings", {
      user: "user-2",
    });
    expect(other.body.user.commandAutocomplete).toBe(false);
  });

  it("saves the browser preferences a user moves over, for that user only", async () => {
    server = await startServer();
    const saved = await server.request("PUT", "/user-settings", {
      body: { commandAutocomplete: true, localEcho: "on", theme: "x" },
    });
    expect(saved.status).toBe(200);
    expect(
      await server.mock.ctx.settings.getUser("user-1", "commandAutocomplete"),
    ).toBe(true);
    expect(
      await server.mock.ctx.settings.getUser("user-1", "localEcho"),
    ).toBeUndefined();
    expect(
      await server.mock.ctx.settings.getUser("user-2", "commandAutocomplete"),
    ).not.toBe(true);
  });

  it("moves browser clipboard preferences to the account", async () => {
    server = await startServer();
    const saved = await server.request("PUT", "/user-settings", {
      body: {
        rightClickAction: "native",
        ctrlVPaste: false,
        copyOnSelect: true,
      },
    });
    expect(saved.status).toBe(200);
    const { body } = await server.request("GET", "/client-settings");
    expect(body.user).toMatchObject({
      rightClickAction: "native",
      ctrlVPaste: false,
      copyOnSelect: true,
    });
  });

  it("falls back to the default for a right click choice that does not exist", async () => {
    server = await startServer();
    await server.request("PUT", "/user-settings", {
      body: { rightClickAction: "nonsense" },
    });
    const { body } = await server.request("GET", "/client-settings");
    expect(body.user.rightClickAction).toBe("copyPaste");
  });

  it("turns auto tmux on for a host the user can edit", async () => {
    server = await startServer({ hosts: [host(1)] });
    const saved = await server.request("PUT", "/hosts/1/auto-tmux", {
      body: { enabled: true },
    });
    expect(saved.status).toBe(200);
    expect(await server.mock.ctx.settings.getHost(1, "autoTmux")).toBe(true);
  });

  it("refuses auto tmux on a host the user cannot reach, or a bad body", async () => {
    server = await startServer({ hosts: [host(1)] });
    const unknown = await server.request("PUT", "/hosts/2/auto-tmux", {
      body: { enabled: true },
    });
    expect(unknown.status).toBe(403);
    const bad = await server.request("PUT", "/hosts/1/auto-tmux", {
      body: { enabled: "yes" },
    });
    expect(bad.status).toBe(400);
  });
});
