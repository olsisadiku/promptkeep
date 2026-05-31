import { useState, type ReactNode } from "react";
import {
  type AiProvider,
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  setApiKey,
  deleteApiKey,
  gitPublish,
  gitCommitAndPush,
} from "@spl/shared-ui";
import { Button, IconCheck, IconKey, IconUpload, Spinner } from "../ui";
import { useApp } from "../store";

export function SettingsView() {
  const {
    settings,
    updateSettings,
    libraryPath,
    pickLibrary,
    providerKeys,
    refreshProviderKeys,
    git,
    refreshGit,
    toast,
  } = useApp();

  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-8 pb-16 pt-5">
      <h1 className="mb-6 text-[24px] font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
        Settings
      </h1>

      <Section title="Appearance">
        <div className="flex gap-1.5">
          {(["system", "light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => updateSettings({ theme: t })}
              className={`flex-1 rounded-lg border py-2 text-[13px] capitalize ${
                settings.theme === t ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Library folder" subtitle="Your prompts are plain .md files in this folder. Categories are subfolders.">
        <div className="flex items-center gap-3">
          <code className="min-w-0 flex-1 truncate rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--bg-sidebar)" }}>
            {libraryPath ?? "—"}
          </code>
          <Button variant="soft" onClick={pickLibrary}>Change…</Button>
        </div>
      </Section>

      <Section title="AI keys" subtitle="Stored in your macOS Keychain — never written to disk or sent anywhere except the provider you choose.">
        <div className="space-y-2.5">
          {ALL_PROVIDERS.map((p) => (
            <KeyRow
              key={p}
              provider={p}
              hasKey={providerKeys.includes(p)}
              onSaved={refreshProviderKeys}
              toast={toast}
            />
          ))}
        </div>
      </Section>

      <Section title="GitHub backup" subtitle="Optional. Your library can be backed up to a private GitHub repo so you never lose it. Local version history is never published.">
        <GitPanel git={git} libraryPath={libraryPath} refreshGit={refreshGit} toast={toast} />
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-[12.5px] text-[var(--text-soft)]">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </section>
  );
}

function KeyRow({
  provider,
  hasKey,
  onSaved,
  toast,
}: {
  provider: AiProvider;
  hasKey: boolean;
  onSaved: () => void;
  toast: (m: string, k?: "info" | "success" | "error") => void;
}) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!val.trim()) return;
    setBusy(true);
    try {
      await setApiKey(provider, val.trim());
      setVal("");
      onSaved();
      toast(`${PROVIDER_LABELS[provider]} key saved`, "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    await deleteApiKey(provider);
    onSaved();
    toast(`${PROVIDER_LABELS[provider]} key removed`, "info");
  };

  return (
    <div className="flex items-center gap-2">
      <span className="flex w-40 shrink-0 items-center gap-1.5 text-[13px]">
        <IconKey size={14} className="text-[var(--text-faint)]" />
        {PROVIDER_LABELS[provider]}
      </span>
      {hasKey ? (
        <>
          <span className="flex flex-1 items-center gap-1.5 text-[12.5px] text-[var(--text-soft)]">
            <span style={{ color: "#3aa657" }}><IconCheck size={14} /></span> Key set
          </span>
          <Button variant="danger" onClick={remove}>Remove</Button>
        </>
      ) : (
        <>
          <input
            type="password"
            value={val}
            placeholder={`Paste ${PROVIDER_LABELS[provider]} API key`}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border-strong)" }}
          />
          <Button variant="primary" onClick={save} disabled={busy || !val.trim()}>
            {busy ? <Spinner /> : "Save"}
          </Button>
        </>
      )}
    </div>
  );
}

function GitPanel({
  git,
  libraryPath,
  refreshGit,
  toast,
}: {
  git: ReturnType<typeof useApp>["git"];
  libraryPath: string | null;
  refreshGit: () => Promise<void>;
  toast: (m: string, k?: "info" | "success" | "error") => void;
}) {
  const folder = libraryPath?.split("/").filter(Boolean).pop() ?? "prompt-library";
  const [repoName, setRepoName] = useState(folder);
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!git) return <p className="text-[13px] text-[var(--text-faint)]">Checking Git…</p>;
  if (!git.git_available)
    return <p className="text-[13px] text-[var(--danger)]">Git isn’t installed. Install Xcode Command Line Tools to enable backup.</p>;

  const publish = async () => {
    if (!git.gh_available || !git.gh_authed) {
      toast("Run `gh auth login` in a terminal to connect GitHub.", "error");
      return;
    }
    setBusy(true);
    try {
      const url = await gitPublish(repoName.trim(), isPrivate);
      await refreshGit();
      toast(`Published to ${url}`, "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setBusy(true);
    try {
      const changed = await gitCommitAndPush("Update prompts");
      await refreshGit();
      toast(changed ? "Backed up to GitHub" : "Nothing new to back up", "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (git.has_remote) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
        <p className="mb-1 text-[13px]">
          Connected to <a className="underline" style={{ color: "var(--accent)" }} href={git.remote_url ?? "#"}>{git.remote_url}</a>
        </p>
        <p className="mb-3 text-[12px] text-[var(--text-faint)]">
          Branch {git.branch} · {git.dirty ? "uncommitted changes" : "up to date"}
        </p>
        <Button variant="primary" onClick={backup} disabled={busy}>
          {busy ? <Spinner /> : <IconUpload size={15} />} Back up now
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
      <label className="mb-1 block text-[12px] font-medium text-[var(--text-soft)]">Repository name</label>
      <input
        value={repoName}
        onChange={(e) => setRepoName(e.target.value)}
        className="mb-3 w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
        style={{ borderColor: "var(--border-strong)" }}
      />
      <label className="mb-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Private repository <span className="text-[var(--text-faint)]">(recommended)</span>
      </label>
      {git.gh_available ? (
        !git.gh_authed && <p className="mb-2 text-[12px] text-[var(--danger)]">GitHub CLI not authenticated — run <code>gh auth login</code>.</p>
      ) : (
        <p className="mb-2 text-[12px] text-[var(--danger)]">GitHub CLI (gh) not installed.</p>
      )}
      <Button variant="primary" onClick={publish} disabled={busy}>
        {busy ? <Spinner /> : <IconUpload size={15} />} Publish to GitHub
      </Button>
    </div>
  );
}
