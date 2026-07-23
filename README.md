# Atlas

Atlas is a personal, Hebrew-language (RTL) "Proactive AI Life Operating System" — a deterministic, explainable intelligence layer over a person's goals, learning, family relationships, and daily schedule, not a chatbot wrapper. See [`docs/ATLAS_ARCHITECTURE_VISION.md`](docs/ATLAS_ARCHITECTURE_VISION.md) for the full architecture and product philosophy, and [`docs/BACKLOG.md`](docs/BACKLOG.md) for what's actively being worked on.

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
   | `OPENAI_API_KEY` | Enables every AI-backed route (chat, goal breakdown, Torah extraction, Deep Onboarding, the AI Command Panel) via OpenAI, and is required for audio transcription (Torah Space uploads) regardless of which provider handles chat. |
   | `GEMINI_API_KEY` | Alternative chat provider — get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). If both `OPENAI_API_KEY` and `GEMINI_API_KEY` are set, OpenAI is used. Every AI-backed route degrades to an honest fallback (never a fabricated response) when neither is set. |
   | `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32`. |
   | `NEXTAUTH_URL` | `http://localhost:3000` for local development. |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Needs the `calendar.events` scope for calendar suggestions/commands to work. |
   | `ALLOWED_SIGNIN_EMAILS` | Comma-separated allow-list. Empty/unset means nobody can sign in (fail-closed) — Atlas is currently single-tenant by design. |
   | `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase project. The service-role key is server-only, never exposed to the client. |
   | `SUPABASE_DB_URL` | Direct Postgres connection string, used only by `npm run db:migrate`. |

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
