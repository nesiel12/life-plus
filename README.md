# Life Plus

Life Plus is a personal, Hebrew-language (RTL) "Proactive AI Life Operating System" — a deterministic, explainable intelligence layer over a person's goals, learning, family relationships, and daily schedule, not a chatbot wrapper. See [`docs/ATLAS_BIBLE.md`](docs/ATLAS_BIBLE.md) for the canonical source of truth, [`docs/ATLAS_ARCHITECTURE_VISION.md`](docs/ATLAS_ARCHITECTURE_VISION.md) for the full architecture, and [`docs/BACKLOG.md`](docs/BACKLOG.md) for what's actively being worked on.

> The product was renamed from **Atlas** to **Life Plus** (2026-09-01). Internal code identifiers (`useAtlasStore`, `buildAtlasContext`, `AtlasContext`) and the `docs/ATLAS_*.md` filenames still use the old name — see the note at the top of `docs/ATLAS_BIBLE.md`.

## Stack

- **Next.js App Router** + TypeScript, Tailwind CSS
- **Supabase Postgres** for persistence
- **NextAuth.js** (Google OAuth) for authentication
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`) for every AI-backed feature, wrapped behind `lib/ai/` — supports OpenAI and Gemini as chat providers, selected by whichever API key is configured
- **Vitest** for tests, GitHub Actions for CI

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment variables** — copy `.env.example` to `.env.local` and fill in:

   | Variable | Purpose |
   |---|---|
   | `GEMINI_API_KEY` | Primary chat provider — get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Used whenever present; enables every AI-backed route (chat, goal breakdown, Torah extraction, Deep Onboarding, the AI Command Panel). |
   | `OPENAI_API_KEY` | Final fallback provider, and required for audio transcription (Torah Space uploads) regardless of which provider handles chat. Every AI-backed route degrades to an honest fallback (never a fabricated response) when no chat provider is configured at all. |
   | `BYTEZ_API_KEY` | Optional middle fallback tier between Gemini and OpenAI — get a key at [bytez.com](https://bytez.com). See `lib/ai/provider.ts`'s `getChatModelChain` for the exact ordering. |
   | `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32`. |
   | `NEXTAUTH_URL` | `http://localhost:3000` for local development. |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Needs the `calendar.events` scope for calendar suggestions/commands to work. |
   | `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase project. The service-role key is server-only, never exposed to the client. |
   | `SUPABASE_DB_URL` | Direct Postgres connection string, used only by `npm run db:migrate`. |
   | `FREE_AI_REQUESTS_PER_DAY` | Free AI allowance per user per day, in cost units (default `40`). A chat or structured call is 1 unit; a course module is 3, since it emits several times the output. |
   | `FREE_AI_TRANSCRIPTION_MINUTES_PER_DAY` | Separate daily allowance for audio transcription, in minutes (default `10`). Whisper is priced per minute, so one transcription can cost far more than a day of chat. |
   | `FREE_AI_REQUESTS_PER_MINUTE` | Burst guard (default `6`), so a whole day's allowance cannot be drained in one second. |

3. **Database migrations**

   ```bash
   npm run db:migrate
   ```

   Applies every file in `supabase/migrations/` that hasn't already run (tracked in a `_migrations` table). Safe to re-run.

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Other commands

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # Vitest
npm run build      # production build
```
