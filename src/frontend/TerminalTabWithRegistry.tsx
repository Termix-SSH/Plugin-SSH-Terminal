import { useCallback, useEffect, useState } from "react";
import type { TabProps } from "@termix-ssh/plugin-sdk/frontend";
import { TerminalTabContent } from "./terminal/TerminalTabContent";
import type { TerminalHandle } from "./terminal/terminal-types";
import {
  registerSession,
  setActiveSession,
  updateSession,
} from "./session-registry";
import { assignRef } from "./lib/assign-ref";

/**
 * Registers the tab's terminal handle in the session registry, so
 * terminal.sendToActive/sendToSession (used by the snippets plugin, among
 * others) can reach a live session.
 */
export function TerminalTabWithRegistry(props: TabProps) {
  const tabRecord = props.tab as { id: string };
  const host = props.host as
    | {
        id: string;
        name?: string;
        ip?: string;
        username?: string;
        port?: number;
        folder?: string;
      }
    | undefined;
  const [handle, setHandle] = useState<TerminalHandle | null>(null);
  const { handleRef } = props;
  const trackHandle = useCallback(
    (value: TerminalHandle | null) => {
      assignRef(handleRef as React.Ref<TerminalHandle>, value);
      setHandle(value);
    },
    [handleRef],
  );

  // The handle is rebuilt on each connection change. Registering once keeps
  // the session's place in the list and its focus.
  const hasHandle = !!handle;
  useEffect(() => {
    if (!handle) return;
    return registerSession(
      {
        id: tabRecord.id,
        hostId: host ? Number(host.id) || null : null,
        hostName: host?.name,
        label: props.label,
        ip: host?.ip,
        username: host?.username,
        port: host?.port,
        folder: host?.folder,
      },
      handle,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHandle, tabRecord.id]);

  useEffect(() => {
    if (!handle) return;
    updateSession(tabRecord.id, {
      ref: handle,
      label: props.label,
      hostName: host?.name,
      folder: host?.folder,
      connected: handle.isConnected?.() ?? true,
      visible: props.isVisible,
    });
  }, [
    handle,
    tabRecord.id,
    props.label,
    props.isVisible,
    host?.name,
    host?.folder,
  ]);

  useEffect(() => {
    if (props.isFocusedPane) setActiveSession(tabRecord.id);
  }, [props.isFocusedPane, tabRecord.id]);

  return <TerminalTabContent {...props} handleRef={trackHandle} />;
}
