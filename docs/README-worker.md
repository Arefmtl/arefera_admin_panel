# Telegram Rich Markdown Bot — Cloudflare Worker (v2)

Standalone Cloudflare Worker implementing the **full Telegram bot** with a rich
feature set. This is the bot half of the project — the Next.js app in `src/`
is the web admin panel for human operators (they share the same bot token but
run independently).

## What's inside

### Core bot (unchanged from v1)
- 🌐 Bilingual (FA/EN) menu with language switcher
- 📨 Rich Markdown & HTML echo via Telegram `sendRichMessage` API
- ⚙️ Admin panel: admins CRUD, channels CRUD, post builder with inline
  buttons, multi-channel send, delivery report
- 📖 Markdown / HTML / Media guides + full live demo

### NEW in v2

| Feature | Commands | Description |
|---------|----------|-------------|
| 🤖 **AI Module** | `/ai <prompt>`, `/askai`, `/scheduleai`, `/scheduled`, `/aiconfig`, `/aimodel`, `/aisystem` | Generate content with any OpenAI-compatible API (OpenAI/Groq/Together/OpenRouter/custom). Preview → send to channel or schedule for later. Multi-turn chat mode with conversation memory. |
| 📥 **Media Downloader** | `/dl <url>` | Download from YouTube, Spotify, TikTok, Instagram, Twitter/X, SoundCloud, GitHub, and dozens more via the cobalt API. GitHub handled natively (raw/blob/releases). Files >45MB sent as links. |
| 📊 **Polls & Surveys** | `/poll Q \| o1 \| o2`, `/quiz Q \| o1 \| !o2`, `/pollstats` | Create non-anonymous polls and quizzes. Track votes via `PollAnswer` updates. View results with bar charts. |
| 📈 **Channel Analytics** | `/stats` | Member count per channel + scheduled-post delivery success rate + poll count. |
| 🌐 **Web App Menu** | `/webapp`, `/panel` | If `WEB_APP_URL` env is set, the bot sets a Telegram Menu Button that opens the Next.js admin panel as a Telegram Web App. Also shows a 🌐 button on the main keyboard. |
| ⚡ **Inline Queries** | `@bot <url>`, `@bot ai <prompt>`, `@bot help` | Inline results for quick download, AI generation, and command listing in any chat. |
| ⏰ **Scheduled AI Posts** | `/scheduleai` + cron | AI-generated content scheduled for future delivery. A `scheduled` event handler (cron every 5 min) sends due posts automatically. |

## File in this folder

| File | Purpose |
|------|---------|
| `worker.js` | The complete Cloudflare Worker (single file, ~4200 lines). |
| `wrangler.toml` | Wrangler deploy config + KV binding + cron trigger. |
| `README-worker.md` | This file. |

## Quick deploy (5 commands)

```bash
# 1. create the KV namespace
wrangler kv:namespace create BOT_DB
#   → copy the printed `id` into wrangler.toml (replace placeholder)

# 2. (optional) set your AI API key as a secret
wrangler secret put AI_API_KEY
#   → paste your key (e.g. sk-proj-xxx for OpenAI, gsk_xxx for Groq)

# 3. (optional) set your web panel URL for the Web App menu
wrangler secret put WEB_APP_URL
#   → paste your HTTPS panel URL (e.g. https://your-panel.pages.dev)

# 4. deploy the worker
wrangler deploy
#   → note the printed URL

# 5. point Telegram at the worker (sets the webhook automatically)
curl "https://telegram-rich-markdown-bot.<you>.workers.dev/setup-webhook"
```

Now open your bot in Telegram and send `/start`. 🎉

## Configuration reference

All values are optional — the worker works out-of-the-box with baked-in
defaults. Override via `wrangler secret put <NAME>` (recommended for secrets)
or `[vars]` in `wrangler.toml` (for non-sensitive values).

| Env var | Default | Purpose |
|---------|---------|---------|
| `BOT_TOKEN` | hardcoded in worker.js | Telegram bot token |
| `OWNER_ID` | `1278759197` | Numeric Telegram user ID of the owner |
| `WEBHOOK_SECRET` | `""` (disabled) | Optional webhook secret token |
| `WEB_APP_URL` | `""` (disabled) | HTTPS URL of the Next.js admin panel (enables Web App menu) |
| `AI_PROVIDER` | `openai` | `openai` · `groq` · `together` · `openrouter` · `custom` |
| `AI_API_KEY` | `""` | API key for the AI provider |
| `AI_BASE_URL` | by provider | Override for non-standard endpoints |
| `AI_MODEL` | by provider | Model name (e.g. `gpt-4o-mini`, `llama-3.3-70b-versatile`) |
| `AI_SYSTEM_PROMPT` | content-writer default | System prompt for content generation |
| `COBALT_API_URL` | `https://api.cobalt.tools` | Cobalt instance URL (self-host for reliability) |

**KV overrides env for AI config**: the `/aiconfig` command stores the config
in KV (`ai_config` key), which takes precedence over env vars. This lets the
admin change providers/keys without redeploying.

## HTTP helper endpoints (GET)

