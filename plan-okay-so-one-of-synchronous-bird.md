# System Prompt Library — macOS Desktop App

## Context

I keep many reusable system prompts and have nowhere clean to store, find, and reuse them. This builds a clean, simple **macOS desktop app** (Tauri) that is a personal library of system prompts:

- A sidebar of **categories** (folders) and **prompts** (plain `.md`/`.txt` files on disk).
- Click a prompt → a clean rendered view with a **Copy** button top-right; click to **edit**.
- **Local version history** on every save (view/restore any past version), independent of Git.
- Optional **GitHub backup/publish** from the sidebar, **defaulting to a private repo**, so prompts are never lost.
- **Excellent search** across titles + full content (fuzzy + full-text ranking).
- **Bring-your-own AI key** (OpenAI / OpenRouter / Anthropic) stored in macOS Keychain, used to **optimize** a prompt.
- An **"Open in…"** button next to Copy that pre-fills the prompt into external tools where supported, with clipboard fallback otherwise.

The deliverable is **four distinct clean UI designs** as separate runnable builds, all sharing **one backend**. After previewing, we keep the chosen UI and delete the other three.

### Added scope (requested mid-build)
- **Menu bar quick-access popover:** a macOS menu bar tray icon that opens a lightweight popover window (browse categories, instant search, click to copy / open-in). **Click-only** (no global hotkey). Shared across all 4 UI builds; reuses the same backend + search. Implemented as a second Tauri window (label `quickpanel`) created in `crates/core` and branched on by the frontend via the window label.
- **Community tab (Supabase-hosted):** browse prompts others have published, copy/import them locally, publish your own, and upvote. **Anonymous public read** for browse/copy (RLS); **email-OTP sign-in** required to publish/upvote. Lives in `packages/shared-ui` using `@supabase/supabase-js` so all 4 UIs share it (Rust core stays local-only). Requires provisioning a Supabase project (done as a dedicated step with a cost check).

## Confirmed decisions

- **Framework:** Tauri v2 (Rust backend). Machine has cargo 1.92, git 2.46, gh 2.83, Xcode CLT. **Node not installed** → install once (Node 20+ via official installer/Homebrew) + `pnpm` + `cargo install tauri-cli`.
- **Versioning:** local snapshot history; Git/GitHub is a separate optional backup. Private by default.
- **UI delivery:** four separate runnable frontend builds sharing one backend command set.
- **Frontend stack:** React 19 + Vite + Tailwind CSS v4 (ecosystem/maintainability). Markdown via `markdown-it` + `DOMPurify`, code highlight via `shiki`.
- **Search:** client-side **MiniSearch** (BM25-style ranking, field boosting title > body, prefix + fuzzy), rebuilt on a `library-changed` fs-watch event.

## Verified external facts ("Open in…" targets)

These are best-effort, undocumented UI behaviors; each needs a clipboard fallback and the user must be logged in. The backend models each target as a capability record so the UI is data-driven.

| Target | Strategy | URL template | Limit / note |
|---|---|---|---|
| ChatGPT web | url_prefill (auto-submits) | `https://chatgpt.com/?q={enc}` | fall back to clipboard if > ~8 KB |
| Claude desktop | url_prefill (review, no auto-send) | `claude://claude.ai/new?q={enc}` | truncate/fallback at ~14,000 chars |
| Claude web | clipboard_open | `https://claude.ai/new` | web `?q=` removed ~Oct 2025 |
| Perplexity | url_prefill | `https://www.perplexity.ai/search/?q={enc}` | length-sensitive |
| Google AI Studio | clipboard_open | `https://aistudio.google.com/prompts` | no stable prefill param |
| Cursor / other | clipboard_open | app/site root | no public prefill |

Encoding: URL-encode; spaces `%20`/`+`, newlines `%0A`. Any `url_prefill` prompt over ~8 KB auto-falls back to clipboard + open.

## Tauri v2 plugins / crates (correct v2 names)

- **Keychain:** `keyring` crate (v3+) called from Rust, login keychain. (Not Stronghold — deprecated.)
- **Open URLs / custom schemes:** `tauri-plugin-opener` (handles `claude://`, web URLs, reveal-in-Finder). (Not the deprecated `shell.open`.)
- **Filesystem + watch:** `tauri-plugin-fs` with `features = ["watch"]` (or `notify` crate in core).
- **HTTP to AI APIs:** `reqwest` directly in Rust core — API key read from Keychain, never exposed to the webview.
- **Dialogs:** `tauri-plugin-dialog` (library-folder picker, confirm restore).
- **Non-secret settings:** `tauri-plugin-store`. **Clipboard:** `tauri-plugin-clipboard-manager`.

## Repo layout (one backend, four runnable frontends)

pnpm workspace (JS) + Cargo workspace (Rust). Core logic is a **plain Rust lib crate**; each app is a **thin Tauri binary** that calls `spl_core::run()`, so the command set is defined exactly once.

```
system-prompt-library/
├── Cargo.toml                       # [workspace] members = crates/*, apps/*/src-tauri
├── pnpm-workspace.yaml              # packages: apps/*, packages/*
├── package.json                     # scripts: dev:aurora, dev:mono, dev:canvas, dev:shelf
├── crates/core/                     # THE backend (lib crate)
│   └── src/{lib.rs, commands.rs, fs_library.rs, versions.rs, git.rs, ai.rs, keychain.rs, targets.rs}
├── packages/shared-ui/              # shared TS: command bindings, MiniSearch index,
│   └── src/                         #   markdown pipeline, "Open in…" target registry
└── apps/
    ├── ui-aurora/  (port 5181)      # React+Vite frontend #1  + src-tauri/{main.rs, tauri.conf.json}
    ├── ui-mono/    (port 5182)      # frontend #2
    ├── ui-canvas/  (port 5183)      # frontend #3
    └── ui-shelf/   (port 5184)      # frontend #4
```

