import {
  ClipboardPaste,
  Copy,
  Eraser,
  Search,
  TextSelect,
  Wrench,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ToolsMenuItems, type ToolEntry } from "./ToolsMenu";

export interface TerminalMenuActions {
  hasSelection: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  /** Left out where the terminal has no find bar. */
  onFind?: () => void;
  onClear?: () => void;
  tools?: readonly ToolEntry[];
}

/** The terminal's own right click menu, opened where the pointer is. */
export function TerminalContextMenu({
  at,
  onClose,
  actions,
}: {
  at: { x: number; y: number } | null;
  onClose: () => void;
  actions: TerminalMenuActions;
}) {
  const { t } = useTranslation();
  if (!at) return null;
  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: at.x, top: at.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={0}>
        <DropdownMenuItem
          disabled={!actions.hasSelection}
          onSelect={actions.onCopy}
        >
          <Copy className="size-3.5" />
          {t("terminalTools.menu.copy")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onPaste}>
          <ClipboardPaste className="size-3.5" />
          {t("terminalTools.menu.paste")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.onSelectAll}>
          <TextSelect className="size-3.5" />
          {t("terminalTools.menu.selectAll")}
        </DropdownMenuItem>
        {actions.onFind && (
          <DropdownMenuItem onSelect={actions.onFind}>
            <Search className="size-3.5" />
            {t("terminalTools.menu.find")}
          </DropdownMenuItem>
        )}
        {actions.onClear && (
          <DropdownMenuItem onSelect={actions.onClear}>
            <Eraser className="size-3.5" />
            {t("terminalTools.menu.clear")}
          </DropdownMenuItem>
        )}
        {actions.tools && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Wrench className="size-3.5" />
                {t("terminalToolbar.tools")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <ToolsMenuItems
                  entries={actions.tools}
                  sendKeyLabel={t("terminalTools.keys.title")}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