| Path | What it does |
|------|--------------|
| `/` | Health check with feature list |
| `/health` | JSON health check |
| `/info` | `getMe` + `getWebhookInfo` for the configured bot |
| `/setup-webhook` | Registers this worker's URL as the Telegram webhook |
| `/delete-webhook` | Removes the webhook (switch to polling for testing) |
| `/getUpdates` | One-shot `getUpdates` (local manual testing only) |
| `/run-scheduler` | Manually trigger the scheduled-posts runner (returns JSON) |

## Bot commands reference

### Core
| Command | Description |
|---------|-------------|
| `/start` | Show language selection (+ set Web App menu button if configured) |
| `/cancel` | Abort any in-progress flow |
| `/webapp` | Open the web admin panel (if `WEB_APP_URL` set) |

### AI (🤖)
| Command | Who | Description |
|---------|-----|-------------|
| `/ai <prompt>` | anyone | Generate content, preview, send-to-channel or schedule |
| `/askai` | anyone | Enter multi-turn AI chat mode (conversation memory, 10 turns) |
| `/scheduleai` | anyone | Generate → pick channels → pick time → cron auto-sends |
| `/scheduled` | anyone | List pending + recently sent scheduled posts |
| `/aiconfig <provider> <apiKey> [baseUrl]` | admin | Set AI provider + key |
| `/aiconfig show` | admin | Display current AI config (key masked) |
| `/aimodel <model>` | admin | Change the model name |
| `/aisystem <text>` | admin | Change the system prompt |

### Media Downloader (📥)
| Command | Description |
|---------|-------------|
| `/dl <url>` | Download media from YouTube/Spotify/TikTok/Instagram/Twitter/GitHub/... |

### Polls & Surveys (📊)
| Command | Description |
|---------|-------------|
| `/poll Q \| o1 \| o2 \| ...` | Create a non-anonymous poll (2-10 options) |
| `/quiz Q \| o1 \| !o2 \| o3` | Create a quiz (mark correct answer with `!`) |
| `/pollstats` | List all tracked polls with live vote counts + bar charts |

### Analytics (📈)
| Command | Description |
|---------|-------------|
| `/stats` | Channel analytics: members, scheduled post delivery rate, polls |

### Inline Queries (⚡)
Type `@botname` in any chat:
- `<url>` → "Download Media" article (sends `/dl <url>`)
- `ai <prompt>` → AI generates a response article
- `help` or empty → list all commands

## How scheduled AI posts work

1. User runs `/scheduleai` → sends a prompt
2. AI generates content → user previews it
3. User selects target channels (multi-select)
4. User sends a time: `2024-12-25 14:30` (UTC) or `in 2h` / `in 30m` / `in 1d`
5. The post is stored in KV (`scheduled_posts` key)
6. A cron trigger fires every 5 minutes → the `scheduled` event handler checks
   for due posts, sends them to their target channels via `sendRichMessage`,
   and marks them `sent: true` with delivery results
7. Users can view/cancel pending posts via `/scheduled`

## Storage layout (KV namespace `BOT_DB`)

| Key | Value |
|-----|-------|
| `admins` | JSON array of admin user IDs (always includes owner) |
| `channels` | JSON array of `{ id, title }` |
| `state:<userId>` | JSON per-user temp state (flows, AI chat) |
| `ai_config` | JSON `{ provider, apiKey, baseUrl, model, systemPrompt }` |
| `scheduled_posts` | JSON array of scheduled AI post records |
| `polls` | JSON array of `{ id, pollId, question, options, chatId, messageId, type, correctOptionId, createdAt }` |
| `poll_answers:<pollId>` | JSON array of `{ userId, optionIds, at }` |

## Limitations & notes

- **cobalt reliability**: the public cobalt instance may rate-limit or block
  worker IPs. For production, self-host cobalt and set `COBALT_API_URL`.
- **Spotify**: cobalt returns metadata/preview only — full audio requires
  Spotify Premium and is not supported.
- **File size**: Telegram Bot API limits uploads to 50MB. Files >45MB are sent
  as download links instead.
- **Cloudflare Workers limits**: 30s wall-clock per request on the free plan.
  AI calls and media downloads should finish well within that for typical use.
- **Cron granularity**: every 5 minutes. Scheduled posts may be up to 5 min
  late. For finer granularity, change `crons` in `wrangler.toml` (Cloudflare
  allows up to 1-minute intervals on the free plan).
- **AI inline queries**: have a ~30s timeout. If the AI is slow, the inline
  result may not appear — use `/ai` directly instead.

## Telegram-side setup (one time)

1. Create the bot with [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the bot token (or keep the default baked into `worker.js`)
3. **Enable inline mode**: [@BotFather](https://t.me/BotFather) →
   `/setinline` → select your bot → send a placeholder text (e.g. "Search...")
4. Deploy the worker (see Quick deploy above)
5. Add the bot to your channel(s) and **promote it to admin** with the
   *Post Messages* permission — otherwise channel sends will fail
6. In Telegram, open the bot and send `/start`, pick a language
7. **Admin**: use **⚙️ Admin Panel → 📡 Manage Channels → ➕ Add Channel**
   to register a channel by its numeric id (`-100…`) or `@username`
8. **Admin**: use `/aiconfig <provider> <key>` to enable AI
9. Start using: `/ai`, `/dl`, `/poll`, `/stats`, etc.
