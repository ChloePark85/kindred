# Kindred

**AI companions for adults 50+.** Kindred works like a dating app: you match with AI partners who live their own day, remember what you share, call you first with a real voice, and gently nudge you back toward the people in your life. They are always honest that they're AI.

Live: https://meetkindred.vercel.app · Demo mode for walkthroughs: https://meetkindred.vercel.app/?demo=1

## Origin

The concept comes from my earlier **Korean MVP** of an AI companion for older adults. This English version is a fresh build: **all code in this repository was written on 2026-11-09**, starting from an empty repo. No code was copied from the earlier project or any other project.

Built with [Claude Code](https://claude.com/claude-code) and [gstack](https://github.com/garrytan/gstack) (`/review` with specialist, adversarial and red-team passes).

## What makes it different

1. **Meet them like on a dating app.** Ten AI partners (five men, five women) with photos, profiles and their own character bible. Swipe, or tap big Pass / Like buttons.
2. **They decide too.** A like is a request. The partner looks at your profile when they're free ("Walter is looking at your profile…"), then says yes, or gently no. Your first match is always a yes, so nobody is left with no one to talk to.
3. **They live their own day.** Each partner has a daily schedule. If they're at the workshop or asleep, your message waits ("Walter is busy until about 1:30 PM") and the late reply says why ("Sorry, I was elbow-deep in an old mantel clock…"). Reloading can't hurry them.
4. **They remember you.** Claude extracts events, people, feelings and plans from every conversation, including calls. Partners bring them up later ("How did the knee check-up go?"), and the **Us** page shows everything they remember. You can ask them to forget any item.
5. **They reach out first.** "Next day" moves your simulated clock forward. The partner writes first in the morning, or phones you: an incoming-call screen with a ringtone, Answer / Decline, and a voice message if you decline.
6. **Real voice calls.** ElevenLabs Conversational AI with a distinct voice per partner, the same persona prompt, memories and relationship stage, and large live captions.
7. **You grow closer.** Just met → Getting to know you → Close → Sweethearts, earned by chatting and calling. The partner's tone changes with the stage, and the chat celebrates each step.
8. **Back to real life.** Partners notice the real people in your life and, now and then, encourage you to call or message them. The Us page counts the real-world connections you mentioned this week. Kindred supports your relationships; it doesn't replace them.
9. **Honest and safe.** Every screen labels the partner as an AI, and they say so if asked. No money talk, no medical or legal advice, and crisis resources (911, 988) when needed.

Accessibility: 20px base font, Atkinson Hyperlegible, high contrast, large tap targets, keyboard support, single-column layout, and live call captions.

## Demo mode

Open the site with `?demo=1` (kept in a cookie; `?demo=0` turns it off). Partners stay on their own schedule, but on a demo-friendly clock so a short walkthrough happens on cue: likes are answered in a few seconds (first yes, then one gentle no), the first message after matching finds the partner busy for about 20 seconds, closeness counts faster so the relationship moves up a stage, and the first "Next day" is a phone call.

## Tech stack

- Next.js 16 (App Router, Cache Components) + Tailwind CSS v4, deployed on Vercel
- Supabase: Postgres + anonymous auth, row-level security on every table
- Anthropic Claude (`claude-opus-5-5`, low effort, server-side refusal fallback) for chat, memory extraction, schedules and outreach
- ElevenLabs Conversational AI (calls; agent LLM `claude-sonnet-5-5`, voice `eleven_v4_turbo`) and Text-to-Speech (`eleven_v4` voice messages)
- Vitest for unit and route tests

## Project structure

```
src/
  app/
    onboarding/        profile + who you'd like to meet
    discover/          swipe deck, pending likes, match / decline
    matches/           your matches and the open partner
    chat/              chat with busy notes, late replies, stage-ups, "Next day"
    call/              phone-style call, incoming calls, voice-message fallback
    us/                relationship stage, memories, real-life connections
    api/               chat, discover, matches, reach-out, voice route handlers
  lib/
    prompt.ts          one persona prompt shared by chat, outreach and calls
    availability.ts    when a partner can reply or answer a like
    likes.ts           partners answering likes
    closeness.ts       relationship stage from chats and calls
    memories.ts        extraction + relevance ranking
    schedule.ts        per-day partner schedule
    simtime.ts         per-user simulated clock ("next day")
    personas.ts        the 10 partners and their character bibles
    demo.ts            demo mode
supabase/migrations/   database schema (0001–0004)
tests/                 Vitest tests
```

## Setup

### 1. Supabase

1. Create a new Supabase project.
2. Apply `supabase/migrations/` in order (`0001` to `0004`) with `supabase db push`, or run them in the SQL editor.
3. **Authentication → Sign In / Providers → enable "Allow anonymous sign-ins".** Older adults don't need a password.

### 2. ElevenLabs

1. Create a Conversational AI agent. Its own prompt doesn't matter, because the app sends the persona at call time.
2. In the agent's **Security** tab, enable overrides for **System prompt**, **First message**, **Language** and **Voice**. If any of these is off, ElevenLabs rejects the session and the app falls back to a voice message.
3. Keep **Enable authentication** on. The app connects with server-issued signed URLs, so the agent doesn't need to be public. Set the agent's default language to English.
4. Copy the agent id and an API key. Partner voices are ElevenLabs premade voices; their ids are in `src/lib/personas.ts`.

### 3. Environment

```bash
cp .env.example .env.local   # .env.local is git-ignored
```

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`) | console.anthropic.com |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` | ElevenLabs dashboard |

### 4. Run and test

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # Vitest
```

### 5. Deploy

Import the repo in Vercel and add the same environment variables in Project Settings → Environment Variables.

## Safety notes

- Every screen shows that the partner is an AI. If asked, the partner says honestly that it is one.
- The persona prompt avoids medical, legal and financial advice. It points users to emergency services or the 988 Suicide & Crisis Lifeline when needed, and it encourages real-world connection.
- Memories are stored per user under row-level security, and users can delete them from the "Us" page.
