// Supabase-backed community: browse/copy public prompts (anonymous), and
// publish/upvote once signed in (email one-time-code; no browser redirect, so
// it works inside the desktop webview). All writes are governed by RLS in the
// database — the embedded anon key cannot bypass it.

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { COMMUNITY_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export interface CommunityPrompt {
  id: string;
  title: string;
  body: string;
  category: string | null;
  tags: string[] | null;
  author_name: string | null;
  upvotes: number;
  viewer_has_upvoted?: boolean;
  created_at: string;
}

export interface BrowseOptions {
  query?: string;
  category?: string | null;
  sort?: "top" | "new";
  limit?: number;
}

let client: SupabaseClient | null = null;

export function community(): SupabaseClient {
  if (!COMMUNITY_ENABLED) {
    throw new Error("Community is not configured (missing Supabase credentials).");
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export const communityEnabled = (): boolean => COMMUNITY_ENABLED;

// --- browse / copy (anonymous) ---------------------------------------------

export async function browseCommunity(opts: BrowseOptions = {}): Promise<CommunityPrompt[]> {
  const db = community();
  // `community_feed` is a view that includes the upvote count and whether the
  // current viewer has upvoted (resolved via auth.uid()).
  let q = db.from("community_feed").select("*");
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.query && opts.query.trim()) {
    const term = `%${opts.query.trim()}%`;
    q = q.or(`title.ilike.${term},body.ilike.${term}`);
  }
  q = q.order(opts.sort === "new" ? "created_at" : "upvotes", { ascending: false });
  q = q.limit(opts.limit ?? 60);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CommunityPrompt[];
}

export async function communityCategories(): Promise<string[]> {
  const db = community();
  const { data, error } = await db.from("community_feed").select("category");
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) if (row.category) set.add(row.category as string);
  return [...set].sort();
}

// --- auth (email one-time code) --------------------------------------------

export async function sendLoginCode(email: string): Promise<void> {
  const { error } = await community().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

export async function verifyLoginCode(email: string, token: string): Promise<Session | null> {
  const { data, error } = await community().auth.verifyOtp({ email, token, type: "email" });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function currentSession(): Promise<Session | null> {
  if (!COMMUNITY_ENABLED) return null;
  const { data } = await community().auth.getSession();
  return data.session;
}

export async function signOut(): Promise<void> {
  await community().auth.signOut();
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!COMMUNITY_ENABLED) return () => {};
  const { data } = community().auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// --- publish / upvote (authenticated) --------------------------------------

export interface PublishInput {
  title: string;
  body: string;
  category?: string | null;
  tags?: string[];
}

export async function publishToCommunity(input: PublishInput): Promise<CommunityPrompt> {
  const db = community();
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) throw new Error("You must sign in to publish.");
  const authorName =
    (userData.user.user_metadata?.name as string | undefined) ??
    userData.user.email?.split("@")[0] ??
    "anon";
  const { data, error } = await db
    .from("community_prompts")
    .insert({
      title: input.title.trim(),
      body: input.body,
      category: input.category ?? null,
      tags: input.tags ?? [],
      author_id: userData.user.id,
      author_name: authorName,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CommunityPrompt;
}

/** Toggle the current user's upvote; returns the new vote count. */
export async function toggleUpvote(promptId: string): Promise<number> {
  const { data, error } = await community().rpc("toggle_upvote", { p_prompt_id: promptId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}
