import { Duplex } from "node:stream";
import WebSocket, { createWebSocketStream } from "ws";
import { isRedactedSecret } from "@termix-ssh/plugin-sdk/settings";
import { HOST_KEYS } from "./settings.js";

export interface CloudflareTunnelOptions {
  hostname: string;
  port?: number;
  protocol?: "ws" | "wss";
  clientId?: string;
  clientSecret?: string;
  timeoutMs?: number;
  log?: (level: "info" | "warning" | "error", message: string) => void;
}

export interface NormalizedTunnelEndpoint {
  hostname: string;
  port: number;
}

/**
 * Normalizes host/URL inputs, stripping any protocol schemes (even with typos like httsp:// or http:/),
 * paths, queries, and extracting explicit ports when present.
 */
export function normalizeCloudflareEndpoint(
  rawInput: string,
  defaultPort: number = 443,
): NormalizedTunnelEndpoint {
  let input = String(rawInput || "").trim();
  if (!input) {
    return { hostname: "", port: defaultPort };
  }

  // 1. Strip any URI scheme/protocol prefix, e.g. "https://", "httsp://", "http://", "wss://", "ssh://", etc.
  input = input.replace(/^[a-zA-Z0-9+.-]+:\/+/i, "");

  // 2. Strip any path, query string or hash (/foo, ?bar, #baz)
  input = input.split("/")[0].split("?")[0].split("#")[0].trim();

  // 3. Extract port from IPv6 [::1]:443 or host:port
  let hostname = input;
  let port = defaultPort;

  if (hostname.startsWith("[") && hostname.includes("]")) {
    const close = hostname.indexOf("]");
    const ipv6 = hostname.slice(1, close);
    const rest = hostname.slice(close + 1);
    hostname = ipv6;
    if (rest.startsWith(":")) {
      const p = parseInt(rest.slice(1), 10);
      if (!Number.isNaN(p) && p > 0 && p <= 65535) {
        port = p;
      }
    }
  } else if (hostname.includes(":")) {
    const parts = hostname.split(":");
    if (parts.length === 2) {
      const p = parseInt(parts[1], 10);
      if (!Number.isNaN(p) && p > 0 && p <= 65535) {
        hostname = parts[0];
        port = p;
      }
    }
  }

  hostname = hostname.replace(/[:/]+$/, "").trim();

  return { hostname, port };
}

/**
 * Creates a Node.js Duplex stream to an SSH server behind Cloudflare Tunnel (Zero Trust)
 * using native WebSocket encapsulation (WSS) without requiring external binaries.
 */
export async function createCloudflareTunnelStream(
  options: CloudflareTunnelOptions,
): Promise<Duplex> {
  const {
    hostname,
    port = 443,
    protocol,
    clientId,
    clientSecret,
    timeoutMs = 30000,
    log,
  } = options;

  const normalized = normalizeCloudflareEndpoint(hostname, port);
  const cleanHost = normalized.hostname;
  const cleanPort = port !== 443 ? port : normalized.port;

  return createWebSocketTunnelStream({
    hostname: cleanHost,
    port: cleanPort,
    protocol,
    clientId,
    clientSecret,
    timeoutMs,
    log,
  });
}

