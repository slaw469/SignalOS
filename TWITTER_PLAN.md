# SignalOS Phase 2: Twitter/X Automation

## Context

SignalOS is a personal AI command center with a 3-panel dashboard (Agenda, Todos, Chat) powered by Gemini 2.0 Flash with tool use. Phase 1 is complete. Phase 2 adds Twitter/X automation so the user can draft, schedule, and post tweets (including threads and media) directly from the dashboard, with full AI integration.

**Constraints:** Twitter/X Free tier API only (posting, no read/analytics). Rate limits: 1,500 tweets/month, 50 requests per 24h on some endpoints. OAuth 2.0 with PKCE for user authentication.

---

## Chunk 1: Database Schema + Types

### New Supabase Tables

```sql
-- Tweet drafts and scheduled/posted tweets
CREATE TABLE tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  thread_id UUID,              -- NULL for single tweets, shared UUID for thread tweets
  thread_order INT DEFAULT 0,  -- 0 for single, 1/2/3... for thread position
  media_urls TEXT[] DEFAULT '{}',
  status TEXT CHECK (status IN ('draft', 'scheduled', 'posting', 'posted', 'failed')) DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  twitter_id TEXT,             -- Twitter's tweet ID after posting
  error TEXT,
  recurring_rule TEXT,         -- NULL or cron-like rule: 'weekly:sun:10:00', 'daily:18:00'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Twitter rate limit tracking
CREATE TABLE twitter_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,          -- '2026-02' format
  tweets_posted INT DEFAULT 0,
  last_posted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Twitter OAuth tokens stored in existing `settings` table (keys: `twitter_access_token`, `twitter_refresh_token`).

### New Types in `lib/types.ts`

```typescript
type TweetStatus = "draft" | "scheduled" | "posting" | "posted" | "failed";

interface Tweet {
  id: string;
  content: string;
  thread_id: string | null;
  thread_order: number;
  media_urls: string[];
  status: TweetStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  twitter_id: string | null;
  error: string | null;
  recurring_rule: string | null;
  created_at: string;
  updated_at: string;
}
```

### Files to modify
- `lib/types.ts` -- add Tweet, TweetStatus types

### Verification
- Run SQL in Supabase dashboard, confirm tables created
- Types compile with no errors

---

## Chunk 2: Twitter API Client

### New file: `lib/twitter.ts`

OAuth 2.0 with PKCE flow (similar pattern to `lib/google-calendar.ts`):

- `getTwitterAuthUrl()` -- generate OAuth2 authorization URL with PKCE
- `getTwitterTokens(code, codeVerifier)` -- exchange auth code for access/refresh tokens
- `refreshTwitterToken(refreshToken)` -- refresh expired access token
- `getTwitterClient(accessToken)` -- return authenticated `twitter-api-v2` client
- `postTweet(accessToken, content, mediaIds?)` -- post a single tweet
- `postThread(accessToken, tweets[])` -- post a thread (chain of replies)
- `deleteTweet(accessToken, tweetId)` -- delete a posted tweet
- `uploadMedia(accessToken, imageBuffer, mimeType)` -- upload media, return media ID

### New API routes for OAuth flow
- `app/api/twitter/auth/route.ts` -- GET with `action=url` returns auth URL, `action=status` returns connected status
- `app/auth/twitter/callback/route.ts` -- OAuth callback, exchanges code for tokens, stores in settings table

### Dependencies
- `npm install twitter-api-v2`

### Files to create
- `lib/twitter.ts`
- `app/api/twitter/auth/route.ts`
- `app/auth/twitter/callback/route.ts`

### Verification
- Hit `/api/twitter/auth?action=url`, get a valid Twitter OAuth URL
- Complete OAuth flow, tokens stored in `settings` table
- `action=status` returns `{ connected: true }`

---

## Chunk 3: Tweet CRUD API Routes

### New routes (following `app/api/todos/` pattern)

**`app/api/tweets/route.ts`**
- `GET` -- list tweets with filters (status, thread_id). Query params: `?status=draft&status=scheduled`
- `POST` -- create a new tweet/draft. Body: `{ content, scheduled_at?, media_urls?, thread_id?, thread_order? }`

**`app/api/tweets/[id]/route.ts`**
- `PATCH` -- update tweet (edit content, reschedule, change status)
- `DELETE` -- delete tweet (if not yet posted; if posted, also delete from Twitter)

**`app/api/tweets/post/route.ts`**
- `POST` -- immediately post a tweet or thread by ID. Body: `{ tweet_id }` or `{ thread_id }`
- Handles: single tweet posting, thread posting (ordered), media attachment
- Updates status to 'posted' with twitter_id, or 'failed' with error
- Increments rate limit counter

### Files to create
- `app/api/tweets/route.ts`
- `app/api/tweets/[id]/route.ts`
- `app/api/tweets/post/route.ts`

### Verification
- POST a draft tweet via API, confirm in Supabase
- PATCH to update content
- POST to `/api/tweets/post` to publish it to Twitter
- DELETE a draft

---

## Chunk 4: Gemini Tool Definitions + Handlers

### New tools in `lib/claude.ts`

```
draft_tweet
  - content: string (required) -- tweet text (max 280 chars)
  - thread: boolean (optional) -- if true, creates first tweet of a thread
  - schedule_at: string (optional) -- ISO 8601 datetime to schedule

