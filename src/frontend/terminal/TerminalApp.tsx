import React from "react";
import { Terminal } from "./Terminal";
import { tmuxAttachCommand } from "./tmux-attach-command";
import { CommandHistoryProvider } from "./command-history/CommandHistoryContext";
import {
  FullScreenAppWrapper,
  ConnectionScreen,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

interface TerminalAppProps {
  hostId?: string;
  /** tmux session to attach to once the shell is ready (tmux monitor "Attach"). */
  tmuxSession?: string;
}

const TerminalApp: React.FC<TerminalAppProps> = ({ hostId, tmuxSession }) => {
  const { t } = useTranslation();
  return (
    <FullScreenAppWrapper hostId={hostId}>
      {(hostConfig, phase) => {
        if (phase === "loading") {
          return (
            <div className="relative h-full w-full">
              <ConnectionScreen
                status="connecting"
                message={t("hosts.loadingHost")}
              />
            </div>
          );
        }

        if (!hostConfig) {
          return (
            <div className="relative h-full w-full">
              <ConnectionScreen
                status="error"
                unavailable={{ title: t("hosts.hostNotFound") }}
              />
            </div>
          );
        }

        return (
          <CommandHistoryProvider>
            <Terminal
              hostConfig={hostConfig}
              isVisible={true}
              title={
                hostConfig.name || `${hostConfig.username}@${hostConfig.ip}`
              }
              showTitle={false}
              splitScreen={false}
              onClose={() => {}}
              executeCommand={
                tmuxSession ? tmuxAttachCommand(tmuxSession) : undefined
              }
              tmuxSession={tmuxSession || undefined}
            />
          </CommandHistoryProvider>
        );
      }}
    </FullScreenAppWrapper>
  );
};

export default TerminalApp;
