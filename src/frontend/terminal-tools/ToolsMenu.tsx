import { Fragment, type ComponentType } from "react";
import {
  ClipboardCopy,
  Bell,
  Eraser,
  FileDown,
  Keyboard,
  KeyRound,
  Radio,
  RotateCcw,
  SearchCode,
  TerminalSquare,
  TextSelect,
} from "lucide-react";
import { toast } from "sonner";
import {
  copyToClipboard,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import type { TerminalHandle } from "../terminal/terminal-types";
import {
  fillPasswords,
  getBroadcastState,
  toggleBroadcast,
} from "./broadcast/broadcast-store";
import { linesToText } from "./buffer-lines";
import { downloadText, outputFileName } from "./save-output";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface ToolEntry {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  group: "session" | "find" | "output" | "fix" | "keys";
  run: () => void;
}

export interface ToolContext {
  /** Tab id. Embedded terminals have none, so they can't join a broadcast. */
  sessionId?: string;
  hostName: string;
  handle: () => TerminalHandle | null | undefined;
}

export const SEND_KEYS: ReadonlyArray<{ key: string; data: string }> = [
  { key: "Ctrl+C", data: "\x03" },
  { key: "Ctrl+Z", data: "\x1a" },
  { key: "Ctrl+\\", data: "\x1c" },
  { key: "Ctrl+D", data: "\x04" },
  { key: "Esc", data: "\x1b" },
];

/** Fills saved passwords where a terminal is asking and says how it went. */
export async function fillPasswordsWithToast(
  t: Translate,
  ids: readonly string[],
): Promise<void> {
  const { filled, notAsking, noPassword } = await fillPasswords(ids);
  if (filled > 0) {
    toast.success(t("terminalTools.fill.done", { count: filled }));
  }
  if (noPassword > 0) {
    toast.error(t("terminalTools.fill.noPassword", { count: noPassword }));
  }
  if (notAsking > 0) {
    toast.info(t("terminalTools.fill.notAsking", { count: notAsking }));
  }
}

function currentText(handle: TerminalHandle): string {
  return linesToText(handle.readBufferLines());
}

/** Every tool, for the toolbar, right click menu, palette and phone key row. */
export function buildToolEntries(t: Translate, ctx: ToolContext): ToolEntry[] {
  const { sessionId } = ctx;
  const withHandle = (run: (handle: TerminalHandle) => void) => () => {
    const handle = ctx.handle();
    if (handle) run(handle);
  };
  // The menu hands focus back to its button once it closes, so wait for that.
  const thenFocus = (run: (handle: TerminalHandle) => void) =>
    withHandle((handle) => {
      run(handle);
      setTimeout(() => handle.focus(), 50);
    });
  const saveAs = (text: string) => {
    if (!text) {
      toast.info(t("terminalTools.output.empty"));
      return;
    }
    downloadText(outputFileName(ctx.hostName), text);
  };
  const copy = (text: string) => {
    if (!text) {
      toast.info(t("terminalTools.output.empty"));
      return;
    }
    void copyToClipboard(text).then((copied) => {
      if (copied) toast.success(t("terminalTools.output.copied"));
      else toast.error(t("terminalTools.output.copyFailed"));
    });
  };

  const session: ToolEntry[] = sessionId
    ? [
        {
          key: "broadcast",
          group: "session",
          icon: Radio,
          label: getBroadcastState().members.includes(sessionId)
            ? t("terminalTools.broadcast.stop")
            : t("terminalTools.broadcast.start"),
          run: () => toggleBroadcast(sessionId),
        },
        {
          key: "fillPassword",
          group: "session",
          icon: KeyRound,
          label: t("terminalTools.fill.label"),
          run: () => {
            const { members } = getBroadcastState();
            void fillPasswordsWithToast(
              t,
              members.includes(sessionId) ? members : [sessionId],
            );
          },
        },
        {
          key: "findAll",
          group: "find",
          icon: SearchCode,
          label: t("terminalTools.find.all"),
          run: withHandle((handle) => handle.openTool("findAll")),
        },
        {
          key: "watch",
          group: "find",
          icon: Bell,
          label: t("terminalTools.watch.title"),
          run: withHandle((handle) => handle.openTool("watch")),
        },
      ]
    : [];

  return [
    ...session,
    {
      key: "saveOutput",
      group: "output",
      icon: FileDown,
      label: t("terminalTools.output.save"),
      run: withHandle((handle) => saveAs(currentText(handle))),
    },
    {
      key: "copyOutput",
      group: "output",
      icon: ClipboardCopy,
      label: t("terminalTools.output.copy"),
      run: withHandle((handle) => copy(currentText(handle))),
    },
    {
      key: "saveSelection",
      group: "output",
      icon: TextSelect,
      label: t("terminalTools.output.saveSelection"),
      run: withHandle((handle) => saveAs(handle.getSelection())),
    },
    {
      key: "resetDisplay",
      group: "fix",
      icon: RotateCcw,
      label: t("terminalTools.fix.resetDisplay"),
      run: thenFocus((handle) => handle.resetDisplay()),
    },
    {
      key: "clearScrollback",
      group: "fix",
      icon: Eraser,
      label: t("terminalTools.fix.clearScrollback"),
      run: thenFocus((handle) => handle.clearScrollback()),
    },
    {
      key: "resetShell",
      group: "fix",
      icon: TerminalSquare,
      label: t("terminalTools.fix.resetShell"),
      run: withHandle((handle) => handle.openTool("resetShell")),
    },
    ...SEND_KEYS.map(({ key, data }): ToolEntry => ({
      key: `send:${key}`,
      group: "keys",
      label: key,
      run: thenFocus((handle) => handle.typeInput(data)),
    })),
    {
      key: "sendCustomKey",
      group: "keys",
      icon: Keyboard,
      label: t("terminalTools.keys.custom"),
      run: withHandle((handle) => handle.openTool("sendKey")),
    },
  ];
}

function Item({ entry }: { entry: ToolEntry }) {
  return (
    <DropdownMenuItem onSelect={entry.run}>
      {entry.icon && <entry.icon className="size-3.5" />}
      {entry.label}
    </DropdownMenuItem>
  );
}

/** The tools as menu rows, with the keys tucked into their own submenu. */
export function ToolsMenuItems({
  entries,
  sendKeyLabel,
}: {
  entries: readonly ToolEntry[];
  sendKeyLabel: string;
}) {
  const groups = (["session", "find", "output", "fix"] as const)
    .map((group) => entries.filter((entry) => entry.group === group))
    .filter((group) => group.length > 0);
  const keys = entries.filter((entry) => entry.group === "keys");
  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={group[0].key}>
          {index > 0 && <DropdownMenuSeparator />}
          {group.map((entry) => (
            <Item key={entry.key} entry={entry} />
          ))}
        </Fragment>
      ))}
      {keys.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Keyboard className="size-3.5" />
              {sendKeyLabel}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {keys.map((entry) => (
                <Item key={entry.key} entry={entry} />
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      )}
    </>
  );
}
