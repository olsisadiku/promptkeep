import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FlatPrompt,
  type SearchHit,
  PromptSearch,
  OPEN_TARGETS,
  listSearchPayload,
  getLibraryPath,
  setLibraryPath,
  defaultLibraryPath,
  getSettings,
  onLibraryChanged,
  copyToClipboard,
  openIn,
  hideQuickPanel,
  previewLine,
} from "@spl/shared-ui";
import { IconCopy, IconExternal, IconSearch } from "../ui";

// A self-contained, lightweight popover for the menu-bar tray. It does not use
// the main app store — it talks to the backend directly so it stays snappy.
export function QuickPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const search = useRef(new PromptSearch());
  const inputRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef("");
  queryRef.current = query;

  // Fetch the payload into the index, then render results for the latest query.
  const loadPayload = useCallback(async () => {
    try {
      const payload: FlatPrompt[] = await listSearchPayload();
      search.current.replaceAll(payload);
    } catch {
      // Library not set in this process yet — establish it, then retry.
      const path = (await getLibraryPath()) ?? (await defaultLibraryPath());
      await setLibraryPath(path);
      const payload = await listSearchPayload();
      search.current.replaceAll(payload);
    }
    setResults(search.current.search(queryRef.current));
  }, []);

  // Theme: mirror saved setting / system preference (no AppProvider here).
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      const dark =
        s.theme === "dark" ||
        (s.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    })();
  }, []);

  // Load once; re-load on external library changes. Subscribes a single time.
  useEffect(() => {
    loadPayload();
    const p = onLibraryChanged(() => loadPayload());
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hideQuickPanel();
    window.addEventListener("keydown", onKey);
    return () => {
      p.then((off) => off());
      window.removeEventListener("keydown", onKey);
    };
  }, [loadPayload]);

  useEffect(() => {
    setResults(search.current.search(query));
  }, [query]);

  const doCopy = async (p: FlatPrompt) => {
    await copyToClipboard(p.content);
    setFlash(p.id);
    setTimeout(() => hideQuickPanel(), 280);
  };
  const quickOpen = async (p: FlatPrompt, targetId: string) => {
    await openIn(targetId, p.content);
    hideQuickPanel();
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <IconSearch size={16} className="text-[var(--text-faint)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prompts…"
          className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--text-faint)]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {results.length === 0 ? (
          <p className="p-4 text-center text-[12px] text-[var(--text-faint)]">No prompts found.</p>
        ) : (
          results.map((h) => (
            <div
              key={h.prompt.id}
              className="group flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-[var(--bg-hover)]"
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => doCopy(h.prompt)} title="Copy">
                <div className="truncate text-[13px] font-medium">
                  {flash === h.prompt.id ? "Copied ✓" : h.prompt.title}
                </div>
                <div className="truncate text-[11px] text-[var(--text-faint)]">
                  {h.prompt.category ? `${h.prompt.category} · ` : ""}
                  {previewLine(h.prompt.content, 80)}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => doCopy(h.prompt)}
                  title="Copy"
                  className="rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--bg-active)]"
                >
                  <IconCopy size={14} />
                </button>
                <button
                  onClick={() => quickOpen(h.prompt, OPEN_TARGETS[0].id)}
                  title={`Open in ${OPEN_TARGETS[0].label}`}
                  className="rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--bg-active)]"
                >
                  <IconExternal size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div
        className="border-t px-3 py-1.5 text-[10px] text-[var(--text-faint)]"
        style={{ borderColor: "var(--border)" }}
      >
        Click to copy · Esc to close
      </div>
    </div>
  );
}
