import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Host } from "../../../src/frontend/types";

const env = vi.hoisted(() => ({
  isMobile: false as boolean | undefined,
  toolbar: [] as Array<Record<string, unknown>>,
  status: [] as Array<Record<string, unknown>>,
  hostActions: [] as Array<Record<string, unknown>>,
  invoked: [] as unknown[][],
  tabs: { openTab: vi.fn(), openSingletonTab: vi.fn() },
}));

vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTranslation: () => ({ t: (key: string) => key, language: "en" }),
  useSlotContributions: (slotId: string) =>
    slotId === "terminal.toolbar"
      ? env.toolbar
      : slotId === "terminal.toolbarStatus"
        ? env.status
        : [],
  useHostActions: () => env.hostActions,
  useTabs: () => env.tabs,
  invokeAction: (...args: unknown[]) => {
    env.invoked.push(args);
    return Promise.resolve();
  },
}));

vi.mock("@termix-ssh/plugin-sdk/ui", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIsMobile: () => env.isMobile,
  ComponentSlot: () => <span data-testid="status-slot" />,
}));

import { TerminalToolbar } from "../../../src/frontend/terminal/TerminalToolbar";

const Icon = () => null;
const host = { id: 7, connectionType: "ssh" } as unknown as Host;
const withSettings = (values: Record<string, unknown>) =>
  ({ ...host, pluginSettings: { "ssh-terminal": values } }) as unknown as Host;

function renderToolbar(
  overrides: Partial<React.ComponentProps<typeof TerminalToolbar>> = {},
) {
  const props: React.ComponentProps<typeof TerminalToolbar> = {
    host,
    isConnected: true,
    isTmuxAttached: false,
    onTmuxDetach: vi.fn(),
    isImageUploading: false,
    onUploadImage: vi.fn(),
    onPasteImage: vi.fn(),
    ...overrides,
  };
  return { ...render(<TerminalToolbar {...props} />), props };
}

/** Gives the strip a width and every measured button 40px. */
function stubWidths(row: number, root = 1000) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      let width = 0;
      if (this.hasAttribute("data-terminal-toolbar")) width = root;
      else if (this.hasAttribute("data-toolbar-buttons")) width = row;
      else if (this.parentElement?.hasAttribute("data-toolbar-measure"))
        width = 40;
      return {
        width,
        height: 32,
        top: 0,
        left: 0,
        right: width,
        bottom: 32,
      } as DOMRect;
    },
  );
}

const strip = () => screen.getByRole("toolbar");
const stripButton = (name: string) =>
  screen
    .queryAllByRole("button", { name })
    .find((button) => strip().contains(button));

