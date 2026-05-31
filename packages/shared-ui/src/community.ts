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
  author_id: string;
  author_name: string | null;
  upvotes: number;
  viewer_has_upvoted?: boolean;
  author_followers?: number;
  viewer_is_following?: boolean;
  created_at: string;
}

export interface BrowseOptions {
  query?: string;
  category?: string | null;
  sort?: "top" | "new";
  /** Restrict the feed to authors the signed-in viewer follows. */
  following?: boolean;
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
  if (opts.following) q = q.eq("viewer_is_following", true);
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

// --- follow authors (authenticated) ----------------------------------------

/** Toggle following an author; returns whether the caller now follows them. */
export async function toggleFollow(authorId: string): Promise<boolean> {
  const { data, error } = await community().rpc("toggle_follow", { p_followee_id: authorId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// --- manage your own community categories (authenticated) ------------------

async function requireUserId(db: SupabaseClient): Promise<string> {
  const { data } = await db.auth.getUser();
  if (!data.user) throw new Error("You must sign in to manage categories.");
  return data.user.id;
}

/** Distinct, non-empty categories across the signed-in user's published prompts. */
export async function myCommunityCategories(): Promise<string[]> {
  const db = community();
  const uid = await requireUserId(db);
  const { data, error } = await db
    .from("community_prompts")
    .select("category")
    .eq("author_id", uid);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const row of data ?? []) if (row.category) set.add(row.category as string);
  return [...set].sort();
}

/** Rename a category across the signed-in user's published prompts. */
export async function renameMyCategory(oldName: string, newName: string): Promise<void> {
  const next = newName.trim();
  if (!next) throw new Error("New category name can't be empty.");
  const db = community();
  const uid = await requireUserId(db);
  const { error } = await db
    .from("community_prompts")
    .update({ category: next })
    .eq("author_id", uid)
    .eq("category", oldName);
  if (error) throw new Error(error.message);
}

/**
 * Delete a category for the signed-in user. This removes every community prompt
 * they published under that category — it does NOT touch their local library.
 */
export async function deleteMyCategory(name: string): Promise<void> {
  const db = community();
  const uid = await requireUserId(db);
  const { error } = await db
    .from("community_prompts")
    .delete()
    .eq("author_id", uid)
    .eq("category", name);
  if (error) throw new Error(error.message);
}
