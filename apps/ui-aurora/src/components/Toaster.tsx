import { useApp } from "../store";
import { IconCheck, IconX } from "../ui";

export function Toaster() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="fade-in pointer-events-auto flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-lg"
          style={{
            background: "var(--bg-elevated)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow)",
            color: t.kind === "error" ? "var(--danger)" : "var(--text)",
          }}
        >
          {t.kind === "success" && <span style={{ color: "#3aa657" }}><IconCheck size={15} /></span>}
          <span className="max-w-xs">{t.message}</span>
          <button className="text-[var(--text-faint)] hover:text-[var(--text)]" onClick={() => dismissToast(t.id)}>
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
