import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  createCloudflareTunnelStream,
  normalizeCloudflareEndpoint,
  resolveTunnelSettings,
} from "./cloudflare-tunnel.js";
import { HOST_KEYS } from "./settings.js";

const REFRESH_MS = 60_000;

/**
 * Hosts with Cloudflare Tunnel on are reached through the tunnel by every SSH
 * connection, not only this plugin's terminal: core asks transports first, so
 * the file manager, snippets and the rest use it too.
 */
export function registerCloudflareTransport(ctx: PluginContext) {
  const enabled = new Set<number>();

  const refresh = async () => {
    try {
      const rows = await ctx.settings.listHostValues<boolean>(
        HOST_KEYS.cloudflareTunnelEnabled,
      );
      enabled.clear();
      for (const row of rows) if (row.value === true) enabled.add(row.hostId);
    } catch {
      // Keep the last known list.
    }
  };

  void refresh();
  ctx.settings.onChange(HOST_KEYS.cloudflareTunnelEnabled, () => {
    void refresh();
  });
  ctx.schedule.every(REFRESH_MS, refresh);

  const claims = (hostId: number) => enabled.has(hostId);

  ctx.ssh.transports.provide({
    claims,
    open: async (host) => {
      const tunnel = await resolveTunnelSettings(
        (key) => ctx.settings.getHost(host.id, key),
        null,
      );
      if (!tunnel.enabled) throw new Error("Cloudflare Tunnel is off");
      const endpoint = normalizeCloudflareEndpoint(
        tunnel.hostname || host.ip,
        tunnel.port || 443,
      );
      return createCloudflareTunnelStream({
        hostname: endpoint.hostname,
        port: endpoint.port,
        clientId: tunnel.clientId,
        clientSecret: tunnel.clientSecret,
      });
    },
  });

  return { claims, refresh };
}
