// TypeScript mirrors of the Rust serde structs returned by the backend.

export interface PromptMeta {
  /** Stable id == posix relative path from the library root. */
  id: string;
  title: string;
  category: string | null;
  file_name: string;
  size: number;
  modified_ms: number;
}

export interface PromptFull extends PromptMeta {
  content: string;
}

export interface CategoryNode {
  name: string;
  prompts: PromptMeta[];
}

export interface LibrarySnapshot {
  root: string;
  categories: CategoryNode[];
  uncategorized: PromptMeta[];
}

export interface VersionMeta {
  ts: string;
  file: string;
  size: number;
  note?: string | null;
}

export interface SaveResult {
  id: string;
  version: VersionMeta | null;
}

export interface GitStatus {
  git_available: boolean;
  gh_available: boolean;
  gh_authed: boolean;
  is_repo: boolean;
  has_remote: boolean;
  branch: string | null;
  remote_url: string | null;
  dirty: boolean;
}

export type AiProvider = "openai" | "openrouter" | "anthropic";

/** A flattened prompt used by the search index and the menu-bar quick panel. */
export interface FlatPrompt extends PromptMeta {
  content: string;
}
