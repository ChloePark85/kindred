-- Dating-style discovery: users browse AI partner profiles, like or pass, and match.
-- profiles.partner_id now means "the partner whose chat/call/us screens are open".

alter table public.profiles
  add column seeking text not null default 'anyone' check (seeking in ('men', 'women', 'anyone'));

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id text not null,
  status text not null check (status in ('passed', 'matched')),
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  unique (user_id, partner_id)
);
create index matches_user_idx on public.matches (user_id, status, matched_at desc);

alter table public.matches enable row level security;
create policy "own matches" on public.matches
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Existing users who already picked a partner keep them as a match.
insert into public.matches (user_id, partner_id, status, matched_at)
select id, partner_id, 'matched', created_at from public.profiles where partner_id is not null
on conflict (user_id, partner_id) do nothing;
