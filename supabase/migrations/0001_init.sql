-- SeniorChat Global: initial schema
-- Every row is owned by an (anonymous or registered) Supabase auth user.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  age_range text not null,
  interests text[] not null default '{}',
  partner_id text,
  timezone text not null default 'UTC',
  day_offset integer not null default 0, -- "simulate next day" shifts this
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id text not null,
  role text not null check (role in ('user', 'partner')),
  kind text not null default 'chat' check (kind in ('chat', 'reach_out', 'busy_note', 'voice_message', 'call')),
  content text not null,
  sim_date date not null,
  created_at timestamptz not null default now()
);
create index messages_user_partner_idx on public.messages (user_id, partner_id, created_at);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id text not null,
  category text not null check (category in ('event', 'person', 'feeling', 'plan')),
  content text not null,
  event_date date,          -- when the remembered thing happens/happened, if known
  importance smallint not null default 2 check (importance between 1 and 3),
  followed_up boolean not null default false,
  source_message_id uuid references public.messages (id) on delete set null,
  sim_date date not null,
  created_at timestamptz not null default now()
);
create index memories_user_partner_idx on public.memories (user_id, partner_id, created_at desc);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id text not null,
  sim_date date not null,
  items jsonb not null, -- [{ start: "HH:MM", end: "HH:MM", activity: text, busy: bool }]
  created_at timestamptz not null default now(),
  unique (user_id, partner_id, sim_date)
);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.schedules enable row level security;

create policy "own profile" on public.profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own messages" on public.messages
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own memories" on public.memories
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own schedules" on public.schedules
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
