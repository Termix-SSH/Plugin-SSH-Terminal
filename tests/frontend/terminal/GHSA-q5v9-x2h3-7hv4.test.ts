// @vitest-environment node
/**
 * The startup snippet, env exports and auto mosh run once per new shell, not
 * again on every reattach or when joining someone else's session.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldRunPostConnect } from "../../../src/frontend/terminal/post-connect.ts";

const source = fs.readFileSync(
  new URL("../../../src/frontend/terminal/Terminal.tsx", import.meta.url),
  "utf8",
);

describe("GHSA-q5v9-x2h3-7hv4 post connect setup", () => {
  it("runs only for a brand new shell", () => {
    expect(shouldRunPostConnect({ newSession: true })).toBe(true);
    expect(shouldRunPostConnect({})).toBe(false);
    expect(shouldRunPostConnect({ newSession: "true" })).toBe(false);
  });

  it("gates the setup in the connected handler", () => {
    const start = source.indexOf('} else if (msg.type === "connected") {');
    const end = source.indexOf('} else if (msg.type === "session_ended")');
    const handler = source.slice(start, end);
    expect(start).toBeGreaterThan(0);
    const gate = handler.indexOf("if (!shouldRunPostConnect(msg)) return;");
    expect(gate).toBeGreaterThan(0);
    for (const step of [
      "environmentVariables",
      "snippets.startupCommand",
      "settings.autoMosh",
    ]) {
      expect(handler.indexOf(step)).toBeGreaterThan(gate);
    }
  });
});