Each `apps/ui-*/src-tauri/src/main.rs` is just `fn main() { spl_core::run(); }`. Only `tauri.conf.json` (title, devUrl/port, distDir, bundle identifier) + React presentation differ.

## On-disk data model

```
~/Documents/PromptLibrary/            # user-chosen library root (a git repo if backup enabled)
├── Coding/code-review.md             # category = folder, prompt = .md file
├── Writing/blog-outline.md
└── .spl/                             # app metadata, git-ignored from publish
    ├── versions/<category>/<slug>/<ISO8601>.md   # local snapshots
    ├── versions-index.json           # {promptPath: [{ts, file, size, note}]}
    └── library.json                  # per-library prefs (remote, branch)

~/Library/Application Support/com.spl.app/settings.json   # theme, last library, AI provider, UI choice (NO secrets)
macOS Keychain (service "com.spl.app", accounts: openai|openrouter|anthropic)  # API keys ONLY here
```

- **Save:** write file → copy prior content into `.spl/versions/...` → append to `versions-index.json`. **Restore** copies a snapshot over the live file (itself snapshotted, so non-destructive).
- **Publish:** `.spl/` in `.gitignore`; `git init` → commit → `gh repo create <name> --private --source=. --push`. Public requires an explicit toggle.

## Implementation phases

**Phase 0 — Scaffolding:** install Node + pnpm + tauri-cli; create Cargo + pnpm workspaces, empty `crates/core`, one placeholder app; add plugins (opener, fs+watch, dialog, store, clipboard) and crates (keyring, reqwest, notify, serde).

**Phase 1 — Backend core (`crates/core`) — freeze the command contract here:**
1. `fs_library`: pick/scan library root; list categories+prompts; create/rename/delete category & prompt; read/write file; fs-watch emits `library-changed`.
2. `versions`: snapshot-on-save, list versions, read version, restore.
3. `keychain`: set/get/delete provider key via `keyring`.
4. `ai`: provider trait + OpenAI / OpenRouter / Anthropic over `reqwest`; `optimize_prompt(provider, text) -> improved` (frontend Accept → save → new snapshot).
5. `git`: detect git/gh, init, commit, `gh repo create --private --push`, status, push.
6. `targets`: the "Open in…" capability registry + length/fallback logic.
7. `commands.rs`: expose all the above (the contract all 4 UIs depend on).

**Phase 2 — `packages/shared-ui` + one reference UI (`ui-aurora`):** typed command bindings; MiniSearch index rebuilt on `library-changed`; markdown+shiki pipeline; target registry. Reference UI: sidebar (categories/prompts + add), rendered view with **Copy** (top-right) + **Open in…** dropdown, edit mode, version-history panel, search box, settings (AI provider/key, library path, Git backup).

**Phase 3 — Replicate to four:** copy reference app into `ui-mono`, `ui-canvas`, `ui-shelf`; each imports the same `@spl/shared-ui` + `crates/core`; only presentation + `tauri.conf.json` differ; add four `dev:*` scripts.

**Phase 4 — Preview & prune:** run all four, pick one, delete the other three `apps/ui-*` dirs (core + shared-ui untouched). Polish, then `tauri build` + signing.

## Four UI design directions

1. **Aurora — Calm editorial:** two-pane, serif headings, parchment/off-white, generous whitespace (iA Writer / Bear feel).
2. **Mono — Developer minimal:** monospace, high-contrast dark, three columns (categories | list | content), keyboard-first ⌘K palette.
3. **Canvas — Card/gallery:** prompts as cards in a grid with category chips; search bar as hero; centered focus overlay on open.
4. **Shelf — macOS-native:** vibrancy/translucent sidebar with SF-style icons, right-hand inspector for version history/metadata (Finder/Notes hybrid).

All four share identical functionality via `@spl/shared-ui` + the single `crates/core` command set; only layout/type/color/density change.

## Verification

- **Backend (Phase 1):** Rust unit tests for `fs_library` (CRUD + scan), `versions` (snapshot/restore round-trip), `targets` (URL encoding + fallback thresholds). Smoke-test commands from a throwaway HTML page before building real UIs.
- **Search:** seed ~50 sample prompts; confirm title-boosted ranking, prefix, and typo tolerance return the expected top hit.
- **Open in…:** verify `chatgpt.com/?q=` and `perplexity.ai/search/?q=` prefill in browser; `claude://` opens Claude desktop pre-filled; oversized prompt falls back to clipboard+open; AI Studio/Cursor use clipboard+open.
- **Versioning:** edit→save several times, confirm snapshots accumulate and restore is non-destructive (creates a new snapshot).
- **AI optimize:** with a real key in Keychain, run optimize against each provider; confirm key never appears in the webview/logs.
- **Git publish:** on a throwaway library, `gh repo create --private` + push; confirm repo is private and `.spl/` is excluded.
- **End-to-end:** `pnpm dev:aurora` (then mono/canvas/shelf) launches each app against the same library and backend.
