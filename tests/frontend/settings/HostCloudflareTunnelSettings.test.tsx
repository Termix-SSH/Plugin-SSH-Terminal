import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HostCloudflareTunnelSettings } from "../../../src/frontend/settings/HostCloudflareTunnelSettings";

afterEach(cleanup);

type Form = Record<string, unknown>;

function renderComponent(form: Form = { pluginSettings: {} }) {
  let current: Form = form;
  const updateForm = vi.fn((patch: (form: Form) => Form) => {
    current = patch(current);
  });
  render(
    <HostCloudflareTunnelSettings
      form={form}
      updateForm={updateForm}
      host={{ id: "1", name: "box", ip: "ssh.example.com", port: 22 }}
    />,
  );
  return { updateForm, current: () => current };
}

describe("HostCloudflareTunnelSettings", () => {
  it("renders the Cloudflare Tunnel section card with toggle off by default", () => {
    renderComponent();
    expect(screen.getByText("terminal.cloudflareTunnelTitle")).toBeTruthy();
    expect(screen.getByText("terminal.enableCloudflareTunnel")).toBeTruthy();
    // Sub-settings should not be shown when disabled
    expect(screen.queryByText("terminal.cloudflareTunnelPort")).toBeNull();
  });

  it("toggles cloudflareTunnelEnabled when switch is clicked", () => {
    const { updateForm, current } = renderComponent();
    const switchButton = screen.getByRole("switch");
    fireEvent.click(switchButton);

    expect(updateForm).toHaveBeenCalled();
    const pluginSettings = (
      current().pluginSettings as Record<string, Record<string, unknown>>
    )["ssh-terminal"];
    expect(pluginSettings?.cloudflareTunnelEnabled).toBe(true);
  });

  it("shows port and service token fields when enabled", () => {
    renderComponent({
      ip: "ssh.example.com",
      pluginSettings: {
        "ssh-terminal": {
          cloudflareTunnelEnabled: true,
          cloudflareTunnelPort: 443,
          cloudflareTunnelClientId: "client-id-123",
          cloudflareTunnelClientSecret: "secret-456",
        },
      },
    });

    expect(screen.queryByText("terminal.cloudflareTunnelHostname")).toBeNull();
    expect(screen.getByText("terminal.cloudflareTunnelPort")).toBeTruthy();
    expect(screen.getByText("terminal.cloudflareTunnelClientId")).toBeTruthy();
    expect(
      screen.getByText("terminal.cloudflareTunnelClientSecret"),
    ).toBeTruthy();
  });

  it("renders configured secret indicator and Replace button when client secret is a redacted secret object { set: true }", () => {
    const { updateForm } = renderComponent({
      ip: "ssh.example.com",
      pluginSettings: {
        "ssh-terminal": {
          cloudflareTunnelEnabled: true,
          cloudflareTunnelClientSecret: { set: true },
        },
      },
    });

    // Should NOT show any input containing "[object Object]"
    expect(screen.queryByDisplayValue("[object Object]")).toBeNull();
    // Should show saved indicator
    expect(screen.getByText(/••••••••/)).toBeTruthy();
    const replaceBtn = screen.getByText("terminal.secretReplace");
    expect(replaceBtn).toBeTruthy();

    // Click Replace
    fireEvent.click(replaceBtn);
    expect(updateForm).toHaveBeenCalled();

    // Now input is shown, and its value is "" (NOT "[object Object]")
    const input = screen.getByPlaceholderText(
      "terminal.cloudflareTunnelClientSecretPlaceholderNew",
    ) as HTMLInputElement;
    expect(input.value).toBe("");

    // Cancel button should be shown
    const cancelBtn = screen.getByText("terminal.secretCancel");
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn);
    expect(updateForm).toHaveBeenCalled();
  });

  it("handles { set: false } without displaying [object Object]", () => {
    renderComponent({
      ip: "ssh.example.com",
      pluginSettings: {
        "ssh-terminal": {
          cloudflareTunnelEnabled: true,
          cloudflareTunnelClientSecret: { set: false },
        },
      },
    });

    expect(screen.queryByDisplayValue("[object Object]")).toBeNull();
    const input = screen.getByPlaceholderText(
      "terminal.cloudflareTunnelClientSecretPlaceholder",
    ) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("sanitizes literal string '[object Object]' from input value", () => {
    renderComponent({
      ip: "ssh.example.com",
      pluginSettings: {
        "ssh-terminal": {
          cloudflareTunnelEnabled: true,
          cloudflareTunnelClientSecret: "[object Object]",
        },
      },
    });

    expect(screen.queryByDisplayValue("[object Object]")).toBeNull();
    const input = screen.getByPlaceholderText(
      "terminal.cloudflareTunnelClientSecretPlaceholder",
    ) as HTMLInputElement;
    expect(input.value).toBe("");
  });
});
