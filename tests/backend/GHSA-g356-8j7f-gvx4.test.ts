import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { cdCommandFor } from "../../src/backend/helpers.js";

function hasSh(): boolean {
  try {
    execFileSync("sh", ["-c", "true"]);
    return true;
  } catch {
    return false;
  }
}

describe("GHSA-g356-8j7f-gvx4 start folder typed into the shell", () => {
  it.each([
    "/srv/$(touch pwned)",
    "/srv/`touch pwned`",
    "/srv/a'b",
    '/srv/a"b',
    "/srv/$HOME",
  ])("keeps %j a literal path for POSIX shells", (path) => {
    const command = cdCommandFor(path);
    expect(command).not.toBeNull();
    expect(command!.endsWith("\r")).toBe(true);
    expect(command!.startsWith("cd '")).toBe(true);
    if (!hasSh()) return;
    const line = command!.slice(0, -1);
    // sh prints the argument cd would get, without running anything else.
    const out = execFileSync(
      "sh",
      ["-c", `set -- ${line.slice(3)}; printf %s "$1"`],
      {
        encoding: "utf8",
      },
    );
    expect(out).toBe(path);
  });

  it.each(["/srv/a\rb", "/srv/a\nrm -rf ~", "/srv/a\u0003"])(
    "refuses control characters in %j",
    (path) => {
      expect(cdCommandFor(path)).toBeNull();
    },
  );

  it.each([
    "C:/Users/me/$(calc)",
    "/C:/Users/me/`calc`",
    "C:/Users/%USERPROFILE%",
    'C:/Users/a"b',
  ])("does not type %j on Windows hosts", (path) => {
    expect(cdCommandFor(path)).toBeNull();
  });

  it("still opens plain Windows folders", () => {
    expect(cdCommandFor("/C:/Users/me/My Files")).toBe(
      'cd "C:\\Users\\me\\My Files"\r',
    );
  });

  it("is what the terminal socket types", () => {
    const source = fs.readFileSync(
      new URL("../../src/backend/terminal-socket.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("cdCommandFor(initialPath)");
    expect(source).not.toMatch(/cd "\$\{initialPath/);
  });
});
