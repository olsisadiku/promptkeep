import { useEffect, useMemo, useState } from "react";
import { copyToClipboard, renderMarkdown } from "@spl/shared-ui";
import {
  Button,
  IconButton,
  IconCheck,
  IconCopy,
  IconEdit,
  IconHistory,
  IconSparkles,
  IconTrash,
} from "../ui";
import { useApp } from "../store";
import { OpenInMenu } from "./OpenInMenu";
import { VersionHistory } from "./VersionHistory";
import { OptimizeDialog } from "./OptimizeDialog";

export function PromptView() {
  const {
    selected,
    editing,
    draft,
    setDraft,
    startEdit,
    cancelEdit,
    saveEdit,
    applyContent,
    deletePrompt,
    resolvedTheme,
    toast,
  } = useApp();
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showOptimize, setShowOptimize] = useState(false);

  const html = useMemo(
    () => (selected ? renderMarkdown(selected.content, resolvedTheme) : ""),
    [selected, resolvedTheme],
  );

  // Cmd/Ctrl+S to save while editing.
  useEffect(() => {
    if (!editing) return;
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveEdit();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [editing, saveEdit]);

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-faint)]">
        <div className="mb-2 text-5xl">✶</div>
        <p className="text-sm">Select a prompt, or create one with the + button.</p>
      </div>
    );
  }

  const copy = async () => {
    await copyToClipboard(editing ? draft : selected.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const remove = async () => {
    if (confirm(`Delete "${selected.title}"? This cannot be undone (a final version is kept locally).`)) {
      await deletePrompt(selected.id);
      toast("Prompt deleted", "info");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="drag flex items-start justify-between gap-3 px-7 pb-3 pt-4">
        <div className="min-w-0 pt-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            {selected.category ?? "Uncategorized"}
          </div>
          <h1
            className="truncate text-[22px] font-semibold"
            style={{ fontFamily: "var(--font-sans)" }}
            title={selected.title}
          >
            {selected.title}
          </h1>
        </div>
        <div className="no-drag flex shrink-0 items-center gap-1.5 pt-1">
          <Button variant="primary" onClick={copy}>
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <OpenInMenu getText={() => (editing ? draft : selected.content)} />
          <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />
          {!editing ? (
            <IconButton title="Edit" onClick={startEdit}>
              <IconEdit />
            </IconButton>
          ) : null}
          <IconButton title="Optimize with AI" onClick={() => setShowOptimize(true)}>
            <IconSparkles />
          </IconButton>
          <IconButton title="Version history" onClick={() => setShowHistory(true)}>
            <IconHistory />
          </IconButton>
          <IconButton title="Delete" onClick={remove}>
            <IconTrash />
          </IconButton>
        </div>
      </div>

      {/* Body */}
      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col px-7 pb-4">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none rounded-xl border bg-transparent p-4 text-[14px] leading-relaxed outline-none focus:border-[var(--accent)]"
            style={{ fontFamily: "var(--font-mono)", borderColor: "var(--border-strong)" }}
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="mr-auto text-[12px] text-[var(--text-faint)]">⌘S to save</span>
            <Button variant="ghost" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => saveEdit()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-10">
          {selected.content.trim() ? (
            <article className="prose fade-in" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-sm text-[var(--text-faint)]">
              This prompt is empty. Click <span className="font-medium">Edit</span> to add content.
            </p>
          )}
        </div>
      )}

      <VersionHistory open={showHistory} onClose={() => setShowHistory(false)} promptId={selected.id} />
      <OptimizeDialog
        open={showOptimize}
        onClose={() => setShowOptimize(false)}
        original={editing ? draft : selected.content}
        onAccept={(improved) => {
          if (editing) setDraft(improved);
          else applyContent(improved, "AI optimize");
          toast("Optimized version saved", "success");
        }}
      />
    </div>
  );
}
