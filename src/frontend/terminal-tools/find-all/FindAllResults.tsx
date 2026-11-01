import { useEffect, useMemo, useState } from "react";
import { useShell, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  getSessionHandle,
  getSessionInfo,
  listSessions,
} from "../../session-registry";
import { sessionLabel } from "../broadcast/BroadcastTargets";
import {
  buildLineMatcher,
  MAX_FIND_RESULTS,
  searchTerminals,
  type FindOptions,
  type FindResult,
} from "./buffer-search";

const SEARCH_DELAY_MS = 200;

/** Results across every open terminal, shown under the find bar. */
export function FindAllResults({
  query,
  options,
}: {
  query: string;
  options: FindOptions;
}) {
  const { t } = useTranslation();
  const shell = useShell();
  const [found, setFound] = useState<{
    results: FindResult[];
    capped: boolean;
  } | null>(null);
  const matcher = useMemo(
    () => buildLineMatcher(query, options),
    [query, options],
  );

  useEffect(() => {
    if (!matcher) {
      setFound(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const sources = listSessions().map((session) => ({
        id: session.id,
        lines: () => getSessionHandle(session.id)?.readBufferLines() ?? [],
      }));
      void searchTerminals(sources, matcher, () => cancelled).then((next) => {
        if (!cancelled) setFound(next);
      });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matcher]);

  const groups = useMemo(() => {
    const bySession = new Map<string, FindResult[]>();
    for (const result of found?.results ?? []) {
      const group = bySession.get(result.sessionId);
      if (group) group.push(result);
      else bySession.set(result.sessionId, [result]);
    }
    return [...bySession.entries()];
  }, [found]);

  function open(result: FindResult) {
    shell?.tabs.setActive(result.sessionId);
    // A tab behind another one has to show before it can scroll.
    requestAnimationFrame(() => {
      getSessionHandle(result.sessionId)?.revealLines(
        result.firstRow,
        result.lastRow,
      );
    });
  }

  if (!query) return null;
  if (!matcher) {
    return (
      <p className="px-1 py-1 text-[11px] text-destructive">
        {t("terminalTools.find.badRegex")}
      </p>
    );
  }
  if (found && groups.length === 0) {
    return (
      <p className="px-1 py-1 text-[11px] text-muted-foreground">
        {t("terminal.searchNoResults")}
      </p>
    );
  }

  return (
    <div className="flex max-h-72 flex-col overflow-y-auto border-t border-border">
      {groups.map(([sessionId, results]) => {
        const session = getSessionInfo(sessionId);
        return (
          <div key={sessionId} className="flex flex-col">
            <span className="sticky top-0 truncate bg-muted px-1.5 py-0.5 text-[11px] font-medium">
              {session ? sessionLabel(session) : sessionId} | {results.length}
            </span>
            {results.map((result) => (
              <button
                key={result.firstRow}
                type="button"
                onClick={() => open(result)}
                className="truncate px-1.5 py-0.5 text-left font-mono text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                {result.text}
              </button>
            ))}
          </div>
        );
      })}
      {found?.capped && (
        <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
          {t("terminalTools.find.capped", { count: MAX_FIND_RESULTS })}
        </p>
      )}
    </div>
  );
}
