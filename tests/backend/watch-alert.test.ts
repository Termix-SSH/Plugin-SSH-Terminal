import { afterEach, describe, expect, it } from "vitest";
import type { PluginHostSummary } from "@termix-ssh/plugin-sdk/backend";
import { startServer, type TestServer } from "./helpers";

const host = { id: 1, name: "web-01" } as PluginHostSummary;
let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

describe("POST /watch-alert", () => {
  it("sends the caller an alert naming the rule and host", async () => {
    server = await startServer({ hosts: [host] });
    const res = await server.request("POST", "/watch-alert", {
      user: "watch-user-1",
      body: { hostId: 1, rule: "Build failed" },
    });
    expect(res.status).toBe(200);
    expect(server.mock.notifications).toHaveLength(1);
    const sent = server.mock.notifications[0].notification;
    expect(sent.title).toBe("Build failed on web-01");
    expect(sent.audience).toEqual({ userId: "watch-user-1" });
  });

  it("carries no terminal output, even if a client sends it", async () => {
    server = await startServer({ hosts: [host] });
    await server.request("POST", "/watch-alert", {
      user: "watch-user-2",
      body: { hostId: 1, rule: "r", line: "password=hunter2" },
    });
    expect(JSON.stringify(server.mock.notifications)).not.toContain("hunter2");
  });

  it.each([
    ["no host", { rule: "r" }],
    ["a host that is not a number", { hostId: "1", rule: "r" }],
    ["no rule", { hostId: 1 }],
    ["an empty rule", { hostId: 1, rule: "  " }],
    ["a very long rule", { hostId: 1, rule: "x".repeat(121) }],
  ])("rejects %s", async (_name, body) => {
    server = await startServer({ hosts: [host] });
    const res = await server.request("POST", "/watch-alert", {
      user: "watch-user-3",
      body,
    });
    expect(res.status).toBe(400);
    expect(server.mock.notifications).toHaveLength(0);
  });

  it("refuses a host the caller can't reach", async () => {
    server = await startServer({ hosts: [host] });
    const res = await server.request("POST", "/watch-alert", {
      user: "watch-user-4",
      body: { hostId: 999, rule: "r" },
    });
    expect(res.status).toBe(403);
    expect(server.mock.notifications).toHaveLength(0);
  });

  it("limits how many alerts a user can send in a minute", async () => {
    server = await startServer({ hosts: [host] });
    const send = () =>
      server!.request("POST", "/watch-alert", {
        user: "watch-user-5",
        body: { hostId: 1, rule: "r" },
      });
    for (let i = 0; i < 30; i++) expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });
});