add_thread_tweet
  - thread_id: string (required) -- thread UUID to append to
  - content: string (required) -- tweet text

schedule_tweet
  - tweet_id: string (required) -- existing draft tweet ID
  - scheduled_at: string (required) -- ISO 8601 datetime

post_tweet_now
  - tweet_id: string (required) -- post immediately

get_tweet_queue
  - status: string (optional) -- filter by status (draft/scheduled/posted)

delete_tweet
  - tweet_id: string (required)

suggest_tweet_ideas
  - topic: string (optional) -- topic to generate ideas about
  - count: number (optional, default 3) -- number of suggestions
```

### New handlers in `lib/tools.ts`

Add handler functions for each tool, following existing pattern:
- `draftTweet()` -- insert into tweets table with status 'draft' or 'scheduled'
- `addThreadTweet()` -- insert with matching thread_id and incremented thread_order
- `scheduleTweet()` -- update existing draft with scheduled_at and status 'scheduled'
- `postTweetNow()` -- call Twitter API to post, update status
- `getTweetQueue()` -- query tweets table with filters
- `deleteTweet()` -- delete from DB (and Twitter if posted)
- `suggestTweetIdeas()` -- generate ideas via Gemini (sub-call)

Add cases to the `executeTool()` switch statement.

### Update system prompt in `lib/claude.ts`

Add to `buildSystemPrompt()`:
- Current tweet queue (drafts + scheduled) injected into system prompt
- Instructions for tweet drafting: "Keep tweets under 280 characters. Auto-suggest relevant hashtags. Match Steven's voice: casual, technical, builder mindset."

### Files to modify
- `lib/claude.ts` -- add 7 tool declarations, update buildSystemPrompt()
- `lib/tools.ts` -- add 7 handler functions + switch cases
- `app/api/chat/route.ts` -- fetch tweet queue for system prompt context

### Verification
- Chat: "draft a tweet about React Server Components" -- creates draft in DB
- Chat: "schedule that tweet for tomorrow at 10am" -- updates to scheduled
- Chat: "post it now" -- posts to Twitter
- Chat: "start a thread about my startup journey" -- creates thread

---

## Chunk 5: Cron Job for Scheduled Tweets

### New cron endpoint: `app/api/cron/tweet-scheduler/route.ts`

Logic:
1. Auth check (Bearer token with CRON_SECRET)
2. Query tweets WHERE status = 'scheduled' AND scheduled_at <= NOW()
3. Group by thread_id (threads post together)
4. For each due tweet/thread:
   - Check rate limits (monthly count < 1,500)
   - Post via Twitter API
   - Update status to 'posted' or 'failed'
   - Increment rate limit counter
5. Handle recurring tweets: if recurring_rule is set, create next occurrence after posting

### Update `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/briefing", "schedule": "0 9 * * *" },
    { "path": "/api/cron/tweet-scheduler", "schedule": "*/5 * * * *" }
  ]
}
```

### Smart Scheduling Helper

Since we cannot read analytics on free tier, use general best-practice posting times:
- Weekdays: 9am, 12pm, 5pm (high engagement windows)
- Weekends: 10am, 2pm
- Store as a simple lookup in `lib/twitter.ts`: `getOptimalPostingTimes(date: Date): string[]`
- AI references these when user asks "when should I post?"

### Recurring Tweet Logic

Format: `weekly:sun:10:00` or `daily:18:00`
- After posting a recurring tweet, calculate next occurrence
- Insert new tweet row with same content, new scheduled_at, same recurring_rule

### Files to create
- `app/api/cron/tweet-scheduler/route.ts`

### Files to modify
- `vercel.json` -- add tweet-scheduler cron
- `lib/twitter.ts` -- add getOptimalPostingTimes()

### Verification
- Create a scheduled tweet with scheduled_at in the past
- Hit `/api/cron/tweet-scheduler` manually
- Confirm tweet posted to Twitter and status updated
- Test recurring: confirm next occurrence created

---

## Chunk 6: Briefing Integration

### Modify `lib/briefing.ts`

Update `generateBriefing()` to:
1. Fetch tweet queue (drafts + scheduled for today) alongside todos and calendar
2. Add tweet context to the briefing prompt
3. Add instruction: "Suggest 2-3 tweet ideas based on what Steven is working on today. Keep them casual and authentic."

The briefing output now includes a "Tweet ideas" section that appears in the BriefingBanner.

### Files to modify
- `lib/briefing.ts` -- add tweet context + suggestions to prompt

### Verification
- Trigger briefing regeneration
- Confirm briefing includes tweet suggestions
- Suggestions are relevant to today's calendar/todos

---

## Chunk 7: Twitter Drawer UI

### New component: `components/twitter-drawer.tsx`

**Collapsed state (default):**
- Slim bar with Twitter/X icon, summary text ("2 drafts, 1 scheduled for today"), and expand button
- Uses `.glass` class for consistent styling
- fadeUp animation with 0.5s delay (after panels, before stats)

**Expanded state:**
- Full panel with 3 tabs: **Queue** | **Compose** | **Posted**
- Glass panel with `panel-header` / `panel-body` structure
- Max height with internal scrolling

**Queue tab:**
- List of drafts and scheduled tweets, sorted by scheduled_at
- Each item shows: content preview (truncated), status badge, scheduled time, actions (edit/post/delete)
- Thread indicator for multi-tweet threads
- "Post Now" button for drafts
- Rate limit indicator: "42/1,500 tweets this month"

**Compose tab:**
- Text area with character counter (280 max, turns red near limit)
- Thread mode toggle: adds "+" button to chain multiple tweets
- Media attach button (image upload)
- Schedule picker: date/time input OR "Smart schedule" button (picks next optimal time)
- Recurring toggle: dropdown with options (Daily, Weekly + day picker)
- "Save Draft" and "Schedule" buttons
- AI assist button: "Let AI improve this" sends content to chat for refinement

**Posted tab (local tracking only for free tier):**
- List of recently posted tweets with posted_at timestamp
- Delete button (removes from Twitter + DB)
- Simple stats: total posted this month, streak count

### Integration in `app/page.tsx`

Add between panels-grid and StatsBar:
```tsx
<TwitterDrawer key={`twitter-${refreshKey}`} />
```

The `refreshKey` mechanism already exists and will re-fetch tweet data when AI tools modify tweets.

### Files to create
- `components/twitter-drawer.tsx`

### Files to modify
- `app/page.tsx` -- add TwitterDrawer component
- `app/globals.css` -- add drawer-specific styles (expand/collapse transition, tab styles)

### Verification
- Drawer renders collapsed with correct summary
- Expands smoothly on click
- Can compose and save a draft from Compose tab
- Queue shows drafts/scheduled with correct actions
- Post Now works from Queue tab
- Thread compose works (add multiple tweets)
- Character counter accurate
- Media upload attaches image
- Schedule picker sets correct time

---

## Chunk 8: Media Upload Support

### New API route: `app/api/tweets/media/route.ts`

- `POST` -- accepts multipart form data with image file
- Uploads to Twitter via media upload endpoint
- Returns media_id to attach to tweet
- Stores media URL in tweet's media_urls array
- Supported formats: JPEG, PNG, GIF, WEBP (per Twitter API)
- Max size: 5MB for images, 15MB for GIFs

### Alternative: Supabase Storage

If Twitter media upload is complex on free tier:
- Upload image to Supabase Storage bucket
- Store public URL in media_urls
- On tweet post, download from Supabase and upload to Twitter

### Files to create
- `app/api/tweets/media/route.ts`

### Verification
- Upload an image via the compose UI
- Image preview shows in composer
- Tweet posts with image attached

---

## Build Order

1. **Chunk 1** (Schema + Types) -- foundation, no dependencies
2. **Chunk 2** (Twitter API Client + OAuth) -- needs schema
3. **Chunk 3** (CRUD Routes) -- needs client + schema
4. **Chunk 4** (Gemini Tools) -- needs CRUD routes
5. **Chunk 5** (Cron Scheduler) -- needs client + routes
6. **Chunk 6** (Briefing) -- needs schema (light touch)
7. **Chunk 7** (Drawer UI) -- needs CRUD routes
8. **Chunk 8** (Media) -- needs client + UI

Chunks 5, 6, 7 can be parallelized after Chunk 4.

---

## Environment Variables Needed

```
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_REDIRECT_URI=http://localhost:8008/auth/twitter/callback
```

---

## End-to-End Verification

1. Connect Twitter account via OAuth from the drawer
2. Chat: "Draft a tweet about building SignalOS" -- draft appears in drawer queue
3. Open Compose tab, write a thread (3 tweets), attach an image, schedule for tomorrow 10am
4. Hit cron endpoint manually -- confirms scheduled tweet logic works
5. Post a draft immediately from the Queue tab -- appears on Twitter
6. Morning briefing includes tweet suggestions
7. Rate limit counter increments correctly
8. Recurring tweet creates next occurrence after posting
