# PromptKeep

A clean, fast app for storing, searching, versioning, and reusing your system prompts.
It ships in **two forms from one codebase**:

- a **macOS desktop app** — local-first, your prompts are plain `.md` files on disk; and
- a **website** — for anyone (including non-Mac users), with each account's library
  synced to the cloud.

Built with **Tauri v2** (Rust) + **React 19** + **Vite** + **Tailwind v4**, backed by
**Supabase** on the web.

UI: **Aurora** — a calm, editorial design (serif headings, warm parchment, indigo accent).

> **Desktop vs. web.** The React UI is identical; only the backend differs. Every backend
> call routes through `packages/shared-ui/src/api.ts`, which dispatches at runtime
> (`isTauri()`): on desktop to the Rust commands, on the web to Supabase
> (`packages/shared-ui/src/web.ts`). Native-only features (local Git backup, the macOS
> Keychain, the menu-bar tray, the folder picker) are hidden on the web; AI keys there
> live in the browser tab's session storage and call the provider directly.

## Features

- **Library** — categories are folders, prompts are plain `.md` files on disk. Add,
  rename, move, delete categories and prompts.
- **Great search** — full-text + fuzzy ranking (MiniSearch), title-boosted, as-you-type.
- **Clean reading view** with a **Copy** button and an **Open in…** menu that prefills the
  prompt into ChatGPT, the Claude desktop app, or Perplexity (clipboard fallback for
  Claude web, Google AI Studio, Cursor).
- **Local version history** — every save snapshots the previous content; view and restore
  any version. Independent of Git.
- **Optional GitHub backup** — publish your library to a **private** repo and back up with
  one click. Local history is never published.
- **Bring-your-own AI key** (OpenAI / OpenRouter / Anthropic) stored in the macOS
  **Keychain** — used to optimize a prompt. Keys never touch the webview.
- **Menu-bar quick panel** — a tray icon opens a popover to search and copy any prompt
  without leaving your current app.
- **Community** (Supabase) — browse, copy/import, upvote, and publish prompts. See setup
  below; the app works fully without it.

## Requirements

- macOS, Xcode Command Line Tools
- Rust (`cargo`), Git, optionally the GitHub CLI (`gh`) for backup
- Node 20.19+ / 22+ and `pnpm`

> Note: a Homebrew Node 25 build on macOS 26 is killed by the Code Signing Monitor
> (`SIGKILL (Code Signature Invalid)`). Use an official Node build (e.g. via `nvm`).
> This project was developed against Node 22 (`nvm use 22`).

## Run (desktop)

```bash
pnpm install

pnpm dev      # run the app (Tauri dev)
pnpm build    # production build → bundles a .app/.dmg via `tauri build`
```

On first launch the app opens `~/Documents/PromptKeep` (created if missing). Change the
folder anytime from the sidebar or Settings.

## Run (website)

The website needs Supabase (see **Web / community setup** below) — that's where each
signed-in user's library lives, since a browser has no local disk.

```bash
pnpm web          # the web app in a browser at http://127.0.0.1:5181 (Vite dev, with HMR)
pnpm build:web    # production static build → apps/ui-aurora/dist
pnpm preview:web  # serve the production build locally
```

On the web, users sign in with an email one-time code (no password); their prompts,
categories, and version history are stored per-account in Supabase under row-level
security. Search runs client-side, exactly like desktop.

### Deploy to Vercel

The repo includes `vercel.json` (build command, output dir, and an SPA rewrite). To deploy:

1. Import the repo into Vercel. It auto-detects pnpm; `vercel.json` does the rest
   (`pnpm build:web` → `apps/ui-aurora/dist`).
2. In **Project Settings → Environment Variables**, set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (the anon key is safe to expose — RLS governs access).
3. Apply both SQL migrations to your Supabase project (see below).
4. Deploy. (Node is pinned to 22 via `engines` / `.nvmrc`.)

## Project layout

```
crates/core/         # THE backend (one Rust lib): fs library, version history,
                     #   Keychain, AI providers, Git, the Tauri command surface,
                     #   the file watcher, and the menu-bar tray + quick-panel window.
packages/shared-ui/  # shared TS: command bindings (api.ts — dispatches desktop↔web
                     #   via runtime.ts), the web/Supabase backend (web.ts), MiniSearch,
                     #   markdown (markdown-it + shiki), "Open in…" registry, Supabase.
apps/ui-aurora/      # the Tauri app AND the website (one bundle); main.rs is just
                     #   `promptkeep_core::run(...)`. AuthGate.tsx is the web sign-in screen.
supabase/migrations/ # 0001 community schema + 0002 per-user library (apply both).
```

## Tests

```bash
cargo test -p promptkeep-core   # backend unit tests (fs, versions, git, targets)
pnpm -r typecheck           # frontend type checks
```

## Web / community setup (Supabase)

Supabase powers two things: the shared **Community** feed (optional on desktop) and the
per-account **personal library** for the **website** (required there).

1. In your Supabase project, run both migrations (Dashboard → SQL Editor → paste & run):
   - `supabase/migrations/0001_community.sql` — the public community feed + upvotes.
   - `supabase/migrations/0002_library.sql` — per-user prompts, categories, and version
     history for the web app (RLS scopes every row to its owner).
2. Provide the credentials:
   - **Local:** copy `.env.example` to `.env` at the repo root and fill in
     `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - **Vercel:** set the same two as Environment Variables.
   ```
   VITE_SUPABASE_URL=...        # Project Settings → API → Project URL
   VITE_SUPABASE_ANON_KEY=...   # the anon / publishable key (safe to embed)
   ```
3. Restart the dev server.
   - On **desktop**, the Community tab goes live: anonymous browse/copy/import, email
     one-time-code sign-in to publish and upvote. The local library is unaffected.
   - On the **web**, sign-in is required up front (email one-time code); each account gets
     its own cloud library. RLS enforces that the anon key cannot read or write anyone
     else's rows.
