import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  type CommunityPrompt,
  communityEnabled,
  browseCommunity,
  currentSession,
  sendLoginCode,
  verifyLoginCode,
  signOut as apiSignOut,
  onAuthChange,
  publishToCommunity,
  toggleUpvote,
  copyToClipboard,
  createPrompt,
  savePrompt,
  previewLine,
} from "@spl/shared-ui";
import { Button, IconArrowUp, IconCopy, IconUsers, Modal, Spinner } from "../ui";
import { useApp } from "../store";

export function CommunityView() {
  const { toast, refresh, select, selected } = useApp();
  const [email, setEmail] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<CommunityPrompt[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"top" | "new">("top");
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const enabled = communityEnabled();

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setPrompts(await browseCommunity({ query, sort }));
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [enabled, query, sort, toast]);

  useEffect(() => {
    if (!enabled) return;
    currentSession().then((s) => setEmail(s?.user.email ?? null));
    const off = onAuthChange((s) => setEmail(s?.user.email ?? null));
    return off;
  }, [enabled]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const importPrompt = async (p: CommunityPrompt) => {
    try {
      const id = await createPrompt(p.category ?? null, p.title);
      await savePrompt(id, p.body, `imported from community`);
      await refresh();
      await select(id);
      toast(`Imported "${p.title}"`, "success");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const upvote = async (p: CommunityPrompt) => {
    if (!email) return setShowAuth(true);
    try {
      const count = await toggleUpvote(p.id);
      setPrompts((list) => list.map((x) => (x.id === p.id ? { ...x, upvotes: count } : x)));
    } catch (e) {
      toast(String(e), "error");
    }
  };

  if (!enabled) {
    return (
      <Empty>
        <p className="mb-1 text-[15px] font-medium">Community is coming online</p>
        <p className="max-w-sm text-[13px] text-[var(--text-soft)]">
          Once the shared library is connected you’ll be able to browse prompts other people publish,
          upvote the best ones, and import them into your library with one click.
        </p>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="drag flex items-center justify-between gap-3 px-7 pb-3 pt-4">
        <h1 className="text-[22px] font-semibold" style={{ fontFamily: "var(--font-sans)" }}>Community</h1>
        <div className="no-drag flex items-center gap-2">
          {email ? (
            <>
              <span className="text-[12px] text-[var(--text-soft)]">{email}</span>
              <Button variant="ghost" onClick={() => apiSignOut()}>Sign out</Button>
            </>
          ) : (
            <Button variant="soft" onClick={() => setShowAuth(true)}>Sign in</Button>
          )}
          <Button variant="primary" onClick={() => (email ? setShowPublish(true) : setShowAuth(true))}>
            Publish a prompt
          </Button>
        </div>
      </div>

      <div className="no-drag flex items-center gap-2 px-7 pb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search community prompts…"
          className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        />
        <div className="flex rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {(["top", "new"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-2 text-[12px] capitalize ${sort === s ? "bg-[var(--bg-active)] font-medium" : "text-[var(--text-soft)]"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-10">
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[var(--text-soft)]"><Spinner /> Loading…</div>
        ) : prompts.length === 0 ? (
          <p className="py-10 text-[13px] text-[var(--text-faint)]">No prompts found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {prompts.map((p) => (
              <div key={p.id} className="flex flex-col rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-sans)" }}>{p.title}</h3>
                  <button onClick={() => upvote(p)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] hover:bg-[var(--bg-hover)]" title="Upvote">
                    <IconArrowUp size={14} /> {p.upvotes}
                  </button>
                </div>
                <p className="mb-3 line-clamp-3 flex-1 text-[12.5px] text-[var(--text-soft)]">{previewLine(p.body, 200)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-faint)]">
                    {p.category ? `${p.category} · ` : ""}{p.author_name ?? "anon"}
                  </span>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" onClick={async () => { await copyToClipboard(p.body); toast("Copied", "success"); }}>
                      <IconCopy size={14} /> Copy
                    </Button>
                    <Button variant="soft" onClick={() => importPrompt(p)}>Import</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} toast={toast} />
      <PublishModal open={showPublish} onClose={() => setShowPublish(false)} onDone={load} toast={toast} seed={selected} />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <span className="mb-3 text-[var(--text-faint)]"><IconUsers size={40} /></span>
      {children}
    </div>
  );
}

function AuthModal({ open, onClose, toast }: { open: boolean; onClose: () => void; toast: (m: string, k?: "info" | "success" | "error") => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await sendLoginCode(email.trim());
      setStage("code");
      toast("Check your email for a 6-digit code", "info");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    try {
      await verifyLoginCode(email.trim(), code.trim());
      toast("Signed in", "success");
      onClose();
      setStage("email");
      setCode("");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Sign in to the community">
      <p className="mb-3 text-[12.5px] text-[var(--text-soft)]">
        We’ll email you a one-time code — no password needed.
      </p>
      {stage === "email" ? (
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border-strong)" }}
          />
          <div className="flex justify-end">
            <Button variant="primary" onClick={send} disabled={busy || !email.includes("@")}>
              {busy ? <Spinner /> : "Send code"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border-strong)" }}
          />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStage("email")}>Back</Button>
            <Button variant="primary" onClick={verify} disabled={busy || code.length < 6}>
              {busy ? <Spinner /> : "Verify & sign in"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PublishModal({
  open,
  onClose,
  onDone,
  toast,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  toast: (m: string, k?: "info" | "success" | "error") => void;
  seed: ReturnType<typeof useApp>["selected"];
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && seed) {
      setTitle(seed.title);
      setBody(seed.content);
      setCategory(seed.category ?? "");
    }
  }, [open, seed]);

  const publish = async () => {
    setBusy(true);
    try {
      await publishToCommunity({ title, body, category: category || null });
      toast("Published to community", "success");
      onClose();
      onDone();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Publish a prompt" width={560}>
      <div className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border-strong)" }}
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (optional)"
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border-strong)" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Prompt content…"
          rows={10}
          className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border-strong)", fontFamily: "var(--font-mono)" }}
        />
        <p className="text-[11px] text-[var(--text-faint)]">Published prompts are public. Don’t include secrets or personal data.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={publish} disabled={busy || !title.trim() || !body.trim()}>
            {busy ? <Spinner /> : "Publish"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
