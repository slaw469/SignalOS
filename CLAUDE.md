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

1. **media_ids tuple type in twitter-api-v2**: The package requires exact tuple types `[string] | [string, string] | ...` not generic `string[]`. Fixed with `slice(0, 4) as unknown as [string]` cast in lib/twitter.ts.

2. **CSRF state validation bypass in OAuth callback**: Original code `if (state && stateRow?.value && state !== stateRow.value)` could be bypassed by omitting the `state` query param. Fixed to `if (!state || !stateRow?.value || state !== stateRow.value)` to make validation mandatory.

3. **recurring_rule missing from PATCH allowedFields**: The PATCH endpoint for tweets filtered out `recurring_rule`, causing the UI's two-step create+set-recurring flow to silently fail. Added `"recurring_rule"` to the allowedFields array.

4. **No re-post guard on tweet publishing**: Already-posted or currently-posting tweets could be submitted again, causing duplicate posts on Twitter. Added status check returning 409 in both the API route and tool handler.

5. **Orphaned "posting" status tweets**: If the server crashes during a Twitter API call, tweets stuck in "posting" status are never retried or cleaned up. Added a cleanup step at the start of the cron job that resets tweets in "posting" for 5+ minutes to "failed".

6. **Tool handlers missing content validation**: `draftTweet` and `addThreadTweet` in lib/tools.ts wrote directly to Supabase without validating empty content or 280-char limit. Added validation to both.

## Learnings

1. **Next.js 16 build uses Turbopack by default** even for `next build`. Must use `--webpack` flag for both dev and build to avoid Turbopack issues.

2. **Twitter API media uploads require OAuth 1.0a** (V1 API), while the rest of the API uses OAuth 2.0. The `getTwitterClientV1()` function exists separately for this purpose.

3. **Supabase upsert with onConflict** is the pattern for storing settings/tokens. Key pattern: `{ key: "setting_name", value: "...", updated_at: new Date().toISOString() }` with `{ onConflict: "key" }`.

4. **Read-then-write race conditions** are present in `incrementRateLimit`. For a single-user app this is low risk, but for production use, consider Supabase RPC with SQL atomic increment.

5. **Thread posting in cron**: Threads should be posted atomically (all tweets or none). Currently only posts tweets that are individually past their `scheduled_at`. Best practice: ensure all tweets in a thread share the same `scheduled_at`.
