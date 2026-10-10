import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useSettings,
  useTranslation,
  type PanelProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Braces,
  ChevronDown,
  Clock,
  CornerDownRight,
  ExternalLink,
  GitBranch,
  Plus,
  Repeat,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import {
  AddButton,
  Button,
  Input,
  Textarea,
  Checkbox,
  EmptyState,
  Facts,
  FormFooter,
  InlineView,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  TextAreaField,
  TextField,
  useConfirm,
  PanelSearch,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import {
  mergeLocalMacros,
  sanitizeTerminalMacros,
  runTerminalMacro,
  type MacroStep,
  type TerminalMacro,
} from "./terminal-macros";
import {
  getSessionHandle,
  sessionsSnapshot,
  subscribeSessions,
} from "../session-registry";
import { docsUrl } from "../docs";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

const STEP_TYPES = ["send", "wait", "delay", "if", "repeat"] as const;

const STEP_ICONS = {
  send: TerminalIcon,
  wait: CornerDownRight,
  delay: Clock,
  if: GitBranch,
  repeat: Repeat,
} as const;

function id(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createStep(type: MacroStep["type"]): MacroStep {
  const stepId = id();
  switch (type) {
    case "send":
      return { id: stepId, type, text: "", pressEnter: true };
    case "delay":
      return { id: stepId, type, milliseconds: 1000 };
    case "wait":
      return {
        id: stepId,
        type,
        pattern: "",
        isRegex: false,
        timeoutMs: 10_000,
        onTimeout: "stop",
      };
    case "if":
      return {
        id: stepId,
        type,
        pattern: "",
        isRegex: false,
        then: [],
        else: [],
      };
    case "repeat":
      return { id: stepId, type, count: 2, steps: [] };
  }
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds are an implementation detail, so the editor works in seconds. */
function SecondsInput({
  valueMs,
  onChangeMs,
  minMs,
  label,
}: {
  valueMs: number;
  onChangeMs: (ms: number) => void;
  minMs: number;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        className="h-7 w-20 rounded-none text-xs"
        type="number"
        min={minMs / 1000}
        max={300}
        step={0.5}
        value={valueMs / 1000}
        onChange={(event) => {
          const seconds = Number(event.target.value);
          onChangeMs(
            Number.isFinite(seconds)
              ? Math.max(minMs, Math.min(300_000, Math.round(seconds * 1000)))
              : minMs,
          );
        }}
      />
      <span className="text-muted-foreground">{t("macros.seconds")}</span>
    </label>
  );
}

/** Shared text/regex matcher field used by both "wait" and "if". */
function MatchField({
  pattern,
  isRegex,
  label,
  placeholder,
  onChange,
}: {
  pattern: string;
  isRegex: boolean;
  label: string;
  placeholder: string;
  onChange: (next: { pattern?: string; isRegex?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const badRegex = isRegex && pattern.length > 0 && !isValidRegex(pattern);

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Input
        className={`h-8 rounded-none font-mono text-xs ${
          badRegex ? "border-destructive" : ""
        }`}
        placeholder={placeholder}
        value={pattern}
        onChange={(event) => onChange({ pattern: event.target.value })}
      />
      {badRegex && (
        <div className="text-[11px] text-destructive">
          {t("macros.match.invalidRegex")}
        </div>
      )}
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Checkbox
          checked={isRegex}
          onCheckedChange={(checked) => onChange({ isRegex: checked === true })}
        />
        {t("macros.match.useRegex")}
      </label>
    </div>
  );
}

function AddStepMenu({
  onAdd,
  compact,
}: {
  onAdd: (type: MacroStep["type"]) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={`rounded-none ${compact ? "h-7 text-[11px]" : "h-8 w-full text-xs"}`}
        >
          <Plus className="mr-1 size-3" />
          {t("macros.addStep")}
          <ChevronDown className="ml-1 size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-none">
        {STEP_TYPES.map((type) => {
          const Icon = STEP_ICONS[type];
          return (
            <DropdownMenuItem
              key={type}
              className="flex-col items-start gap-0.5 rounded-none"
              onSelect={() => onAdd(type)}
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                <Icon className="size-3.5" />
                {t(`macros.stepTypes.${type}.label`)}
              </span>
              <span className="pl-5 text-[11px] leading-snug text-muted-foreground">
                {t(`macros.stepTypes.${type}.help`)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StepList({
  steps,
  onChange,
  depth = 0,
}: {
  steps: MacroStep[];
  onChange: (steps: MacroStep[]) => void;
  depth?: number;
}) {
  const { t } = useTranslation();

  const update = (index: number, step: MacroStep) => {
    const next = [...steps];
    next[index] = step;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, index) => {
        const Icon = STEP_ICONS[step.type];
        return (
          <div key={step.id} className="border border-border bg-muted/20">
            <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium">
                {t(`macros.stepTypes.${step.type}.label`)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto size-6 rounded-none"
                aria-label={t("macros.removeStep")}
                onClick={() => onChange(steps.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>

            <div className="space-y-2 p-2">
              {step.type === "send" && (
                <div className="space-y-2">
                  <Textarea
                    className="min-h-16 rounded-none font-mono text-xs"
                    placeholder={t("macros.send.textPlaceholder")}
                    value={step.text}
                    onChange={(event) =>
                      update(index, { ...step, text: event.target.value })
                    }
                  />
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Checkbox
                      checked={step.pressEnter}
                      onCheckedChange={(checked) =>
                        update(index, { ...step, pressEnter: checked === true })
                      }
                    />
                    {t("macros.send.pressEnter")}
                  </label>
                </div>
              )}

              {step.type === "delay" && (
                <SecondsInput
                  label={t("macros.delay.duration")}
                  valueMs={step.milliseconds}
                  minMs={0}
                  onChangeMs={(milliseconds) =>
                    update(index, { ...step, milliseconds })
                  }
                />
              )}

              {step.type === "wait" && (
                <div className="space-y-2">
                  <MatchField
                    pattern={step.pattern}
                    isRegex={step.isRegex !== false}
                    label={t("macros.wait.pattern")}
                    placeholder={t("macros.wait.patternPlaceholder")}
                    onChange={(next) => update(index, { ...step, ...next })}
                  />
                  <SecondsInput
                    label={t("macros.wait.timeout")}
                    valueMs={step.timeoutMs}
                    minMs={100}
                    onChangeMs={(timeoutMs) =>
                      update(index, { ...step, timeoutMs })
                    }
                  />
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      {t("macros.wait.onTimeout")}
                    </div>
                    <div className="flex gap-1">
                      {(["stop", "continue"] as const).map((mode) => (
                        <Button
                          key={mode}
                          size="sm"
                          variant={
                            step.onTimeout === mode ? "default" : "outline"
                          }
                          className="h-7 flex-1 rounded-none text-[11px]"
                          onClick={() =>
                            update(index, { ...step, onTimeout: mode })
                          }
                        >
                          {t(`macros.wait.${mode}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step.type === "if" && (
                <div className="space-y-3">
                  <MatchField
                    pattern={step.pattern}
                    isRegex={step.isRegex !== false}
                    label={t("macros.ifStep.pattern")}
                    placeholder={t("macros.ifStep.patternPlaceholder")}
                    onChange={(next) => update(index, { ...step, ...next })}
                  />
                  <div className="border-l-2 border-emerald-500/40 pl-2">
                    <div className="mb-1 text-[11px] font-medium text-emerald-500">
                      {t("macros.ifStep.then")}
                    </div>
                    <StepList
                      steps={step.then}
                      depth={depth + 1}
                      onChange={(then) => update(index, { ...step, then })}
                    />
                  </div>
                  <div className="border-l-2 border-warning/40 pl-2">
                    <div className="mb-1 text-[11px] font-medium text-warning">
                      {t("macros.ifStep.else")}
                    </div>
                    <StepList
                      steps={step.else}
                      depth={depth + 1}
                      onChange={(elseSteps) =>
                        update(index, { ...step, else: elseSteps })
                      }
                    />
                  </div>
                </div>
              )}

              {step.type === "repeat" && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {t("macros.repeat.count")}
                    </span>
                    <Input
                      className="h-7 w-20 rounded-none text-xs"
                      type="number"
                      min={1}
                      max={100}
                      value={step.count}
                      onChange={(event) =>
                        update(index, {
                          ...step,
                          count: Math.max(
                            1,
                            Math.min(100, Number(event.target.value) || 1),
                          ),
                        })
                      }
                    />
                    <span className="text-muted-foreground">
                      {t("macros.repeat.times")}
                    </span>
                  </label>
                  <div className="border-l-2 border-border pl-2">
                    <StepList
                      steps={step.steps}
                      depth={depth + 1}
                      onChange={(nested) =>
                        update(index, { ...step, steps: nested })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {depth < 4 && (
        <AddStepMenu
          compact={depth > 0}
          onAdd={(type) => onChange([...steps, createStep(type)])}
        />
      )}
    </div>
  );
}

/**
 * Macros: a saved series of steps typed into the terminal the user is
 * working in, waiting for and branching on what the server sends back.
 * They are the user's own setting, so they follow them to every browser.
 */
export function MacrosPanel({ targetTab, active, setEditing }: PanelProps) {
  const { t } = useTranslation();
  const settings = useSettings("user");
  const [draft, setDraft] = useState<TerminalMacro | null>(null);
  const [search, setSearch] = useState("");
  const editing = draft !== null;
  useEffect(() => {
    if (active) setEditing?.(editing);
  }, [active, editing, setEditing]);
  useEffect(() => () => setEditing?.(false), [setEditing]);
  const [dirty, setDirty] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TerminalMacro | null>(
    null,
  );
  const [pendingRun, setPendingRun] = useState<TerminalMacro | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const confirmedRef = useRef<Set<string>>(new Set());
  const movedLocalRef = useRef(false);
  const sessions = useSyncExternalStore(subscribeSessions, sessionsSnapshot);

  const macros = useMemo(
    () => sanitizeTerminalMacros(settings.values.macros),
    [settings.values.macros],
  );
  const { save: saveSettings } = settings;

  useEffect(() => () => abortRef.current?.abort(), []);

  // Macros a browser kept before 2.9.0 move into the setting once.
  useEffect(() => {
    if (!settings.loaded || movedLocalRef.current) return;
    movedLocalRef.current = true;
    const merged = mergeLocalMacros(macros);
    if (!merged) return;
    saveSettings({ macros: merged.macros })
      .then(merged.clear)
      .catch(() => toast.error(t("macros.saveFailed")));
  }, [settings.loaded, macros, saveSettings, t]);

  const target = useMemo(
    () =>
      sessions.find((session) => session.id === targetTab?.id) ?? sessions[0],
    [sessions, targetTab?.id],
  );

  const updateDraft = useCallback((next: TerminalMacro) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const createMacro = () => {
    const now = new Date().toISOString();
    setDraft({
      id: id(),
      name: "",
      description: "",
      steps: [],
      createdAt: now,
      updatedAt: now,
    });
    setDirty(true);
  };

  const persist = async (next: TerminalMacro[]) => {
    await saveSettings({ macros: next });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error(t("macros.nameRequired"));
      return;
    }
    const saved: TerminalMacro = {
      ...draft,
      name: draft.name.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await persist(
        macros.some((macro) => macro.id === saved.id)
          ? macros.map((macro) => (macro.id === saved.id ? saved : macro))
          : [...macros, saved],
      );
      setDraft(saved);
      setDirty(false);
      toast.success(t("macros.saved"));
    } catch (error) {
      toast.error(getErrorMessage(error) || t("macros.saveFailed"));
    }
  };

  const confirm = useConfirm();
  useEffect(() => {
    if (!pendingDelete) return;
    void confirm({
      title: t("macros.deleteTitle"),
      description: t("macros.deleteBody", { name: pendingDelete.name }),
      confirmLabel: t("macros.delete"),
    }).then((ok) => {
      if (ok) void confirmDelete();
      else setPendingDelete(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDelete]);
  useEffect(() => {
    if (!pendingRun) return;
    const macro = pendingRun;
    void confirm({
      title: t("macros.confirmRunTitle"),
      description: t("macros.confirmRunBody", {
        name: macro.name,
        host: targetLabel,
      }),
      confirmLabel: t("macros.confirmRunAction"),
      destructive: false,
    }).then((ok) => {
      setPendingRun(null);
      if (ok) {
        confirmedRef.current.add(macro.id);
        void execute(macro);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRun]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const next = macros.filter((macro) => macro.id !== pendingDelete.id);
    try {
      await persist(next);
      if (draft?.id === pendingDelete.id) {
        setDraft(null);
        setDirty(false);
      }
      toast.success(t("macros.deleted"));
    } catch (error) {
      toast.error(getErrorMessage(error) || t("macros.saveFailed"));
    } finally {
      setPendingDelete(null);
    }
  };

  const execute = useCallback(
    async (macro: TerminalMacro) => {
      const terminal = target ? getSessionHandle(target.id) : null;
      if (!terminal?.sendInput || !terminal.subscribeOutput) {
        toast.error(t("macros.needTerminal"));
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setRunningId(macro.id);
      try {
        await runTerminalMacro(
          macro,
          { send: terminal.sendInput, subscribe: terminal.subscribeOutput },
          { signal: controller.signal },
        );
        toast.success(t("macros.completed"));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          toast.error(getErrorMessage(error) || t("macros.failed"));
        }
      } finally {
        abortRef.current = null;
        setRunningId(null);
      }
    },
    [target, t],
  );

  const requestRun = (macro: TerminalMacro) => {
    if (!target || !getSessionHandle(target.id)?.sendInput) {
      toast.error(t("macros.needTerminal"));
      return;
    }
    if (confirmedRef.current.has(macro.id)) {
      void execute(macro);
      return;
    }
    setPendingRun(macro);
  };

  const targetLabel = target?.label ?? t("macros.noTerminal");

  const query = search.trim().toLowerCase();
  const shown = macros.filter((macro) =>
    [macro.name, macro.description ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  const closeDraft = () => {
    setDraft(null);
    setDirty(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2">
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("macros.search")}
          fill
        />
        <div className="flex items-center gap-2">
          <AddButton
            label={t("macros.create")}
            onClick={createMacro}
            className="flex-1"
          />
          <Button variant="outline" size="icon" asChild>
            <a
              href={docsUrl("macros")}
              target="_blank"
              rel="noreferrer"
              title={t("hosts.docsLink")}
              aria-label={t("hosts.docsLink")}
            >
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <TerminalIcon className="size-3 shrink-0" />
          <span className="truncate">
            {t("macros.target")}: {targetLabel}
          </span>
        </div>
      </div>

      <PanelList
        empty={
          <EmptyState
            icon={Braces}
            title={t(macros.length === 0 ? "macros.empty" : "macros.noMatches")}
            hint={macros.length === 0 ? t("macros.emptyHint") : undefined}
          />
        }
      >
        {shown.map((macro, index) => {
          const isRunning = runningId === macro.id;
          return (
            <ListRow
              key={macro.id}
              stripe={index}
              tone={isRunning ? "success" : "brand"}
              icon={<Braces />}
              title={macro.name}
              meta={
                <Facts>
                  {macro.description ? <span>{macro.description}</span> : null}
                  <span>
                    {t("macros.stepCount", { count: macro.steps.length })}
                  </span>
                </Facts>
              }
              onClick={() => {
                setDraft(structuredClone(macro));
                setDirty(false);
              }}
              trailing={
                isRunning ? (
                  <ListBadge tone="success">{t("macros.running")}</ListBadge>
                ) : undefined
              }
              actions={
                <>
                  <ListRowAction
                    label={isRunning ? t("macros.stop") : t("macros.run")}
                    tone="brand"
                    onClick={() =>
                      isRunning ? abortRef.current?.abort() : requestRun(macro)
                    }
                  >
                    {isRunning ? <Square /> : <Play />}
                  </ListRowAction>
                  <ListRowAction
                    label={t("macros.delete")}
                    tone="destructive"
                    onClick={() => setPendingDelete(macro)}
                  >
                    <Trash2 />
                  </ListRowAction>
                </>
              }
            />
          );
        })}
      </PanelList>

      <InlineView
        open={!!draft}
        onOpenChange={(open) => !open && closeDraft()}
        icon={<Braces className="size-4" />}
        title={draft?.name || t("macros.title")}
        status={targetLabel}
        footer={
          draft && (
            <FormFooter
              dirty={dirty}
              onDelete={() => setPendingDelete(draft)}
              deleteLabel={t("macros.delete")}
              onCancel={closeDraft}
              onSave={() => void save()}
              saveLabel={t("macros.save")}
              extra={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    runningId === draft.id
                      ? abortRef.current?.abort()
                      : requestRun(draft)
                  }
                >
                  {runningId === draft.id ? (
                    <>
                      <Square className="size-3" />
                      {t("macros.stop")}
                    </>
                  ) : (
                    <>
                      <Play className="size-3" />
                      {t("macros.run")}
                    </>
                  )}
                </Button>
              }
            />
          )
        }
      >
        {draft && (
          <>
            <TextField
              label={t("macros.name")}
              value={draft.name}
              placeholder={t("macros.namePlaceholder")}
              onChange={(name) => updateDraft({ ...draft, name })}
            />
            <TextAreaField
              label={t("macros.descriptionLabel")}
              value={draft.description ?? ""}
              placeholder={t("macros.descriptionPlaceholder")}
              onChange={(description) => updateDraft({ ...draft, description })}
            />
            {draft.steps.length === 0 && (
              <div className="border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                {t("macros.noSteps")}
              </div>
            )}
            <StepList
              steps={draft.steps}
              onChange={(steps) => updateDraft({ ...draft, steps })}
            />
          </>
        )}
      </InlineView>
    </div>
  );
}
