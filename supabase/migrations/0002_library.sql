-- System Prompt Library — personal (cloud) library schema for the WEB app.
-- Apply to the same Supabase project as 0001_community.sql:
--   • Supabase Dashboard → SQL Editor → paste & run, OR
--   • supabase db push with this file.
--
-- Model: every row is owned by a signed-in user (auth.uid()). RLS makes a user's
-- prompts, categories and version history visible and writable ONLY to them.
-- The desktop app stores all of this on the local filesystem instead; these
-- tables back the website (packages/shared-ui/src/web.ts).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Categories are tracked explicitly so empty categories (folders with no
-- prompts) persist, exactly like an empty subfolder on desktop.
create table if not exists public.library_categories (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);

create table if not exists public.library_prompts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  category   text,                       -- null = uncategorized
  content    text not null default '' check (char_length(content) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- mirrors filesystem uniqueness: one title per category per user.
  unique (user_id, category, title)
);

create table if not exists public.library_versions (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid not null references public.library_prompts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content    text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists library_prompts_user_idx on public.library_prompts (user_id);
create index if not exists library_versions_prompt_idx
  on public.library_versions (prompt_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security — each user sees and edits only their own rows.
-- ---------------------------------------------------------------------------
alter table public.library_categories enable row level security;
alter table public.library_prompts    enable row level security;
alter table public.library_versions   enable row level security;

drop policy if exists "own categories" on public.library_categories;
create policy "own categories"
  on public.library_categories for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own prompts" on public.library_prompts;
create policy "own prompts"
  on public.library_prompts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own versions" on public.library_versions;
create policy "own versions"
  on public.library_versions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies on top of these). Anonymous users get nothing —
-- the personal library always requires sign-in.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.library_categories to authenticated;
grant select, insert, update, delete on public.library_prompts    to authenticated;
grant select, insert, update, delete on public.library_versions   to authenticated;
