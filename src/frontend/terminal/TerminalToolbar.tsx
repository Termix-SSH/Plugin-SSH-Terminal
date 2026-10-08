import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, MoreHorizontal } from "lucide-react";

import {
  TERMINAL_TOOLBAR_STATUS_SLOT,
  type TerminalSlotApi,
} from "./terminal-slots";
import type { Host } from "../types";
import {
  countFittingButtons,
  readToolbarSettings,
  visibleButtons,
} from "./toolbar-settings";
import {
  IMAGE_BUTTON,
  TMUX_DETACH_BUTTON,
  useToolbarButtons,
  type ToolbarButtonInfo,
} from "./toolbar-buttons";
import {
  ComponentSlot,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  useIsMobile,
} from "@termix-ssh/plugin-sdk/ui";
import {
  invokeAction,
  useSlotContributions,
  useTabs,
  useTranslation,
  type PluginHostRecord,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";

const BUTTON =
  "inline-flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-muted data-[state=open]:text-foreground";

/** Below this the live stats give their room to the buttons. */
const STATUS_MIN_WIDTH = 640;

interface TerminalToolbarProps {
  host: Host;
  isConnected: boolean;
  isTmuxAttached: boolean;
  onTmuxDetach: () => void;
  isImageUploading: boolean;
  onUploadImage: (file: File) => void;
  onPasteImage: () => void;
  /** Opens the file manager at the shell's working directory. */
  onOpenFiles?: () => void;
  /** Handed to contributed actions when they are invoked. */
  slotApi?: TerminalSlotApi;
  /** Dims the strip of a split pane that is not focused. */
  isFocused?: boolean;
}

interface MenuEntry {
  key: string;
  label: string;
  icon?: ToolbarButtonInfo["icon"];
  disabled?: boolean;
  run: () => void;
}

/** A strip docked to the top or bottom edge of the terminal. */
export const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
  host,
  isConnected,
  isTmuxAttached,
  onTmuxDetach,
  isImageUploading,
  onUploadImage,
  onPasteImage,
  onOpenFiles,
  slotApi,
  isFocused = true,
}) => {
  const { t } = useTranslation();
  const tabs = useTabs();
  const isMobile = useIsMobile();
  const settings = useMemo(() => readToolbarSettings(host), [host]);
  const catalog = useToolbarButtons(host);
  const statusContributions = useSlotContributions(
    TERMINAL_TOOLBAR_STATUS_SLOT,
    { host },
  );
  const buttons = useMemo(
    () =>
      visibleButtons(catalog, settings.buttons).filter(
        (button) => button.id !== TMUX_DETACH_BUTTON || isTmuxAttached,
      ),
    [catalog, settings.buttons, isTmuxAttached],
  );
  const hasStatus = settings.showStatus && statusContributions.length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const labeledRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  // fit is how many buttons stay on the strip, null for all of them.
  const [layout, setLayout] = useState<{
    labeled: boolean;
    fit: number | null;
  }>(() => ({ labeled: settings.labels === "labeled", fit: null }));
  const [wide, setWide] = useState(true);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const root = rootRef.current;
    if (!row || !root) return;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const rootWidth = root.getBoundingClientRect().width;
      if (rootWidth > 0) setWide(rootWidth >= STATUS_MIN_WIDTH);
      const available = row.getBoundingClientRect().width;
      if (available <= 0) return;
      const widths = (measured: HTMLDivElement | null) =>
        Array.from(measured?.children ?? []).map(
          (child) => child.getBoundingClientRect().width,
        );
      const labeled = widths(labeledRef.current);
      const icons = widths(iconRef.current);
      // The last measured child is the overflow trigger.
      const overflowWidth = icons.pop() ?? 0;
      labeled.pop();
      const labeledTotal = labeled.reduce((sum, width) => sum + width, 0);
      const fit = countFittingButtons(icons, available, overflowWidth);
      const next =
        settings.labels === "labeled" && labeledTotal <= available
          ? { labeled: true, fit: null }
          : { labeled: false, fit: fit >= icons.length ? null : fit };
      setLayout((current) =>
        current.labeled === next.labeled && current.fit === next.fit
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (frame == null) frame = window.requestAnimationFrame(measure);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(row);
    observer?.observe(root);
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [buttons, settings.labels, t, isConnected, isMobile, hasStatus]);

  if (!isConnected || isMobile !== false) return null;

  const record = host as unknown as PluginHostRecord;
  const chooseFile = () => fileInputRef.current?.click();

  const runButton = (button: ToolbarButtonInfo) => {
    const { source } = button;
    if (source.kind === "action") {
      void invokeAction(source.contribution.actionId, slotApi);
    } else if (source.kind === "link") {
      // The file manager opens where the shell is.
      if (source.action.tabType === "files" && onOpenFiles) onOpenFiles();
      else if (source.action.run)
        source.action.run(record, tabs as unknown as ShellApi);
      else if (source.action.tabType)
        tabs.openTab(record, source.action.tabType);
    } else if (button.id === TMUX_DETACH_BUTTON) {
      onTmuxDetach();
    }
  };

  const imageEntries: MenuEntry[] = [
    {
      key: "upload",
      label: t("terminalToolbar.upload"),
      icon: ImagePlus,
      disabled: isImageUploading,
      run: chooseFile,
    },
    {
      key: "paste",
      label: t("terminalToolbar.paste"),
      icon: ClipboardPaste,
      disabled: isImageUploading,
      // Clipboard access must stay inside this click's activation.
      run: onPasteImage,
    },
  ];

  const titleOf = (button: ToolbarButtonInfo) =>
    button.id === TMUX_DETACH_BUTTON
      ? t("terminalToolbar.detachTmuxDescription")
      : t(button.titleKey);

  const content = (button: ToolbarButtonInfo, labeled: boolean) => {
    const Icon = button.icon;
    return (
      <>
        {Icon && <Icon className="size-3.5 shrink-0" />}
        {(labeled || !Icon) && <span>{t(button.titleKey)}</span>}
      </>
    );
  };

  const renderButton = (button: ToolbarButtonInfo) => {
    const title = titleOf(button);
    if (button.id === IMAGE_BUTTON) {
      return (
        <DropdownMenu key={button.id}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={BUTTON}
              aria-label={title}
              title={title}
              disabled={isImageUploading}
            >
              {content(button, layout.labeled)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={settings.position === "top" ? "bottom" : "top"}
            align="start"
          >
            {imageEntries.map((entry) => (
              <DropdownMenuItem
                key={entry.key}
                disabled={entry.disabled}
                onSelect={entry.run}
              >
                {entry.icon && <entry.icon className="size-3.5" />}
                {entry.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <button
        key={button.id}
        type="button"
        className={BUTTON}
        aria-label={title}
        title={title}
        onClick={() => runButton(button)}
      >
        {content(button, layout.labeled)}
      </button>
    );
  };

  const fit = layout.fit ?? buttons.length;
  const shown = buttons.slice(0, fit);
  const overflow = buttons.slice(fit);
  const overflowEntries: MenuEntry[] = overflow.flatMap((button) =>
    button.id === IMAGE_BUTTON
      ? imageEntries
      : [
          {
            key: button.id,
            label: t(button.titleKey),
            icon: button.icon,
            run: () => runButton(button),
          },
        ],
  );
  const measureRow = (labeled: boolean, ref: React.Ref<HTMLDivElement>) => (
    <div
      ref={ref}
      data-toolbar-measure={labeled ? "labeled" : "icons"}
      aria-hidden="true"
      className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap"
    >
      {buttons.map((button) => (
        <span key={button.id} className={BUTTON}>
          {content(button, labeled)}
        </span>
      ))}
      <span className={BUTTON}>
        <MoreHorizontal className="size-3.5" />
      </span>
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-terminal-toolbar
      data-position={settings.position}
      role="toolbar"
      aria-label={t("terminalToolbar.label")}
      className={cn(
        "relative z-[110] flex h-8 w-full shrink-0 items-center gap-1 border-border bg-background px-1",
        settings.position === "top" ? "border-b" : "border-t",
        !isFocused && "opacity-60 hover:opacity-100 focus-within:opacity-100",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        disabled={isImageUploading}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUploadImage(file);
        }}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {isImageUploading ? t("terminalToolbar.uploadingImage") : ""}
      </span>

      <div
        ref={rowRef}
        data-toolbar-buttons
        className="relative flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
      >
        {measureRow(true, labeledRef)}
        {measureRow(false, iconRef)}
        {shown.map(renderButton)}
        {overflowEntries.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={BUTTON}
                aria-label={t("terminalToolbar.more")}
                title={t("terminalToolbar.more")}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={settings.position === "top" ? "bottom" : "top"}
              align="start"
            >
              {overflowEntries.map((entry) => (
                <DropdownMenuItem
                  key={entry.key}
                  disabled={entry.disabled}
                  onSelect={entry.run}
                >
                  {entry.icon && <entry.icon className="size-3.5" />}
                  {entry.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {hasStatus && wide && (
        <div
          data-toolbar-status
          className="flex h-full shrink-0 items-center border-l border-border pl-1"
        >
          <ComponentSlot
            slotId={TERMINAL_TOOLBAR_STATUS_SLOT}
            when={{ host }}
            props={{ host, isConnected, active: isConnected }}
          />
        </div>
      )}
    </div>
  );
};
