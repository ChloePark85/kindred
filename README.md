# SeniorChat

An AI companion for adults 50+ who feel lonely. Pick one of three pre-made partners, chat in large, simple text, take a voice call, and see what your partner remembers about you. The partner is **always labeled as an AI**.

Live: https://seniorchat-global.vercel.app

## Origin

The concept comes from my earlier **Korean MVP** of an AI companion for older adults. This English version is a fresh build: **all code in this repository was written on 2026-11-09**, starting from an empty repo. No code was copied from the earlier project or any other project.

Built with [Claude Code](https://claude.com/claude-code) and [gstack](https://github.com/garrytan/gstack).

## Features

1. **Onboarding**: name, age range and a few interests, then choose one of 3 AI partners (Margaret, Walter, Rosa). Users can't create their own characters.
2. **Chat with memory**: after each exchange, Claude extracts memorable facts about the user (events, people, feelings, plans) into a `memories` table. The most relevant memories are injected into later replies, so the partner brings them up naturally.
3. **Daily schedule**: each partner gets a simple schedule, generated once per (simulated) day. If the partner is busy, a short note appears ("Rosa is at choir practice…") and the reply arrives after a delay.
4. **Partner reaches out first**: a "Next day" button moves the simulated clock forward one day. The partner then writes first, based on its schedule and the user's memories (e.g. "How did the doctor's appointment go?").
5. **Voice call**: real-time call through ElevenLabs Conversational AI, using the same persona prompt and memories. If the call can't connect, the partner leaves a short **voice message** (ElevenLabs TTS) instead. Call transcripts are saved and mined for memories too.
6. **"Us" page**: a timeline of everything the partner remembers. Users can filter it and ask the partner to forget an item.
7. **Back to real life**: memory extraction tags the real people in the user's life (family, friends, neighbors). Now and then (at most once every three outreach messages), the partner's first message of the day gently suggests contacting one of them, and refers to what the user said about that person. The "Us" page shows how many real-world connections the user mentioned this week. The app supports the user's relationships; it doesn't replace them.

Accessibility: 20px base font, Atkinson Hyperlegible typeface, high contrast, 56px+ tap targets, a single-column layout, and live captions during calls.

## Tech stack

- Next.js 16 (App Router) + Tailwind CSS v4, deployed on Vercel
- Supabase: Postgres + anonymous auth, row-level security on every table
- Anthropic Claude (`claude-opus-5-5`, low effort, server-side refusal fallback) for chat, memory extraction, schedules and outreach
- ElevenLabs Conversational AI (calls) and Text-to-Speech (fallback voice messages)

## Project structure

```
src/
  app/
    onboarding/        Step 1: profile + partner choice
    chat/              Steps 2-4: chat UI (busy notes, "next day" outreach)
    call/              Step 5: voice call + TTS fallback
    us/                Step 6: memory timeline
    api/               chat, reach-out, voice route handlers
  lib/
    prompt.ts          single persona prompt shared by chat, outreach and calls
    memories.ts        extraction + relevance ranking
    schedule.ts        per-day partner schedule
    simtime.ts         per-user simulated clock ("next day")
    personas.ts        the 3 fixed partners
    claude.ts          Anthropic SDK helpers
supabase/migrations/   database schema
```

## Setup

### 1. Supabase

1. Create a new Supabase project.
2. Run the files in `supabase/migrations/` in order (`0001_init.sql`, then `0002_real_life.sql`) in the SQL editor, or use `supabase db push`.
3. **Authentication → Sign In / Providers → enable "Allow anonymous sign-ins".** Seniors don't need a password.

### 2. ElevenLabs

1. Create a Conversational AI agent. Its own prompt doesn't matter, because the app sends the persona at call time.
2. In the agent's **Security** tab, enable overrides for **System prompt**, **First message**, **Language** and **Voice**. If any of these is off, ElevenLabs rejects the session and the app falls back to a voice message.
3. Keep **Enable authentication** on. The app connects with server-issued signed URLs, so the agent doesn't need to be public. Set the agent's default language to English.
4. Copy the agent id and an API key. The three partner voices are ElevenLabs premade voices; their ids are in `src/lib/personas.ts`.

### 3. Environment

```bash
cp .env.example .env.local   # .env.local is git-ignored
```

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`) | console.anthropic.com |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` | ElevenLabs dashboard |

### 4. Run

```bash
npm install
npm run dev     # http://localhost:3000
```

### 5. Deploy

Import the repo in Vercel and add the same environment variables in Project Settings → Environment Variables.

## Safety notes

- Every screen shows that the partner is an AI. If asked, the partner says honestly that it is one.
- The persona prompt avoids medical, legal and financial advice. It points users to emergency services or the 988 Suicide & Crisis Lifeline when needed, and it encourages real-world connection.
- Memories are stored per user under row-level security, and users can delete them from the "Us" page.
