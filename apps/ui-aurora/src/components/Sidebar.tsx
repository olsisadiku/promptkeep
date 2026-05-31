import { useState, type ReactNode } from "react";
import { previewLine } from "@spl/shared-ui";
import {
  IconButton,
  IconChevron,
  IconFolder,
  IconLibrary,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSun,
  IconUsers,
  useInputModal,
} from "../ui";
import { useApp } from "../store";

export function Sidebar() {
  const {
    snapshot,
    query,
    setQuery,
    results,
    select,
    selectedId,
    view,
    setView,
    newCategory,
    newPrompt,
    libraryPath,
    pickLibrary,
    updateSettings,
    resolvedTheme,
    git,
    web,
    account,
  } = useApp();
  const { ask, node } = useInputModal();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });

  const onPick = async (id: string) => {
    setView("library");
    await select(id);
  };

  const addCategory = async () => {
    const name = await ask("New category", { placeholder: "e.g. Coding" });
    if (name) await newCategory(name);
  };
  const addPrompt = async (category: string | null) => {
    const name = await ask("New prompt", { placeholder: "e.g. Code review" });
    if (name) await newPrompt(category, name);
  };

  const folderName = libraryPath?.split("/").filter(Boolean).pop() ?? "No folder";
  const searching = query.trim().length > 0;

  return (
    <aside
      className="drag flex h-full w-72 shrink-0 flex-col border-r"
      style={{ background: "var(--bg-sidebar)", borderColor: "var(--border)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="flex items-center gap-2 text-[14px] font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
          <span style={{ color: "var(--accent)" }}><IconLibrary size={18} /></span>
          PromptKeep
        </span>
        <IconButton
          title="Toggle theme"
          onClick={() => updateSettings({ theme: resolvedTheme === "dark" ? "light" : "dark" })}
        >
          {resolvedTheme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
        </IconButton>
      </div>

      {/* search */}
      <div className="no-drag px-3 pb-2">
        <div
          className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
        >
          <IconSearch size={15} className="text-[var(--text-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--text-faint)]"
          />
          {searching && (
            <button className="text-[var(--text-faint)] hover:text-[var(--text)]" onClick={() => setQuery("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* nav */}
      <div className="no-drag flex gap-1 px-3 pb-2">
        <NavButton active={view === "library"} onClick={() => setView("library")} icon={<IconLibrary size={15} />} label="Library" />
        <NavButton active={view === "community"} onClick={() => setView("community")} icon={<IconUsers size={15} />} label="Community" />
      </div>

      {/* tree / results */}
      <div className="no-drag min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {searching ? (
          <div className="pt-1">
            <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
              {results.length} result{results.length === 1 ? "" : "s"}
            </div>
            {results.map((h) => (
              <PromptRow
                key={h.prompt.id}
                active={selectedId === h.prompt.id}
                title={h.prompt.title}
                subtitle={h.prompt.category ?? previewLine(h.prompt.content)}
                onClick={() => onPick(h.prompt.id)}
              />
            ))}
          </div>
        ) : (
          <div className="pt-1">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Categories</span>
              <IconButton title="New category" onClick={addCategory} className="!p-1">
                <IconPlus size={14} />
              </IconButton>
            </div>

            {snapshot?.categories.map((c) => {
              const open = !collapsed.has(c.name);
              return (
                <div key={c.name} className="mb-0.5">
                  <div className="group flex items-center rounded-lg pr-1 hover:bg-[var(--bg-hover)]">
                    <button className="flex flex-1 items-center gap-1 py-1.5 pl-1.5 text-left" onClick={() => toggle(c.name)}>
                      <IconChevron size={13} className={`text-[var(--text-faint)] transition-transform ${open ? "rotate-90" : ""}`} />
                      <span className="text-[13px] font-medium">{c.name}</span>
                      <span className="text-[11px] text-[var(--text-faint)]">{c.prompts.length}</span>
                    </button>
                    <IconButton title={`New prompt in ${c.name}`} onClick={() => addPrompt(c.name)} className="!p-1 opacity-0 group-hover:opacity-100">
                      <IconPlus size={13} />
                    </IconButton>
                  </div>
                  {open &&
                    c.prompts.map((p) => (
                      <PromptRow
                        key={p.id}
                        nested
                        active={selectedId === p.id}
                        title={p.title}
                        onClick={() => onPick(p.id)}
                      />
                    ))}
                </div>
              );
            })}

            {snapshot && snapshot.uncategorized.length > 0 && (
              <div className="mt-2">
                <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Uncategorized</div>
                {snapshot.uncategorized.map((p) => (
                  <PromptRow key={p.id} active={selectedId === p.id} title={p.title} onClick={() => onPick(p.id)} />
                ))}
              </div>
            )}

            <button
              onClick={() => addPrompt(null)}
              className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--text-soft)] hover:bg-[var(--bg-hover)]"
            >
              <IconPlus size={13} /> New prompt
            </button>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="no-drag flex items-center gap-1 border-t px-2 py-2" style={{ borderColor: "var(--border)" }}>
        {web ? (
          <button
            onClick={() => setView("settings")}
            title={account ?? "Cloud library"}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
          >
            <IconFolder size={15} className="shrink-0 text-[var(--text-faint)]" />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium">{account ?? "Cloud library"}</span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-faint)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#3aa657" }} />
                synced to your account
              </span>
            </span>
          </button>
        ) : (
          <button
            onClick={pickLibrary}
            title={libraryPath ?? "Choose a library folder"}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
          >
            <IconFolder size={15} className="shrink-0 text-[var(--text-faint)]" />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium">{folderName}</span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-faint)]">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: git?.is_repo ? (git.dirty ? "#e0a000" : "#3aa657") : "var(--text-faint)" }}
                />
                {git?.is_repo ? (git.dirty ? "uncommitted" : "synced") : "local only"}
              </span>
            </span>
          </button>
        )}
        <IconButton title="Settings" onClick={() => setView("settings")} className={view === "settings" ? "text-[var(--accent)]" : ""}>
          <IconSettings size={16} />
        </IconButton>
      </div>
      {node}
    </aside>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] font-medium transition-colors ${
        active ? "bg-[var(--bg-active)] text-[var(--text)]" : "text-[var(--text-soft)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function PromptRow({
  title,
  subtitle,
  active,
  nested,
  onClick,
}: {
  title: string;
  subtitle?: string;
  active: boolean;
  nested?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left transition-colors ${
        nested ? "ml-3 w-[calc(100%-0.75rem)]" : ""
      } ${active ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--bg-hover)]"}`}
    >
      <span className={`truncate text-[13px] ${active ? "font-semibold" : ""}`} style={active ? { color: "var(--accent)" } : undefined}>
        {title}
      </span>
      {subtitle && <span className="truncate text-[11px] text-[var(--text-faint)]">{subtitle}</span>}
    </button>
  );
}
