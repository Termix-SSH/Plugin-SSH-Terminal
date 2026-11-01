import { useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@termix-ssh/plugin-sdk/ui";
import { useSettings, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { validateWatchRule, type WatchKind, type WatchRule } from "./match";
import {
  isWatchRuleOn,
  removeWatchRuleEverywhere,
  setWatchRule,
  useWatchCount,
} from "./watch-store";

function readRules(value: unknown): WatchRule[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter(
        (rule): rule is WatchRule =>
          !!rule &&
          typeof rule.id === "string" &&
          typeof rule.name === "string" &&
          ["match", "quiet", "activity"].includes(rule.kind),
      )
    : [];
}

function newRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Saved rules with a switch per terminal, and a form to add one. */
export function WatchEditor({
  tabId,
  onClose,
}: {
  tabId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings("user");
  useWatchCount(tabId);
  const rules = readRules(settings.values.watchRules);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<WatchKind>("match");
  const [pattern, setPattern] = useState("");
  const [regex, setRegex] = useState(false);
  const [seconds, setSeconds] = useState("30");
  const [error, setError] = useState<string | null>(null);

  function saveRules(next: WatchRule[]) {
    return settings.save({ ...settings.values, watchRules: next });
  }

  function addRule() {
    const rule: WatchRule = {
      id: newRuleId(),
      name: name.trim(),
      kind,
      ...(kind === "match" ? { pattern, regex } : {}),
      ...(kind === "quiet" ? { seconds: Number(seconds) } : {}),
    };
    const problem = validateWatchRule(rule);
    setError(problem);
    if (problem) return;
    void saveRules([...rules, rule]).then(() => {
      setWatchRule(tabId, rule, true);
      setName("");
      setPattern("");
    });
  }

  function describe(rule: WatchRule): string {
    if (rule.kind === "match") {
      return t("terminalTools.watch.describeMatch", {
        pattern: rule.pattern ?? "",
      });
    }
    if (rule.kind === "quiet") {
      return t("terminalTools.watch.describeQuiet", {
        count: rule.seconds ?? 0,
      });
    }
    return t("terminalTools.watch.describeActivity");
  }

  return (
    <div
      className="absolute top-2 right-2 z-[130] flex max-h-[calc(100%-1rem)] w-80 flex-col gap-2 overflow-y-auto border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {t("terminalTools.watch.title")}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("terminal.searchClose")}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("terminalTools.watch.note")}
      </p>

      {rules.length > 0 && (
        <div className="flex flex-col border border-border">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5 last:border-0"
            >
              <Switch
                aria-label={rule.name}
                checked={isWatchRuleOn(tabId, rule.id)}
                onCheckedChange={(on) => setWatchRule(tabId, rule, on)}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs">{rule.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {describe(rule)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("terminalTools.watch.delete")}
                onClick={() => {
                  removeWatchRuleEverywhere(rule);
                  void saveRules(rules.filter((item) => item.id !== rule.id));
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Input
          value={name}
          className="h-7"
          placeholder={t("terminalTools.watch.name")}
          aria-label={t("terminalTools.watch.name")}
          onChange={(e) => setName(e.target.value)}
        />
        <Select value={kind} onValueChange={(v) => setKind(v as WatchKind)}>
          <SelectTrigger
            className="h-7 w-full"
            aria-label={t("terminalTools.watch.when")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[140]">
            <SelectItem value="match">
              {t("terminalTools.watch.kindMatch")}
            </SelectItem>
            <SelectItem value="quiet">
              {t("terminalTools.watch.kindQuiet")}
            </SelectItem>
            <SelectItem value="activity">
              {t("terminalTools.watch.kindActivity")}
            </SelectItem>
          </SelectContent>
        </Select>
        {kind === "match" && (
          <>
            <Input
              value={pattern}
              className="h-7 font-mono"
              spellCheck={false}
              placeholder={t("terminalTools.watch.pattern")}
              aria-label={t("terminalTools.watch.pattern")}
              onChange={(e) => setPattern(e.target.value)}
            />
            <Label className="flex items-center gap-1.5 text-[11px] font-normal">
              <Checkbox
                checked={regex}
                onCheckedChange={(next) => setRegex(next === true)}
              />
              {t("terminal.searchRegex")}
            </Label>
          </>
        )}
        {kind === "quiet" && (
          <Input
            value={seconds}
            type="number"
            min={1}
            className="h-7"
            aria-label={t("terminalTools.watch.seconds")}
            placeholder={t("terminalTools.watch.seconds")}
            onChange={(e) => setSeconds(e.target.value)}
          />
        )}
        {error && <p className="text-[11px] text-destructive">{t(error)}</p>}
        <Button size="xs" variant="outline" onClick={addRule}>
          {t("terminalTools.watch.add")}
        </Button>
      </div>
    </div>
  );
}
