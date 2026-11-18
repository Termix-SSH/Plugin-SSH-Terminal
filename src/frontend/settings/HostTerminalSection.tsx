import type { HostEditorSectionProps } from "@termix-ssh/plugin-sdk/frontend";
import { HostFeatureFields } from "@termix-ssh/plugin-sdk/ui";
import { HostCloudflareTunnelSettings } from "./HostCloudflareTunnelSettings";
import { HostTerminalSettings } from "./HostTerminalSettings";
import { HostToolbarSettings } from "./HostToolbarSettings";
import { HostPanelSettings } from "./HostPanelSettings";

/** The host editor's Terminal tab: switches, the toolbar, the panel bar, then the look. Simple shows the switches and the look. */
export function HostTerminalSection(props: HostEditorSectionProps) {
  const { form, setField, updateForm, host } = props;
  // Only on SDK 2.10.0 types; older cores leave it unset, which means all.
  const advanced = (props as { advanced?: boolean }).advanced !== false;
  return (
    <>
      <HostFeatureFields form={form} updateForm={updateForm} />
      {advanced && (
        <>
          <HostToolbarSettings
            form={form}
            updateForm={updateForm}
            host={host}
          />
          <HostPanelSettings form={form} updateForm={updateForm} />
          <HostCloudflareTunnelSettings
            form={form}
            updateForm={updateForm}
            host={host}
          />
        </>
      )}
      <HostTerminalSettings
        form={form}
        setField={setField}
        updateForm={updateForm}
        host={host}
        advanced={advanced}
      />
    </>
  );
}
