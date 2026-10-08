import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const env = vi.hoisted(() => ({
  hostActions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSlotContributions: () => [],
  useHostActions: () => env.hostActions,
}));

import { HostToolbarSettings } from "../../../src/frontend/settings/HostToolbarSettings";

afterEach(cleanup);

type Form = Record<string, unknown>;

const Icon = () => null;
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
    when: (host: {
      pluginSettings?: { docker?: { enableDocker?: boolean } };
    }) => host.pluginSettings?.docker?.enableDocker === true,
  },
];

function renderSettings(
  values: Record<string, unknown> = {},
  extra: Form = {},
) {
  let current: Form = {
    pluginSettings: { "ssh-terminal": values, ...extra },
  };
  const updateForm = vi.fn((patch: (form: Form) => Form) => {
    current = patch(current);
  });
  render(<HostToolbarSettings form={current} updateForm={updateForm} />);
  const saved = () =>
    (current.pluginSettings as Record<string, Record<string, unknown>>)[
      "ssh-terminal"
    ];
  return { saved };
}

// Enable, live stats, then one per button in order.
const buttonSwitch = (index: number) =>
  screen.getAllByRole("switch")[2 + index];

describe("HostToolbarSettings", () => {
  it("hides the rest of the card when the toolbar is off", () => {
    renderSettings({ enableTerminalToolbar: false });
    expect(
      screen.getByText("settings.host.enableTerminalToolbar.label"),
    ).toBeTruthy();
    expect(
      screen.queryByText("settings.host.terminalToolbarButtons.label"),
    ).toBeNull();
  });

  it("lists the buttons this host offers", () => {
    renderSettings();
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.queryByText("Docker")).toBeNull();
    expect(screen.getByText("terminalToolbar.image")).toBeTruthy();
    expect(screen.getByText("terminalToolbar.detachTmux")).toBeTruthy();
    cleanup();
    renderSettings({}, { docker: { enableDocker: true } });
    expect(screen.getByText("Docker")).toBeTruthy();
  });

  it("saves the new order when a button moves", () => {
    const { saved } = renderSettings();
    const downs = screen.getAllByRole("button", {
      name: "settings.host.terminalToolbarButtons.moveDown",
    });
    fireEvent.click(downs[0]);
    expect(saved().terminalToolbarButtons).toEqual({
      order: ["terminal.image", "files", "terminal.tmuxDetach"],
      hidden: [],
    });
  });

  it("hides and shows a button", () => {
    const first = renderSettings();
    expect(buttonSwitch(0)).toHaveAttribute("aria-checked", "true");
    fireEvent.click(buttonSwitch(0));
    expect(first.saved().terminalToolbarButtons).toEqual({
      order: [],
      hidden: ["files"],
    });
    cleanup();
    const second = renderSettings({
      terminalToolbarButtons: { order: [], hidden: ["files"] },
    });
    expect(buttonSwitch(0)).toHaveAttribute("aria-checked", "false");
    fireEvent.click(buttonSwitch(0));
    expect(second.saved().terminalToolbarButtons).toEqual({
      order: [],
      hidden: [],
    });
  });

  it("saves the position and label choices", () => {
    const { saved } = renderSettings();
    const [position, labels] = screen.getAllByRole("combobox");
    fireEvent.change(position, { target: { value: "top" } });
    fireEvent.change(labels, { target: { value: "icons" } });
    expect(saved().terminalToolbarPosition).toBe("top");
    expect(saved().terminalToolbarLabels).toBe("icons");
  });
});
