-- PromptKeep — community schema.
-- Apply this to your Supabase project (system-prompt-tracker):
--   • Supabase Dashboard → SQL Editor → paste & run, OR
--   • supabase db push with this file, OR
--   • have the assistant run it via the Supabase MCP once it can reach the project.
--
-- Model: anyone (even signed-out) can READ the feed and copy prompts. Publishing
-- and upvoting require a signed-in user (email one-time-code). RLS enforces that
-- the embedded anon key cannot write on someone else's behalf.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.community_prompts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  body        text not null check (char_length(body) between 1 and 100000),
  category    text,
  tags        text[] not null default '{}',
  author_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text,
  created_at  timestamptz not null default now()
);

create table if not exists public.community_upvotes (
  prompt_id  uuid not null references public.community_prompts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prompt_id, user_id)
);

create index if not exists community_prompts_created_idx on public.community_prompts (created_at desc);
create index if not exists community_upvotes_prompt_idx on public.community_upvotes (prompt_id);

-- ---------------------------------------------------------------------------
-- Feed view: upvote count + whether the current viewer upvoted.
-- security_invoker so RLS + auth.uid() resolve against the calling user.
-- ---------------------------------------------------------------------------
create or replace view public.community_feed
with (security_invoker = on) as
select
  p.id,
  p.title,
  p.body,
  p.category,
  p.tags,
  p.author_name,
  p.created_at,
  coalesce(uc.cnt, 0)::int as upvotes,
  exists (
    select 1 from public.community_upvotes u
    where u.prompt_id = p.id and u.user_id = auth.uid()
  ) as viewer_has_upvoted
from public.community_prompts p
left join (
  select prompt_id, count(*)::int as cnt
  from public.community_upvotes
  group by prompt_id
) uc on uc.prompt_id = p.id;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.community_prompts enable row level security;
alter table public.community_upvotes enable row level security;

drop policy if exists "prompts readable by all" on public.community_prompts;
create policy "prompts readable by all"
  on public.community_prompts for select
  using (true);

drop policy if exists "authors insert own prompts" on public.community_prompts;
create policy "authors insert own prompts"
  on public.community_prompts for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "authors modify own prompts" on public.community_prompts;
create policy "authors modify own prompts"
  on public.community_prompts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "authors delete own prompts" on public.community_prompts;
create policy "authors delete own prompts"
  on public.community_prompts for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists "upvotes readable by all" on public.community_upvotes;
create policy "upvotes readable by all"
  on public.community_upvotes for select
  using (true);

drop policy if exists "users manage own upvotes (insert)" on public.community_upvotes;
create policy "users manage own upvotes (insert)"
  on public.community_upvotes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users manage own upvotes (delete)" on public.community_upvotes;
create policy "users manage own upvotes (delete)"
  on public.community_upvotes for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- toggle_upvote RPC — flips the caller's upvote and returns the new count.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_upvote(p_prompt_id uuid)
returns int
language plpgsql
security invoker
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to upvote';
  end if;
  if exists (
    select 1 from public.community_upvotes
    where prompt_id = p_prompt_id and user_id = auth.uid()
  ) then
    delete from public.community_upvotes
    where prompt_id = p_prompt_id and user_id = auth.uid();
  else
    insert into public.community_upvotes (prompt_id, user_id)
    values (p_prompt_id, auth.uid());
  end if;
  select count(*)::int into v_count
  from public.community_upvotes where prompt_id = p_prompt_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies on top of these)
-- ---------------------------------------------------------------------------
grant select on public.community_feed to anon, authenticated;
grant select on public.community_prompts to anon, authenticated;
grant insert, update, delete on public.community_prompts to authenticated;
grant select on public.community_upvotes to anon, authenticated;
grant insert, delete on public.community_upvotes to authenticated;
grant execute on function public.toggle_upvote(uuid) to authenticated;
