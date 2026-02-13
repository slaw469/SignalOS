# SignalOS Content Automation — Research & Implementation Guide

## Overview

SignalOS Phase 3: Multi-platform social media automation. Post to X/Twitter, Bluesky, LinkedIn, Mastodon, Threads, and more from a single AI-powered dashboard.

**Architecture:** SignalOS → Postiz (self-hosted on Railway) → Social platforms
**Direct integration:** Bluesky via `@atproto/api` (no Postiz needed)
**AI:** Gemini 2.0 Flash `format_content_for_platforms` tool auto-adapts content per platform

---

## Platform Comparison

### Posting Capabilities

| Platform | Free API? | Approval Needed? | Auth | Character Limit | Best For |
|----------|-----------|------------------|------|-----------------|----------|
| **X/Twitter** | Yes (1,500/mo) | No | OAuth 2.0 | 280 chars | Short-form, hot takes, threads |
| **Bluesky** | Yes (unlimited) | No | App Password | 300 graphemes | Genuine conversation, tech community |
| **LinkedIn** | Yes (after review) | Yes (weeks) | OAuth 2.0 | 3,000 chars | Professional, career insights |
| **Mastodon** | Yes (free) | No | OAuth 2.0/Token | 500 chars | Open-source/tech, accessibility-focused |
| **Threads** | Yes (after review) | Yes (Meta review) | OAuth 2.0 | 500 chars | Casual, Instagram-adjacent |
| **Dev.to** | Yes (free) | No | API key | 100,000 chars | Technical articles |
| **Hashnode** | Yes (free) | No | API key (GraphQL) | 10,000 chars | Technical articles |
| **Reddit** | Yes (pre-approval) | Yes (mandatory) | OAuth 2.0 | 10,000 chars | NOT recommended for cross-posting |
| **Medium** | Frozen | N/A | N/A | N/A | Skip (no new integrations) |

### Recommended Integration Priority
1. **Bluesky** — Free, no approval, TypeScript SDK, direct integration built
2. **Mastodon** — Equally simple, fediverse reach
3. **Dev.to + Hashnode** — Trivial for technical content
4. **Threads** — Worth it but Meta review delay
5. **LinkedIn** — High value but burdensome approval process

---

## X/Twitter API (Free Tier)

### Current Status
- **1,500 tweets/month** at app level (plenty for 3-5 tweets/day = ~155/month)
- Write-only: can post, delete, upload media. Cannot read, search, or get analytics
- OAuth 2.0 with PKCE for user auth
- Media upload available (50K/day limit)
- Thread posting works via `reply.in_reply_to_tweet_id`

### New: Pay-Per-Use Model (Feb 2026)
- Consumption-based billing alongside existing tiers
- Free tier users get $10 voucher if migrating
- Useful if you ever need read access without jumping to $200/mo Basic

### Rate Limits
| Endpoint | Limit |
|----------|-------|
| POST /2/tweets | 1,500/month (app), per-15-min window |
| POST /2/media/upload | 50,000/24hrs |
| DELETE /2/tweets/:id | Per-15-min window |

### Code Fixes Applied
1. Media upload migrated from deprecated v1.1 to v2
2. `media.write` scope added to OAuth
3. `v2.me()` read health check removed (fails on Free tier)
4. Rate limit safety margin: capped at 1,400 of 1,500

### Analytics Workaround
Free tier has no read access. Cheapest analytics:
- **X Premium ($8/mo)** — full analytics dashboard (vs $200/mo Basic API)
- **Followerwonk** — free follower demographics
- **Foller.me** — free instant profile analysis

---

## Bluesky (AT Protocol)

### Why Bluesky First
- Completely free, no rate limit anxiety
- No approval process
- Official TypeScript SDK (`@atproto/api`)
- Open protocol (decentralized)
- Growing tech community

### Authentication
- **App Passwords** (not OAuth) — perfect for single-user server-side apps
- Generate in Bluesky Settings > App Passwords
- Session tokens: access (~2min), refresh (~90 days)
- SDK auto-refreshes via `persistSession` callback
- CRITICAL: `createSession` rate-limited to 30/5min, 300/day — must reuse sessions

