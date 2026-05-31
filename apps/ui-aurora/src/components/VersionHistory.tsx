import { useEffect, useState } from "react";
import { type VersionMeta, listVersions, readVersion, restoreVersion } from "@spl/shared-ui";
import { Button, IconHistory, Modal, Spinner } from "../ui";
import { useApp } from "../store";

function when(ts: string): string {
  // ts looks like 2026-05-31T11-40-58.123Z
  const iso = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  const d = new Date(iso);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export function VersionHistory({
  open,
  onClose,
  promptId,
}: {
  open: boolean;
  onClose: () => void;
  promptId: string;
}) {
  const { refresh, toast } = useApp();
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<VersionMeta | null>(null);
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!open) return;
    setActive(null);
    setContent("");
    setLoading(true);
    listVersions(promptId)
      .then((v) => setVersions(v))
      .catch((e) => toast(String(e), "error"))
      .finally(() => setLoading(false));
  }, [open, promptId, toast]);

  const view = async (v: VersionMeta) => {
    setActive(v);
    try {
      setContent(await readVersion(promptId, v.ts));
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const restore = async (v: VersionMeta) => {
    try {
      await restoreVersion(promptId, v.ts);
      await refresh();
      toast("Version restored", "success");
      onClose();
    } catch (e) {
      toast(String(e), "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Version history" width={720}>
      <div className="flex gap-4" style={{ height: 420 }}>
        <div className="w-56 shrink-0 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-[var(--text-soft)]">
              <Spinner /> Loading…
            </div>
          ) : versions.length === 0 ? (
            <p className="p-3 text-sm text-[var(--text-faint)]">
              No previous versions yet. Every save after an edit creates one.
            </p>
          ) : (
            versions.map((v) => (
              <button
                key={v.ts}
                onClick={() => view(v)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-[13px] ${
                  active?.ts === v.ts ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
                }`}
              >
                <div className="font-medium">{when(v.ts)}</div>
                <div className="text-[11px] text-[var(--text-faint)]">
                  {(v.size / 1024).toFixed(1)} KB{v.note ? ` · ${v.note}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border" style={{ borderColor: "var(--border)" }}>
          {active ? (
            <>
              <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-soft)]">
                  <IconHistory size={14} /> {when(active.ts)}
                </span>
                <Button variant="primary" onClick={() => restore(active)}>
                  Restore this version
                </Button>
              </div>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 text-[12.5px] leading-relaxed" style={{ fontFamily: "var(--font-mono)" }}>
                {content}
              </pre>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-faint)]">
              Select a version to preview
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
