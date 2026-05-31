import { useState } from "react";
import {
  type AiProvider,
  ALL_PROVIDERS,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  optimizePrompt,
} from "@spl/shared-ui";
import { Button, IconSparkles, Modal, Spinner } from "../ui";
import { useApp } from "../store";

export function OptimizeDialog({
  open,
  onClose,
  original,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  original: string;
  onAccept: (improved: string) => void;
}) {
  const { settings, providerKeys, updateSettings, toast, setView } = useApp();
  const [provider, setProvider] = useState<AiProvider>(settings.aiProvider);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const model = settings.aiModels[provider] || DEFAULT_MODELS[provider];
  const hasKey = providerKeys.includes(provider);

  const run = async () => {
    if (!hasKey) {
      toast(`Add an API key for ${PROVIDER_LABELS[provider]} in Settings first.`, "error");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const improved = await optimizePrompt(provider, original, { model, instructions });
      setResult(improved);
      await updateSettings({ aiProvider: provider });
    } catch (e) {
      toast(`Optimize failed: ${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Optimize with AI" width={result ? 760 : 480}>
      {!result ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[var(--text-soft)]">Provider</label>
            <div className="flex gap-1.5">
              {ALL_PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-[12px] ${
                    provider === p ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
                  }`}
                >
                  {PROVIDER_LABELS[p]}
                  {providerKeys.includes(p) ? "" : " ·"}
                  <span className="block text-[10px] text-[var(--text-faint)]">
                    {providerKeys.includes(p) ? "key set" : "no key"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[var(--text-soft)]">
              Model <span className="text-[var(--text-faint)]">({model})</span>
            </label>
            <input
              value={settings.aiModels[provider] ?? ""}
              placeholder={DEFAULT_MODELS[provider]}
              onChange={(e) =>
                updateSettings({ aiModels: { ...settings.aiModels, [provider]: e.target.value } })
              }
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border-strong)" }}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[var(--text-soft)]">
              Guidance (optional)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. make it more concise, add output format constraints…"
              rows={2}
              className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border-strong)" }}
            />
          </div>
          {!hasKey && (
            <p className="text-[12px] text-[var(--danger)]">
              No API key for {PROVIDER_LABELS[provider]}.{" "}
              <button className="underline" onClick={() => { onClose(); setView("settings"); }}>
                Add one in Settings
              </button>
              .
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={run} disabled={busy || !hasKey}>
              {busy ? <Spinner /> : <IconSparkles size={15} />}
              {busy ? "Optimizing…" : "Optimize"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3" style={{ height: 380 }}>
            <Pane title="Current" text={original} />
            <Pane title="Suggested" text={result} highlight />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResult(null)}>Back</Button>
            <Button variant="soft" onClick={onClose}>Discard</Button>
            <Button
              variant="primary"
              onClick={() => {
                onAccept(result);
                onClose();
              }}
            >
              <IconSparkles size={15} /> Accept & save as new version
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Pane({ title, text, highlight }: { title: string; text: string; highlight?: boolean }) {
  return (
    <div
      className="flex min-w-0 flex-col rounded-xl border"
      style={{ borderColor: highlight ? "var(--accent)" : "var(--border)" }}
    >
      <div className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]" style={{ borderColor: "var(--border)" }}>
        {title}
      </div>
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 text-[12.5px] leading-relaxed" style={{ fontFamily: "var(--font-mono)" }}>
        {text}
      </pre>
    </div>
  );
}