### Key Differences from Twitter
| Feature | Twitter | Bluesky |
|---------|---------|---------|
| Char limit | 280 characters | 300 **graphemes** (not chars) |
| Link previews | Auto-generated | Must build manually (fetch OG metadata) |
| Rich text | Plain text | **Facets** (byte-indexed annotations) |
| Media | Upload + attach | Blob upload first, reference by CID |
| Webhooks | None (Free) | None (use notification polling) |
| Session TTL | ~2hr access | ~2min access, ~90 day refresh |

### Facets System (Rich Text)
Bluesky uses "facets" — not markdown or HTML. The `RichText` class handles this:
```typescript
import { RichText } from '@atproto/api'
const rt = new RichText({ text: 'Hello @alice.bsky.social! #dev' })
await rt.detectFacets(agent) // resolves mentions to DIDs, detects URLs + hashtags
```
Three facet types: `#mention` (DID), `#link` (URI), `#tag` (hashtag without #)

### Rate Limits
| Operation | Budget |
|-----------|--------|
| Post creation | ~1,666/hour (5,000 pts/hr at 3pts each) |
| API requests | 3,000/5min (by IP) |
| createSession | 30/5min, 300/day |
| Blob upload | 50MB max, 1MB per image |
| Videos/day | 25 videos, 10GB |

### Implementation
- `lib/bluesky.ts` — full client with session management, posting, threads, media, validation
- `app/api/bluesky/auth/route.ts` — connection status and login
- `app/api/bluesky/route.ts` — post creation endpoint

### Env Vars Required
```
BLUESKY_IDENTIFIER=your-handle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

---

## Postiz (Self-Hosted Social Media Manager)

### What Is It
Open-source social media scheduling platform. Self-hosted on Railway, exposes a REST API that SignalOS calls to post to 30+ platforms through a single interface.

### Why Postiz
- Free to self-host (vs $19-49/mo for Late, Typefully, etc.)
- 32 supported platforms
- REST API + official Node SDK
- Same tech DNA (NestJS + PostgreSQL)
- Handles OAuth complexity for LinkedIn, Threads, etc.

### Railway Deployment
- **One-click template:** [railway.com/deploy/postiz](https://railway.com/deploy/postiz)
- **3 services:** Postiz app + PostgreSQL + Redis (no Temporal)
- **Estimated cost:** $5-10/month on Hobby plan
- **Port:** Must set public port to 5000 (not 3000)

### API Overview
Base URL: `https://your-postiz.railway.app/public/v1`
Auth: Raw API key in `Authorization` header (no Bearer prefix)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/integrations` | GET | List connected social channels |
| `/posts` | POST | Create/schedule posts (multi-platform in one call) |
| `/posts` | GET | List posts by date range |
| `/posts/{id}` | DELETE | Delete a post |
| `/upload` | POST | Upload media (multipart) |
| `/find-slot/{id}` | GET | Find next available posting time |

Rate limit: **30 requests/hour** for post creation (batch multi-platform into one request)

### Post Creation Structure
```json
{
  "type": "schedule",
  "date": "2026-02-15T10:00:00.000Z",
  "posts": [
    {
      "integration": { "id": "twitter-uuid" },
      "value": [{ "content": "Tweet text", "image": [] }],
      "settings": { "__type": "x", "who_can_reply_post": "everyone" }
    },
    {
      "integration": { "id": "bluesky-uuid" },
      "value": [{ "content": "Bluesky text", "image": [] }],
      "settings": { "__type": "bluesky" }
    }
  ]
}
```

### Platform Auth in Postiz
| Auth Type | Platforms |
|-----------|-----------|
| OAuth 2.0 (env vars) | X, LinkedIn, Facebook, Instagram, Threads, TikTok, YouTube, Reddit, Discord, Slack |
| Direct credentials (UI) | Bluesky, Mastodon, Lemmy, Medium, Dev.to, Hashnode, WordPress, Nostr |
| Bot token | Telegram |
| OAuth 1.0a | X (for media upload) |

### Env Vars for Postiz Service
```
X_API_KEY=your-twitter-api-key
X_API_SECRET=your-twitter-api-secret
# Add more as you connect platforms:
# LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
# THREADS_APP_ID, THREADS_APP_SECRET
# MASTODON_URL, MASTODON_CLIENT_ID, MASTODON_CLIENT_SECRET
```

### Env Vars for SignalOS
```
POSTIZ_API_URL=https://your-postiz.railway.app/public/v1
POSTIZ_API_KEY=your-api-key-from-postiz-settings
POSTING_BACKEND=postiz
```

### Implementation
- `lib/postiz.ts` — lightweight REST client (no SDK dependency)
- `lib/tools.ts` — `POSTING_BACKEND` feature flag routes to Postiz or direct twitter-api-v2
- Supabase `tweets` table extended with `postiz_post_id`, `postiz_state`, `platform` columns

---

## Content Formatting (AI-Powered)

### Gemini Tool: `format_content_for_platforms`
Takes raw content and generates platform-optimized versions. Rules are encoded in `buildSystemPrompt()`.

### Platform-Specific Rules

#### X (Twitter) — 280 chars
- Casual, punchy, opinionated
- 1-3 hashtags inline (not at end)
- Include compelling text with links
- CAPS sparingly for emphasis
- For long content: suggest thread (4-8 tweets)

#### LinkedIn — 3,000 chars
- Professional, narrative, story-driven
- First ~210 chars above the fold — strong hook required
- Exactly 3 hashtags at bottom
- AVOID links in post body (25-40% reach penalty) → "Link in comments"
- Line breaks every 1-2 sentences

#### Bluesky — 300 graphemes
- Genuine, conversational, anti-hustle
- 1-3 niche hashtags
- Link cards (URL length doesn't affect char count)
- Threads: 3-5 posts, discussion-oriented

#### Mastodon — 500 chars
- Thoughtful, inclusive, accessibility-conscious
- 2-5 CamelCase hashtags (critical for discovery, no algorithm)
- ALWAYS include alt text for images
- Content Warnings for sensitive/long threads

#### Threads — 500 chars
- Casual, friendly, Instagram-adjacent
- 0-1 hashtags (algorithm-driven)
- Text-first content performs better

### General Cross-Posting Rules
- NEVER copy same text to all platforms
- Adapt length: X (280) → Bluesky (300) → Mastodon/Threads (500) → LinkedIn (3,000)
- Adapt tone: casual → professional escalation
- Best posting times: Tue-Thu 9AM-12PM (X/LinkedIn), broader for Threads

---

## Content Automation Tools (Comparison)

### Unified APIs (Post to multiple platforms via one API)

| Tool | Free Tier | Paid | Platforms | API |
|------|-----------|------|-----------|-----|
| **Late** | 10 posts/mo | $19-99/mo | 13+ | REST |
| **Ayrshare** | Limited | $10.99/mo+ | 15+ | REST + SDKs |
| **Publer** | 10 scheduled | $12-21/mo | 11+ | REST (higher tiers) |
| **Typefully** | 15 posts/mo | $8-39/mo | 5 (text platforms) | REST v2, MCP server |
| **Postiz** | Unlimited (self-host) | Free | 32+ | REST |

### Scheduling Tools

| Tool | Free Tier | API Access | Notes |
|------|-----------|------------|-------|
| Buffer | 10 posts/channel | Enterprise only | No API on free |
| Hootsuite | None | Free (approval) | $99/mo platform |
| Hypefury | Trial | None | X-focused, no API |

### Open-Source

| Tool | Stack | Platforms | Cost |
|------|-------|-----------|------|
| **Postiz** | NestJS + Next.js + PostgreSQL | 32+ | Free (self-host) |
| **Mixpost** | Laravel/PHP | 10+ | Free (Lite), $299 one-time (Pro) |
| **n8n** | Self-hosted workflow automation | Via nodes | Free (self-host) |

### Automation Platforms

| Platform | Free Tier | Best For |
|----------|-----------|----------|
| **n8n** (self-hosted) | Unlimited | Complex workflows, 453+ social media templates |
| **Make** | 1,000 ops/mo | Better free tier than Zapier |
| **Zapier** | 100 tasks/mo | Simple 2-step automations |

---

## Setup Checklist

### Phase 1: Bluesky Direct (Free, No Dependencies)
- [ ] Generate Bluesky App Password (Settings > App Passwords)
- [ ] Add `BLUESKY_IDENTIFIER` and `BLUESKY_APP_PASSWORD` to Vercel env vars
- [ ] Test connection via `/api/bluesky/auth?action=connect`
- [ ] Test posting via Social Drawer compose tab

### Phase 2: Postiz on Railway
- [ ] Deploy Postiz via [railway.com/deploy/postiz](https://railway.com/deploy/postiz)
- [ ] Set Postiz public port to 5000
- [ ] Create account in Postiz UI
- [ ] Add `X_API_KEY` and `X_API_SECRET` as env vars on Postiz Railway service
- [ ] Connect X account in Postiz UI
- [ ] Connect Bluesky in Postiz UI (enter credentials directly)
- [ ] Generate API key in Postiz Settings
- [ ] Add `POSTIZ_API_URL`, `POSTIZ_API_KEY`, `POSTING_BACKEND=postiz` to Vercel env vars
- [ ] Run SQL migration to add columns to tweets table
- [ ] Test cross-platform posting

### Phase 3: Additional Platforms (Via Postiz)
- [ ] LinkedIn: Create LinkedIn app, add env vars to Postiz, go through app review
- [ ] Threads: Create Meta developer app, add env vars to Postiz
- [ ] Mastodon: Register app on your instance, add env vars to Postiz

### SQL Migration
```sql
ALTER TABLE tweets ADD COLUMN platform TEXT DEFAULT 'x';
ALTER TABLE tweets ADD COLUMN postiz_post_id TEXT;
ALTER TABLE tweets ADD COLUMN postiz_state TEXT;
ALTER TABLE tweets ADD COLUMN postiz_synced_at TIMESTAMPTZ;
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   SignalOS Dashboard                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │  Agenda   │  │  Todos   │  │  Signal (Chat)    │ │
│  │  Panel    │  │  Panel   │  │  Gemini 2.0 Flash │ │
│  └──────────┘  └──────────┘  └───────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Social Drawer (Multi-Platform)         │ │
│  │  [All] [X] [Bluesky]  │  Queue │ Compose │ Posted│
│  └─────────────────────────────────────────────────┘ │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
       ┌───────▼───────┐      ┌───────▼───────┐
       │  lib/postiz.ts │      │ lib/bluesky.ts│
       │  (REST client) │      │ (AT Protocol) │
       └───────┬───────┘      └───────┬───────┘
               │                      │
       ┌───────▼───────┐      ┌───────▼───────┐
       │    Postiz      │      │   Bluesky     │
       │  (Railway)     │      │   (bsky.social│
       │  ┌──────────┐  │      └───────────────┘
       │  │ X/Twitter │  │
       │  │ LinkedIn  │  │
       │  │ Threads   │  │
       │  │ Mastodon  │  │
       │  │ 28 more...│  │
       │  └──────────┘  │
       └────────────────┘
```

---

## Sources

### X/Twitter
- [X API Pricing 2026](https://getlate.dev/blog/twitter-api-pricing)
- [X API Rate Limits](https://docs.x.com/x-api/fundamentals/rate-limits)
- [X API Pay-Per-Use Launch](https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476)

### Bluesky
- [Bluesky API Get Started](https://docs.bsky.app/docs/get-started)
- [Creating a Post](https://docs.bsky.app/docs/tutorials/creating-a-post)
- [Rich Text Facets](https://docs.bsky.app/docs/advanced-guides/post-richtext)
- [Rate Limits](https://docs.bsky.app/docs/advanced-guides/rate-limits)
- [@atproto/api npm](https://www.npmjs.com/package/@atproto/api)

### Postiz
- [Postiz Documentation](https://docs.postiz.com)
- [Postiz Public API](https://docs.postiz.com/public-api/introduction)
- [Postiz GitHub](https://github.com/gitroomhq/postiz-app)
- [Railway Deploy Template](https://railway.com/deploy/postiz)

### Content Formatting
- [Buffer Character Limits](https://support.buffer.com/article/588-character-limits-for-each-social-network)
- [Social Media Image Sizes 2026](https://buffer.com/resources/social-media-image-sizes/)
- [LinkedIn Algorithm Link Handling](https://www.botdog.co/blog-posts/linkedin-algorithm-2025)
- [Best Times to Post 2026](https://sociallyin.com/resources/best-times-to-post-on-social-media/)
