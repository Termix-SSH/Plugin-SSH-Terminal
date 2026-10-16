import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import {
  createCloudflareTunnelStream,
  normalizeCloudflareEndpoint,
  resolveTunnelSettings,
} from "../../src/backend/cloudflare-tunnel.js";

describe("normalizeCloudflareEndpoint", () => {
  it("normalizes plain hostnames and sets default port 443", () => {
    expect(normalizeCloudflareEndpoint("ssh.example.com")).toEqual({
      hostname: "ssh.example.com",
      port: 443,
    });
  });

  it("strips schemes and trailing slashes, including typo protocols like httsp:// and http:/", () => {
    expect(normalizeCloudflareEndpoint("httsp://ssh.example.com")).toEqual({
      hostname: "ssh.example.com",
      port: 443,
    });
    expect(normalizeCloudflareEndpoint("httsp:/ssh.example.com")).toEqual({
      hostname: "ssh.example.com",
      port: 443,
    });
    expect(normalizeCloudflareEndpoint("https://ssh.example.com/")).toEqual({
      hostname: "ssh.example.com",
      port: 443,
    });
    expect(
      normalizeCloudflareEndpoint("wss://ssh.example.com/some/path"),
    ).toEqual({
      hostname: "ssh.example.com",
      port: 443,
    });
    expect(normalizeCloudflareEndpoint("ssh://ssh.example.com")).toEqual({
      hostname: "ssh.example.com",
      port: 443,
    });
  });

  it("extracts explicit port when present in host or URL", () => {
    expect(
      normalizeCloudflareEndpoint("https://ssh.example.com:8443/some/path"),
    ).toEqual({
      hostname: "ssh.example.com",
      port: 8443,
    });
    expect(normalizeCloudflareEndpoint("ssh.example.com:2222")).toEqual({
      hostname: "ssh.example.com",
      port: 2222,
    });
  });
});

describe("createCloudflareTunnelStream", () => {
  it("connects to websocket server and exchanges bidirectional data", async () => {
    const server = createServer();
    const wss = new WebSocketServer({ server });

    let serverReceived = "";
    wss.on("connection", (socket) => {
      socket.send("SSH-2.0-TestServer\r\n");
      socket.on("message", (data) => {
        serverReceived += data.toString();
      });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as AddressInfo).port;

    try {
      const logs: string[] = [];
      const stream = await createCloudflareTunnelStream({
        hostname: "127.0.0.1",
        port,
        timeoutMs: 5000,
        log: (_level, msg) => logs.push(msg),
      });

      const chunk = await new Promise<Buffer>((resolve) => {
        stream.once("data", resolve);
      });

      expect(chunk.toString()).toBe("SSH-2.0-TestServer\r\n");

      stream.write("SSH-2.0-Client\r\n");

      // Give a tick for websocket message delivery
      await new Promise((r) => setTimeout(r, 50));
      expect(serverReceived).toBe("SSH-2.0-Client\r\n");

      stream.destroy();
    } finally {
      wss.close();
      server.close();
    }
  });

  it("passes Cloudflare Access Service Token headers in handshake", async () => {
    const server = createServer();
    let receivedHeaders: Record<string, string | string[] | undefined> = {};

    server.on("upgrade", (req, socket, head) => {
      receivedHeaders = req.headers;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });

    const wss = new WebSocketServer({ noServer: true });
    wss.on("connection", (socket) => {
      socket.send("SSH-2.0-Banner\r\n");
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as AddressInfo).port;

    try {
      const stream = await createCloudflareTunnelStream({
        hostname: "127.0.0.1",
        port,
        clientId: "test-client-id-1234",
        clientSecret: "test-client-secret-5678",
        timeoutMs: 5000,
      });

      expect(receivedHeaders["cf-access-client-id"]).toBe(
        "test-client-id-1234",
      );
      expect(receivedHeaders["cf-access-client-secret"]).toBe(
        "test-client-secret-5678",
      );

      stream.destroy();
    } finally {
      wss.close();
      server.close();
    }
  });

  it("rejects with descriptive error when HTTP 403 Forbidden is returned", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
    });

    server.on("upgrade", (_req, socket) => {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as AddressInfo).port;

    try {
      await expect(
        createCloudflareTunnelStream({
          hostname: "127.0.0.1",
          port,
          timeoutMs: 3000,
        }),
      ).rejects.toThrow(
        /Cloudflare Access Zero Trust rejected the connection \(HTTP 403 Forbidden\)/,
      );
    } finally {
      server.close();
    }
  });

  it("rejects with descriptive error when HTTP 502 Bad Gateway is returned", async () => {
    const server = createServer();
    server.on("upgrade", (_req, socket) => {
      socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      socket.destroy();
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as AddressInfo).port;

    try {
      await expect(
        createCloudflareTunnelStream({
          hostname: "127.0.0.1",
          port,
          timeoutMs: 3000,
        }),
      ).rejects.toThrow(/Cloudflare Tunnel origin is unreachable \(HTTP 502\)/);
    } finally {
      server.close();
    }
  });
});

describe("resolveTunnelSettings", () => {
  const stored: Record<string, unknown> = {
    cloudflareTunnelEnabled: true,
    cloudflareTunnelHostname: "ssh.example.com",
    cloudflareTunnelPort: 443,
    cloudflareTunnelClientId: "id",
    cloudflareTunnelClientSecret: "secret",
  };
  const attacker = {
    "ssh-terminal": {
      cloudflareTunnelEnabled: true,
      cloudflareTunnelHostname: "evil.example.net",
    },
  };

  it("ignores client values for a saved host", async () => {
    const settings = await resolveTunnelSettings(
      async (key) => stored[key],
      attacker,
    );
    expect(settings.hostname).toBe("ssh.example.com");
    expect(settings.clientSecret).toBe("secret");
  });

  it("stays off for a saved host without a stored tunnel", async () => {
    const settings = await resolveTunnelSettings(
      async () => undefined,
      attacker,
    );
    expect(settings.enabled).toBe(false);
  });

  it("takes a quick connect's own values", async () => {
    const settings = await resolveTunnelSettings(null, attacker);
    expect(settings).toMatchObject({
      enabled: true,
      hostname: "evil.example.net",
      port: 443,
    });
  });
});
