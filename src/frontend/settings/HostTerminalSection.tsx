import type { HostEditorSectionProps } from "@termix-ssh/plugin-sdk/frontend";
import { HostFeatureFields } from "@termix-ssh/plugin-sdk/ui";
import { HostTerminalSettings } from "./HostTerminalSettings";
import { HostToolbarSettings } from "./HostToolbarSettings";

/** The host editor's Terminal tab: switches, the toolbar, then the look. */
export function HostTerminalSection({
  form,
  setField,
  updateForm,
  host,
}: HostEditorSectionProps) {
  return (
    <>
      <HostFeatureFields form={form} updateForm={updateForm} />
      <HostToolbarSettings form={form} updateForm={updateForm} host={host} />
      <HostTerminalSettings
        form={form}
        setField={setField}
        updateForm={updateForm}
        host={host}
      />
    </>
  );
}
