// Web backend: the browser-side implementation of the command surface that the
// desktop app implements in Rust (crates/core). A signed-in user's prompts,
// categories and version history live in Supabase Postgres (see
// supabase/migrations/0002_library.sql); RLS scopes every row to auth.uid().
//
// Native-only features (local Git backup, the macOS Keychain, the file watcher,
// the folder picker, the menu-bar tray) have no browser equivalent and are
// stubbed out here — the UI hides them on web (see store `isWeb`).

import { community } from "./community";
import { ALL_PROVIDERS, DEFAULT_MODELS } from "./config";
import type {
  AiProvider,
  CategoryNode,
  FlatPrompt,
  GitStatus,
  LibrarySnapshot,
  PromptFull,
  PromptMeta,
  SaveResult,
  VersionMeta,
} from "./types";

// --- mapping helpers -------------------------------------------------------

interface PromptRow {
  id: string;
  title: string;
  category: string | null;
  content: string;
  updated_at: string;
}
interface VersionRow {
  created_at: string;
  content: string;
  note: string | null;
}

const byteLen = (s: string): number => new TextEncoder().encode(s).length;

function toMeta(r: PromptRow): PromptMeta {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    file_name: `${r.title}.md`,
    size: byteLen(r.content),
    modified_ms: new Date(r.updated_at).getTime(),
  };
}

function toVersionMeta(v: VersionRow, promptId: string): VersionMeta {
  // `ts` is the opaque key the UI passes back to read/restore; we key versions
  // by their created_at timestamp (unique per prompt in practice).
  return { ts: v.created_at, file: promptId, size: byteLen(v.content), note: v.note };
}

const PROMPT_COLS = "id,title,category,content,updated_at";

/** Map a Postgres unique-violation into a friendly message; rethrow others. */
function friendly(error: { code?: string; message: string } | null, dupMsg: string): void {
  if (!error) return;
  if (error.code === "23505") throw new Error(dupMsg);
  throw new Error(error.message);
}

async function ensureCategory(name: string): Promise<void> {
  const { error } = await community().from("library_categories").insert({ name: name.trim() });
  if (error && error.code !== "23505") throw new Error(error.message);
}

// --- library location ------------------------------------------------------

export async function webDefaultLibraryPath(): Promise<string> {
  return "Cloud library";
}

export async function webGetLibraryPath(): Promise<string | null> {
  const { data } = await community().auth.getUser();
  return data.user ? (data.user.email ?? "Cloud library") : null;
}

export async function webSetLibraryPath(_path: string): Promise<LibrarySnapshot> {
  // There is no folder to choose on web; the "library" is the signed-in account.
  return webListLibrary();
}

// --- library / prompts -----------------------------------------------------

export async function webListLibrary(): Promise<LibrarySnapshot> {
  const db = community();
  const [cats, prompts] = await Promise.all([
    db.from("library_categories").select("name"),
    db.from("library_prompts").select(PROMPT_COLS).order("title"),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (prompts.error) throw new Error(prompts.error.message);

  const rows = (prompts.data ?? []) as PromptRow[];
  const byCat = new Map<string, PromptMeta[]>();
  const uncategorized: PromptMeta[] = [];
  for (const r of rows) {
    if (r.category) {
      const list = byCat.get(r.category) ?? [];
      list.push(toMeta(r));
      byCat.set(r.category, list);
    } else {
      uncategorized.push(toMeta(r));
    }
  }

  // Categories = explicitly-created (possibly empty) folders ∪ any referenced.
  const names = new Set<string>((cats.data ?? []).map((c: { name: string }) => c.name));
  for (const k of byCat.keys()) names.add(k);
  const categories: CategoryNode[] = [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, prompts: byCat.get(name) ?? [] }));

  const root = (await webGetLibraryPath()) ?? "Cloud library";
  return { root, categories, uncategorized };
}

export async function webListSearchPayload(): Promise<FlatPrompt[]> {
  const { data, error } = await community().from("library_prompts").select(PROMPT_COLS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as PromptRow[]).map((r) => ({ ...toMeta(r), content: r.content }));
}

export async function webReadPrompt(id: string): Promise<PromptFull> {
  const { data, error } = await community()
    .from("library_prompts")
    .select(PROMPT_COLS)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const r = data as PromptRow;
  return { ...toMeta(r), content: r.content };
}

export async function webCreateCategory(name: string): Promise<void> {
  const { error } = await community().from("library_categories").insert({ name: name.trim() });
  friendly(error, "A category with that name already exists.");
}

export async function webRenameCategory(oldName: string, newName: string): Promise<void> {
  const db = community();
  const c = await db.from("library_categories").update({ name: newName.trim() }).eq("name", oldName);
  friendly(c.error, "A category with that name already exists.");
  const p = await db.from("library_prompts").update({ category: newName.trim() }).eq("category", oldName);
  if (p.error) throw new Error(p.error.message);
}

export async function webDeleteCategory(name: string): Promise<void> {
  const db = community();
  // Prompts cascade their versions; then drop the (now empty) category row.
  const p = await db.from("library_prompts").delete().eq("category", name);
  if (p.error) throw new Error(p.error.message);
  const c = await db.from("library_categories").delete().eq("name", name);
  if (c.error) throw new Error(c.error.message);
}

export async function webCreatePrompt(category: string | null, name: string): Promise<string> {
  if (category) await ensureCategory(category);
  const { data, error } = await community()
    .from("library_prompts")
    .insert({ title: name.trim(), category, content: "" })
    .select("id")
    .single();
  friendly(error, "A prompt with that name already exists here.");
  return (data as { id: string }).id;
}

