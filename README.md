# System Prompt Library

A clean, fast macOS desktop app for storing, searching, versioning, and reusing your
system prompts. Built with **Tauri v2** (Rust) + **React 19** + **Vite** + **Tailwind v4**.

UI: **Aurora** — a calm, editorial design (serif headings, warm parchment, indigo accent).

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

## Run

```bash
pnpm install

pnpm dev      # run the app (Tauri dev)
pnpm build    # production build → bundles a .app/.dmg via `tauri build`
```

On first launch the app opens `~/Documents/PromptLibrary` (created if missing). Change the
folder anytime from the sidebar or Settings.

## Project layout

```
crates/core/         # THE backend (one Rust lib): fs library, version history,
                     #   Keychain, AI providers, Git, the Tauri command surface,
                     #   the file watcher, and the menu-bar tray + quick-panel window.
packages/shared-ui/  # shared TS: command bindings, MiniSearch, markdown
                     #   (markdown-it + shiki), "Open in…" registry, Supabase.
apps/ui-aurora/      # the Tauri app; main.rs is just `spl_core::run(...)`.
supabase/migrations/ # community schema (apply to your Supabase project).
```

## Tests

```bash
cargo test -p spl-core      # backend unit tests (fs, versions, git, targets)
pnpm -r typecheck           # frontend type checks
```

## Community setup (optional, Supabase)

1. In your Supabase project, run `supabase/migrations/0001_community.sql`
   (Dashboard → SQL Editor → paste & run).
2. Copy `.env.example` to `.env` at the repo root and fill in:
   ```
   VITE_SUPABASE_URL=...        # Project Settings → API → Project URL
   VITE_SUPABASE_ANON_KEY=...   # the anon / publishable key (safe to embed)
   ```
3. Restart the dev server. The Community tab goes live: anonymous browse/copy/import,
   email one-time-code sign-in to publish and upvote. RLS enforces that the anon key
   cannot write on anyone else's behalf.
