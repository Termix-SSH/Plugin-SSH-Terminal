import { describe, expect, it } from "vitest";
import { safeSignInUrl } from "../../../src/frontend/terminal/terminal-helpers";

describe("safeSignInUrl", () => {
  it("keeps web addresses", () => {
    expect(safeSignInUrl("https://login.tailscale.com/a/abc")).toBe(
      "https://login.tailscale.com/a/abc",
    );
    expect(safeSignInUrl("http://10.0.0.5:8888/@warpgate")).toBe(
      "http://10.0.0.5:8888/@warpgate",
    );
  });

  it("drops anything else an SSH server could send", () => {
    expect(safeSignInUrl("javascript:alert(1)")).toBeNull();
    expect(safeSignInUrl("data:text/html,hi")).toBeNull();
    expect(safeSignInUrl("file:///etc/passwd")).toBeNull();
    expect(safeSignInUrl("not a url")).toBeNull();
    expect(safeSignInUrl("")).toBeNull();
  });
});
