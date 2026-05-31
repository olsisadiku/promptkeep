-- PromptKeep — community social layer: following authors.
-- Apply to the same Supabase project as 0001_community.sql:
--   • Supabase Dashboard → SQL Editor → paste & run, OR
--   • supabase db push with this file.
--
-- Adds the ability to follow other authors and filter the feed to people you
-- follow. Category rename/delete (per author, over their own published prompts)
-- needs no new tables — it runs through the existing RLS update/delete policies
-- on community_prompts. This migration only exposes author_id on the feed view
-- (needed so the client can address an author) and adds the follow graph.

-- ---------------------------------------------------------------------------
-- Follow graph
-- ---------------------------------------------------------------------------
create table if not exists public.community_follows (
  follower_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint community_follows_no_self check (follower_id <> followee_id)
);

create index if not exists community_follows_followee_idx
  on public.community_follows (followee_id);

alter table public.community_follows enable row level security;

-- Follower relationships are public (so anyone can see follower counts), but a
-- user may only create/remove their OWN follows.
drop policy if exists "follows readable by all" on public.community_follows;
create policy "follows readable by all"
  on public.community_follows for select
  using (true);

drop policy if exists "users create own follows" on public.community_follows;
create policy "users create own follows"
  on public.community_follows for insert to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "users remove own follows" on public.community_follows;
create policy "users remove own follows"
  on public.community_follows for delete to authenticated
  using (follower_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Feed view — now also exposes the author's id, whether the viewer follows
-- them, and the author's total follower count. Recreated (drop + create) so we
-- can add columns without column-ordering constraints.
-- ---------------------------------------------------------------------------
drop view if exists public.community_feed;
create view public.community_feed
with (security_invoker = on) as
select
  p.id,
  p.title,
  p.body,
  p.category,
  p.tags,
  p.author_id,
  p.author_name,
  p.created_at,
  coalesce(uc.cnt, 0)::int as upvotes,
  exists (
    select 1 from public.community_upvotes u
    where u.prompt_id = p.id and u.user_id = auth.uid()
  ) as viewer_has_upvoted,
  coalesce(fc.cnt, 0)::int as author_followers,
  exists (
    select 1 from public.community_follows f
    where f.followee_id = p.author_id and f.follower_id = auth.uid()
  ) as viewer_is_following
from public.community_prompts p
left join (
  select prompt_id, count(*)::int as cnt
  from public.community_upvotes
  group by prompt_id
) uc on uc.prompt_id = p.id
left join (
  select followee_id, count(*)::int as cnt
  from public.community_follows
  group by followee_id
) fc on fc.followee_id = p.author_id;

-- ---------------------------------------------------------------------------
-- toggle_follow RPC — flips the caller's follow of an author; returns whether
-- the caller now follows them.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_follow(p_followee_id uuid)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_following boolean;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to follow';
  end if;
  if p_followee_id = auth.uid() then
    raise exception 'cannot follow yourself';
  end if;
  if exists (
    select 1 from public.community_follows
    where follower_id = auth.uid() and followee_id = p_followee_id
  ) then
    delete from public.community_follows
    where follower_id = auth.uid() and followee_id = p_followee_id;
    v_following := false;
  else
    insert into public.community_follows (follower_id, followee_id)
    values (auth.uid(), p_followee_id);
    v_following := true;
  end if;
  return v_following;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies on top of these)
-- ---------------------------------------------------------------------------
grant select on public.community_feed to anon, authenticated;
grant select on public.community_follows to anon, authenticated;
grant insert, delete on public.community_follows to authenticated;
grant execute on function public.toggle_follow(uuid) to authenticated;
