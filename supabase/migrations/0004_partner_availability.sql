-- Partners live their own day: replies wait until they're free (or awake), and a
-- like is a request the partner answers later, sometimes with a gentle no.

-- On busy notes: the moment (on the user's simulated clock, see simtime.ts) the
-- partner is free to reply. Null on every other message.
alter table public.messages add column reply_at timestamptz;

-- Likes start as 'pending' and become 'matched' or 'declined' at decide_at
-- (simulated clock), depending on the partner's schedule.
alter table public.matches drop constraint matches_status_check;
alter table public.matches
  add constraint matches_status_check check (status in ('passed', 'pending', 'matched', 'declined'));
alter table public.matches add column decide_at timestamptz;
