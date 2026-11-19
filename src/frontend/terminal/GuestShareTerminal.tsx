import { useEffect, useRef } from "react";
import { useXTerm } from "react-xtermjs";
import { FitAddon } from "@xterm/addon-fit";
import { pluginWsUrl } from "@termix-ssh/plugin-sdk/ui";

/** The slot session sharing draws a shared terminal through. */
export const GUEST_TERMINAL_SLOT = "session.terminalView";

const PING_INTERVAL_MS = 30_000;

export interface GuestShareTerminalProps {
  /** `shareToken=...` or `roomGuestToken=...`, as the server handed it out. */
  query: string;
  readWrite?: boolean;
  onParticipants?: (participants: unknown[]) => void;
  onEnded?: () => void;
}

/** A guest's tokens in the query are the only ones the socket takes. */
export function guestQuery(query: string): string | null {
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  const out = new URLSearchParams();
  for (const name of ["shareToken", "roomGuestToken"]) {
    const value = params.get(name);
    if (value) out.set(name, value);
  }
  return out.size > 0 ? out.toString() : null;
}

/**
 * A shared session for someone watching through a link or a room. It draws
 * here, in ssh-terminal, because only this plugin can open its own socket.
 */
export function GuestShareTerminal({
  query,
  readWrite = false,
  onParticipants,
  onEnded,
}: GuestShareTerminalProps) {
  const { instance: terminal, ref: xtermRef } = useXTerm();
  const callbacks = useRef({ onParticipants, onEnded });
  callbacks.current = { onParticipants, onEnded };

  useEffect(() => {
    const tokens = guestQuery(query);
    if (!terminal || !xtermRef.current || !tokens) return;
    terminal.options.theme = { background: "#0c0d0b" };
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(xtermRef.current);
    fit.fit();

    let shared: { cols: number; rows: number } | null = null;
    const resize = new ResizeObserver(() => {
      if (shared) terminal.resize(shared.cols, shared.rows);
      else fit.fit();
    });
    resize.observe(xtermRef.current);

    let cancelled = false;
    let ws: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    const ended = () => void callbacks.current.onEnded?.();

    void pluginWsUrl("ssh-terminal", "/terminal").then((target) => {
      if (cancelled || !target) return;
      const separator = target.url.includes("?") ? "&" : "?";
      ws = new WebSocket(`${target.url}${separator}${tokens}`);
      ws.onopen = () => {
        ping = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };
      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        switch (msg.type) {
          case "resized": {
            const { cols, rows } = msg;
            if (
              Number.isInteger(cols) &&
              Number.isInteger(rows) &&
              (cols as number) > 0 &&
              (rows as number) > 0
            ) {
              shared = { cols: cols as number, rows: rows as number };
              terminal.resize(shared.cols, shared.rows);
            }
            break;
          }
          case "data":
            if (typeof msg.data === "string") terminal.write(msg.data);
            break;
          case "participants":
            if (Array.isArray(msg.participants)) {
              void callbacks.current.onParticipants?.(msg.participants);
            }
            break;
          case "sessionExpired":
          case "sessionTerminatedByOwner":
          case "session_ended":
            ended();
            break;
        }
      };
      ws.onclose = ended;
      if (readWrite) {
        terminal.onData((data) => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data }));
          }
        });
      }
    });

    return () => {
      cancelled = true;
      resize.disconnect();
      if (ping) clearInterval(ping);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [terminal, xtermRef, query, readWrite]);

  return <div ref={xtermRef} className="w-full h-full" />;
}
