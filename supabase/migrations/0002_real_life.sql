-- Step 7 "Back to real life": tag real people in the user's life on memories,
-- and record when a proactive message nudged the user to contact one of them.

alter table public.memories
  add column person_name text,   -- real person in the user's life this memory involves (e.g. "Sarah")
  add column relationship text;  -- their relationship to the user (e.g. "daughter", "old friend")

create index memories_person_idx on public.memories (user_id, partner_id, sim_date)
  where person_name is not null;

alter table public.messages
  add column nudged_person text; -- set on reach_out messages that encouraged contacting this person
