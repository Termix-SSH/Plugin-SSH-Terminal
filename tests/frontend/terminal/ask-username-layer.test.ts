// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("../../../src/frontend/terminal/Terminal.tsx", import.meta.url),
  "utf8",
);

describe("the $ask username prompt", () => {
  it("draws on the connection layer, above the Connecting screen", () => {
    const start = source.indexOf("open={askingUsername}");
    expect(start).toBeGreaterThan(-1);
    const prompt = source.slice(start, source.indexOf("title=", start));
    // The pane layer (z-50) sits under ConnectionScreen (z-[100]).
    expect(prompt).toContain('layer="connection"');
    expect(prompt).toContain("backgroundColor={backgroundColor}");
  });
});
