import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

// ---- Icons (inline SVG, currentColor) ----
type IconProps = { size?: number; className?: string };
const svg = (path: ReactNode) =>
  function IconCmp({ size = 16, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

export const IconSearch = svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>);
export const IconPlus = svg(<><path d="M12 5v14M5 12h14" /></>);
export const IconCopy = svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>);
export const IconCheck = svg(<path d="M20 6 9 17l-5-5" />);
export const IconExternal = svg(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>);
export const IconEdit = svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>);
export const IconTrash = svg(<><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" /></>);
export const IconHistory = svg(<><path d="M3 3v6h6" /><path d="M3.5 9a9 9 0 1 0 2.1-3.4L3 9" /><path d="M12 7v5l3 2" /></>);
export const IconSparkles = svg(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></>);
export const IconSettings = svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2.6 14H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 2.6V2a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 4a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21.4 9H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>);
export const IconFolder = svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />);
export const IconLibrary = svg(<><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="m17 5 3 1-3 14-3-1z" /></>);
export const IconUsers = svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1A4 4 0 0 1 16 11" /></>);
export const IconChevron = svg(<path d="m9 6 6 6-6 6" />);
export const IconX = svg(<path d="M6 6 18 18M18 6 6 18" />);
export const IconSun = svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>);
export const IconMoon = svg(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />);
export const IconUpload = svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 9l5-5 5 5" /><path d="M12 4v12" /></>);
export const IconArrowUp = svg(<path d="M12 19V5M5 12l7-7 7 7" />);
export const IconKey = svg(<><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.5 12.5 8-8M16 5l3 3M14 7l3 3" /></>);

// ---- Button ----
type Variant = "primary" | "ghost" | "soft" | "danger";
export function Button({
  variant = "soft",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "no-drag inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium px-3 py-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none select-none";
  const variants: Record<Variant, string> = {
    primary: "text-[var(--accent-text)] hover:brightness-110",
    ghost: "text-[var(--text-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]",
    soft: "bg-[var(--bg-hover)] text-[var(--text)] hover:bg-[var(--bg-active)]",
    danger: "text-[var(--danger)] hover:bg-[var(--bg-hover)]",
  };
  const style = variant === "primary" ? { background: "var(--accent)" } : undefined;
  return (
    <button className={`${base} ${variants[variant]} ${className}`} style={style} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({
  className = "",
  children,
  title,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      title={title}
      className={`no-drag inline-flex items-center justify-center rounded-lg p-2 text-[var(--text-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ---- Modal ----
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onMouseDown={onClose}
    >
      <div
        className="fade-in w-full rounded-2xl border p-5 shadow-xl"
        style={{
          maxWidth: width,
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton title="Close" onClick={onClose}>
            <IconX />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A small text-input prompt modal (replaces window.prompt, which is unreliable in webviews). */
export function useInputModal() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    placeholder?: string;
    initial?: string;
    resolve?: (v: string | null) => void;
  }>({ open: false, title: "" });

  const ask = (title: string, opts?: { placeholder?: string; initial?: string }) =>
    new Promise<string | null>((resolve) =>
      setState({ open: true, title, placeholder: opts?.placeholder, initial: opts?.initial, resolve }),
    );

  const node = (
    <InputModal
      {...state}
      onDone={(v) => {
        state.resolve?.(v);
        setState((s) => ({ ...s, open: false }));
      }}
    />
  );
  return { ask, node };
}

function InputModal({
  open,
  title,
  placeholder,
  initial,
  onDone,
}: {
  open: boolean;
  title: string;
  placeholder?: string;
  initial?: string;
  onDone: (v: string | null) => void;
}) {
  const [val, setVal] = useState(initial ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setVal(initial ?? "");
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [open, initial]);
  return (
    <Modal open={open} onClose={() => onDone(null)} title={title}>
      <input
        ref={ref}
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) onDone(val.trim());
        }}
        className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        style={{ borderColor: "var(--border-strong)" }}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!val.trim()} onClick={() => onDone(val.trim())}>
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
