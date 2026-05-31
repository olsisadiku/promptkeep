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
  toggleFollow,
  myCommunityCategories,
  renameMyCategory,
  deleteMyCategory,
  copyToClipboard,
  createPrompt,
  savePrompt,
  previewLine,
} from "@spl/shared-ui";
import {
  Button,
  IconArrowUp,
  IconCheck,
  IconCopy,
  IconEdit,
  IconFolder,
  IconPlus,
  IconTrash,
  IconUsers,
  Modal,
  Spinner,
} from "../ui";
import { useApp } from "../store";

type Toast = (m: string, k?: "info" | "success" | "error") => void;

export function CommunityView() {
  const { toast, refresh, select, selected } = useApp();
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<CommunityPrompt[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"top" | "new" | "following">("top");
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  const enabled = communityEnabled();

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const following = tab === "following";
      setPrompts(await browseCommunity({ query, following, sort: following ? "top" : tab }));
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [enabled, query, tab, toast]);

  useEffect(() => {
    if (!enabled) return;
    const apply = (s: Awaited<ReturnType<typeof currentSession>>) => {
      setEmail(s?.user.email ?? null);
      setUid(s?.user.id ?? null);
    };
    currentSession().then(apply);
    const off = onAuthChange(apply);
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

  const follow = async (p: CommunityPrompt) => {
    if (!uid) return setShowAuth(true);
    try {
      const now = await toggleFollow(p.author_id);
      setPrompts((list) =>
        list
          // every card by this author reflects the new state…
          .map((x) =>
            x.author_id === p.author_id
              ? {
                  ...x,
                  viewer_is_following: now,
                  author_followers: Math.max(0, (x.author_followers ?? 0) + (now ? 1 : -1)),
                }
              : x,
          )
          // …and on the Following tab, unfollowing drops them out of view.
          .filter((x) => tab !== "following" || x.viewer_is_following),
      );
      toast(now ? `Following ${p.author_name ?? "author"}` : `Unfollowed ${p.author_name ?? "author"}`, "info");
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
              <Button variant="ghost" onClick={() => setShowCategories(true)}>
                <IconFolder size={14} /> Categories
              </Button>
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
          {(["top", "new", "following"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                if (s === "following" && !uid) return setShowAuth(true);
                setTab(s);
              }}
              className={`px-3 py-2 text-[12px] capitalize ${tab === s ? "bg-[var(--bg-active)] font-medium" : "text-[var(--text-soft)]"}`}
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
          <p className="py-10 text-[13px] text-[var(--text-faint)]">
            {tab === "following"
              ? "You're not following anyone yet — follow an author to see their prompts here."
              : "No prompts found."}
          </p>
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
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
                    <span className="truncate">
                      {p.category ? `${p.category} · ` : ""}{p.author_name ?? "anon"}
                    </span>
                    {p.author_id !== uid && (
                      <button
                        onClick={() => follow(p)}
                        title={p.viewer_is_following ? "Unfollow this author" : "Follow this author"}
                        className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                          p.viewer_is_following
                            ? "text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                            : "text-[var(--text-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                        }`}
                      >
                        {p.viewer_is_following ? <IconCheck size={12} /> : <IconPlus size={12} />}
                        {p.viewer_is_following ? "Following" : "Follow"}
                      </button>
                    )}
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
      <CategoriesModal open={showCategories} onClose={() => setShowCategories(false)} onChanged={load} toast={toast} />
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

function CategoriesModal({
  open,
  onClose,
  onChanged,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: Toast;
}) {
  const [cats, setCats] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCats(await myCommunityCategories());
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setConfirmDelete(null);
    load();
  }, [open, load]);

  const rename = async (oldName: string) => {
    const next = draft.trim();
    if (!next || next === oldName) return setEditing(null);
    setBusy(oldName);
    try {
      await renameMyCategory(oldName, next);
      toast(`Renamed “${oldName}” → “${next}”`, "success");
      setEditing(null);
      await load();
      onChanged();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    setBusy(name);
    try {
      await deleteMyCategory(name);
      toast(`Deleted “${name}” and its published prompts`, "success");
      setConfirmDelete(null);
      await load();
      onChanged();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage your categories" width={520}>
      <p className="mb-3 text-[12.5px] text-[var(--text-soft)]">
        Rename or delete categories across the prompts <em>you’ve published</em> to the community.
        Deleting a category also removes those published prompts — your local library is untouched.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[var(--text-soft)]"><Spinner /> Loading…</div>
      ) : cats.length === 0 ? (
        <p className="py-6 text-[13px] text-[var(--text-faint)]">
          You haven’t published any categorized prompts yet.
        </p>
      ) : (
        <ul className="max-h-[320px] space-y-1 overflow-y-auto">
          {cats.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              {editing === name ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(name);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="flex-1 rounded-md border bg-transparent px-2 py-1 text-[13px] outline-none focus:border-[var(--accent)]"
                    style={{ borderColor: "var(--border-strong)" }}
                  />
                  <Button variant="primary" onClick={() => rename(name)} disabled={busy === name || !draft.trim()}>
                    {busy === name ? <Spinner size={14} /> : <IconCheck size={14} />}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </>
              ) : confirmDelete === name ? (
                <>
                  <IconFolder size={15} className="shrink-0 text-[var(--text-faint)]" />
                  <span className="flex-1 truncate text-[13px] text-[var(--danger)]">
                    Delete “{name}” and its published prompts?
                  </span>
                  <Button variant="danger" onClick={() => remove(name)} disabled={busy === name}>
                    {busy === name ? <Spinner size={14} /> : "Delete"}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Keep</Button>
                </>
              ) : (
                <>
                  <IconFolder size={15} className="shrink-0 text-[var(--text-faint)]" />
                  <span className="flex-1 truncate text-[13px]">{name}</span>
                  <button
                    title="Rename"
                    onClick={() => { setEditing(name); setDraft(name); }}
                    className="rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  >
                    <IconEdit size={14} />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => setConfirmDelete(name)}
                    className="rounded-md p-1.5 text-[var(--text-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                  >
                    <IconTrash size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
