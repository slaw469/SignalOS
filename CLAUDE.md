# SignalOS

## Project Overview
Personal AI command center. Next.js 16.1.6 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui, Supabase, Google Gemini 2.0 Flash with tool use.

## Tech Stack
- Framework: Next.js 16.1.6 + React 19.2.3
- Styling: Tailwind CSS 4 + shadcn/ui + glass morphism
- Database: Supabase (PostgreSQL)
- AI: Google Gemini 2.0 Flash (not Claude) via @google/generative-ai
- Calendar: Google Calendar API (OAuth2)
- Twitter: twitter-api-v2 (OAuth2, Free tier)
- Dev server: npm run dev (port 8008, --webpack flag, NOT Turbopack)

## Conventions
- API routes: app/api/[resource]/route.ts (GET/POST), app/api/[resource]/[id]/route.ts (PATCH/DELETE)
- Tool definitions: lib/claude.ts (Gemini FunctionDeclarationsTool with SchemaType)
- Tool handlers: lib/tools.ts (executeTool switch router, ToolResult interface)
- External API clients: lib/[service].ts (e.g., google-calendar.ts, twitter.ts)
- Components: components/[name].tsx ("use client", glass class, panel-header/panel-body)
- Types: lib/types.ts (all shared interfaces)
- Supabase: lib/supabase.ts (service role key client)
- Animations: fadeUp with staggered delays (0.25s, 0.4s, 0.55s)
- CSS vars: --ink, --ink-muted, --glass-bg, --so-radius, --ease-out

## Known Gotchas
- Turbopack is DISABLED. Use --webpack flag. root: __dirname + Turbopack causes 200%+ CPU.
- Dev server runs on port 8008, not 3000
- Gemini tool loop max 5 iterations in chat/route.ts
- Google Calendar tokens stored in settings table (key: google_access_token)
- Rate limiting is in-memory (lib/rate-limit.ts), resets on server restart

## Bug Log
<!-- Document every bug encountered and how it was fixed -->

## Learnings
<!-- Document patterns, gotchas, and useful discoveries -->