export async function webRenamePrompt(id: string, newName: string): Promise<string> {
  const { error } = await community()
    .from("library_prompts")
    .update({ title: newName.trim() })
    .eq("id", id);
  friendly(error, "A prompt with that name already exists here.");
  return id;
}

export async function webDeletePrompt(id: string): Promise<void> {
  const { error } = await community().from("library_prompts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function webMovePrompt(id: string, newCategory: string | null): Promise<string> {
  if (newCategory) await ensureCategory(newCategory);
  const { error } = await community()
    .from("library_prompts")
    .update({ category: newCategory })
    .eq("id", id);
  friendly(error, "A prompt with that name already exists there.");
  return id;
}

export async function webSavePrompt(
  id: string,
  content: string,
  note?: string,
): Promise<SaveResult> {
  const db = community();
  const cur = await db.from("library_prompts").select("content").eq("id", id).single();
  if (cur.error) throw new Error(cur.error.message);
  const prev = (cur.data as { content: string }).content ?? "";

  // Snapshot the previous content before overwriting (mirrors desktop history).
  let version: VersionMeta | null = null;
  if (prev && prev !== content) {
    const v = await db
      .from("library_versions")
      .insert({ prompt_id: id, content: prev, note: note ?? null })
      .select("created_at,content,note")
      .single();
    if (v.error) throw new Error(v.error.message);
    version = toVersionMeta(v.data as VersionRow, id);
  }

  const upd = await db
    .from("library_prompts")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upd.error) throw new Error(upd.error.message);
  return { id, version };
}

// --- version history -------------------------------------------------------

export async function webListVersions(id: string): Promise<VersionMeta[]> {
  const { data, error } = await community()
    .from("library_versions")
    .select("created_at,content,note")
    .eq("prompt_id", id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as VersionRow[]).map((v) => toVersionMeta(v, id));
}

export async function webReadVersion(id: string, ts: string): Promise<string> {
  const { data, error } = await community()
    .from("library_versions")
    .select("content")
    .eq("prompt_id", id)
    .eq("created_at", ts)
    .limit(1)
    .single();
  if (error) throw new Error(error.message);
  return (data as { content: string }).content;
}

export async function webRestoreVersion(id: string, ts: string): Promise<SaveResult> {
  const content = await webReadVersion(id, ts);
  return webSavePrompt(id, content, "Restored a previous version");
}

// --- API keys (browser session only) ---------------------------------------
// On web there is no Keychain. Keys live in sessionStorage — cleared when the
// tab closes — and are used to call the provider directly from the browser.

const KEY_PREFIX = "spl.aikey.";

export function webSetApiKey(provider: AiProvider, key: string): void {
  sessionStorage.setItem(KEY_PREFIX + provider, key);
}
export function webHasApiKey(provider: AiProvider): boolean {
  return !!sessionStorage.getItem(KEY_PREFIX + provider);
}
export function webDeleteApiKey(provider: AiProvider): void {
  sessionStorage.removeItem(KEY_PREFIX + provider);
}
export function webProvidersWithKeys(): AiProvider[] {
  return ALL_PROVIDERS.filter((p) => webHasApiKey(p));
}

// --- AI optimize (browser fetch) -------------------------------------------
// Mirrors crates/core/src/ai.rs, but runs in the browser. Providers must allow
// cross-origin calls: OpenAI and OpenRouter do; Anthropic requires the explicit
// direct-browser-access opt-in header.

const OPTIMIZE_SYSTEM =
  "You are an expert prompt engineer. You are given a system prompt that the user wants to improve. Rewrite it to be clearer, more specific, better structured, and more effective, while preserving the original intent, voice, and any concrete constraints. Prefer plain, direct language. Do not add meta-commentary. Return ONLY the improved system prompt as Markdown — no preamble, no explanation, no code fences around the whole thing.";

function userMessage(prompt: string, instructions?: string): string {
  const i = instructions?.trim();
  return i
    ? `Additional instructions for how to improve it:\n${i}\n\n---\nSYSTEM PROMPT TO IMPROVE:\n\n${prompt}`
    : `SYSTEM PROMPT TO IMPROVE:\n\n${prompt}`;
}

function providerError(v: any, status: number): string {
  const msg =
    v?.error?.message ?? (typeof v?.error === "string" ? v.error : undefined) ?? v?.message ?? "request failed";
  return `${status}: ${msg}`;
}

export async function webOptimizePrompt(
  provider: AiProvider,
  prompt: string,
  opts?: { model?: string; instructions?: string },
): Promise<string> {
  if (!prompt.trim()) throw new Error("prompt is empty");
  const key = sessionStorage.getItem(KEY_PREFIX + provider);
  if (!key) throw new Error(`No API key for ${provider}. Add one in Settings.`);
  const model = opts?.model?.trim() || DEFAULT_MODELS[provider];
  const user = userMessage(prompt, opts?.instructions);

  if (provider === "openai" || provider === "openrouter") {
    const url =
      provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions";
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    };
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://github.com/olsisadiku/promptkeep";
      headers["X-Title"] = "PromptKeep";
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: OPTIMIZE_SYSTEM },
          { role: "user", content: user },
        ],
        temperature: 0.4,
      }),
    });
    const v = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(providerError(v, res.status));
    const out = v?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error("empty response from model");
    return out;
  }

  // anthropic
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: OPTIMIZE_SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  const v = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(providerError(v, res.status));
  const out = v?.content?.[0]?.text?.trim();
  if (!out) throw new Error("empty response from model");
  return out;
}

// --- Git (not available on web) --------------------------------------------

export function webGitStatus(): GitStatus {
  return {
    git_available: false,
    gh_available: false,
    gh_authed: false,
    is_repo: false,
    has_remote: false,
    branch: null,
    remote_url: null,
    dirty: false,
  };
}
