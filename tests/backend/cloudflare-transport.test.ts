import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCloudflareTunnelStream: vi.fn(async () => "stream"),
}));

vi.mock("../../src/backend/cloudflare-tunnel.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createCloudflareTunnelStream: mocks.createCloudflareTunnelStream,
}));

const { registerCloudflareTransport } =
  await import("../../src/backend/cloudflare-transport.js");

function fakeCtx(values: Record<number, Record<string, unknown>>) {
  let provider: {
    claims: (id: number) => boolean;
    open: (host: { id: number; ip: string; port: number }) => Promise<unknown>;
  } | null = null;
  const ctx = {
    settings: {
      listHostValues: async (key: string) =>
        Object.entries(values)
          .filter(([, v]) => key in v)
          .map(([id, v]) => ({
            hostId: Number(id),
            userId: "u",
            value: v[key],
          })),
      getHost: async (id: number, key: string) => values[id]?.[key],
      onChange: vi.fn(),
    },
    schedule: { every: vi.fn() },
    ssh: {
      transports: {
        provide: (p: typeof provider) => {
          provider = p;
          return () => {};
        },
      },
    },
  };
  return { ctx, provider: () => provider! };
}

describe("cloudflare transport", () => {
  it("claims hosts with the tunnel on and opens it for any connection", async () => {
    const { ctx, provider } = fakeCtx({
      1: {
        cloudflareTunnelEnabled: true,
        cloudflareTunnelHostname: "ssh.example.com",
      },
      2: { cloudflareTunnelEnabled: false },
    });
    const transport = registerCloudflareTransport(ctx as never);
    await transport.refresh();

    expect(provider().claims(1)).toBe(true);
    expect(provider().claims(2)).toBe(false);
    expect(provider().claims(3)).toBe(false);

    await expect(
      provider().open({ id: 1, ip: "10.0.0.1", port: 22 }),
    ).resolves.toBe("stream");
    expect(mocks.createCloudflareTunnelStream).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "ssh.example.com", port: 443 }),
    );
  });
});