beforeEach(() => {
  env.isMobile = false;
  env.toolbar = [];
  env.status = [];
  env.hostActions = [];
  env.invoked = [];
  env.tabs.openTab.mockClear();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TerminalToolbar", () => {
  it("renders nothing until connected, or on mobile", () => {
    renderToolbar({ isConnected: false });
    expect(screen.queryByRole("toolbar")).toBeNull();
    cleanup();
    env.isMobile = true;
    renderToolbar();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("docks to the bottom by default and to the top when the host asks", () => {
    renderToolbar();
    expect(strip()).toHaveAttribute("data-position", "bottom");
    expect(strip()).toHaveClass("border-t");
    cleanup();
    renderToolbar({ host: withSettings({ terminalToolbarPosition: "top" }) });
    expect(strip()).toHaveAttribute("data-position", "top");
    expect(strip()).toHaveClass("border-b");
  });

  it("opens host tools, the file manager at the shell directory first", async () => {
    const run = vi.fn();
    env.hostActions = [
      {
        id: "files",
        kind: "open",
        tabType: "files",
        titleKey: "Files",
        icon: Icon,
        when: () => true,
        run,
      },
      {
        id: "tunnel",
        kind: "open",
        tabType: "tunnel",
        titleKey: "Tunnels",
        icon: Icon,
        when: () => true,
      },
      {
        id: "gone",
        kind: "open",
        titleKey: "Gone",
        icon: Icon,
        when: () => false,
        run,
      },
      {
        id: "terminal",
        kind: "connect",
        tabType: "terminal",
        titleKey: "Terminal",
        icon: Icon,
        when: () => true,
      },
    ];
    const onOpenFiles = vi.fn();
    renderToolbar({ onOpenFiles });
    expect(stripButton("Gone")).toBeUndefined();
    expect(stripButton("Terminal")).toBeUndefined();
    await userEvent.click(stripButton("Files")!);
    expect(onOpenFiles).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    await userEvent.click(stripButton("Tunnels")!);
    expect(env.tabs.openTab).toHaveBeenCalledWith(expect.anything(), "tunnel");
  });

  it("hands contributed actions the terminal slot api", async () => {
    env.toolbar = [
      { actionId: "ai.open", titleKey: "AI", icon: Icon, kind: "button" },
    ];
    const slotApi = { getBufferText: () => "" } as never;
    renderToolbar({ slotApi });
    await userEvent.click(stripButton("AI")!);
    expect(env.invoked).toEqual([["ai.open", slotApi]]);
  });

  it("only shows tmux detach while attached", async () => {
    renderToolbar();
    expect(
      stripButton("terminalToolbar.detachTmuxDescription"),
    ).toBeUndefined();
    cleanup();
    const { props } = renderToolbar({ isTmuxAttached: true });
    await userEvent.click(
      stripButton("terminalToolbar.detachTmuxDescription")!,
    );
    expect(props.onTmuxDetach).toHaveBeenCalledOnce();
  });

  it("keeps image upload and paste under one button", async () => {
    const { props } = renderToolbar();
    await userEvent.click(stripButton("terminalToolbar.image")!);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "terminalToolbar.paste" }),
    );
    expect(props.onPasteImage).toHaveBeenCalledOnce();
  });

  it("uploads the chosen file", () => {
    const { props, container } = renderToolbar();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onUploadImage).toHaveBeenCalledWith(file);
  });

  it("follows the host's button order and hidden list", () => {
    env.hostActions = [
      {
        id: "files",
        kind: "open",
        tabType: "files",
        titleKey: "Files",
        icon: Icon,
        when: () => true,
      },
      {
        id: "docker",
        kind: "open",
        tabType: "docker",
        titleKey: "Docker",
        icon: Icon,
        when: () => true,
      },
    ];
    renderToolbar({
      host: withSettings({
        terminalToolbarButtons: {
          order: ["docker", "files"],
          hidden: ["terminal.image"],
        },
      }),
    });
    const names = Array.from(
      strip().querySelectorAll("[data-toolbar-buttons] > button"),
    ).map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Docker", "Files"]);
  });

  it("shows labels when they fit and icons only when the host asks", () => {
    env.hostActions = [
      {
        id: "files",
        kind: "open",
        tabType: "files",
        titleKey: "Files",
        icon: Icon,
        when: () => true,
      },
    ];
    stubWidths(500);
    renderToolbar();
    expect(stripButton("Files")).toHaveTextContent("Files");
    cleanup();
    renderToolbar({ host: withSettings({ terminalToolbarLabels: "icons" }) });
    expect(stripButton("Files")).not.toHaveTextContent("Files");
  });

  it("drops to icons, then moves what does not fit into a More menu", async () => {
    env.hostActions = ["a", "b", "c", "d"].map((id) => ({
      id,
      kind: "open",
      tabType: id,
      titleKey: id.toUpperCase(),
      icon: Icon,
      when: () => true,
    }));
    // Five buttons with the image one, 40px each: three fit beside More.
    stubWidths(160);
    renderToolbar();
    expect(stripButton("A")).not.toHaveTextContent("A");
    expect(stripButton("D")).toBeUndefined();
    await userEvent.click(stripButton("terminalToolbar.more")!);
    expect(await screen.findByRole("menuitem", { name: "D" })).toBeVisible();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "terminalToolbar.paste" }),
    );
  });

  it("shows live stats only on a wide strip with the setting on", () => {
    env.status = [{ actionId: "metrics", titleKey: "m", kind: "component" }];
    stubWidths(400, 1000);
    renderToolbar();
    expect(screen.getByTestId("status-slot")).toBeInTheDocument();
    cleanup();
    renderToolbar({
      host: withSettings({ terminalToolbarShowStatus: false }),
    });
    expect(screen.queryByTestId("status-slot")).toBeNull();
    cleanup();
    vi.restoreAllMocks();
    stubWidths(300, 500);
    renderToolbar();
    expect(screen.queryByTestId("status-slot")).toBeNull();
  });
});