function createWebSocketTunnelStream(options: {
  hostname: string;
  port: number;
  protocol?: "ws" | "wss";
  clientId?: string;
  clientSecret?: string;
  timeoutMs: number;
  log?: (level: "info" | "warning" | "error", message: string) => void;
}): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const { hostname, port, protocol, clientId, clientSecret, timeoutMs, log } =
      options;

    const proto =
      protocol ??
      (hostname === "127.0.0.1" || hostname === "localhost" ? "ws" : "wss");
    const isStandardPort =
      (proto === "wss" && port === 443) || (proto === "ws" && port === 80);
    const url = isStandardPort
      ? `${proto}://${hostname}/`
      : `${proto}://${hostname}:${port}/`;
    log?.("info", `Initiating Cloudflare Tunnel connection to ${url}`);

    const headers: Record<string, string> = {
      Host: hostname,
      "User-Agent": "Termix-SSH-Terminal/1.0",
    };

    const validClientSecret =
      typeof clientSecret === "string" &&
      clientSecret.trim() !== "" &&
      clientSecret !== "[object Object]";

    if (clientId && validClientSecret) {
      headers["CF-Access-Client-Id"] = clientId.trim();
      headers["CF-Access-Client-Secret"] = clientSecret.trim();
      log?.("info", "Cloudflare Access Service Token headers attached");
    }

    let ws: WebSocket | null = null;
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    try {
      ws = new WebSocket(url, {
        headers,
        rejectUnauthorized: true,
        handshakeTimeout: timeoutMs,
      });
    } catch (err) {
      log?.(
        "error",
        `Failed to initialize WebSocket client: ${err instanceof Error ? err.message : String(err)}`,
      );
      reject(err);
      return;
    }

    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        log?.(
          "error",
          `Cloudflare Tunnel connection timed out after ${timeoutMs}ms`,
        );
        ws?.terminate();
        reject(
          new Error(
            `Cloudflare Tunnel connection timed out after ${timeoutMs}ms`,
          ),
        );
      }
    }, timeoutMs);

    ws.on("unexpected-response", (_req, res) => {
      if (settled) return;
      settled = true;
      cleanup();

      const statusCode = res.statusCode;
      let errorMsg = `Cloudflare Tunnel WebSocket handshake rejected with HTTP ${statusCode}`;

      if (statusCode === 403) {
        errorMsg =
          "Cloudflare Access Zero Trust rejected the connection (HTTP 403 Forbidden). " +
          "Verify your Service Token (CF-Access-Client-Id / CF-Access-Client-Secret) or Zero Trust Access policies.";
      } else if (statusCode === 502 || statusCode === 504) {
        errorMsg =
          `Cloudflare Tunnel origin is unreachable (HTTP ${statusCode}). ` +
          "Make sure cloudflared daemon is running on the origin server and the tunnel is healthy.";
      }

      log?.("error", errorMsg);
      ws?.terminate();
      reject(new Error(errorMsg));
    });

    ws.on("error", (err) => {
      log?.("error", `Cloudflare Tunnel WebSocket error: ${err.message}`);
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });

    ws.on("open", () => {
      if (settled) return;
      settled = true;
      cleanup();

      log?.("info", `Connected to Cloudflare Zero Trust Tunnel at ${hostname}`);

      const duplexStream = createWebSocketStream(ws!, {
        allowHalfOpen: false,
      });

      // Ensure underlying WebSocket is closed when duplex stream ends or is destroyed
      duplexStream.on("close", () => {
        if (
          ws &&
          (ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING)
        ) {
          ws.close();
        }
      });

      resolve(duplexStream);
    });
  });
}

export interface TunnelSettings {
  enabled: boolean;
  hostname: string;
  port: number;
  clientId: string;
  clientSecret: string;
}

const NO_TUNNEL: TunnelSettings = {
  enabled: false,
  hostname: "",
  port: 443,
  clientId: "",
  clientSecret: "",
};

const text = (value: unknown) =>
  typeof value === "string" && !isRedactedSecret(value) ? value : "";
const validPort = (value: unknown) =>
  typeof value === "number" && value > 0 && value < 65536 ? value : 443;

/**
 * A saved host only ever uses what is stored for it (readHost). Taking these
 * from the client would let a user who may only connect point the tunnel,
 * and the owner's credentials, at a server of their choosing. A quick connect
 * has nothing stored and brings its own values.
 */
export async function resolveTunnelSettings(
  readHost: ((key: string) => Promise<unknown>) | null,
  clientPluginSettings: unknown,
): Promise<TunnelSettings> {
  if (readHost) {
    try {
      if ((await readHost(HOST_KEYS.cloudflareTunnelEnabled)) !== true) {
        return NO_TUNNEL;
      }
      return {
        enabled: true,
        hostname: text(await readHost(HOST_KEYS.cloudflareTunnelHostname)),
        port: validPort(await readHost(HOST_KEYS.cloudflareTunnelPort)),
        clientId: text(await readHost(HOST_KEYS.cloudflareTunnelClientId)),
        clientSecret: text(
          await readHost(HOST_KEYS.cloudflareTunnelClientSecret),
        ),
      };
    } catch {
      return NO_TUNNEL;
    }
  }
  const all =
    clientPluginSettings && typeof clientPluginSettings === "object"
      ? (clientPluginSettings as Record<string, unknown>)
      : {};
  const own = all["ssh-terminal"];
  const client =
    own && typeof own === "object" ? (own as Record<string, unknown>) : {};
  if (client.cloudflareTunnelEnabled !== true) return NO_TUNNEL;
  return {
    enabled: true,
    hostname: text(client.cloudflareTunnelHostname),
    port: validPort(client.cloudflareTunnelPort),
    clientId: text(client.cloudflareTunnelClientId),
    clientSecret: text(client.cloudflareTunnelClientSecret),
  };
}
