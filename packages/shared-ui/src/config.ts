// Build-time configuration, read from Vite env vars. The Supabase anon key is
// safe to embed in the client — row-level security governs what it can do.

import type { AiProvider } from "./types";

const env = (import.meta as any).env ?? {};

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? "";

/** Community features are only enabled once a Supabase project is configured. */
export const COMMUNITY_ENABLED: boolean = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  anthropic: "Anthropic (Claude)",
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o",
  openrouter: "openai/gpt-4o",
  anthropic: "claude-sonnet-4-6",
};

export const ALL_PROVIDERS: AiProvider[] = ["openai", "openrouter", "anthropic"];
