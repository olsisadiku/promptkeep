import { useEffect, useRef, useState } from "react";
import { OPEN_TARGETS, openIn } from "@spl/shared-ui";
import { Button, IconExternal, IconChevron } from "../ui";
import { useApp } from "../store";

export function OpenInMenu({ getText }: { getText: () => string }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, [open]);

  const run = async (id: string) => {
    setOpen(false);
    try {
      const { action, target } = await openIn(id, getText());
      const msg =
        action === "opened"
          ? `Opened in ${target.label}`
          : action === "copied_and_opened"
            ? `Copied & opened ${target.label}`
            : `Copied — paste into ${target.label}`;
      toast(msg, "success");
    } catch (e) {
      toast(`Couldn't open: ${String(e)}`, "error");
    }
  };

  return (
    <div className="relative no-drag" ref={ref}>
      <Button variant="soft" onClick={() => setOpen((o) => !o)}>
        <IconExternal size={15} />
        Open in
        <IconChevron size={13} className="rotate-90 opacity-60" />
      </Button>
      {open && (
        <div
          className="fade-in absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-xl border p-1 shadow-xl"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          {OPEN_TARGETS.map((t) => (
            <button
              key={t.id}
              onClick={() => run(t.id)}
              title={t.hint}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--bg-hover)]"
            >
              <span className="mt-0.5 text-[var(--text-faint)]">
                <IconExternal size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{t.label}</span>
                <span className="block truncate text-[11px] text-[var(--text-faint)]">
                  {t.strategy === "url_prefill" ? "Prefills the prompt" : "Copies & opens"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
