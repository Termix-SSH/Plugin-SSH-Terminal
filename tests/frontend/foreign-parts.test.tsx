import { describe, expect, it } from "vitest";
import { renderWithApp } from "@termix-ssh/plugin-sdk/testing";
import * as plugin from "../../src/frontend/index";
import manifest from "../../manifest.json";

function OtherPart(props: Record<string, unknown>) {
  return <p>other part {String(props.hostId ?? "")}</p>;
}

describe("other plugins' parts", () => {
  it("draws what another plugin puts in terminal.sidePanel", async () => {
    const rendered = await renderWithApp(plugin, {
      manifest: manifest as never,
      others: {
        slots: {
          "terminal.sidePanel": [
            { actionId: "other.part", component: OtherPart },
          ],
        },
      },
    });
    const element = rendered.renderSlot("terminal.sidePanel", { hostId: 7 });
    expect(element.textContent).toContain("other part 7");
    await rendered.deactivate();
  });

  it("draws what another plugin puts in terminal.overlay", async () => {
    const rendered = await renderWithApp(plugin, {
      manifest: manifest as never,
      others: {
        slots: {
          "terminal.overlay": [
            { actionId: "other.part", component: OtherPart },
          ],
        },
      },
    });
    const element = rendered.renderSlot("terminal.overlay", { hostId: 7 });
    expect(element.textContent).toContain("other part 7");
    await rendered.deactivate();
  });
});
