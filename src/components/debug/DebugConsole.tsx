import { useEffect, useState } from "react";

type DebugEntry = {
  id: number;
  level: "info" | "warning" | "error";
  message: string;
  time: string;
  source?: string;
  sourceKind?: "mapped" | "raw";
};

type StackFrameLike = {
  getFileName?: () => string | undefined;
  getLineNumber?: () => number | undefined;
  getColumnNumber?: () => number | undefined;
};

function targetLabel(target: EventTarget | null) {
  if (!(target instanceof Element)) return "unknown";
  const label =
    target.getAttribute("aria-label") ||
    target.getAttribute("placeholder") ||
    target.textContent?.trim().replace(/\s+/g, " ").slice(0, 48) ||
    target.tagName.toLowerCase();
  const className =
    target.className && typeof target.className === "string"
      ? `.${target.className.split(" ").join(".")}`
      : "";
  return `${target.tagName.toLowerCase()}${className} ${label}`.trim();
}

export function DebugConsole() {
  const [open, setOpen] = useState(false);
  const [nextId, setNextId] = useState(1);
  const [entries, setEntries] = useState<DebugEntry[]>([]);

  function genNextId() {
    const id = nextId;
    setNextId((id) => id + 1);
    return id;
  }

  useEffect(() => {
    const oldLog = window.console.log;
    const oldWarn = window.console.warn;
    const oldError = window.console.error;
    const sourceCache = new Map<string, string | undefined>();

    function serializeArg(arg: unknown) {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }

    function sourceFromErrorStack(stack?: string) {
      if (!stack) return undefined;
      const lines = stack.split("\n").map((line) => line.trim());
      for (const line of lines) {
        if (!line || line.includes("DebugConsole.tsx")) continue;
        const match = line.match(/(?:https?:\/\/|\/|[A-Za-z]:\\).*?:\d+:\d+/);
        if (match) return match[0];
      }
      return undefined;
    }

    function sourceFromEvent(filename?: string, lineno?: number, colno?: number) {
      if (!filename) return undefined;
      if (!lineno || !colno) return filename;
      return `${filename}:${lineno}:${colno}`;
    }

    function addWithId(
      level: DebugEntry["level"],
      message: string,
      source?: string,
      sourceKind?: DebugEntry["sourceKind"],
    ) {
      const id = genNextId();
      setEntries((current) =>
        [
          {
            id,
            level,
            message,
            time: new Date().toLocaleTimeString(),
            source,
            sourceKind,
          },
          ...current,
        ].slice(0, 80),
      );
      return id;
    }

    function updateEntrySource(id: number, source?: string, sourceKind?: DebugEntry["sourceKind"]) {
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, source, sourceKind } : entry)),
      );
    }

    async function resolveMappedSource(errorLike?: Error) {
      const stackKey = errorLike?.stack || "";
      if (stackKey && sourceCache.has(stackKey)) return sourceCache.get(stackKey);
      try {
        const StackTrace = await import("stacktrace-js");
        const frames = errorLike
          ? await StackTrace.fromError(errorLike)
          : await StackTrace.get();
        const frame = frames.find((candidate: StackFrameLike) => {
          const fileName = candidate.getFileName?.() || "";
          return (
            Boolean(fileName) &&
            !fileName.includes("DebugConsole.tsx") &&
            !fileName.includes("stacktrace") &&
            !fileName.includes("node_modules")
          );
        }) as StackFrameLike | undefined;
        const fileName = frame?.getFileName?.();
        if (!fileName) return undefined;
        const line = frame?.getLineNumber?.();
        const column = frame?.getColumnNumber?.();
        const mapped = `${fileName}:${line ?? "?"}:${column ?? "?"}`;
        if (stackKey) sourceCache.set(stackKey, mapped);
        return mapped;
      } catch {
        return undefined;
      }
    }

    function addWithSourceResolution(
      level: DebugEntry["level"],
      message: string,
      fallbackSource?: string,
      sourceError?: Error,
    ) {
      const id = addWithId(level, message, fallbackSource, fallbackSource ? "raw" : undefined);
      void resolveMappedSource(sourceError).then((mappedSource) => {
        if (mappedSource) updateEntrySource(id, mappedSource, "mapped");
      });
    }

    window.console.log = function (...args) {
      addWithSourceResolution(
        "info",
        args.map((arg) => serializeArg(arg)).join(" "),
        sourceFromErrorStack(new Error().stack),
      );
      oldLog(...args);
    };

    window.console.warn = function (...args) {
      addWithSourceResolution(
        "warning",
        args.map((arg) => serializeArg(arg)).join(" "),
        sourceFromErrorStack(new Error().stack),
      );
      oldWarn(...args);
    };

    window.console.error = function (...args) {
      const errorArg = args.find((arg): arg is Error => arg instanceof Error);
      addWithSourceResolution(
        "error",
        args.map((arg) => serializeArg(arg)).join(" "),
        sourceFromErrorStack(errorArg?.stack || new Error().stack),
        errorArg,
      );
      oldError(...args);
    };

    function onError(event: ErrorEvent) {
      addWithSourceResolution(
        "error",
        event.message || "Unhandled runtime error",
        sourceFromEvent(event.filename, event.lineno, event.colno),
        event.error instanceof Error ? event.error : undefined,
      );
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason =
        event.reason instanceof Error
          ? `${event.reason.name}: ${event.reason.message}`
          : String(event.reason);
      addWithSourceResolution(
        "error",
        `Unhandled rejection: ${reason}`,
        event.reason instanceof Error ? sourceFromErrorStack(event.reason.stack) : undefined,
        event.reason instanceof Error ? event.reason : undefined,
      );
    }

    function onSubmit(event: SubmitEvent) {
      addWithSourceResolution("info", `submit ${targetLabel(event.target)}`);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    document.addEventListener("submit", onSubmit, true);
    addWithId("info", "debug console ready");

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      document.removeEventListener("submit", onSubmit, true);
      window.console.log = oldLog;
      window.console.warn = oldWarn;
      window.console.error = oldError;
    };
  }, []);

  return (
    <section className="debug-console" data-open={open}>
      <div className="debug-console-bar">
        <button onClick={() => setOpen((value) => !value)}>
          Debug console ({entries.filter((entry) => entry.level === "error").length})
        </button>
        <button onClick={() => setEntries([])}>Clear</button>
      </div>
      {open && (
        <div className="debug-console-log">
          {entries.length ? (
            entries.map((entry) => (
              <p key={entry.id} data-level={entry.level}>
                <span>{entry.time}</span>
                {entry.message}
                {entry.source ? (
                  <>
                    <br />
                    <code>
                      [{entry.sourceKind ?? "raw"}] {entry.source}
                    </code>
                  </>
                ) : null}
              </p>
            ))
          ) : (
            <p data-level="info">No entries.</p>
          )}
        </div>
      )}
    </section>
  );
}
