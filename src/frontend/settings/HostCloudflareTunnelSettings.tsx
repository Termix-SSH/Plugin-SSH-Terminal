import { useState } from "react";
import { Cloud, Eye, EyeOff } from "lucide-react";
import {
  Button,
  FakeSwitch,
  Input,
  SectionCard,
  SettingRow,
} from "@termix-ssh/plugin-sdk/ui";
import {
  useTranslation,
  type HostEditorSectionProps,
} from "@termix-ssh/plugin-sdk/frontend";

const PLUGIN_ID = "ssh-terminal";

type HostPluginSettings = Record<string, Record<string, unknown>>;

function isRedactedSecret(value: unknown): value is { set: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { set?: unknown }).set === "boolean"
  );
}

export function HostCloudflareTunnelSettings({
  form: _form,
  updateForm,
}: Pick<HostEditorSectionProps, "form" | "updateForm" | "host">) {
  const { t } = useTranslation();
  const [showSecret, setShowSecret] = useState(false);
  const [isEditingSecret, setIsEditingSecret] = useState(false);

  const stored = ((_form?.pluginSettings as HostPluginSettings)?.[PLUGIN_ID] ??
    {}) as Record<string, unknown>;

  const enabled = stored.cloudflareTunnelEnabled === true;
  const port =
    typeof stored.cloudflareTunnelPort === "number"
      ? stored.cloudflareTunnelPort
      : 443;
  const clientId = (stored.cloudflareTunnelClientId as string) || "";
  const rawSecret = stored.cloudflareTunnelClientSecret;

  const isRedacted = isRedactedSecret(rawSecret);
  const isSecretConfigured = isRedacted && rawSecret.set;

  // Clean string representation for typing: ensure object or "[object Object]" is never passed to input value
  const secretText =
    typeof rawSecret === "string" && rawSecret !== "[object Object]"
      ? rawSecret
      : "";

  const write = (values: Record<string, unknown>) =>
    updateForm((current) => {
      const all = (current.pluginSettings ?? {}) as HostPluginSettings;
      return {
        ...current,
        pluginSettings: {
          ...all,
          [PLUGIN_ID]: { ...(all[PLUGIN_ID] ?? {}), ...values },
        },
      };
    });

  return (
    <SectionCard
      title={t(
        "terminal.cloudflareTunnelTitle",
        "Cloudflare Tunnel (Zero Trust)",
      )}
      icon={<Cloud className="size-3.5" />}
    >
      <SettingRow
        label={t("terminal.enableCloudflareTunnel", "Enable Cloudflare Tunnel")}
        description={t(
          "terminal.enableCloudflareTunnelDesc",
          "Route SSH traffic through Cloudflare Zero Trust (WSS) using the host's main address instead of direct TCP sockets.",
        )}
      >
        <FakeSwitch
          checked={enabled}
          onChange={(checked) => write({ cloudflareTunnelEnabled: checked })}
        />
      </SettingRow>

      {enabled && (
        <>
          <SettingRow
            label={t("terminal.cloudflareTunnelPort", "Tunnel Port")}
            description={t(
              "terminal.cloudflareTunnelPortDesc",
              "Edge HTTPS/WSS port on Cloudflare (default is 443).",
            )}
          >
            <Input
              type="number"
              value={port}
              onChange={(e) =>
                write({
                  cloudflareTunnelPort: e.target.value
                    ? Number(e.target.value)
                    : 443,
                })
              }
              placeholder="443"
              className="max-w-xs"
            />
          </SettingRow>

          <SettingRow
            label={t(
              "terminal.cloudflareTunnelClientId",
              "Service Token Client ID",
            )}
            description={t(
              "terminal.cloudflareTunnelClientIdDesc",
              "Optional CF-Access-Client-Id header. Required only if Cloudflare Access Zero Trust policy enforces Service Tokens.",
            )}
          >
            <Input
              value={clientId}
              onChange={(e) =>
                write({ cloudflareTunnelClientId: e.target.value })
              }
              placeholder="e.g. xxxxxxxx.access"
              className="max-w-xs"
            />
          </SettingRow>

          <SettingRow
            label={t(
              "terminal.cloudflareTunnelClientSecret",
              "Service Token Client Secret",
            )}
            description={t(
              "terminal.cloudflareTunnelClientSecretDesc",
              "Optional CF-Access-Client-Secret header for Cloudflare Access authentication.",
            )}
          >
            {isSecretConfigured && !isEditingSecret ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                  •••••••• ({t("settings.secretSet", "Saved")})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setIsEditingSecret(true);
                    write({ cloudflareTunnelClientSecret: "" });
                  }}
                >
                  {t("settings.secretReplace", "Replace")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setIsEditingSecret(false);
                    write({ cloudflareTunnelClientSecret: "" });
                  }}
                >
                  {t("common.clear", "Clear")}
                </Button>
              </div>
            ) : (
              <div className="flex max-w-xs items-center gap-2 w-full">
                <div className="relative flex-1">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={secretText}
                    onChange={(e) =>
                      write({ cloudflareTunnelClientSecret: e.target.value })
                    }
                    placeholder={
                      isSecretConfigured
                        ? t(
                            "terminal.cloudflareTunnelClientSecretPlaceholderNew",
                            "New Service Token Secret",
                          )
                        : t(
                            "terminal.cloudflareTunnelClientSecretPlaceholder",
                            "Optional Service Token Secret",
                          )
                    }
                    className="pr-10"
                    autoFocus={isSecretConfigured && isEditingSecret}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSecret((prev) => !prev)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label={showSecret ? "Hide secret" : "Show secret"}
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {isSecretConfigured && isEditingSecret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setIsEditingSecret(false);
                      write({ cloudflareTunnelClientSecret: { set: true } });
                    }}
                  >
                    {t("common.cancel", "Cancel")}
                  </Button>
                )}
              </div>
            )}
          </SettingRow>
        </>
      )}
    </SectionCard>
  );
}
