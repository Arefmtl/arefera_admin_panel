/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Telegram Rich Markdown Bot — Cloudflare Worker (v2 — Full Edition)
 *  Bot API 10.1 (Rich Message support) + AI + Media Downloader + Polls + Analytics
 * https://github.com/Arefmtl | https://github.com/DarknessShade  
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  WHAT THIS IS
 *  ────────────
 *  A standalone Cloudflare Worker that implements the full Telegram bot with
 *  a rich feature set:
 *
 *    CORE BOT
 *    • Bilingual (FA / EN) menu with language switcher
 *    • Rich Markdown & HTML echo (via Telegram's sendRichMessage API)
 *    • Admin panel: admins / channels CRUD, post builder with inline buttons,
 *      multi-channel target selection, send-result report
 *    • Markdown / HTML / Media guides + full live demo
 *
 *    AI MODULE (🤖)  —  content generation + scheduling
 *    • /ai <prompt>          → one-shot AI content generation, with preview
 *                              + buttons to send-to-channel or schedule
 *    • /askai                → enter multi-turn AI chat mode (context kept)
 *    • /scheduleai           → stateful: prompt → generate → pick channels →
 *                              pick time → cron fires it automatically
 *    • /scheduled            → list pending scheduled AI posts
 *    • /aiconfig <p> <key>   → set AI provider + API key (admin only)
 *    • /aimodel <model>      → set model name (admin only)
 *    • /aisystem <text>      → set system prompt (admin only)
 *    • Supports any OpenAI-compatible API (OpenAI / Groq / Together / OpenRouter
 *      / local LLMs). Config stored in KV, overrides env defaults.
 *
 *    MEDIA DOWNLOADER (📥)  —  YouTube / Spotify / GitHub / TikTok / Instagram / …
 *    • /dl <url>             → fetch media via cobalt API (or GitHub direct),
 *                              send as file (video / audio / photo / document)
 *    • Files >45 MB sent as direct download link (Telegram bot 50 MB limit)
 *    • GitHub raw / blob / release-asset URLs handled natively
 *    • Cobalt instance URL configurable via env COBALT_API_URL
 *
 *    POLLS & SURVEYS (📊)
 *    • /poll Q | o1 | o2 …   → create a regular poll in the current chat
 *    • /quiz Q | o1 | o2 | !o3 → create a quiz (o3 = correct answer)
 *    • /pollstats             → list all tracked polls with live vote counts
 *    • Poll answers tracked via PollAnswer updates in KV
 *
 *    CHANNEL ANALYTICS (📈)
 *    • /stats                 → member count per channel + scheduled-post
 *                                delivery success rate + poll participation
 *
 *    WEB APP MENU (🌐)
 *    • If WEB_APP_URL env is set, the bot sets a Telegram Menu Button (bottom
 *      left of chat) that opens the Next.js admin panel as a Telegram Web App.
 *    • /webapp command also sends an inline button to open the panel.
 *
 *    INLINE QUERIES (⚡)
 *    • @bot <url>             → returns a "Download" article (sends /dl)
 *    • @bot ai <prompt>       → returns AI-generated article (short response)
 *    • @bot help              → lists all commands
 *
 *    SCHEDULER (cron)
 *    • A `scheduled` event handler runs every 5 minutes (via wrangler.toml
 *      `[triggers] crons` set to every-5-minutes). It picks up due scheduled AI
 *      posts from KV, sends them to their target channels, and marks them sent.
 *
 *  CONFIGURATION
 *  ──────────────
 *  All values are read from the Worker environment (wrangler secrets / vars),
 *  with sensible defaults baked in so you can deploy & test immediately:
 *
 *      env.BOT_TOKEN        → Telegram bot token          (default: hardcoded)
 *      env.OWNER_ID         → numeric Telegram user id    (default: hardcoded)
 *      env.WEBHOOK_SECRET   → optional webhook secret     (default: "")
 *      env.WEB_APP_URL      → HTTPS URL of the web panel  (default: "")
 *      env.AI_PROVIDER      → "openai"|"groq"|"together"|"openrouter"|"custom"
 *      env.AI_API_KEY       → API key for the AI provider (default: "")
 *      env.AI_BASE_URL      → override base URL           (default: by provider)
 *      env.AI_MODEL         → model name                  (default: by provider)
 *      env.AI_SYSTEM_PROMPT → system prompt               (default: content-writer)
 *      env.COBALT_API_URL   → cobalt instance URL         (default: public instance)
 *      env.RAPIDAPI_KEY     → RapidAPI key (generic, all platforms)
 *      env.RAPIDAPI_YOUTUBE_KEY   → YouTube-specific key (overrides generic)
 *      env.RAPIDAPI_TIKTOK_KEY    → TikTok-specific key
 *      env.RAPIDAPI_IG_KEY        → Instagram-specific key
 *      env.RAPIDAPI_TWITTER_KEY   → Twitter/X-specific key
 *      env.RAPIDAPI_FB_KEY        → Facebook-specific key
 *      env.RAPIDAPI_REDDIT_KEY    → Reddit-specific key
 *      env.RAPIDAPI_PINTEREST_KEY → Pinterest-specific key
 *
 *  KV overrides env for AI config: /aiconfig /aimodel /aisystem store in KV
 *  and take precedence over env vars.
 *
 *  STORAGE
 *  ───────
 *  Requires a KV namespace bound as `BOT_DB`.
 *
 *  KV keys used:
 *    "admins"                  → JSON array of admin user IDs (always owner)
 *    "channels"                → JSON array of { id, title }
 *    "state:<userId>"          → JSON per-user temp state (flows, AI chat)
 *    "ai_config"               → JSON { provider, apiKey, baseUrl, model, systemPrompt }
 *    "scheduled_posts"         → JSON array of { id, userId, prompt, generatedText,
 *                                channelIds, sendAt, sent, sentAt, sendResults }
 *    "polls"                   → JSON array of { id, pollId, question, options,
 *                                chatId, messageId, createdAt }
 *    "poll_answers:<pollId>"   → JSON array of { userId, optionIds, at }
 *    "analytics_cache"         → JSON cached stats (optional, for /stats speed)
 *
 *  DEPLOY & TEST
 *  ─────────────
 *      npm i -g wrangler
 *      wrangler login
 *      wrangler kv:namespace create BOT_DB       # → paste id into wrangler.toml
 *      wrangler deploy
 *      curl "https://<your-worker>.workers.dev/setup-webhook"
 *      # open @yourbot in Telegram, send /start
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Default config (env overrides these) ────────────────────────────────────
const DEFAULT_BOT_TOKEN = "8996679568:AAFJVU2QwwPTSTAemCNT_soO6zsPSNRGC0I";
const DEFAULT_OWNER_ID  = 1278759197;

// AI provider defaults — baseUrl + model per provider. The /aiconfig command
// stores a full config object in KV (key "ai_config") which overrides these.
// ─── Timezone offset (Iran = UTC+3:30) ─────────────────────────────────────
const TIMEZONE_OFFSET_MS = 3.5 * 60 * 60 * 1000; // 3 hours 30 minutes in ms

// ─── In-memory KV cache ─────────────────────────────────────────────────────
// Reduces KV reads by caching frequently accessed data in memory.
// Cache is per-worker instance and resets on cold start.
const kvCache = new Map();
const KV_CACHE_TTL = 60 * 1000; // 60 seconds default

// ─── Keyboard cache ──────────────────────────────────────────────────────────
// Static keyboards are recreated every call. Cache them to reduce GC pressure.
const kbCache = new Map();
function cachedKeyboard(key, builder) {
  if (kbCache.has(key)) return kbCache.get(key);
  const kb = builder();
  kbCache.set(key, kb);
  return kb;
}

/**
 * Read from KV with in-memory caching.
 * @param {Object} env - Worker env with BOT_DB binding
 * @param {string} key - KV key
 * @param {string} type - "json" | "text" | "arrayBuffer" | "stream"
 * @param {number} ttl - Cache TTL in ms (default 60s)
 * @returns {Promise<any>}
 */
async function cachedGet(env, key, type = "json", ttl = KV_CACHE_TTL) {
  const cacheKey = `${key}:${type}`;
  const cached = kvCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) return cached.value;

  const value = await env.BOT_DB.get(key, type);
  kvCache.set(cacheKey, { value, ts: Date.now() });
  return value;
}

/**
 * Write to KV and invalidate cache for that key.
 */
async function cachedPut(env, key, value, type = "json") {
  const str = type === "json" ? JSON.stringify(value) : value;
  await env.BOT_DB.put(key, str);
  kvCache.delete(`${key}:json`);
  kvCache.delete(`${key}:text`);
}

/**
 * Delete from KV and invalidate cache.
 */
async function cachedDelete(env, key) {
  await env.BOT_DB.delete(key);
  kvCache.delete(`${key}:json`);
  kvCache.delete(`${key}:text`);
}

/**
 * Clear all cache (use after bulk operations).
 */
function clearCache() {
  kvCache.clear();
}

function parseLocalTime(text) {
  // Try relative: "in 2h", "in 30m", "in 1d"
  const relMatch = text.match(/^in\s+(\d+)\s*(m|min|minutes?|h|hr|hours?|d|days?)$/i);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const mult = unit.startsWith("m") ? 60000 : unit.startsWith("h") ? 3600000 : 86400000;
    return Date.now() + num * mult;
  }
  
  // Try ISO-like: "2026-06-26 00:30" or "2026-06-26T00:30"
  const m1 = text.match(/^(\d{4})-(\d{2})-(\d{2})[\s T]+(\d{2}):(\d{2})/);
  if (m1) {
    const localMs = new Date(`${m1[1]}-${m1[2]}-${m1[3]}T${m1[4]}:${m1[5]}:00`).getTime();
    return localMs - TIMEZONE_OFFSET_MS;
  }
  
  // Try "2026-Jun-26 00:30" format
  const monthNames = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const m2 = text.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (m2) {
    const monthNum = monthNames[m2[2].toLowerCase()];
    if (monthNum) {
      const localMs = new Date(`${m2[1]}-${monthNum}-${m2[3]}T${m2[4]}:${m2[5]}:00`).getTime();
      return localMs - TIMEZONE_OFFSET_MS;
    }
  }
  
  // Try "26 Jun 2026 00:30" format
  const m3 = text.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})/);
  if (m3) {
    const monthNum = monthNames[m3[2].toLowerCase()];
    if (monthNum) {
      const localMs = new Date(`${m3[3]}-${monthNum}-${m3[1]}T${m3[4]}:${m3[5]}:00`).getTime();
      return localMs - TIMEZONE_OFFSET_MS;
    }
  }
  
  return null;
}

const AI_PROVIDER_DEFAULTS = {
  openai:    { baseUrl: "https://api.openai.com/v1",          model: "gpt-4o-mini" },
  groq:      { baseUrl: "https://api.groq.com/openai/v1",     model: "llama-3.3-70b-versatile" },
  together:  { baseUrl: "https://api.together.xyz/v1",        model: "meta-llama/Llama-3-8b-chat-hf" },
  openrouter:{ baseUrl: "https://openrouter.ai/api/v1",       model: "openai/gpt-4o-mini" },
  custom:    { baseUrl: "",                                    model: "" },
};

const DEFAULT_AI_SYSTEM_PROMPT =
  "You are a professional content writer for Telegram channels. " +
  "Write engaging, well-structured posts using Markdown formatting " +
  "(bold, italic, lists, headings where appropriate). Keep posts concise " +
  "and impactful unless the user asks for longer content. " +
  "Write in the same language the user uses (Persian or English). " +
  "Do not wrap the response in code fences — output raw markdown.";

function getConfig(env) {
  const token = (env && env.BOT_TOKEN && String(env.BOT_TOKEN).trim()) || DEFAULT_BOT_TOKEN;
  const owner = Number(env && env.OWNER_ID) || DEFAULT_OWNER_ID;
  const secret = (env && env.WEBHOOK_SECRET && String(env.WEBHOOK_SECRET).trim()) || "";
  const webAppUrl = (env && env.WEB_APP_URL && String(env.WEB_APP_URL).trim()) || "";
  const cobaltUrl = (env && env.COBALT_API_URL && String(env.COBALT_API_URL).trim()) || "https://api.cobalt.tools";

  // RapidAPI config — generic key + optional per-platform overrides
  const rapidApiKey = (env && env.RAPIDAPI_KEY && String(env.RAPIDAPI_KEY).trim()) || "";
  const rapidApiYoutubeKey = (env && env.RAPIDAPI_YOUTUBE_KEY && String(env.RAPIDAPI_YOUTUBE_KEY).trim()) || "";
  const rapidApiTiktokKey = (env && env.RAPIDAPI_TIKTOK_KEY && String(env.RAPIDAPI_TIKTOK_KEY).trim()) || "";
  const rapidApiIgKey = (env && env.RAPIDAPI_IG_KEY && String(env.RAPIDAPI_IG_KEY).trim()) || "";
  const rapidApiTwitterKey = (env && env.RAPIDAPI_TWITTER_KEY && String(env.RAPIDAPI_TWITTER_KEY).trim()) || "";
  const rapidApiFbKey = (env && env.RAPIDAPI_FB_KEY && String(env.RAPIDAPI_FB_KEY).trim()) || "";
  const rapidApiRedditKey = (env && env.RAPIDAPI_REDDIT_KEY && String(env.RAPIDAPI_REDDIT_KEY).trim()) || "";
  const rapidApiPinterestKey = (env && env.RAPIDAPI_PINTEREST_KEY && String(env.RAPIDAPI_PINTEREST_KEY).trim()) || "";

  // RapidAPI hosts (optional overrides for self-hosted or alternative endpoints)
  const rapidApiYoutubeHost = (env && env.RAPIDAPI_YOUTUBE_HOST && String(env.RAPIDAPI_YOUTUBE_HOST).trim()) || "";
  const rapidApiTiktokHost = (env && env.RAPIDAPI_TIKTOK_HOST && String(env.RAPIDAPI_TIKTOK_HOST).trim()) || "";
  const rapidApiIgHost = (env && env.RAPIDAPI_IG_HOST && String(env.RAPIDAPI_IG_HOST).trim()) || "";
  const rapidApiTwitterHost = (env && env.RAPIDAPI_TWITTER_HOST && String(env.RAPIDAPI_TWITTER_HOST).trim()) || "";
  const rapidApiFbHost = (env && env.RAPIDAPI_FB_HOST && String(env.RAPIDAPI_FB_HOST).trim()) || "";
  const rapidApiRedditHost = (env && env.RAPIDAPI_REDDIT_HOST && String(env.RAPIDAPI_REDDIT_HOST).trim()) || "";
  const rapidApiPinterestHost = (env && env.RAPIDAPI_PINTEREST_HOST && String(env.RAPIDAPI_PINTEREST_HOST).trim()) || "";

  return {
    botToken: token,
    ownerId: owner,
    webhookSecret: secret,
    webAppUrl,
    cobaltUrl,
    rapidApiKey,
    rapidApiYoutubeKey,
    rapidApiTiktokKey,
    rapidApiIgKey,
    rapidApiTwitterKey,
    rapidApiFbKey,
    rapidApiRedditKey,
    rapidApiPinterestKey,
    rapidApiYoutubeHost,
    rapidApiTiktokHost,
    rapidApiIgHost,
    rapidApiTwitterHost,
    rapidApiFbHost,
    rapidApiRedditHost,
    rapidApiPinterestHost,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Entry point (assigned to a named const so ESLint's
//  `import/no-anonymous-default-export` stays happy — behaviour is identical
//  to the idiomatic `export default { fetch() {} }` Cloudflare Worker form).
// ═══════════════════════════════════════════════════════════════════════════════
const worker = {
  async fetch(request, env) {
    const cfg = getConfig(env);
    const url = new URL(request.url);

    // ── GET helpers ──────────────────────────────────────────────────────────
    if (request.method === "GET") {
      if (url.pathname === "/" || url.pathname === "/health") {
        return json({
          ok: true,
          service: "telegram-rich-markdown-bot",
          version: "2.0",
          features: ["rich-markdown", "admin-panel", "ai", "media-downloader", "rapidapi", "polls", "analytics", "web-app", "inline"],
          time: Date.now(),
        });
      }
      if (url.pathname === "/setup-webhook")   return setupWebhook(cfg, url);
      if (url.pathname === "/delete-webhook")  return deleteWebhook(cfg);
      if (url.pathname === "/info")            return botInfo(cfg);
      if (url.pathname === "/getUpdates")      return getUpdates(cfg, url);
      if (url.pathname === "/run-scheduler")   return runScheduledPosts(env, cfg, true);
      return new Response("✅ Bot is running! v2 — AI + Downloader + Polls + Analytics", { status: 200 });
    }

    if (request.method !== "POST") return new Response("OK");

    // ── Optional webhook secret ──────────────────────────────────────────────
    if (cfg.webhookSecret) {
      const secret =
        url.searchParams.get("secret") ||
        request.headers.get("X-Telegram-Bot-Api-Secret-Token") ||
        "";
      if (secret !== cfg.webhookSecret) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    try {
      const message       = update.message;
      const callbackQuery = update.callback_query;
      const inlineQuery   = update.inline_query;
      const pollAnswer    = update.poll_answer;
      const poll          = update.poll;

      // Route to the correct handler. Each update type is mutually exclusive.
      if (inlineQuery)        await handleInlineQuery(inlineQuery, env, cfg);
      else if (pollAnswer)    await handlePollAnswer(pollAnswer, env);
      else if (callbackQuery) await handleCallback(callbackQuery, env, cfg);
      else if (poll)          {} // poll status update — no action needed (we read on demand)
      else if (message?.text) await handleMessage(message, env, cfg);
      else if (message)       await handleMessage(message, env, cfg); // non-text messages (media, etc.)
    } catch (err) {
      console.error("Handler error:", err && err.stack ? err.stack : err);
      try {
        const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
        if (chatId) {
          await tg(cfg, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Internal error: ${err?.message || err}`,
          });
        }
      } catch {}
    }

    return new Response("OK", { status: 200 });
  },

  // ── Scheduled event (cron trigger) ────────────────────────────────────────
  // Fires every 5 minutes per wrangler.toml `[triggers] crons`. Picks up due
  // scheduled AI posts from KV, sends them to their target channels, marks
  // them sent. Uses ctx.waitUntil so the worker can respond to the scheduler
  // immediately while work continues.
  async scheduled(event, env, ctx) {
    const cfg = getConfig(env);
    ctx.waitUntil(runScheduledPosts(env, cfg, false));
  },
};

export default worker;

// ═══════════════════════════════════════════════════════════════════════════════
//  Webhook / info helpers
// ═══════════════════════════════════════════════════════════════════════════════
async function setupWebhook(cfg, url) {
  // The webhook URL is this worker's own URL with the same path stripped.
  // We build it from the request URL: https://<host>/
  const hookUrl = `${url.origin}/`;
  const body = { url: hookUrl };
  if (cfg.webhookSecret) body.secret_token = cfg.webhookSecret;
  const res = await tg(cfg, "setWebhook", body);
  const me  = await tg(cfg, "getMe", {});
  
  // Set bot commands for / menu
  const cmdRes = await setupBotCommands(cfg);
  
  return json({
    ok: res.ok,
    webhook_url: hookUrl,
    setWebhook: res,
    setCommands: cmdRes,
    bot: me.ok ? me.result : null,
  });
}

async function deleteWebhook(cfg) {
  const res = await tg(cfg, "deleteWebhook", { drop_pending_updates: false });
  return json({ ok: res.ok, deleteWebhook: res });
}

async function botInfo(cfg) {
  const me = await tg(cfg, "getMe", {});
  const wh = await tg(cfg, "getWebhookInfo", {});
  return json({ bot: me, webhook: wh });
}

/**
 * Set bot commands for the / menu in Telegram.
 * This shows users all available commands when they type /
 */
async function setupBotCommands(cfg) {
  const commands = [
    { command: "start", description: "🚀 شروع / Start" },
    { command: "ai", description: "🤖 تولید محتوا با AI" },
    { command: "askai", description: "💬 چت با AI" },
    { command: "dl", description: "📥 دانلود مدیا" },
    { command: "poll", description: "📊 ساخت نظرسنجی" },
    { command: "quiz", description: "🎯 ساخت کوییز" },
    { command: "stats", description: "📈 آمار کانال" },
    { command: "schedule", description: "⏰ زمان‌بندی پست" },
    { command: "webapp", description: "🌐 پنل وب" },
    { command: "cancel", description: "❌ لغو عملیات" },
  ];
  return await tg(cfg, "setMyCommands", { commands });
}

// ─── Calendar Keyboard Generator ──────────────────────────────────────────────
/**
 * Generate a calendar keyboard for a given month.
 * @param {number} year - Year (e.g. 2026)
 * @param {number} month - Month (0-11)
 * @param {string} lang - "fa" or "en"
 * @returns {Object} Telegram inline keyboard
 */
function calendarKeyboard(year, month, lang) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const dayNames = lang === "fa"
    ? ["ش", "ی", "د", "س", "چ", "پ", "ج"]
    : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const rows = [];
  
  rows.push([
    { text: "⏪", callback_data: `${lang}_cal_yr_prev_${year}_${month}` },
    { text: `${year}`, callback_data: `${lang}_noop` },
    { text: "⏩", callback_data: `${lang}_cal_yr_next_${year}_${month}` },
  ]);
  
  rows.push([
    { text: "◀️", callback_data: `${lang}_cal_prev_${year}_${month}` },
    { text: `${monthNames[month]}`, callback_data: `${lang}_noop` },
    { text: "▶️", callback_data: `${lang}_cal_next_${year}_${month}` },
  ]);
  
  rows.push(dayNames.map(d => ({ text: d, callback_data: `${lang}_noop` })));
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Use Iran timezone (UTC+3:30) for "today" calculation
  const nowUTC = Date.now();
  const iranOffset = 3.5 * 60 * 60 * 1000;
  const todayIR = new Date(nowUTC + iranOffset);
  const todayYear = todayIR.getUTCFullYear();
  const todayMonth = todayIR.getUTCMonth();
  const todayDate = todayIR.getUTCDate();
  
  const startDay = firstDay === 0 ? 6 : firstDay - 1;
  
  let row = [];
  
  for (let i = 0; i < startDay; i++) {
    row.push({ text: " ", callback_data: `${lang}_noop` });
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = todayYear === year && todayMonth === month && todayDate === day;
    const isPast = new Date(year, month, day) < new Date(todayYear, todayMonth, todayDate);
    
    let text;
    if (isToday) text = `•${day}•`;
    else if (isPast) text = `${day}̲`;
    else text = `${day}`;
    
    if (isPast) {
      row.push({ text, callback_data: `${lang}_noop` });
    } else {
      row.push({ text, callback_data: `${lang}_cal_day_${year}_${month}_${day}` });
    }
    
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  
  while (row.length > 0 && row.length < 7) {
    row.push({ text: " ", callback_data: `${lang}_noop` });
  }
  if (row.length > 0) rows.push(row);
  
  rows.push([{ text: lang === "fa" ? "❌ لغو" : "❌ Cancel", callback_data: `${lang}_cancel_flow` }]);
  
  return { inline_keyboard: rows };
}

/**
 * Generate time picker keyboard.
 * @param {string} lang - "fa" or "en"
 * @returns {Object} Telegram inline keyboard
 */
function timePickerKeyboard(lang) {
  const rows = [];
  
  // Common hours: morning, noon, afternoon, evening, night
  if (lang === "fa") {
    rows.push([
      { text: "🌅 ۰۶:۰۰", callback_data: `${lang}_time_6_00` },
      { text: "☀️ ۰۹:۰۰", callback_data: `${lang}_time_9_00` },
      { text: "🌤 ۱۱:۰۰", callback_data: `${lang}_time_11_00` },
    ]);
    rows.push([
      { text: "🍽 ۱۲:۰۰", callback_data: `${lang}_time_12_00` },
      { text: "🌞 ۱۴:۰۰", callback_data: `${lang}_time_14_00` },
      { text: "🌇 ۱۸:۰۰", callback_data: `${lang}_time_18_00` },
    ]);
    rows.push([
      { text: "🌙 ۲۰:۰۰", callback_data: `${lang}_time_20_00` },
      { text: "🌃 ۲۱:۰۰", callback_data: `${lang}_time_21_00` },
      { text: "🛏 ۲۳:۰۰", callback_data: `${lang}_time_23_00` },
    ]);
    rows.push([{ text: "⏰ ساعت دیگر...", callback_data: `${lang}_time_custom` }]);
    rows.push([
      { text: "⏰ +۱ ساعت", callback_data: `${lang}_time_quick_1h` },
      { text: "⏰ +۲ ساعت", callback_data: `${lang}_time_quick_2h` },
      { text: "⏰ +۳ ساعت", callback_data: `${lang}_time_quick_3h` },
    ]);
    rows.push([
      { text: "🌅 فردا ۹ صبح", callback_data: `${lang}_time_quick_tomorrow_9` },
      { text: "🌙 فردا ۱۸ عصر", callback_data: `${lang}_time_quick_tomorrow_18` },
    ]);
  } else {
    rows.push([
      { text: "🌅 06:00", callback_data: `${lang}_time_6_00` },
      { text: "☀️ 09:00", callback_data: `${lang}_time_9_00` },
      { text: "🌤 11:00", callback_data: `${lang}_time_11_00` },
    ]);
    rows.push([
      { text: "🍽 12:00", callback_data: `${lang}_time_12_00` },
      { text: "🌞 14:00", callback_data: `${lang}_time_14_00` },
      { text: "🌇 18:00", callback_data: `${lang}_time_18_00` },
    ]);
    rows.push([
      { text: "🌙 20:00", callback_data: `${lang}_time_20_00` },
      { text: "🌃 21:00", callback_data: `${lang}_time_21_00` },
      { text: "🛏 23:00", callback_data: `${lang}_time_23_00` },
    ]);
    rows.push([{ text: "⏰ Other time...", callback_data: `${lang}_time_custom` }]);
    rows.push([
      { text: "⏰ +1 hour", callback_data: `${lang}_time_quick_1h` },
      { text: "⏰ +2 hours", callback_data: `${lang}_time_quick_2h` },
      { text: "⏰ +3 hours", callback_data: `${lang}_time_quick_3h` },
    ]);
    rows.push([
      { text: "🌅 Tomorrow 9 AM", callback_data: `${lang}_time_quick_tomorrow_9` },
      { text: "🌙 Tomorrow 6 PM", callback_data: `${lang}_time_quick_tomorrow_18` },
    ]);
  }
  
  rows.push([{ text: lang === "fa" ? "◀️ بازگشت به تقویم" : "◀️ Back to calendar", callback_data: `${lang}_time_back_cal` }]);
  rows.push([{ text: lang === "fa" ? "❌ لغو" : "❌ Cancel", callback_data: `${lang}_cancel_flow` }]);
  
  return { inline_keyboard: rows };
}

async function getUpdates(cfg, url) {
  // Quick & dirty manual polling helper for local testing (NOT for production
  // alongside an active webhook — Telegram allows only one delivery mode).
  const offset = url.searchParams.get("offset")
    ? Number(url.searchParams.get("offset"))
    : undefined;
  const res = await tg(cfg, "getUpdates", offset ? { offset, timeout: 0 } : { timeout: 0 });
  return json(res);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  KV storage helpers
// ═══════════════════════════════════════════════════════════════════════════════
async function getAdmins(env, cfg) {
  try {
    const list = await cachedGet(env, "admins", "text", 120000); // 2min cache
    const parsed = list ? JSON.parse(list) : [];
    if (!parsed.includes(cfg.ownerId)) return [cfg.ownerId, ...parsed];
    return parsed;
  } catch {
    return [cfg.ownerId];
  }
}

async function setAdmins(env, list, cfg) {
  if (!list.includes(cfg.ownerId)) list = [cfg.ownerId, ...list];
  list = [...new Set(list)];
  await cachedPut(env, "admins", list);
  return list;
}

async function isAdmin(env, userId, cfg) {
  const admins = await getAdmins(env, cfg);
  return admins.includes(userId);
}

async function getChannels(env) {
  try {
    const raw = await cachedGet(env, "channels", "text", 30000); // 30s cache
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setChannels(env, list) {
  await cachedPut(env, "channels", list);
  return list;
}

async function getState(env, userId) {
  try {
    const raw = await env.BOT_DB.get(`state:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setState(env, userId, state) {
  if (state === null) {
    await env.BOT_DB.delete(`state:${userId}`);
  } else {
    await env.BOT_DB.put(`state:${userId}`, JSON.stringify(state));
  }
}

// ─── AI config (KV key "ai_config") ──────────────────────────────────────────
async function getAiConfig(env) {
  let kvConfig = null;
  try {
    const raw = await cachedGet(env, "ai_config", "text", 300000); // 5min cache
    if (raw) kvConfig = JSON.parse(raw);
  } catch {}

  const provider = (kvConfig && kvConfig.provider) || (env && env.AI_PROVIDER) || "openai";
  const defaults = AI_PROVIDER_DEFAULTS[provider] || AI_PROVIDER_DEFAULTS.openai;
  return {
    provider,
    apiKey:     (kvConfig && kvConfig.apiKey)     || (env && env.AI_API_KEY)     || "",
    baseUrl:    (kvConfig && kvConfig.baseUrl)    || (env && env.AI_BASE_URL)    || defaults.baseUrl,
    model:      (kvConfig && kvConfig.model)      || (env && env.AI_MODEL)       || defaults.model,
    systemPrompt: (kvConfig && kvConfig.systemPrompt) || (env && env.AI_SYSTEM_PROMPT) || DEFAULT_AI_SYSTEM_PROMPT,
  };
}

async function setAiConfig(env, config) {
  await cachedPut(env, "ai_config", config);
}

// ─── Scheduled AI posts (KV key "scheduled_posts") ───────────────────────────
async function getScheduledPosts(env) {
  try {
    const raw = await cachedGet(env, "scheduled_posts", "text", 10000); // 10s cache
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveScheduledPosts(env, list) {
  await cachedPut(env, "scheduled_posts", list);
}

async function addScheduledPost(env, post) {
  const list = await getScheduledPosts(env);
  list.push(post);
  await saveScheduledPosts(env, list);
  return post;
}

async function removeScheduledPost(env, id) {
  const list = await getScheduledPosts(env);
  const filtered = list.filter(p => p.id !== id);
  await saveScheduledPosts(env, filtered);
  return list.length !== filtered.length;
}

// ─── Polls (KV keys "polls" + "poll_answers:<pollId>") ───────────────────────
async function getPolls(env) {
  try {
    const raw = await cachedGet(env, "polls", "text", 30000); // 30s cache
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function savePolls(env, list) {
  await cachedPut(env, "polls", list);
}

async function addPoll(env, poll) {
  const list = await getPolls(env);
  list.push(poll);
  await savePolls(env, list);
  return poll;
}

async function getPollAnswers(env, pollId) {
  try {
    const raw = await env.BOT_DB.get(`poll_answers:${pollId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function savePollAnswers(env, pollId, list) {
  await env.BOT_DB.put(`poll_answers:${pollId}`, JSON.stringify(list));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Keyboards - Improved UI/UX
// ═══════════════════════════════════════════════════════════════════════════════
function mainKeyboard(lang, admin, cfg) {
  if (lang === "fa") {
    const rows = [
      [
        { text: "🤖 هوش مصنوعی", callback_data: "fa_ai_menu" },
        { text: "📥 دانلود", callback_data: "fa_dl_help" },
      ],
      [
        { text: "📊 نظرسنجی", callback_data: "fa_standalone_poll_start" },
        { text: "📈 آمار", callback_data: "fa_stats_menu" },
      ],
    ];
    if (admin) {
      rows.push([
        { text: "📝 ساخت پست", callback_data: "fa_newpost" },
        { text: "⚙️ پنل ادمین", callback_data: "fa_admin_panel" },
      ]);
    }
    rows.push([
      { text: "📖 راهنما", callback_data: "fa_help_md" },
      { text: "🌐 پنل وب", web_app: { url: cfg?.webAppUrl || "https://example.com" } },
    ]);
    rows.push([{ text: "🇬🇧 English", callback_data: "en_start" }]);
    return { inline_keyboard: rows };
  }

  const rows = [
    [
      { text: "🤖 AI", callback_data: "en_ai_menu" },
      { text: "📥 Download", callback_data: "en_dl_help" },
    ],
    [
      { text: "📊 Poll", callback_data: "en_standalone_poll_start" },
      { text: "📈 Stats", callback_data: "en_stats_menu" },
    ],
  ];
  if (admin) {
    rows.push([
      { text: "📝 New Post", callback_data: "en_newpost" },
      { text: "⚙️ Admin", callback_data: "en_admin_panel" },
    ]);
  }
  rows.push([
    { text: "📖 Help", callback_data: "en_help_md" },
    { text: "🌐 Web Panel", web_app: { url: cfg?.webAppUrl || "https://example.com" } },
  ]);
  rows.push([{ text: "🇮🇷 فارسی", callback_data: "fa_start" }]);
  return { inline_keyboard: rows };
}

// ─── AI menu keyboard ─────────────────────────────────────────────────────────
function aiMenuKeyboard(lang, cfg) {
  const aiConfigured = cfg && cfg._aiConfigured;
  if (lang === "fa") {
    return {
      inline_keyboard: [
        [
          { text: aiConfigured ? "💬 چت" : "⚙️ تنظیم", callback_data: "fa_ai_help" },
          { text: "✨ تولید", callback_data: "fa_ai_generate" },
        ],
        [
          { text: "⏰ زمان‌بندی", callback_data: "fa_ai_schedule" },
          { text: "📋 لیست", callback_data: "fa_ai_scheduled_list" },
        ],
        [{ text: "⚙️ تنظیمات", callback_data: "fa_ai_config_menu" }],
        [{ text: "⬅️ بازگشت", callback_data: "fa_back" }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [
        { text: aiConfigured ? "💬 Chat" : "⚙️ Setup", callback_data: "en_ai_help" },
        { text: "✨ Generate", callback_data: "en_ai_generate" },
      ],
      [
        { text: "⏰ Schedule", callback_data: "en_ai_schedule" },
        { text: "📋 List", callback_data: "en_ai_scheduled_list" },
      ],
      [{ text: "⚙️ Settings", callback_data: "en_ai_config_menu" }],
      [{ text: "⬅️ Back", callback_data: "en_back" }],
    ],
  };
}

// ─── Tools menu keyboard (download + misc) ────────────────────────────────────
function toolsMenuKeyboard(lang) {
  const key = `tools_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [{ text: "📥 دانلود مدیا", callback_data: "fa_dl_help" }],
        [{ text: "⬅️ بازگشت", callback_data: "fa_back" }],
      ],
    };
    return {
      inline_keyboard: [
        [{ text: "📥 Media Download", callback_data: "en_dl_help" }],
        [{ text: "⬅️ Back", callback_data: "en_back" }],
      ],
    };
  });
}

// ─── Poll menu keyboard ──────────────────────────────────────────────────────
function pollMenuKeyboard(lang) {
  const key = `poll_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [{ text: "📊 ساخت نظرسنجی", callback_data: "fa_standalone_poll_start" }],
        [{ text: "📊 نتایج", callback_data: "fa_pollstats" }],
        [{ text: "⬅️ بازگشت", callback_data: "fa_back" }],
      ],
    };
    return {
      inline_keyboard: [
        [{ text: "📊 Create Poll", callback_data: "en_standalone_poll_start" }],
        [{ text: "📊 Results", callback_data: "en_pollstats" }],
        [{ text: "⬅️ Back", callback_data: "en_back" }],
      ],
    };
  });
}

// ─── AI Config menu keyboard ─────────────────────────────────────────────────
function aiConfigMenuKeyboard(lang) {
  const key = `aicfg_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [{ text: "🔑 تغییر Provider", callback_data: "fa_aiconfig_change" }],
        [{ text: "🤖 تغییر مدل", callback_data: "fa_aimodel_change" }],
        [{ text: "📝 تغییر System Prompt", callback_data: "fa_aisystem_change" }],
        [{ text: "⬅️ بازگشت", callback_data: "fa_ai_menu" }],
      ],
    };
    return {
      inline_keyboard: [
        [{ text: "🔑 Change Provider", callback_data: "en_aiconfig_change" }],
        [{ text: "🤖 Change Model", callback_data: "en_aimodel_change" }],
        [{ text: "📝 Change System Prompt", callback_data: "en_aisystem_change" }],
        [{ text: "⬅️ Back", callback_data: "en_ai_menu" }],
      ],
    };
  });
}

// ─── AI preview keyboard (after generation) ───────────────────────────────────
function aiPreviewKeyboard(lang) {
  const key = `aiprev_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [
          { text: "📤 ارسال فوری", callback_data: "fa_ai_send_now" },
          { text: "⏰ زمان‌بندی", callback_data: "fa_ai_schedule_now" },
        ],
        [
          { text: "✏️ ویرایش", callback_data: "fa_ai_edit" },
          { text: "🔄 بازسازی", callback_data: "fa_ai_regenerate" },
        ],
        [{ text: "❌ لغو", callback_data: "fa_ai_cancel" }],
      ],
    };
    return {
      inline_keyboard: [
        [
          { text: "📤 Send Now", callback_data: "en_ai_send_now" },
          { text: "⏰ Schedule", callback_data: "en_ai_schedule_now" },
        ],
        [
          { text: "✏️ Edit", callback_data: "en_ai_edit" },
          { text: "🔄 Regenerate", callback_data: "en_ai_regenerate" },
        ],
        [{ text: "❌ Cancel", callback_data: "en_ai_cancel" }],
      ],
    };
  });
}

// ─── Back keyboard ────────────────────────────────────────────────────────────
function backKeyboard(lang) {
  const key = `back_${lang}`;
  return cachedKeyboard(key, () => ({
    inline_keyboard: [[
      { text: lang === "fa" ? "⬅️ بازگشت" : "⬅️ Back", callback_data: `${lang}_back` },
    ]],
  }));
}

// ─── Admin panel keyboard ─────────────────────────────────────────────────────
function adminPanelKeyboard(lang) {
  const key = `admin_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [
          { text: "👤 ادمین‌ها", callback_data: "fa_admins_menu" },
          { text: "📡 کانال‌ها", callback_data: "fa_channels_menu" },
        ],
        [{ text: "🤖 هوش مصنوعی", callback_data: "fa_ai_menu" }],
        [{ text: "⬅️ بازگشت", callback_data: "fa_back" }],
      ],
    };
    return {
      inline_keyboard: [
        [
          { text: "👤 Admins", callback_data: "en_admins_menu" },
          { text: "📡 Channels", callback_data: "en_channels_menu" },
        ],
        [{ text: "🤖 AI", callback_data: "en_ai_menu" }],
        [{ text: "⬅️ Back", callback_data: "en_back" }],
      ],
    };
  });
}

// ─── Admins menu keyboard ─────────────────────────────────────────────────────
function adminsMenuKeyboard(lang) {
  const key = `admins_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [{ text: "➕ افزودن ادمین", callback_data: "fa_add_admin" }],
        [{ text: "🗑 حذف ادمین", callback_data: "fa_remove_admin" }],
        [{ text: "📋 لیست ادمین‌ها", callback_data: "fa_list_admins" }],
        [{ text: "⬅️ بازگشت", callback_data: "fa_admin_panel" }],
      ],
    };
    return {
      inline_keyboard: [
        [{ text: "➕ Add Admin", callback_data: "en_add_admin" }],
        [{ text: "🗑 Remove Admin", callback_data: "en_remove_admin" }],
        [{ text: "📋 List Admins", callback_data: "en_list_admins" }],
        [{ text: "⬅️ Back", callback_data: "en_admin_panel" }],
      ],
    };
  });
}

// ─── Channels menu keyboard ───────────────────────────────────────────────────
function channelsMenuKeyboard(lang) {
  const key = `channels_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [{ text: "➕ افزودن کانال", callback_data: "fa_add_channel" }],
        [{ text: "🗑 حذف کانال", callback_data: "fa_remove_channel" }],
        [{ text: "📋 لیست کانال‌ها", callback_data: "fa_list_channels" }],
        [{ text: "⬅️ بازگشت", callback_data: "fa_admin_panel" }],
      ],
    };
    return {
      inline_keyboard: [
        [{ text: "➕ Add Channel", callback_data: "en_add_channel" }],
        [{ text: "🗑 Remove Channel", callback_data: "en_remove_channel" }],
        [{ text: "📋 List Channels", callback_data: "en_list_channels" }],
        [{ text: "⬅️ Back", callback_data: "en_admin_panel" }],
      ],
    };
  });
}

// ─── Cancel keyboard ──────────────────────────────────────────────────────────
function cancelKeyboard(lang) {
  const key = `cancel_${lang}`;
  return cachedKeyboard(key, () => ({
    inline_keyboard: [[
      { text: lang === "fa" ? "❌ لغو" : "❌ Cancel", callback_data: `${lang}_cancel_flow` },
    ]],
  }));
}

// ─── Ask buttons keyboard ─────────────────────────────────────────────────────
function askButtonsKeyboard(lang) {
  const key = `askbtn_${lang}`;
  return cachedKeyboard(key, () => ({
    inline_keyboard: [
      [
        { text: lang === "fa" ? "✅ آره" : "✅ Yes", callback_data: `${lang}_post_btn_yes` },
        { text: lang === "fa" ? "❌ نه" : "❌ No", callback_data: `${lang}_post_btn_no` },
      ],
    ],
  }));
}

// ─── Ask poll keyboard ────────────────────────────────────────────────────────
function askPollKeyboard(lang, hasPolls = false) {
  const key = `askpoll_${lang}_${hasPolls}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") {
      const rows = [
        [
          { text: "📊 نظرسنجی", callback_data: "fa_post_poll_regular" },
          { text: "🎯 کوییز", callback_data: "fa_post_poll_quiz" },
        ],
      ];
      if (hasPolls) {
        rows.push([{ text: "✅ ادامه", callback_data: "fa_post_poll_done" }]);
      }
      rows.push([{ text: "❌ نه", callback_data: "fa_post_poll_no" }]);
      return { inline_keyboard: rows };
    }
    const rows = [
      [
        { text: "📊 Poll", callback_data: "en_post_poll_regular" },
        { text: "🎯 Quiz", callback_data: "en_post_poll_quiz" },
      ],
    ];
    if (hasPolls) {
      rows.push([{ text: "✅ Continue", callback_data: "en_post_poll_done" }]);
    }
    rows.push([{ text: "❌ No", callback_data: "en_post_poll_no" }]);
    return { inline_keyboard: rows };
  });
}

// ─── Post schedule keyboard ───────────────────────────────────────────────────
function postScheduleKeyboard(lang) {
  const key = `postsch_${lang}`;
  return cachedKeyboard(key, () => ({
    inline_keyboard: [
      [
        { text: lang === "fa" ? "📤 فوری" : "📤 Now", callback_data: `${lang}_post_send_now` },
        { text: lang === "fa" ? "⏰ زمان‌بندی" : "⏰ Schedule", callback_data: `${lang}_post_schedule` },
      ],
    ],
  }));
}

// ─── Preview keyboard (confirm/edit) ──────────────────────────────────────────
function previewKeyboard(lang) {
  const key = `preview_${lang}`;
  return cachedKeyboard(key, () => {
    if (lang === "fa") return {
      inline_keyboard: [
        [{ text: "✅ تایید", callback_data: "fa_post_confirm" }],
        [
          { text: "✏️ متن", callback_data: "fa_post_edit_text" },
          { text: "✏️ دکمه", callback_data: "fa_post_edit_btns" },
        ],
        [{ text: "❌ لغو", callback_data: "fa_cancel_flow" }],
      ],
    };
    return {
      inline_keyboard: [
        [{ text: "✅ Confirm", callback_data: "en_post_confirm" }],
        [
          { text: "✏️ Text", callback_data: "en_post_edit_text" },
          { text: "✏️ Buttons", callback_data: "en_post_edit_btns" },
        ],
        [{ text: "❌ Cancel", callback_data: "en_cancel_flow" }],
      ],
    };
  });
}

// Select channels to send (multiple selection)
function channelSelectKeyboard(lang, channels, selected) {
  const rows = channels.map(ch => {
    const checked = selected.includes(String(ch.id)) ? "✅ " : "▫️ ";
    return [{ text: `${checked}${ch.title}`, callback_data: `${lang}_post_ch_${ch.id}` }];
  });
  if (lang === "fa") {
    rows.push([
      { text: "📤 ارسال", callback_data: "fa_post_send" },
      { text: "⏰ زمان‌بندی", callback_data: "fa_post_schedule" },
    ]);
    rows.push([{ text: "⬅️ بازگشت", callback_data: "fa_post_confirm_back" }]);
  } else {
    rows.push([
      { text: "📤 Send", callback_data: "en_post_send" },
      { text: "⏰ Schedule", callback_data: "en_post_schedule" },
    ]);
    rows.push([{ text: "⬅️ Back", callback_data: "en_post_confirm_back" }]);
  }
  return { inline_keyboard: rows };
}

function standalonePollChannelSelect(lang, channels, selected) {
  const rows = channels.map(ch => {
    const checked = selected.includes(String(ch.id)) ? "✅ " : "▫️ ";
    return [{ text: `${checked}${ch.title}`, callback_data: `${lang}_standalone_poll_ch_${ch.id}` }];
  });
  if (lang === "fa") {
    rows.push([
      { text: "📤 ارسال", callback_data: "fa_standalone_poll_confirm" },
      { text: "⏰ زمان‌بندی", callback_data: "fa_standalone_poll_schedule" },
    ]);
    rows.push([{ text: "⬅️ بازگشت", callback_data: "fa_standalone_poll_start" }]);
  } else {
    rows.push([
      { text: "📤 Send", callback_data: "en_standalone_poll_confirm" },
      { text: "⏰ Schedule", callback_data: "en_standalone_poll_schedule" },
    ]);
    rows.push([{ text: "⬅️ Back", callback_data: "en_standalone_poll_start" }]);
  }
  return { inline_keyboard: rows };
}

// ─── AI channel select keyboard ──────────────────────────────────────────────
function aiChannelSelectKeyboard(lang, channels, selected, mode) {
  const rows = channels.map(ch => {
    const checked = selected.includes(String(ch.id)) ? "✅ " : "▫️ ";
    return [{ text: `${checked}${ch.title}`, callback_data: `${lang}_ai_${mode}_ch_${ch.id}` }];
  });
  if (lang === "fa") {
    rows.push([
      { text: "📤 ارسال", callback_data: `fa_ai_${mode}_confirm` },
    ]);
    rows.push([{ text: "⬅️ بازگشت", callback_data: "fa_ai_menu" }]);
  } else {
    rows.push([
      { text: "📤 Send", callback_data: `en_ai_${mode}_confirm` },
    ]);
    rows.push([{ text: "⬅️ Back", callback_data: "en_ai_menu" }]);
  }
  return { inline_keyboard: rows };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Message handler
// ═══════════════════════════════════════════════════════════════════════════════
async function handleMessage(message, env, cfg) {
  const chatId  = message.chat.id;
  const userId  = message.from?.id;
  const rawText = message.text || "";
  const trimmed = rawText.trim();

  // ── /start — also set the Web App menu button if configured ──────────────
  if (trimmed === "/start" || trimmed === "/help") {
    await sendPlain(cfg, chatId, LANG_SELECT_MESSAGE, LANG_SELECT_KEYBOARD);
    if (cfg.webAppUrl) {
      // Best-effort: set the menu button for this user. Ignore errors (e.g.
      // the bot can't set menu buttons for users who haven't started it).
      await tg(cfg, "setChatMenuButton", {
        chat_id: chatId,
        menu_button: { type: "web_app", text: "🌐 Panel", web_app: { url: cfg.webAppUrl } },
      }).catch(() => {});
    }
    return;
  }

  // ── Slash commands (new features) ────────────────────────────────────────
  // These are checked BEFORE stateful flows so a /cancel always works, and
  // so new commands can be used mid-flow without confusion.
  const cmdMatch = trimmed.match(/^\/(\w+)\b/);
  const cmd = cmdMatch ? cmdMatch[1].toLowerCase() : null;
  const argText = cmd ? trimmed.slice(cmdMatch[0].length).trim() : "";

  // /cancel — always works, clears any state
  if (cmd === "cancel" && !argText) {
    await setState(env, userId, null);
    await sendPlain(cfg, chatId, langFa(cfg, userId) ? "❌ عملیات لغو شد." : "❌ Operation cancelled.");
    return;
  }

  // /newpost — start post creation
  if (cmd === "newpost") {
    const lang = langFa(cfg, userId) ? "fa" : "en";
    await setState(env, userId, { action: "post_await_text", lang });
    const txt = langFa(cfg, userId)
      ? "📝 **ساخت پست**\n\nمتن پست خود را ارسال کنید (Markdown یا HTML پشتیبانی می‌شود).\n\nبرای لغو /cancel را ارسال کنید."
      : "📝 **New Post**\n\nSend the text of your post (Markdown or HTML supported).\n\nSend /cancel to abort.";
    await sendPlain(cfg, chatId, txt);
    return;
  }

  // /ai <prompt> — one-shot AI generation + preview + send/schedule buttons
  if (cmd === "ai" && argText) {
    await handleAiGenerate(env, cfg, chatId, userId, argText, null);
    return;
  }

  // /askai — enter multi-turn AI chat mode
  if (cmd === "askai" || (cmd === "ai" && !argText)) {
    const aiConfig = await getAiConfig(env);
    if (!aiConfig.apiKey) {
      await sendPlain(cfg, chatId, langFa(cfg, userId)
        ? "⚠️ هوش مصنوعی تنظیم نشده. ادمین باید از /aiconfig استفاده کند."
        : "⚠️ AI not configured. Admin must use /aiconfig first.");
      return;
    }
    await setState(env, userId, { action: "ai_chat", lang: langFa(cfg, userId) ? "fa" : "en", messages: [] });
    await sendPlain(cfg, chatId, langFa(cfg, userId)
      ? "🤖 حالت چت با AI فعال شد. پیام خود را بفرستید.\n\nبرای خروج /cancel را بفرستید."
      : "🤖 AI chat mode enabled. Send your message.\n\nSend /cancel to exit.",
      cancelKeyboard(langFa(cfg, userId) ? "fa" : "en"));
    return;
  }

  // /scheduleai — stateful: prompt → generate → channels → time → done
  if (cmd === "scheduleai" || (cmd === "ai" && argText.toLowerCase().startsWith("schedule"))) {
    await setState(env, userId, { action: "ai_await_prompt", lang: langFa(cfg, userId) ? "fa" : "en", scheduleMode: true });
    await sendPlain(cfg, chatId, langFa(cfg, userId)
      ? "⏰ زمان‌بندی ارسال AI\n\nپرامپت خود را بفرستید (هر چیزی که می‌خواهید AI درباره آن بنویسه):\n\nبرای لغو /cancel"
      : "⏰ Schedule AI Post\n\nSend your prompt (what you want AI to write about):\n\n/cancel to abort",
      cancelKeyboard(langFa(cfg, userId) ? "fa" : "en"));
    return;
  }

  // /scheduled — list pending scheduled posts
  if (cmd === "scheduled") {
    await handleScheduledList(env, cfg, chatId, userId, null, langFa(cfg, userId) ? "fa" : "en");
    return;
  }

  // /cancel <id> — cancel a scheduled post
  if (cmd === "cancel") {
    if (!argText) {
      await sendPlain(cfg, chatId, langFa(cfg, userId)
        ? "⚠️ فرمت: `/cancel <شناسه>`\n\nبرای مشاهده شناسه‌ها: /scheduled"
        : "⚠️ Format: `/cancel <id>`\n\nTo see IDs: /scheduled");
      return;
    }
    await handleCancelScheduled(env, cfg, chatId, userId, argText.trim(), langFa(cfg, userId) ? "fa" : "en");
    return;
  }

  // /aiconfig <provider> <apiKey>  (admin only)
  if (cmd === "aiconfig") {
    if (!(await isAdmin(env, userId, cfg))) {
      await sendPlain(cfg, chatId, "⛔️ Admin only.");
      return;
    }
    await handleAiConfigCommand(env, cfg, chatId, userId, argText);
    return;
  }

  // /aimodel <model>  (admin only)
  if (cmd === "aimodel") {
    if (!(await isAdmin(env, userId, cfg))) {
      await sendPlain(cfg, chatId, "⛔️ Admin only.");
      return;
    }
    if (!argText) {
      const c = await getAiConfig(env);
      await sendPlain(cfg, chatId, `Current model: \`${c.model}\`\nUsage: /aimodel gpt-4o`);
      return;
    }
    const c = await getAiConfig(env);
    c.model = argText;
    await setAiConfig(env, c);
    await sendPlain(cfg, chatId, `✅ Model set to: \`${argText}\``);
    return;
  }

  // /aisystem <text>  (admin only)
  if (cmd === "aisystem") {
    if (!(await isAdmin(env, userId, cfg))) {
      await sendPlain(cfg, chatId, "⛔️ Admin only.");
      return;
    }
    if (!argText) {
      const c = await getAiConfig(env);
      await sendPlain(cfg, chatId, `Current system prompt:\n\n\`\`\`\n${c.systemPrompt}\n\`\`\`\n\nUsage: /aisystem <new prompt>`);
      return;
    }
    const c = await getAiConfig(env);
    c.systemPrompt = argText;
    await setAiConfig(env, c);
    await sendPlain(cfg, chatId, "✅ System prompt updated.");
    return;
  }

  // /dl <url> — media downloader
  if (cmd === "dl" || cmd === "download") {
    if (!argText) {
      await sendPlain(cfg, chatId, langFa(cfg, userId)
        ? "📥 دانلود مدیا\n\nنحوه استفاده:\n`/dl https://youtu.be/xxxxx`\n`/dl https://github.com/user/repo/raw/...`\n\nپشتیبانی از: YouTube, TikTok, Instagram, Twitter/X, Facebook, Reddit, Pinterest, GitHub و...\n\n⚡ RapidAPI: " + (cfg.rapidApiKey ? "فعال ✅" : "غیرفعال (با RAPIDAPI_KEY فعال کنید)") + "\n\n⚠️ فایل‌های بزرگ‌تر از 45MB به صورت لینک ارسال می‌شوند."
        : "📥 Media Downloader\n\nUsage:\n`/dl https://youtu.be/xxxxx`\n`/dl https://github.com/user/repo/raw/...`\n\nSupports: YouTube, TikTok, Instagram, Twitter/X, Facebook, Reddit, Pinterest, GitHub, and more.\n\n⚡ RapidAPI: " + (cfg.rapidApiKey ? "Enabled ✅" : "Disabled (set RAPIDAPI_KEY to enable)") + "\n\n⚠️ Files larger than 45MB are sent as download links.");
      return;
    }
    await handleDownload(cfg, chatId, userId, argText);
    return;
  }

  // /poll Q | o1 | o2 | ...  or  /quiz Q | o1 | o2 | !o3
  if (cmd === "poll" || cmd === "quiz") {
    await handlePollCommand(env, cfg, chatId, userId, cmd, argText);
    return;
  }

  // /pollstats — list tracked polls with results
  if (cmd === "pollstats") {
    await showPollStats(env, cfg, chatId, userId);
    return;
  }

  // /stats — channel analytics
  if (cmd === "stats") {
    await showChannelStats(env, cfg, chatId, userId);
    return;
  }

  // ── Stateful flows (admin, post builder, AI chat, AI schedule) ───────────
  const state = await getState(env, userId);
  if (state) {
    const handled = await handleStateInput(env, message, state, cfg);
    if (handled) return;
  }

  // ── Rich echo (the original bot behaviour) ───────────────────────────────
  // Telegram clients auto-format `**bold**`, ```code```, etc. typed by the user
  // into formatting entities and STRIP the raw markdown syntax from message.text.
  // Reconstruct the original Markdown/HTML from text + entities before echoing.
  let text = entitiesToMarkdown(rawText, message.entities).trim();
  if (!text) text = trimmed;

  if (!text) return; // empty message (e.g. sticker with no caption)

  if (text.startsWith("<") || /<\/?\w/.test(text)) {
    await sendRichHtml(cfg, chatId, text);
  } else {
    await sendRichMarkdown(cfg, chatId, text);
  }
}

// ─── Helper: detect user language from existing state or default to FA ────────
// Used by slash commands that need a language before any state is set.
function langFa(cfg, userId) {
  // Default to FA (the bot's primary audience). Could be improved by storing
  // per-user language preference in KV, but for now FA is the safe default
  // since the original bot was FA-first.
  return true;
}

// ─── Managing text inputs in different modes (add admin, channel, create post) ──
async function handleStateInput(env, message, state, cfg) {
  const chatId  = message.chat.id;
  const userId  = message.from?.id;
  const rawText = message.text;
  const trimmed = rawText.trim();
  const lang    = state.lang || "fa";

  // Cancel with /cancel
  if (trimmed === "/cancel") {
    await setState(env, userId, null);
    await sendPlain(cfg, chatId, lang === "fa" ? "❌ عملیات لغو شد." : "❌ Operation cancelled.");
    return true;
  }

  // ── Add admin ──────────────────────────────────────────────────────
  if (state.action === "admin_add") {
    const newId = parseInt(trimmed, 10);
    if (!Number.isFinite(newId)) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ آیدی عددی معتبر نیست. یک آیدی عددی تلگرام بفرستید یا /cancel کنید."
        : "⚠️ Invalid numeric ID. Send a numeric Telegram user ID or /cancel.");
      return true;
    }
    const admins = await getAdmins(env, cfg);
    if (admins.includes(newId)) {
      await sendPlain(cfg, chatId, lang === "fa" ? "ℹ️ این کاربر از قبل ادمین است." : "ℹ️ This user is already an admin.");
    } else {
      const updated = await setAdmins(env, [...admins, newId], cfg);
      await sendPlain(cfg, chatId, (lang === "fa" ? `✅ ادمین جدید اضافه شد: \`${newId}\`\n\nلیست فعلی: ` : `✅ New admin added: \`${newId}\`\n\nCurrent list: `) + updated.map(a => `\`${a}\``).join(", "));
    }
    await setState(env, userId, null);
    return true;
  }

  // ── Remove admin ────────────────────────────────────────────────────────
  if (state.action === "admin_remove") {
    const remId = parseInt(trimmed, 10);
    if (!Number.isFinite(remId)) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ آیدی عددی معتبر نیست. یک آیدی عددی تلگرام بفرستید یا /cancel کنید."
        : "⚠️ Invalid numeric ID. Send a numeric Telegram user ID or /cancel.");
      return true;
    }
    if (remId === cfg.ownerId) {
      await sendPlain(cfg, chatId, lang === "fa" ? "⛔️ مالک اصلی ربات قابل حذف نیست." : "⛔️ The bot owner cannot be removed.");
      await setState(env, userId, null);
      return true;
    }
    const admins = await getAdmins(env, cfg);
    if (!admins.includes(remId)) {
      await sendPlain(cfg, chatId, lang === "fa" ? "ℹ️ این کاربر ادمین نبود." : "ℹ️ This user wasn't an admin.");
    } else {
      const updated = await setAdmins(env, admins.filter(a => a !== remId), cfg);
      await sendPlain(cfg, chatId, (lang === "fa" ? `✅ ادمین حذف شد: \`${remId}\`\n\nلیست فعلی: ` : `✅ Admin removed: \`${remId}\`\n\nCurrent list: `) + updated.map(a => `\`${a}\``).join(", "));
    }
    await setState(env, userId, null);
    return true;
  }

  // ── Add channel ─────────────────────────────────────────────────────
  if (state.action === "channel_add") {
    // ورودی می‌تواند آیدی عددی (مثل -1001234567890) یا یوزرنیم (@channel) باشد
    let channelId = trimmed;
    if (!channelId.startsWith("@") && !/^-?\d+$/.test(channelId)) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت نامعتبر است. آیدی عددی کانال (مثل -1001234567890) یا یوزرنیم (@channel) بفرستید، یا /cancel کنید."
        : "⚠️ Invalid format. Send the channel's numeric ID (e.g. -1001234567890) or @username, or /cancel.");
      return true;
    }
    if (/^-?\d+$/.test(channelId)) channelId = parseInt(channelId, 10);

    // بررسی اینکه ربات در کانال ادمین است
    const chatInfo = await tg(cfg, "getChat", { chat_id: channelId });
    if (!chatInfo || !chatInfo.ok) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? `⚠️ نتوانستم اطلاعات این کانال را بگیرم. مطمئن شوید:\n1) ربات در کانال عضو و **ادمین** است.\n2) آیدی/یوزرنیم درست است.\n\nخطا: ${chatInfo?.description || "نامشخص"}`
        : `⚠️ Couldn't fetch chat info. Make sure:\n1) The bot is a member and **admin** of the channel.\n2) The ID/username is correct.\n\nError: ${chatInfo?.description || "unknown"}`);
      return true;
    }
    const title = chatInfo.result.title || chatInfo.result.username || String(channelId);
    const realId = chatInfo.result.id;

    const channels = await getChannels(env);
    if (channels.some(c => String(c.id) === String(realId))) {
      await sendPlain(cfg, chatId, lang === "fa" ? "ℹ️ این کانال از قبل ثبت شده است." : "ℹ️ This channel is already registered.");
    } else {
      const updated = await setChannels(env, [...channels, { id: realId, title }]);
      await sendPlain(cfg, chatId, (lang === "fa" ? `✅ کانال اضافه شد: **${title}** (\`${realId}\`)\n\nتعداد کانال‌های ثبت شده: ${updated.length}` : `✅ Channel added: **${title}** (\`${realId}\`)\n\nTotal registered channels: ${updated.length}`));
    }
    await setState(env, userId, null);
    return true;
  }

  // ── Delete channel (by numeric ID or username) ─────────────────────────────────
  if (state.action === "channel_remove") {
    let channelId = trimmed;
    if (/^-?\d+$/.test(channelId)) channelId = parseInt(channelId, 10);
    else if (channelId.startsWith("@")) channelId = channelId; // keep as username
    const channels = await getChannels(env);
    const found = channels.find(c => String(c.id) === String(channelId) || c.title === channelId);
    if (!found) {
      await sendPlain(cfg, chatId, lang === "fa" ? "⚠️ کانالی با این مشخصات پیدا نشد." : "⚠️ Channel not found.");
      return true;
    }
    const updated = await setChannels(env, channels.filter(c => String(c.id) !== String(found.id)));
    await sendPlain(cfg, chatId, (lang === "fa" ? `✅ کانال حذف شد: **${found.title}**\n\nتعداد کانال‌های ثبت شده: ${updated.length}` : `✅ Channel removed: **${found.title}**\n\nTotal registered channels: ${updated.length}`));
    await setState(env, userId, null);
    return true;
  }

  // ── Creating a Post: Step 1 — Getting the Post Text ───────────────────────────────
  if (state.action === "post_await_text") {
    let text = entitiesToMarkdown(rawText, message.entities).trim();
    if (!text) text = trimmed;

    // Parse embedded quizzes/polls from text
    const { cleanText, polls } = parseEmbeddedPolls(text);
    const isHtml = cleanText.startsWith("<") || /<\/?\w/.test(cleanText);
    
    const newState = {
      action: "post_await_buttons_choice",
      lang,
      text: cleanText,
      polls: polls,
      isHtml,
      buttons: null,
    };
    await setState(env, userId, newState);

    // Show converted post (preview)
    if (isHtml) await sendRichHtml(cfg, chatId, cleanText);
    else await sendRichMarkdown(cfg, chatId, cleanText);

    await sendPlain(cfg, chatId,
      lang === "fa"
        ? "آیا می‌خواهید برای این پست دکمه قرار دهید؟"
        : "Would you like to add buttons to this post?",
      askButtonsKeyboard(lang)
    );
    return true;
  }

  // ── Post Creation: Step 2 — Get Button Text ────────────────────────────
  if (state.action === "post_await_buttons_text") {
    const parsed = parseButtonsInput(trimmed);
    if (!parsed || parsed.length === 0) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت نامعتبر. نمونه:\n\`Button💠 - https://link.com\`\n\`Button🩵 - http://a.ai | Button💙 - http://b.ai\`"
        : "⚠️ Invalid format. Example:\n\`Button💠 - https://link.com\`\n\`Button🩵 - http://a.ai | Button💙 - http://b.ai\`");
      return true;
    }

    // Save buttons for reuse later
    await cachedPut(env, `buttons_${userId}`, parsed);
    
    // After buttons, ask about poll
    const newState = { ...state, action: "post_await_poll_choice", buttons: parsed, polls: state.polls || [] };
    await setState(env, userId, newState);
    
    const existingPolls = state.polls || [];
    let msg;
    if (existingPolls.length > 0) {
      msg = lang === "fa"
        ? `✅ ${parsed.flat().length} دکمه ذخیره شد!\n\n📊 ${existingPolls.length} نظرسنجی از متن شناسایی شد.\n\nنظرسنجی دیگری اضافه کنید یا "✅ ادامه" بزنید.`
        : `✅ ${parsed.flat().length} buttons saved!\n\n📊 ${existingPolls.length} poll(s) detected from text.\n\nAdd more or click "✅ Continue".`;
    } else {
      msg = lang === "fa"
        ? `✅ ${parsed.flat().length} دکمه ذخیره شد!\n\nآیا نظرسنجی اضافه کنید؟`
        : `✅ ${parsed.flat().length} buttons saved!\n\nAdd a poll?`;
    }
    
    await sendPlain(cfg, chatId, msg, askPollKeyboard(lang, existingPolls.length > 0));
    return true;
  }

  // ── Post: Poll choice (regular/quiz/none) ────────────────────────────
  if (state.action === "post_await_poll_choice") {
    // User sends text with poll data: "question | opt1 | opt2 | opt3"
    const isQuiz = state.pollType === "quiz";
    const parts = trimmed.split("|").map(s => s.trim()).filter(s => s.length > 0);

    if (parts.length < 3) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت نامعتبر. لطفاً به این صورت بفرستید:\n\nسوال | گزینه۱ | گزینه۲ | گزینه۳\n\nبرای کوییز، گزینه درست را با `!` مشخص کنید:\nسوال | گزینه۱ | !گزینه۲ درست | گزینه۳\n\nیا /cancel بزنید."
        : "⚠️ Invalid format. Send as:\n\nQuestion | Option1 | Option2 | Option3\n\nFor quiz, mark correct answer with `!`:\nQuestion | Wrong | !Correct | Wrong\n\nOr /cancel.");
      return true;
    }

    const question = parts[0];
    let options = parts.slice(1);
    let correctOptionId = -1;

    if (isQuiz) {
      options = options.map((opt, idx) => {
        if (opt.startsWith("!")) {
          correctOptionId = idx;
          return opt.slice(1).trim();
        }
        return opt;
      });
      if (correctOptionId === -1) {
        await sendPlain(cfg, chatId, lang === "fa"
          ? "⚠️ برای کوییز، گزینه درست را با `!` شروع کنید:\nسوال | اشتباه | !درست | اشتباه"
          : "⚠️ For quiz, mark correct answer with `!`:\nQuestion | Wrong | !Correct | Wrong");
        return true;
      }
    }

    if (options.length < 2 || options.length > 10) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ نظرسنجی باید ۲ تا ۱۰ گزینه داشته باشد."
        : "⚠️ Poll needs 2-10 options.");
      return true;
    }

    const poll = { question, options, type: isQuiz ? "quiz" : "regular", correctOptionId: correctOptionId >= 0 ? correctOptionId : null };
    const polls = [...(state.polls || []), poll];
    const newState = { ...state, action: "post_await_poll_choice", polls, pollType: null };
    await setState(env, userId, newState);
    
    const pollCount = polls.length;
    await sendPlain(cfg, chatId,
      lang === "fa"
        ? `✅ نظرسنجی ${pollCount} ذخیره شد!\n\n📊 ${pollCount} نظرسنجی آماده ارسال\n\nآیا نظرسنجی دیگری اضافه کنید؟`
        : `✅ Poll ${pollCount} saved!\n\n📊 ${pollCount} polls ready to send\n\nAdd another poll?`,
      askPollKeyboard(lang, true));
    return true;
  }

  // ── Standalone poll: awaiting poll text ────────────────────────────────
  if (state.action === "standalone_poll_await") {
    const parts = trimmed.split("|").map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length < 3) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت نامعتبر. به این صورت بفرستید:\n\n`سوال | گزینه۱ | گزینه۲ | گزینه۳`\n\nیا /cancel"
        : "⚠️ Invalid format. Send as:\n\n`Question | Option1 | Option2 | Option3`\n\nOr /cancel");
      return true;
    }
    const question = parts[0];
    const options = parts.slice(1);
    if (options.length < 2 || options.length > 10) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ نظرسنجی باید ۲ تا ۱۰ گزینه داشته باشد."
        : "⚠️ Poll needs 2-10 options.");
      return true;
    }
    const poll = { question, options, type: "regular", correctOptionId: null };
    const channels = await getChannels(env);
    if (channels.length === 0) {
      await setState(env, userId, null);
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ هیچ کانالی ثبت نشده. ابتدا از پنل ادمین کانال اضافه کنید."
        : "⚠️ No channels registered. Add one from admin panel first.");
      return true;
    }
    await setState(env, userId, { action: "standalone_poll_select", lang, poll, selected: [] });
    await sendPlain(cfg, chatId,
      lang === "fa"
        ? `📊 **${question}**\n${options.map((o,i) => `  ${i+1}. ${o}`).join("\n")}\n\n📡 کانال‌ها را انتخاب کنید:`
        : `📊 **${question}**\n${options.map((o,i) => `  ${i+1}. ${o}`).join("\n")}\n\n📡 Select channels:`,
      standalonePollChannelSelect(lang, channels, []));
    return true;
  }

  // ── Standalone poll: awaiting time input ───────────────────────────────
  if (state.action === "standalone_poll_await_time") {
    const sendAt = parseLocalTime(trimmed);
    if (!sendAt || isNaN(sendAt)) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت زمان نامعتبر.\n• `2024-12-25 14:30` (ساعت ایران)\n• `in 2h`\n• `in 30m`\n\nیا /cancel"
        : "⚠️ Invalid time.\n• `2024-12-25 14:30` (your local time)\n• `in 2h`\n• `in 30m`\n\nOr /cancel");
      return true;
    }
    if (sendAt < Date.now()) {
      await sendPlain(cfg, chatId, lang === "fa" ? "⚠️ زمان در گذشته است." : "⚠️ Time is in the past.");
      return true;
    }
    const post = {
      id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      prompt: state.poll.question,
      generatedText: "",
      channelIds: state.selected,
      sendAt,
      createdAt: Date.now(),
      sent: false,
      sentAt: null,
      sendResults: [],
      postState: { text: "", poll: state.poll },
    };
    await addScheduledPost(env, post);
    await setState(env, userId, null);
    const dateStr = new Date(sendAt + TIMEZONE_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16).replace("Z", "") + " (IR)";
    await sendPlain(cfg, chatId, (lang === "fa"
      ? `✅ نظرسنجی زمان‌بندی شد!\n📅 زمان: \`${dateStr}\`\n📡 کانال‌ها: ${state.selected.length}\n\n/list: /scheduled`
      : `✅ Poll scheduled!\n📅 Time: \`${dateStr}\`\n📡 Channels: ${state.selected.length}\n\nList: /scheduled`),
      mainKeyboard(lang, await isAdmin(env, userId, cfg), cfg));
    return true;
  }

  // ── Post schedule: awaiting time input ──────────────────────────────────
  if (state.action === "post_await_time" || state.action === "schedule_await_time_text") {
    const sendAt = parseLocalTime(trimmed);
    if (!sendAt || isNaN(sendAt)) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت زمان نامعتبر.\n\nفرمت‌ها:\n• `14:30`\n• `2026-06-26 14:30`\n• `in 2h`\n• `in 30m`\n\nبرای لغو /cancel"
        : "⚠️ Invalid time format.\n\nFormats:\n• `14:30`\n• `2026-06-26 14:30`\n• `in 2h`\n• `in 30m`\n\n/cancel to abort");
      return true;
    }

    if (sendAt < Date.now()) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ زمان در گذشته است. یک زمان آینده بفرستید یا /cancel"
        : "⚠️ Time is in the past. Send a future time or /cancel");
      return true;
    }

    const channels = await getChannels(env);
    const selected = state.selected || [];

    // Create scheduled post
    const post = {
      id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      prompt: state.text,
      generatedText: state.text,
      channelIds: selected,
      sendAt,
      createdAt: Date.now(),
      sent: false,
      sentAt: null,
      sendResults: [],
      postType: "post",
      postState: {
        text: state.text,
        isHtml: state.isHtml,
        buttons: state.buttons,
        polls: state.polls || [],
      },
    };
    await addScheduledPost(env, post);
    await setState(env, userId, null);

    const dateStr = new Date(sendAt + TIMEZONE_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16).replace("Z", "") + " (IR)";
    await sendPlain(cfg, chatId, (lang === "fa"
      ? `✅ پست زمان‌بندی شد!\n\n📅 زمان ارسال: \`${dateStr}\`\n📡 کانال‌ها: ${selected.length}\n🆔 شناسه: \`${post.id}\`\n\nبرای مشاهده لیست: /scheduled`
      : `✅ Post scheduled!\n\n📅 Send at: \`${dateStr}\`\n📡 Channels: ${selected.length}\n🆔 ID: \`${post.id}\`\n\nList: /scheduled`),
      mainKeyboard(lang, await isAdmin(env, userId, cfg), cfg));
    return true;
  }

  // ── AI chat mode: each message is a turn in the conversation ──────────────
  if (state.action === "ai_chat") {
    const messages = state.messages || [];
    messages.push({ role: "user", content: trimmed });

    await sendPlain(cfg, chatId, lang === "fa" ? "🤖 در حال فکر کردن..." : "🤖 Thinking...");
    const result = await callAi(env, messages);

    if (!result.ok) {
      await sendPlain(cfg, chatId, `❌ AI error: ${result.error}`);
      return true;
    }

    messages.push({ role: "assistant", content: result.text });
    // Keep only the last 10 turns (20 messages) to stay within KV value size.
    const trimmed_messages = messages.slice(-20);
    await setState(env, userId, { ...state, messages: trimmed_messages });

    // Render the AI response as rich markdown.
    const isHtml = result.text.startsWith("<") || /<\/?\w/.test(result.text);
    if (isHtml) await sendRichHtml(cfg, chatId, result.text);
    else await sendRichMarkdown(cfg, chatId, result.text);

    await sendPlain(cfg, chatId, lang === "fa"
      ? "💬 ادامه چت؟ پیام بعدی را بفرستید یا /cancel برای خروج."
      : "💬 Continue? Send next message or /cancel to exit.",
      cancelKeyboard(lang));
    return true;
  }

  // ── AI schedule: awaiting prompt ──────────────────────────────────────────
  if (state.action === "ai_await_prompt") {
    const prompt = trimmed;
    await sendPlain(cfg, chatId, lang === "fa" ? "🤖 در حال تولید محتوا با AI..." : "🤖 Generating content with AI...");
    const result = await callAi(env, [{ role: "user", content: prompt }]);
    if (!result.ok) {
      await sendPlain(cfg, chatId, `❌ AI error: ${result.error}`);
      return true;
    }

    const newState = {
      action: "ai_preview",
      lang,
      prompt,
      generatedText: result.text,
      scheduleMode: true,
    };
    await setState(env, userId, newState);

    // Show preview
    const isHtml = result.text.startsWith("<") || /<\/?\w/.test(result.text);
    if (isHtml) await sendRichHtml(cfg, chatId, result.text);
    else await sendRichMarkdown(cfg, chatId, result.text);

    await sendPlain(cfg, chatId, lang === "fa"
      ? "👆 پیش‌نمایش محتوای تولید‌شده. برای ادامه، کانال‌ها را انتخاب کنید."
      : "👆 Preview of AI-generated content. Select channels to continue.",
      aiPreviewKeyboard(lang));
    return true;
  }

  // ── AI edit mode: user sends edited text ──────────────────────────────────
  if (state.action === "ai_edit") {
    const newState = { ...state, action: "ai_preview", generatedText: trimmed };
    await setState(env, userId, newState);

    const isHtml = trimmed.startsWith("<") || /<\/?\w/.test(trimmed);
    if (isHtml) await sendRichHtml(cfg, chatId, trimmed);
    else await sendRichMarkdown(cfg, chatId, trimmed);

    await sendPlain(cfg, chatId, lang === "fa"
      ? "✅ متن ویرایش شد. حالا چه کار کنیم؟"
      : "✅ Text updated. What next?",
      aiPreviewKeyboard(lang));
    return true;
  }

  // ── AI schedule: awaiting time input ──────────────────────────────────────
  if (state.action === "ai_await_time") {
    const sendAt = parseLocalTime(trimmed);
    if (!sendAt || isNaN(sendAt)) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت زمان نامعتبر.\n• `2024-12-25 14:30` (ساعت ایران)\n• `in 2h`\n• `in 30m`\n\nبرای لغو /cancel"
        : "⚠️ Invalid time format. Use:\n• `2024-12-25 14:30` (your local time)\n• `in 2h`\n• `in 30m`\n\n/cancel to abort");
      return true;
    }

    if (sendAt < Date.now()) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ زمان در گذشته است. یک زمان آینده بفرستید یا /cancel"
        : "⚠️ Time is in the past. Send a future time or /cancel");
      return true;
    }

    // Create the scheduled post
    const post = {
      id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      prompt: state.prompt,
      generatedText: state.generatedText,
      channelIds: state.selectedChannels || [],
      sendAt,
      createdAt: Date.now(),
      sent: false,
      sentAt: null,
      sendResults: [],
    };
    await addScheduledPost(env, post);
    await setState(env, userId, null);

    const dateStr = new Date(sendAt + TIMEZONE_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16).replace("Z", "") + " (IR)";
    await sendPlain(cfg, chatId, (lang === "fa"
      ? `✅ زمان‌بندی ثبت شد!\n\n📅 زمان ارسال: \`${dateStr}\`\n📡 کانال‌ها: ${post.channelIds.length}\n🆔 شناسه: \`${post.id}\`\n\nبرای مشاهده لیست: /scheduled`
      : `✅ Scheduled!\n\n📅 Send at: \`${dateStr}\`\n📡 Channels: ${post.channelIds.length}\n🆔 ID: \`${post.id}\`\n\nList: /scheduled`),
      mainKeyboard(lang, await isAdmin(env, userId, cfg), cfg));
    return true;
  }

  // ── AI config await: "provider apiKey" or "provider apiKey baseUrl" ────────
  if (state.action === "ai_config_await") {
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت: `provider apiKey` یا `provider apiKey baseUrl`\n\nبرای لغو /cancel"
        : "⚠️ Format: `provider apiKey` or `provider apiKey baseUrl`\n\n/cancel to abort");
      return true;
    }
    const provider = parts[0].toLowerCase();
    if (!AI_PROVIDER_DEFAULTS[provider]) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? `⚠️ Provider نامعتبر. گزینه‌ها: ${Object.keys(AI_PROVIDER_DEFAULTS).join(" · ")}\n\nبرای لغو /cancel`
        : `⚠️ Invalid provider. Options: ${Object.keys(AI_PROVIDER_DEFAULTS).join(" · ")}\n\n/cancel to abort`);
      return true;
    }
    const apiKey = parts[1];
    const baseUrl = parts[2] || AI_PROVIDER_DEFAULTS[provider].baseUrl;
    const defaults = AI_PROVIDER_DEFAULTS[provider];
    const config = {
      provider,
      apiKey,
      baseUrl: baseUrl || defaults.baseUrl,
      model: defaults.model || "gpt-4o-mini",
      systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
    };
    // Preserve existing model + systemPrompt if the user already set them.
    const existing = await getAiConfig(env);
    if (existing.model && existing.model !== defaults.model) config.model = existing.model;
    if (existing.systemPrompt && existing.systemPrompt !== DEFAULT_AI_SYSTEM_PROMPT) config.systemPrompt = existing.systemPrompt;

    await setAiConfig(env, config);
    await setState(env, userId, null);
    await sendPlain(cfg, chatId, (lang === "fa"
      ? `✅ AI تنظیم شد!\n\n• Provider: \`${provider}\`\n• Model: \`${config.model}\`\n• Base URL: \`${config.baseUrl}\`\n\nحالا می‌تونی از /ai استفاده کنی.`
      : `✅ AI configured!\n\n• Provider: \`${provider}\`\n• Model: \`${config.model}\`\n• Base URL: \`${config.baseUrl}\`\n\nNow you can use /ai.`),
      mainKeyboard(lang, await isAdmin(env, userId, cfg), cfg));
    return true;
  }

  // ── AI model await ────────────────────────────────────────────────────────
  if (state.action === "ai_model_await") {
    const config = await getAiConfig(env);
    config.model = trimmed;
    await setAiConfig(env, config);
    await setState(env, userId, null);
    await sendPlain(cfg, chatId, `✅ Model set to: \`${trimmed}\``,
      mainKeyboard(lang, await isAdmin(env, userId, cfg), cfg));
    return true;
  }

  // ── AI system prompt await ────────────────────────────────────────────────
  if (state.action === "ai_system_await") {
    const config = await getAiConfig(env);
    config.systemPrompt = trimmed;
    await setAiConfig(env, config);
    await setState(env, userId, null);
    await sendPlain(cfg, chatId, lang === "fa" ? "✅ System prompt به‌روزرسانی شد." : "✅ System prompt updated.",
      mainKeyboard(lang, await isAdmin(env, userId, cfg), cfg));
    return true;
  }

  return false;
}

// ─── inline_keyboard ────────────────────────────
function parseButtonsInput(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;

  const rows = [];
  for (const line of lines) {
    const cells = line.split("|").map(c => c.trim()).filter(c => c.length > 0);
    const row = [];
    for (const cell of cells) {
      const sepIdx = cell.lastIndexOf(" - ");
      if (sepIdx === -1) return null;
      const label = cell.slice(0, sepIdx).trim();
      const url    = cell.slice(sepIdx + 3).trim();
      if (!label || !url) return null;
      if (!/^https?:\/\//i.test(url) && !/^tg:\/\//i.test(url)) return null;
      row.push({ text: label, url });
    }
    if (row.length === 0) return null;
    rows.push(row);
  }
  return rows;
}

/**
 * Parse embedded quizzes/polls from post text.
 * Lines with | separator are detected as polls/quizzes.
 * Lines with ! before an option become quizzes.
 * Skips Markdown table rows (lines starting/ending with |).
 * Returns { cleanText, polls }.
 */
function parseEmbeddedPolls(text) {
  const lines = text.split("\n");
  const cleanLines = [];
  const polls = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      cleanLines.push(line);
      continue;
    }
    
    // Skip Markdown table rows (start or end with |)
    if (trimmedLine.startsWith("|") || trimmedLine.endsWith("|")) {
      cleanLines.push(line);
      continue;
    }
    
    // Skip Markdown table separator lines (like |---|---|)
    if (/^\|[\s\-:|]+\|$/.test(trimmedLine)) {
      cleanLines.push(line);
      continue;
    }
    
    // Check if line looks like a poll/quiz: has | separator and at least 3 parts
    const parts = trimmedLine.split("|").map(s => s.trim()).filter(s => s.length > 0);
    
    if (parts.length >= 3) {
      // Check if any option has ! prefix (quiz)
      let hasCorrect = false;
      const options = parts.slice(1).map(opt => {
        if (opt.startsWith("!")) {
          hasCorrect = true;
          return opt.slice(1).trim();
        }
        return opt;
      });

      // If it looks like a poll/quiz (question | option1 | option2 ...)
      // and has reasonable option count (2-10)
      if (options.length >= 2 && options.length <= 10) {
        let correctOptionId = -1;
        if (hasCorrect) {
          parts.slice(1).forEach((opt, idx) => {
            if (opt.startsWith("!")) correctOptionId = idx;
          });
        }

        polls.push({
          question: parts[0],
          options: options,
          type: hasCorrect ? "quiz" : "regular",
          correctOptionId: correctOptionId >= 0 ? correctOptionId : null,
        });
        continue; // Don't add to clean text
      }
    }
    
    cleanLines.push(line);
  }

  return {
    cleanText: cleanLines.join("\n").trim(),
    polls: polls,
  };
}

// ─── Send a post preview with approve/edit/cancel buttons and options ────────
async function sendPostPreview(env, cfg, chatId, state) {
  const lang = state.lang || "fa";
  const replyMarkup = state.buttons ? { inline_keyboard: state.buttons } : undefined;
  const polls = state.polls || [];

  // STEP 1: Show text post FIRST (with buttons)
  if (state.text) {
    if (state.isHtml) await sendRichHtml(cfg, chatId, state.text, replyMarkup);
    else await sendRichMarkdown(cfg, chatId, state.text, replyMarkup);
  }

  // STEP 2: Show all polls preview SEPARATELY
  for (let i = 0; i < polls.length; i++) {
    const poll = polls[i];
    const pollType = poll.type === "quiz" ? (lang === "fa" ? "🎯 کوییز" : "🎯 Quiz") : (lang === "fa" ? "📊 نظرسنجی" : "📊 Poll");
    const optionsText = poll.options.map((opt, idx) => {
      const correct = poll.type === "quiz" && poll.correctOptionId === idx ? " ✅" : "";
      return `  ${idx + 1}. ${opt}${correct}`;
    }).join("\n");
    await sendPlain(cfg, chatId, `${pollType} ${i + 1}: **${poll.question}**\n\n${optionsText}`);
  }

  // Show summary and confirm button
  const summary = [];
  if (state.text) summary.push(lang === "fa" ? "📝 متن" : "📝 Text");
  if (state.buttons) summary.push(lang === "fa" ? "🔘 دکمه‌ها" : "🔘 Buttons");
  if (polls.length > 0) summary.push(`${lang === "fa" ? "📊 نظرسنجی" : "📊 Poll"} ×${polls.length}`);

  await sendPlain(cfg, chatId,
    (lang === "fa"
      ? "👆 پیش‌نمایش پست شما (" + summary.join(" + ") + ")\n\nتایید کنید تا کانال‌ها را انتخاب کنید."
      : "👆 Post preview (" + summary.join(" + ") + ")\n\nConfirm to select channels."),
    previewKeyboard(lang)
  );
}

// ─── Convert Telegram message entities back into Markdown/HTML source ─────────
function entitiesToMarkdown(text, entities) {
  if (!entities || !entities.length) return text;

  const items = entities.map((e, idx) => ({ e, idx, start: e.offset, end: e.offset + e.length }));

  function isTopLevel(item, pool) {
    return !pool.some(other => {
      if (other.idx === item.idx) return false;
      const strictlyLarger =
        other.start <= item.start && other.end >= item.end &&
        (other.start < item.start || other.end > item.end);
      const sameSpanOuter =
        other.start === item.start && other.end === item.end && other.idx < item.idx;
      return strictlyLarger || sameSpanOuter;
    });
  }

  function render(start, end, pool) {
    const inRange = pool.filter(it => it.start >= start && it.end <= end);
    const top = inRange.filter(it => isTopLevel(it, inRange)).sort((a, b) => a.start - b.start);

    let out = "";
    let pos = start;
    for (const item of top) {
      out += text.slice(pos, item.start);
      // Exclude this item itself to avoid infinite recursion on its own range
      const innerPool = pool.filter(p => p.idx !== item.idx);
      const inner = render(item.start, item.end, innerPool);
      out += wrapEntity(item.e, inner);
      pos = item.end;
    }
    out += text.slice(pos, end);
    return out;
  }

  return render(0, text.length, items);
}

function wrapEntity(e, content) {
  switch (e.type) {
    case "bold":          return `**${content}**`;
    case "italic":        return `*${content}*`;
    case "underline":     return `<u>${content}</u>`;
    case "strikethrough": return `~~${content}~~`;
    case "spoiler":       return `||${content}||`;
    case "code":          return `\`${content}\``;
    case "pre": {
      const lang = e.language || "";
      return "```" + lang + "\n" + content + "\n```";
    }
    case "text_link":
      return `[${content}](${e.url})`;
    case "text_mention":
      return e.user ? `[${content}](tg://user?id=${e.user.id})` : content;
    case "blockquote":
    case "expandable_blockquote":
      return content.split("\n").map(l => `>${l}`).join("\n");
    default:
      // mention, hashtag, cashtag, bot_command, url, email, phone_number, custom_emoji, etc.
      return content;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Callback handler
// ═══════════════════════════════════════════════════════════════════════════════
async function handleCallback(cb, env, cfg) {
  const chatId = cb.message.chat.id;
  const msgId  = cb.message.message_id;
  const userId = cb.from?.id;
  const data   = cb.data;

  await tg(cfg, "answerCallbackQuery", { callback_query_id: cb.id });

  // Parse lang prefix: "fa_help_md" → lang="fa", action="help_md"
  const lang   = data.startsWith("fa_") ? "fa" : "en";
  const action = data.slice(3); // remove "fa_" or "en_"

  const kb   = backKeyboard(lang);
  const admin = await isAdmin(env, userId, cfg);
  // Attach AI config status so aiMenuKeyboard can show the right button label.
  const aiConfig = await getAiConfig(env);
  const cfgWithAi = { ...cfg, _aiConfigured: !!aiConfig.apiKey };
  const main = mainKeyboard(lang, admin, cfgWithAi);

  // ── General menu  ────────────────────────────────────────────────────────
  if (action === "start" || action === "back") {
    await setState(env, userId, null);
    await editRichMarkdown(cfg, chatId, msgId, WELCOME[lang], main);
    return;
  } else if (action === "help_md") {
    await editRichMarkdown(cfg, chatId, msgId, HELP_MD[lang], kb);
    return;
  } else if (action === "help_html") {
    await editRichMarkdown(cfg, chatId, msgId, HELP_HTML[lang], kb);
    return;
  } else if (action === "help_media") {
    await editRichMarkdown(cfg, chatId, msgId, HELP_MEDIA[lang], kb);
    return;
  } else if (action === "demo") {
    await editRichMarkdown(cfg, chatId, msgId, DEMO[lang], kb);
    return;
  } else if (action === "about") {
    await editRichMarkdown(cfg, chatId, msgId, ABOUT[lang], kb);
    return;
  } else if (action === "cancel") {
    await setState(env, userId, null);
    const txt = lang === "fa" ? "❌ عملیات لغو شد." : "❌ Operation cancelled.";
    await editRichMarkdown(cfg, chatId, msgId, txt, main);
    return;
  } else if (action === "cancel_flow") {
    await setState(env, userId, null);
    const txt = lang === "fa" ? "❌ عملیات لغو شد." : "❌ Operation cancelled.";
    await sendPlain(cfg, chatId, txt, main);
    return;
  } else if (action === "noop") {
    return; // Do nothing (divider button)
  }

  // ── Calendar handlers ─────────────────────────────────────────────────
  if (action.startsWith("cal_yr_prev_") || action.startsWith("cal_yr_next_")) {
    const parts = action.split("_");
    const year = parseInt(parts[3]) + (action.startsWith("cal_yr_prev_") ? -1 : 1);
    const month = parseInt(parts[4]);
    await editKeyboardOnly(cfg, chatId, msgId, calendarKeyboard(year, month, lang));
    return;
  }

  if (action.startsWith("cal_prev_") || action.startsWith("cal_next_")) {
    const parts = action.split("_");
    const year = parseInt(parts[2]);
    const month = parseInt(parts[3]) + (action.startsWith("cal_prev_") ? -1 : 1);
    const adjustedDate = new Date(year, month, 1);
    await editKeyboardOnly(cfg, chatId, msgId, calendarKeyboard(adjustedDate.getFullYear(), adjustedDate.getMonth(), lang));
    return;
  }

  if (action.startsWith("cal_day_")) {
    const parts = action.split("_");
    const year = parseInt(parts[2]);
    const month = parseInt(parts[3]);
    const day = parseInt(parts[4]);
    const selectedDate = new Date(year, month, day);
    
    const state = await getState(env, userId);
    if (!state) return;
    
    // Store selected date and show time picker
    await setState(env, userId, { ...state, action: "schedule_pick_time", selectedDate: selectedDate.toISOString() });
    
    const dateStr = selectedDate.toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa"
        ? `📅 **${dateStr}** انتخاب شد!\n\n⏰ ساعت را انتخاب کنید:`
        : `📅 **${dateStr}** selected!\n\n⏰ Pick a time:`,
      timePickerKeyboard(lang));
    return;
  }

  // ── Time picker handlers ──────────────────────────────────────────────
  if (action === "time_back_cal") {
    const state = await getState(env, userId);
    if (!state) return;
    const now = new Date();
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa" ? "📅 **تاریخ ارسال را انتخاب کنید:**" : "📅 **Pick a send date:**",
      calendarKeyboard(now.getFullYear(), now.getMonth(), lang));
    return;
  }

  if (action === "time_custom") {
    const state = await getState(env, userId);
    if (!state) return;
    await setState(env, userId, { ...state, action: "schedule_await_time_text" });
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa"
        ? "⌨️ **ساعت را تایپ کنید:**\n\nفرمت: `14:30` یا `in 2h`"
        : "⌨️ **Type the time:**\n\nFormat: `14:30` or `in 2h`",
      cancelKeyboard(lang));
    return;
  }

  if (action.startsWith("time_quick_")) {
    const state = await getState(env, userId);
    if (!state) return;
    
    let sendAt;
    const now = Date.now();
    
    if (action === "time_quick_1h") sendAt = now + 3600000;
    else if (action === "time_quick_2h") sendAt = now + 7200000;
    else if (action === "time_quick_3h") sendAt = now + 10800000;
    else if (action === "time_quick_6h") sendAt = now + 21600000;
    else if (action === "time_quick_tomorrow_9") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      sendAt = tomorrow.getTime();
    }
    else if (action === "time_quick_tomorrow_18") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      sendAt = tomorrow.getTime();
    }
    
    if (sendAt && state.selectedChannels) {
      const post = {
        id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId,
        generatedText: state.text,
        channelIds: state.selectedChannels,
        sendAt,
        sent: false,
        postState: {
          text: state.text,
          isHtml: state.isHtml,
          buttons: state.buttons,
          polls: state.polls,
        },
      };
      await addScheduledPost(env, post);
      await setState(env, userId, null);
      
      const dateStr = new Date(sendAt).toLocaleString(lang === "fa" ? "fa-IR" : "en-US");
      await editRichMarkdown(cfg, chatId, msgId,
        lang === "fa"
          ? `✅ **زمان‌بندی شد!**\n\n📅 زمان ارسال: \`${dateStr}\`\n📡 کانال‌ها: ${state.selectedChannels.length}\n🆔 شناسه: \`${post.id}\``
          : `✅ **Scheduled!**\n\n📅 Send at: \`${dateStr}\`\n📡 Channels: ${state.selectedChannels.length}\n🆔 ID: \`${post.id}\``,
        main);
    }
    return;
  }

  if (action.startsWith("time_")) {
    const state = await getState(env, userId);
    if (!state) return;
    
    const parts = action.split("_");
    const hour = parseInt(parts[1]);
    const minute = parseInt(parts[2] || 0);
    
    let sendAt;
    if (state.selectedDate) {
      const date = new Date(state.selectedDate);
      // Convert to Iran date components, set time, convert back to UTC
      const iranMs = date.getTime() + TIMEZONE_OFFSET_MS;
      const iranDate = new Date(iranMs);
      const y = iranDate.getUTCFullYear();
      const m = iranDate.getUTCMonth();
      const d = iranDate.getUTCDate();
      sendAt = Date.UTC(y, m, d, hour, minute, 0, 0) - TIMEZONE_OFFSET_MS;
    } else {
      const now = new Date();
      const iranMs = now.getTime() + TIMEZONE_OFFSET_MS;
      const iranDate = new Date(iranMs);
      const y = iranDate.getUTCFullYear();
      const m = iranDate.getUTCMonth();
      const d = iranDate.getUTCDate();
      sendAt = Date.UTC(y, m, d, hour, minute, 0, 0) - TIMEZONE_OFFSET_MS;
      if (sendAt < Date.now()) sendAt += 86400000;
    }
    
    if (state.selectedChannels) {
      const post = {
        id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId,
        generatedText: state.text,
        channelIds: state.selectedChannels,
        sendAt,
        sent: false,
        postState: {
          text: state.text,
          isHtml: state.isHtml,
          buttons: state.buttons,
          polls: state.polls,
        },
      };
      await addScheduledPost(env, post);
      await setState(env, userId, null);
      
      const dateStr = new Date(sendAt).toLocaleString(lang === "fa" ? "fa-IR" : "en-US");
      await editRichMarkdown(cfg, chatId, msgId,
        lang === "fa"
          ? `✅ **زمان‌بندی شد!**\n\n📅 زمان ارسال: \`${dateStr}\`\n📡 کانال‌ها: ${state.selectedChannels.length}\n🆔 شناسه: \`${post.id}\``
          : `✅ **Scheduled!**\n\n📅 Send at: \`${dateStr}\`\n📡 Channels: ${state.selectedChannels.length}\n🆔 ID: \`${post.id}\``,
        main);
    }
    return;
  }

  // ── AI menu ──────────────────────────────────────────────────────────────
  if (action === "ai_menu") {
    await editRichMarkdown(cfg, chatId, msgId, AI_HELP[lang], aiMenuKeyboard(lang, cfgWithAi));
    return;
  }
  if (action === "ai_help") {
    await editRichMarkdown(cfg, chatId, msgId, AI_HELP[lang], aiMenuKeyboard(lang, cfgWithAi));
    return;
  }
  if (action === "ai_generate") {
    // Start stateful AI generation: ask for prompt
    await setState(env, userId, { action: "ai_await_prompt", lang });
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
      ? "✨ **تولید محتوا با AI**\n\nپرامپت خود را بفرستید (هر چیزی که می‌خواهید AI درباره آن بنویسه):\n\nبرای لغو /cancel"
      : "✨ **AI Content Generation**\n\nSend your prompt (what you want AI to write about):\n\n/cancel to abort",
      cancelKeyboard(lang));
    return;
  }
  if (action === "ai_schedule") {
    // Same as ai_generate but flagged for scheduling
    await setState(env, userId, { action: "ai_await_prompt", lang, scheduleMode: true });
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
      ? "⏰ **زمان‌بندی ارسال AI**\n\nپرامپت خود را بفرستید. AI محتوا تولید می‌کنه، شما کانال و زمان رو انتخاب می‌کنید.\n\nبرای لغو /cancel"
      : "⏰ **Schedule AI Post**\n\nSend your prompt. AI generates content, then you pick channels + time.\n\n/cancel to abort",
      cancelKeyboard(lang));
    return;
  }
  if (action === "ai_scheduled_list") {
    await showScheduledList(env, cfg, chatId, userId, msgId, lang);
    return;
  }
  if (action === "ai_config_menu") {
    if (!admin) {
      await editRichMarkdown(cfg, chatId, msgId, lang === "fa" ? "⛔️ فقط ادمین." : "⛔️ Admin only.", main);
      return;
    }
    await editRichMarkdown(cfg, chatId, msgId, AI_CONFIG_HELP[lang], aiConfigMenuKeyboard(lang));
    return;
  }
  if (action === "ai_cancel") {
    await setState(env, userId, null);
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
      ? "❌ عملیات لغو شد."
      : "❌ Operation cancelled.", main);
    return;
  }
  if (action === "ai_config_set") {
    await setState(env, userId, { action: "ai_config_await", lang });
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
      ? "🔑 **تنظیم Provider + API Key**\n\nبه این فرمت بفرستید:\n`openai sk-xxxxx`\n\nProviders: `openai` · `groq` · `together` · `openrouter` · `custom`\n\nبرای custom باید baseUrl هم بدید:\n`custom sk-xxx https://my-api.com/v1`\n\nبرای لغو /cancel"
      : "🔑 **Set Provider + API Key**\n\nSend in this format:\n`openai sk-xxxxx`\n\nProviders: `openai` · `groq` · `together` · `openrouter` · `custom`\n\nFor custom, also provide baseUrl:\n`custom sk-xxx https://my-api.com/v1`\n\n/cancel to abort",
      cancelKeyboard(lang));
    return;
  }
  if (action === "ai_model_set") {
    await setState(env, userId, { action: "ai_model_await", lang });
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
      ? "🤖 مدل جدید را بفرستید. مثال: `gpt-4o`\n\nبرای لغو /cancel"
      : "🤖 Send the new model name. Example: `gpt-4o`\n\n/cancel to abort",
      cancelKeyboard(lang));
    return;
  }
  if (action === "ai_system_set") {
    await setState(env, userId, { action: "ai_system_await", lang });
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
      ? "📝 System prompt جدید را بفرستید.\n\nبرای لغو /cancel"
      : "📝 Send the new system prompt.\n\n/cancel to abort",
      cancelKeyboard(lang));
    return;
  }
  if (action === "ai_config_show") {
    const c = await getAiConfig(env);
    const masked = c.apiKey ? c.apiKey.slice(0, 6) + "…" + c.apiKey.slice(-4) : "(not set)";
    await editRichMarkdown(cfg, chatId, msgId,
      `⚙️ **AI Config**\n\n• Provider: \`${c.provider}\`\n• Model: \`${c.model}\`\n• API Key: \`${masked}\`\n• Base URL: \`${c.baseUrl}\`\n• System Prompt:\n\`\`\`\n${c.systemPrompt}\n\`\`\``,
      aiConfigMenuKeyboard(lang));
    return;
  }
  // AI preview actions
  if (action === "ai_send_now") {
    const state = await getState(env, userId);
    if (!state || state.action !== "ai_preview") return;
    const channels = await getChannels(env);
    if (channels.length === 0) {
      await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
        ? "⚠️ هیچ کانالی ثبت نشده است."
        : "⚠️ No channels registered.",
        aiPreviewKeyboard(lang));
      return;
    }
    await setState(env, userId, { ...state, action: "ai_select_channels", mode: "ai_send", selected: [] });
    await sendPlain(cfg, chatId, lang === "fa" ? "📡 کانال‌ها را انتخاب کنید:" : "📡 Select channels:",
      aiChannelSelectKeyboard(lang, channels, [], "send_now"));
    return;
  }
  if (action === "ai_schedule_this") {
    const state = await getState(env, userId);
    if (!state || state.action !== "ai_preview") return;
    const channels = await getChannels(env);
    if (channels.length === 0) {
      await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
        ? "⚠️ هیچ کانالی ثبت نشده است."
        : "⚠️ No channels registered.",
        aiPreviewKeyboard(lang));
      return;
    }
    await setState(env, userId, { ...state, action: "ai_select_channels", mode: "ai_schedule", selected: [] });
    await sendPlain(cfg, chatId, lang === "fa" ? "📡 کانال‌ها را انتخاب کنید:" : "📡 Select channels:",
      aiChannelSelectKeyboard(lang, channels, [], "schedule"));
    return;
  }
  if (action === "ai_regenerate") {
    const state = await getState(env, userId);
    if (!state || state.action !== "ai_preview") return;
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa" ? "🤖 تولید مجدد..." : "🤖 Regenerating...");
    const result = await callAi(env, [{ role: "user", content: state.prompt }]);
    if (!result.ok) {
      await sendPlain(cfg, chatId, `❌ AI error: ${result.error}`);
      return;
    }
    await setState(env, userId, { ...state, generatedText: result.text });
    const isHtml = result.text.startsWith("<") || /<\/?\w/.test(result.text);
    if (isHtml) await sendRichHtml(cfg, chatId, result.text);
    else await sendRichMarkdown(cfg, chatId, result.text);
    await sendPlain(cfg, chatId, lang === "fa" ? "👆 محتوای جدید. چه کار کنیم؟" : "👆 New content. What next?", aiPreviewKeyboard(lang));
    return;
  }
  if (action === "ai_edit") {
    const state = await getState(env, userId);
    if (!state || state.action !== "ai_preview") return;
    await setState(env, userId, { ...state, action: "ai_edit" });
    await editRichMarkdown(cfg, chatId, msgId, lang === "fa"
      ? "✏️ متن ویرایش‌شده را بفرستید:\n\nبرای لغو /cancel"
      : "✏️ Send the edited text:\n\n/cancel to abort",
      cancelKeyboard(lang));
    return;
  }
  // AI channel selection (tick/untick) — handles both send_now and schedule modes
  if (action.startsWith("ai_send_now_ch_") || action.startsWith("ai_schedule_ch_")) {
    const isSchedule = action.startsWith("ai_schedule_ch_");
    const chId = action.slice(isSchedule ? "ai_schedule_ch_".length : "ai_send_now_ch_".length);
    const state = await getState(env, userId);
    if (!state || state.action !== "ai_select_channels") return;
    let selected = state.selected || [];
    if (selected.includes(chId)) selected = selected.filter(c => c !== chId);
    else selected = [...selected, chId];
    await setState(env, userId, { ...state, selected });
    const channels = await getChannels(env);
    const mode = state.mode === "ai_schedule" ? "schedule" : "send_now";
    await editKeyboardOnly(cfg, chatId, msgId, aiChannelSelectKeyboard(lang, channels, selected, mode));
    return;
  }
  // AI channel selection confirmed
  if (action === "ai_send_now_confirm" || action === "ai_schedule_confirm") {
    const state = await getState(env, userId);
    if (!state || state.action !== "ai_select_channels") return;
    const selected = state.selected || [];
    if (selected.length === 0) {
      await tg(cfg, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: lang === "fa" ? "⚠️ حداقل یک کانال" : "⚠️ Select at least one",
        show_alert: true,
      });
      return;
    }

    // If schedule mode → ask for time
    if (state.mode === "ai_schedule") {
      await setState(env, userId, {
        action: "ai_await_time",
        lang,
        prompt: state.prompt,
        generatedText: state.generatedText,
        selectedChannels: selected,
      });
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⏰ زمان ارسال را بفرستید:\n• `2024-12-25 14:30` (ساعت ایران)\n• `in 2h`\n• `in 30m`\n\nبرای لغو /cancel"
        : "⏰ Send the time:\n• `2024-12-25 14:30` (your local time)\n• `in 2h`\n• `in 30m`\n\n/cancel to abort",
        cancelKeyboard(lang));
      return;
    }

    // Send mode → send immediately
    const channels = await getChannels(env);
    const results = [];
    for (const chId of selected) {
      const ch = channels.find(c => String(c.id) === String(chId));
      if (!ch) continue;
      const isHtml = state.generatedText.startsWith("<") || /<\/?\w/.test(state.generatedText);
      const res = isHtml
        ? await sendRichHtmlResult(cfg, ch.id, state.generatedText)
        : await sendRichMarkdownResult(cfg, ch.id, state.generatedText);
      results.push({ title: ch.title, ok: res?.ok });
    }
    await setState(env, userId, null);
    const lines = results.map(r =>
      r.ok
        ? (lang === "fa" ? `✅ **${r.title}**` : `✅ **${r.title}**`)
        : (lang === "fa" ? `❌ **${r.title}**` : `❌ **${r.title}**`)
    );
    await sendRichMarkdown(cfg, chatId, (lang === "fa" ? "📤 **نتیجه ارسال:**\n\n" : "📤 **Send result:**\n\n") + lines.join("\n"), main);
    return;
  }
  // Cancel a scheduled post
  if (action.startsWith("ai_cancel_scheduled_")) {
    const id = action.slice("ai_cancel_scheduled_".length);
    const ok = await removeScheduledPost(env, id);
    await tg(cfg, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: ok ? "✅ Cancelled" : "⚠️ Not found",
      show_alert: true,
    });
    await showScheduledList(env, cfg, chatId, userId, msgId, lang);
    return;
  }

  // ── Tools menu ───────────────────────────────────────────────────────────
  if (action === "tools_menu") {
    await editRichMarkdown(cfg, chatId, msgId, TOOLS_HELP[lang], toolsMenuKeyboard(lang));
    return;
  }
  if (action === "dl_help") {
    await editRichMarkdown(cfg, chatId, msgId, DOWNLOAD_HELP[lang], toolsMenuKeyboard(lang));
    return;
  }

  // ── Poll menu ────────────────────────────────────────────────────────────
  if (action === "poll_menu") {
    await editRichMarkdown(cfg, chatId, msgId, POLL_HELP[lang], pollMenuKeyboard(lang));
    return;
  }
  if (action === "poll_help") {
    await editRichMarkdown(cfg, chatId, msgId, POLL_HELP[lang], pollMenuKeyboard(lang));
    return;
  }
  if (action === "pollstats" || action === "poll_list") {
    await showPollStats(env, cfg, chatId, userId, msgId, lang);
    return;
  }

  // ── Analytics menu ───────────────────────────────────────────────────────
  if (action === "stats_menu") {
    await showChannelStats(env, cfg, chatId, userId, msgId, lang);
    return;
  }

  if (!admin) {
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa" ? "⛔️ شما دسترسی ادمین ندارید." : "⛔️ You don't have admin access.",
      main);
    return;
  }

  // ── Main admin panel ───────────────────────────────────────────────────
  if (action === "admin_panel") {
    await setState(env, userId, null);
    const txt = lang === "fa" ? ADMIN_PANEL_TEXT.fa : ADMIN_PANEL_TEXT.en;
    await editRichMarkdown(cfg, chatId, msgId, txt, adminPanelKeyboard(lang));
    return;
  }

  // ── Admin management──────────────────────────────────────────────────
  if (action === "admins_menu") {
    const admins = await getAdmins(env, cfg);
    const txt = (lang === "fa"
      ? `👤 **مدیریت ادمین‌ها**\n\nتعداد ادمین‌های فعلی: ${admins.length}\n\nاز دکمه‌های زیر استفاده کنید 👇`
      : `👤 **Manage Admins**\n\nCurrent admin count: ${admins.length}\n\nUse the buttons below 👇`);
    await editRichMarkdown(cfg, chatId, msgId, txt, adminsMenuKeyboard(lang));
    return;
  }

  // Handle both "add_admin" and "admin_add" for compatibility
  if (action === "add_admin" || action === "admin_add") {
    await setState(env, userId, { action: "admin_add", lang });
    const txt = lang === "fa"
      ? "➕ **افزودن ادمین**\n\nآیدی عددی تلگرام کاربر مورد نظر را ارسال کنید.\nبرای گرفتن آیدی عددی می‌توانید از بات‌هایی مثل @userinfobot استفاده کنید.\n\nبرای لغو /cancel را ارسال کنید."
      : "➕ **Add Admin**\n\nSend the numeric Telegram user ID of the user.\nYou can use bots like @userinfobot to get a user's numeric ID.\n\nSend /cancel to abort.";
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  // Handle both "remove_admin" and "admin_remove" for compatibility
  if (action === "remove_admin" || action === "admin_remove") {
    await setState(env, userId, { action: "admin_remove", lang });
    const admins = await getAdmins(env, cfg);
    const txt = (lang === "fa"
      ? `➖ **حذف ادمین**\n\nآیدی عددی ادمینی که می‌خواهید حذف کنید را ارسال کنید.\n(مالک اصلی \`${cfg.ownerId}\` قابل حذف نیست.)\n\nلیست فعلی: `
      : `➖ **Remove Admin**\n\nSend the numeric ID of the admin to remove.\n(Owner \`${cfg.ownerId}\` cannot be removed.)\n\nCurrent list: `) + admins.map(a => `\`${a}\``).join(", ") + (lang === "fa" ? "\n\nبرای لغو /cancel را ارسال کنید." : "\n\nSend /cancel to abort.");
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  // Handle both "list_admins" and "admin_list" for compatibility
  if (action === "list_admins" || action === "admin_list") {
    const admins = await getAdmins(env, cfg);
    const txt = (lang === "fa"
      ? `📋 **لیست ادمین‌ها** (${admins.length})\n\n`
      : `📋 **Admin List** (${admins.length})\n\n`) +
      admins.map(a => `• \`${a}\`${a === cfg.ownerId ? (lang === "fa" ? " (مالک)" : " (owner)") : ""}`).join("\n");
    await editRichMarkdown(cfg, chatId, msgId, txt, adminsMenuKeyboard(lang));
    return;
  }

  // ── Channel management──────────────────────────────────────────────────
  if (action === "channels_menu") {
    const channels = await getChannels(env);
    const txt = (lang === "fa"
      ? `📡 **مدیریت کانال‌ها**\n\nتعداد کانال‌های ثبت‌شده: ${channels.length}\n\nاز دکمه‌های زیر استفاده کنید 👇`
      : `📡 **Manage Channels**\n\nRegistered channels: ${channels.length}\n\nUse the buttons below 👇`);
    await editRichMarkdown(cfg, chatId, msgId, txt, channelsMenuKeyboard(lang));
    return;
  }

  // Handle both "add_channel" and "channel_add" for compatibility
  if (action === "add_channel" || action === "channel_add") {
    await setState(env, userId, { action: "channel_add", lang });
    const txt = lang === "fa"
      ? "➕ **افزودن کانال**\n\n1. ربات را به کانال مورد نظر اضافه کنید.\n2. ربات را **ادمین کانال** کنید (با دسترسی ارسال پیام).\n3. آیدی عددی کانال (مثل `-1001234567890`) یا یوزرنیم آن (مثل `@mychannel`) را اینجا ارسال کنید.\n\nبرای لغو /cancel را ارسال کنید."
      : "➕ **Add Channel**\n\n1. Add the bot to the channel.\n2. Make the bot a **channel admin** (with post permission).\n3. Send the channel's numeric ID (e.g. `-1001234567890`) or username (e.g. `@mychannel`) here.\n\nSend /cancel to abort.";
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  // Handle both "remove_channel" and "channel_remove" for compatibility
  if (action === "remove_channel" || action === "channel_remove") {
    const channels = await getChannels(env);
    if (channels.length === 0) {
      const txt = lang === "fa" ? "ℹ️ هیچ کانالی ثبت نشده است." : "ℹ️ No channels registered.";
      await editRichMarkdown(cfg, chatId, msgId, txt, channelsMenuKeyboard(lang));
      return;
    }
    await setState(env, userId, { action: "channel_remove", lang });
    const txt = (lang === "fa"
      ? "➖ **حذف کانال**\n\nآیدی عددی یا یوزرنیم کانالی که می‌خواهید حذف کنید را ارسال کنید.\n\nلیست فعلی:\n"
      : "➖ **Remove Channel**\n\nSend the numeric ID or username of the channel to remove.\n\nCurrent list:\n") +
      channels.map(c => `• **${c.title}** — \`${c.id}\``).join("\n") +
      (lang === "fa" ? "\n\nبرای لغو /cancel را ارسال کنید." : "\n\nSend /cancel to abort.");
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  // Handle both "list_channels" and "channel_list" for compatibility
  if (action === "list_channels" || action === "channel_list") {
    const channels = await getChannels(env);
    const txt = channels.length === 0
      ? (lang === "fa" ? "ℹ️ هیچ کانالی ثبت نشده است." : "ℹ️ No channels registered.")
      : (lang === "fa" ? `📋 **لیست کانال‌ها** (${channels.length})\n\n` : `📋 **Channel List** (${channels.length})\n\n`) +
        channels.map(c => `• **${c.title}** — \`${c.id}\``).join("\n");
    await editRichMarkdown(cfg, chatId, msgId, txt, channelsMenuKeyboard(lang));
    return;
  }

  // ── Standalone poll channel selection ─────────────────────────────────
  if (action.startsWith("standalone_poll_ch_")) {
    const chId = action.slice("standalone_poll_ch_".length);
    const state = await getState(env, userId);
    if (!state || state.action !== "standalone_poll_select") return;
    let selected = state.selected || [];
    if (selected.includes(chId)) selected = selected.filter(c => c !== chId);
    else selected = [...selected, chId];
    await setState(env, userId, { ...state, selected });
    const channels = await getChannels(env);
    await editKeyboardOnly(cfg, chatId, msgId, standalonePollChannelSelect(lang, channels, selected));
    return;
  }

  if (action === "standalone_poll_confirm") {
    const state = await getState(env, userId);
    if (!state || state.action !== "standalone_poll_select") return;
    const selected = state.selected || [];
    if (selected.length === 0) {
      await tg(cfg, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: lang === "fa" ? "⚠️ حداقل یک کانال" : "⚠️ Select at least one",
        show_alert: true,
      });
      return;
    }
    // Send poll immediately to selected channels
    const channels = await getChannels(env);
    const results = [];
    for (const chId of selected) {
      const ch = channels.find(c => String(c.id) === String(chId));
      if (!ch) continue;
      const pollBody = {
        chat_id: ch.id,
        question: state.poll.question,
        options: state.poll.options,
        is_anonymous: true,
      };
      const res = await tg(cfg, "sendPoll", pollBody);
      results.push({ title: ch.title, ok: res?.ok });
      if (res?.ok) {
        const pollRecord = {
          id: `poll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          pollId: res.result.poll.id,
          question: state.poll.question,
          options: state.poll.options,
          chatId: ch.id,
          messageId: res.result.message_id,
          type: "regular",
          createdAt: Date.now(),
        };
        await addPoll(env, pollRecord);
      }
    }
    await setState(env, userId, null);
    const lines = results.map(r => r.ok
      ? (lang === "fa" ? `✅ **${r.title}**` : `✅ **${r.title}**`)
      : (lang === "fa" ? `❌ **${r.title}**` : `❌ **${r.title}**`));
    await sendRichMarkdown(cfg, chatId,
      (lang === "fa" ? "📤 **نتیجه:**\n\n" : "📤 **Result:**\n\n") + lines.join("\n"),
      mainKeyboard(lang, await isAdmin(env, userId, cfg), cfg));
    return;
  }

  if (action === "standalone_poll_schedule") {
    const state = await getState(env, userId);
    if (!state || state.action !== "standalone_poll_select") return;
    const selected = state.selected || [];
    if (selected.length === 0) {
      await tg(cfg, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: lang === "fa" ? "⚠️ حداقل یک کانال" : "⚠️ Select at least one",
        show_alert: true,
      });
      return;
    }
    await setState(env, userId, { ...state, action: "standalone_poll_await_time" });
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa"
        ? "⏰ زمان ارسال:\n• `2024-12-25 14:30` (ساعت ایران)\n• `in 2h`\n• `in 30m`\n\nیا /cancel"
        : "⏰ Schedule time:\n• `2024-12-25 14:30` (your local time)\n• `in 2h`\n• `in 30m`\n\nOr /cancel",
      cancelKeyboard(lang));
    return;
  }

  // ── Post creation ─────────────────────────────────────────────────────────
  if (action === "newpost") {
    await setState(env, userId, { action: "post_await_text", lang });
    const txt = lang === "fa"
      ? "📝 **ساخت پست**\n\nمتن پست خود را ارسال کنید (Markdown یا HTML پشتیبانی می‌شود).\n\nبرای لغو /cancel را ارسال کنید."
      : "📝 **New Post**\n\nSend the text of your post (Markdown or HTML supported).\n\nSend /cancel to abort.";
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  if (action === "post_btn_yes") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_buttons_choice") return;
    
    // Check if user has saved buttons from before
    const savedButtons = await cachedGet(env, `buttons_${userId}`, "json", 3600000);
    
    let msg;
    let keyboard;
    
    if (savedButtons && savedButtons.length > 0) {
      const lastBtnPreview = savedButtons.flat().slice(0, 3).map(b => b.text).join(", ");
      msg = lang === "fa"
        ? `⛓ **افزودن دکمه به پست**\n\nفرمت:\n\`Button💠 - https://link.com\`\n\`Button🩵 - http://a.ai | Button💙 - http://b.ai\`\n\n— هر خط = یک ردیف دکمه\n— با \`|\` چند دکمه در یک ردیف\n\n🔹 **دکمه‌های ذخیره‌شده:** ${lastBtnPreview}...\n\nیا دکمه جدید بفرستید.`
        : `⛓ **Add Buttons**\n\nFormat:\n\`Button💠 - https://link.com\`\n\`Button🩵 - http://a.ai | Button💙 - http://b.ai\`\n\n— each line = one button row\n— use \`|\` for multiple buttons in a row\n\n🔹 **Saved buttons:** ${lastBtnPreview}...\n\nOr send new buttons.`;
      
      keyboard = {
        inline_keyboard: [
          [{ text: lang === "fa" ? "🔹 استفاده از دکمه‌های قبلی" : "🔹 Use saved buttons", callback_data: `${lang}_use_saved_buttons` }],
          [{ text: lang === "fa" ? "❌ لغو" : "❌ Cancel", callback_data: "fa_cancel_flow" }],
        ],
      };
    } else {
      msg = lang === "fa"
        ? `⛓ **افزودن دکمه به پست**\n\nفرمت:\n\`Button💠 - https://link.com\`\n\`Button🩵 - http://a.ai | Button💙 - http://b.ai\`\n\n— هر خط = یک ردیف دکمه\n— با \`|\` چند دکمه در یک ردیف\n\nبرای لغو /cancel`
        : `⛓ **Add Buttons**\n\nFormat:\n\`Button💠 - https://link.com\`\n\`Button🩵 - http://a.ai | Button💙 - http://b.ai\`\n\n— each line = one button row\n— use \`|\` for multiple buttons in a row\n\n/cancel to abort`;
      keyboard = cancelKeyboard(lang);
    }
    
    await setState(env, userId, { ...state, action: "post_await_buttons_text" });
    await editRichMarkdown(cfg, chatId, msgId, msg, keyboard);
    return;
  }

  if (action === "use_saved_buttons") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_buttons_text") return;
    
    const savedButtons = await cachedGet(env, `buttons_${userId}`, "json", 3600000);
    if (!savedButtons || savedButtons.length === 0) {
      await sendPlain(cfg, chatId, lang === "fa" ? "⚠️ دکمه‌ای ذخیره نشده." : "⚠️ No saved buttons.");
      return;
    }
    
    // Save these buttons for reuse
    const newState = { ...state, action: "post_await_poll_choice", buttons: savedButtons, polls: state.polls || [] };
    await setState(env, userId, newState);
    
    const existingPolls = state.polls || [];
    let msg;
    if (existingPolls.length > 0) {
      msg = lang === "fa"
        ? `✅ دکمه‌های قبلی اعمال شد!\n\n📊 ${existingPolls.length} نظرسنجی از متن شناسایی شد.\n\nنظرسنجی دیگری اضافه کنید یا "✅ ادامه" بزنید.`
        : `✅ Previous buttons applied!\n\n📊 ${existingPolls.length} poll(s) detected from text.\n\nAdd more or click "✅ Continue".`;
    } else {
      msg = lang === "fa"
        ? "✅ دکمه‌های قبلی اعمال شد!\n\nآیا نظرسنجی اضافه کنید؟"
        : "✅ Previous buttons applied!\n\nAdd a poll?";
    }
    
    await editRichMarkdown(cfg, chatId, msgId, msg, askPollKeyboard(lang, existingPolls.length > 0));
    return;
  }

  if (action === "post_btn_no") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_buttons_choice") return;
    // Keep existing polls (from auto-detect) and ask about adding more
    const existingPolls = state.polls || [];
    await setState(env, userId, { ...state, action: "post_await_poll_choice", buttons: null, polls: existingPolls });
    
    let msg;
    if (existingPolls.length > 0) {
      msg = lang === "fa"
        ? `📊 ${existingPolls.length} نظرسنجی از متن شناسایی شد!\n\nنظرسنجی دیگری اضافه کنید یا "✅ ادامه" بزنید.`
        : `📊 ${existingPolls.length} poll(s) detected from text!\n\nAdd more or click "✅ Continue".`;
    } else {
      msg = lang === "fa"
        ? "آیا می‌خواهید **نظرسنجی** یا **کوییز** به پست اضافه کنید؟\n\nمی‌توانید چندین نظرسنجی اضافه کنید!"
        : "Would you like to add a **poll** or **quiz** to this post?\n\nYou can add multiple polls!";
    }
    
    await editRichMarkdown(cfg, chatId, msgId, msg, askPollKeyboard(lang, existingPolls.length > 0));
    return;
  }

  if (action === "post_poll_regular") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_poll_choice") return;
    await setState(env, userId, { ...state, pollType: "regular" });
    const pollCount = (state.polls || []).length;
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa"
        ? `📊 **نظرسنجی ${pollCount + 1}**\n\nسوال و گزینه‌ها را به این فرمت بفرستید:\n\n\`سوال | گزینه۱ | گزینه۲ | گزینه۳\`\n\nمثال:\n\`بهترین زبان؟ | Python | JavaScript | Rust | Go\`\n\nبرای لغو /cancel`
        : `📊 **Poll ${pollCount + 1}**\n\nSend question and options in this format:\n\n\`Question | Option1 | Option2 | Option3\`\n\nExample:\n\`Best language? | Python | JavaScript | Rust | Go\`\n\n/cancel to abort`,
      cancelKeyboard(lang));
    return;
  }

  if (action === "post_poll_quiz") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_poll_choice") return;
    await setState(env, userId, { ...state, pollType: "quiz" });
    const pollCount = (state.polls || []).length;
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa"
        ? `🎯 **کوییز ${pollCount + 1}**\n\nسوال و گزینه‌ها را بفرستید. گزینه درست را با \`!\` مشخص کنید:\n\n\`سوال | اشتباه | !درست | اشتباه\`\n\nمثال:\n\`پایتخت فرانسه؟ | لندن | !پاریس | برلین\`\n\nبرای لغو /cancel`
        : `🎯 **Quiz ${pollCount + 1}**\n\nSend question and options. Mark the correct answer with \`!\`:\n\n\`Question | Wrong | !Correct | Wrong\`\n\nExample:\n\`Capital of France? | London | !Paris | Berlin\`\n\n/cancel to abort`,
      cancelKeyboard(lang));
    return;
  }

  if (action === "post_poll_no") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_poll_choice") return;
    const newState = { ...state, action: "post_preview", polls: state.polls || [] };
    await setState(env, userId, newState);
    await sendPostPreview(env, cfg, chatId, newState);
    return;
  }

  if (action === "post_poll_done") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_poll_choice") return;
    const newState = { ...state, action: "post_preview", polls: state.polls || [] };
    await setState(env, userId, newState);
    await sendPostPreview(env, cfg, chatId, newState);
    return;
  }

  // ── Standalone poll creation ────────────────────────────────────────────
  if (action === "standalone_poll_start") {
    await setState(env, userId, { action: "standalone_poll_await", lang });
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa"
        ? "📊 **ساخت نظرسنجی**\n\nسوال و گزینه‌ها را به این فرمت بفرستید:\n\n`سوال | گزینه۱ | گزینه۲ | گزینه۳`\n\nمثال:\n`بهترین زبان؟ | Python | JavaScript | Rust | Go`\n\nبرای لغو /cancel"
        : "📊 **Create Poll**\n\nSend question and options:\n\n`Question | Option1 | Option2 | Option3`\n\nExample:\n`Best language? | Python | JavaScript | Rust | Go`\n\n/cancel to abort",
      cancelKeyboard(lang));
    return;
  }

  if (action === "post_edit_text") {
    const state = await getState(env, userId);
    if (!state) return;
    await setState(env, userId, { lang, action: "post_await_text" });
    const txt = lang === "fa"
      ? "📝 متن جدید پست را ارسال کنید.\n\nبرای لغو /cancel را ارسال کنید."
      : "📝 Send the new post text.\n\nSend /cancel to abort.";
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  if (action === "post_edit_btns") {
    const state = await getState(env, userId);
    if (!state) return;
    await setState(env, userId, { ...state, action: "post_await_buttons_text" });
    const txt = lang === "fa"
      ? `⛓ دکمه‌های جدید را به فرمت زیر ارسال کنید:\n\nButton💠 - https://link.com\n\nButton🩵 - http://a.ai | Button💙 - http://b.ai\n\nButton🟣 - http://d.ai | Button🟠 - http://c.ai | Button💚 - http://e.ai\n\nبرای لغو /cancel را ارسال کنید.`
      : `⛓ Send the new buttons in the following format:\n\nButton💠 - https://link.com\n\nButton🩵 - http://a.ai | Button💙 - http://b.ai\n\nButton🟣 - http://d.ai | Button🟠 - http://c.ai | Button💚 - http://e.ai\n\nSend /cancel to abort.`;
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  if (action === "post_confirm") {
    const state = await getState(env, userId);
    if (!state) return;
    const channels = await getChannels(env);
    if (channels.length === 0) {
      await setState(env, userId, null);
      const txt = lang === "fa"
        ? "⚠️ هیچ کانالی ثبت نشده است. ابتدا از پنل ادمین یک کانال اضافه کنید."
        : "⚠️ No channels registered. Add a channel from the admin panel first.";
      await editRichMarkdown(cfg, chatId, msgId, txt, adminPanelKeyboard(lang));
      return;
    }
    const newState = { ...state, action: "post_select_channels", selected: [] };
    await setState(env, userId, newState);
    const txt = lang === "fa"
      ? "📡 کانال(های) مورد نظر برای ارسال این پست را انتخاب کنید:"
      : "📡 Select the channel(s) to send this post to:";
    await sendPlain(cfg, chatId, txt, channelSelectKeyboard(lang, channels, []));
    return;
  }

  if (action === "post_confirm_back") {
    const state = await getState(env, userId);
    if (!state) return;
    // Go back to post preview
    await setState(env, userId, { ...state, action: "post_preview" });
    await sendPostPreview(env, cfg, chatId, { ...state, action: "post_preview" });
    return;
  }

  // ── Channel selection (tick/untick) ────────────────────────────────
  if (action.startsWith("post_ch_")) {
    const chId = action.slice("post_ch_".length);
    const state = await getState(env, userId);
    if (!state || state.action !== "post_select_channels") return;
    let selected = state.selected || [];
    if (selected.includes(chId)) selected = selected.filter(c => c !== chId);
    else selected = [...selected, chId];
    const newState = { ...state, selected };
    await setState(env, userId, newState);
    const channels = await getChannels(env);
    await editKeyboardOnly(cfg, chatId, msgId, channelSelectKeyboard(lang, channels, selected));
    return;
  }

  // ── Final posting to selected channels ─────────────────────────────
  if (action === "post_send") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_select_channels") return;
    const selected = state.selected || [];
    if (selected.length === 0) {
      await tg(cfg, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: lang === "fa" ? "⚠️ حداقل یک کانال انتخاب کنید." : "⚠️ Select at least one channel.",
        show_alert: true,
      });
      return;
    }

    const channels = await getChannels(env);
    const replyMarkup = state.buttons ? { inline_keyboard: state.buttons } : undefined;
    const polls = state.polls || [];

    const results = [];
    for (const chId of selected) {
      const ch = channels.find(c => String(c.id) === String(chId));
      if (!ch) continue;

      // STEP 1: Send text post FIRST (with buttons if they exist)
      let textSent = false;
      if (state.text) {
        let res;
        if (state.isHtml) res = await sendRichHtmlResult(cfg, ch.id, state.text, replyMarkup);
        else res = await sendRichMarkdownResult(cfg, ch.id, state.text, replyMarkup);
        textSent = res?.ok;
        results.push({ title: ch.title, ok: res?.ok, textSent: res?.ok });
      }

      // STEP 2: Send ALL polls SEPARATELY (no buttons - polls don't support inline keyboards)
      let pollSentCount = 0;
      for (const poll of polls) {
        const pollBody = {
          chat_id: ch.id,
          question: poll.question,
          options: poll.options,
          is_anonymous: poll.anonymous !== false,
        };
        if (poll.type === "quiz") {
          pollBody.type = "quiz";
          pollBody.correct_option_id = poll.correctOptionId;
        }

        const pollRes = await tg(cfg, "sendPoll", pollBody);
        if (pollRes.ok) {
          const pollRecord = {
            id: `poll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            pollId: pollRes.result.poll.id,
            question: poll.question,
            options: poll.options,
            chatId: ch.id,
            messageId: pollRes.result.message_id,
            type: poll.type,
            anonymous: poll.anonymous !== false,
            correctOptionId: poll.correctOptionId,
            createdAt: Date.now(),
          };
          await addPoll(env, pollRecord);
          pollSentCount++;
        } else {
          // sendPoll failed, send as text
          const optionsText = poll.options.map((opt, i) => `  ${i + 1}. ${opt}`).join("\n");
          const pollText = `📊 ${poll.question}\n\n${optionsText}`;
          if (state.isHtml) await sendRichHtmlResult(cfg, ch.id, pollText);
          else await sendRichMarkdownResult(cfg, ch.id, pollText);
        }
      }
      
      if (polls.length > 0) {
        results.push({ title: ch.title, ok: pollSentCount === polls.length, pollSent: pollSentCount, pollTotal: polls.length });
      }
    }

    await setState(env, userId, null);

    const lines = results.map(r => {
      let line = r.ok
        ? (lang === "fa" ? `✅ **${r.title}**` : `✅ **${r.title}**`)
        : (lang === "fa" ? `❌ **${r.title}**` : `❌ **${r.title}**`);
      const parts = [];
      if (r.textSent) parts.push(lang === "fa" ? "📝 متن" : "📝 Text");
      if (r.pollSent) parts.push(`${lang === "fa" ? "📊 نظرسنجی" : "📊 Poll"} ${r.pollSent}/${r.pollTotal}`);
      if (parts.length > 0) line += " — " + parts.join(" + ");
      if (state?.buttons && state.buttons.length > 0) line += lang === "fa" ? " + 🔘 دکمه" : " + 🔘 Buttons";
      return line;
    });
    const txt = (lang === "fa" ? "📤 **نتیجه ارسال پست:**\n\n" : "📤 **Post send result:**\n\n") + lines.join("\n");
    await sendRichMarkdown(cfg, chatId, txt, adminPanelKeyboard(lang));
    return;
  }

  // ── Post schedule ─────────────────────────────────────────────────
  if (action === "post_send_now") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_select_channels") return;
    // Trigger immediate send
    await handleCallback({ ...cb, data: `${lang}_post_send` }, env, cfg);
    return;
  }

  if (action === "post_schedule") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_select_channels") return;
    const selected = state.selected || [];
    if (selected.length === 0) {
      await tg(cfg, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: lang === "fa" ? "⚠️ حداقل یک کانال انتخاب کنید." : "⚠️ Select at least one channel.",
        show_alert: true,
      });
      return;
    }
    
    // Store selected channels and show calendar
    await setState(env, userId, { ...state, action: "schedule_pick_date", selectedChannels: selected });
    
    const now = new Date();
    await editRichMarkdown(cfg, chatId, msgId,
      lang === "fa"
        ? "📅 **تاریخ ارسال را انتخاب کنید:**"
        : "📅 **Pick a send date:**",
      calendarKeyboard(now.getFullYear(), now.getMonth(), lang));
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Admin panel text
// ═══════════════════════════════════════════════════════════════════════════════
const ADMIN_PANEL_TEXT = {
  fa: `⚙️ **پنل ادمین**

از این بخش می‌توانید:
— ادمین‌های ربات را مدیریت کنید
— کانال‌ها را اضافه/حذف کنید
— پست جدید برای کانال‌ها بسازید و ارسال کنید

یکی از گزینه‌های زیر را انتخاب کنید 👇`,

  en: `⚙️ **Admin Panel**

From here you can:
— Manage bot admins
— Add/remove channels
— Create and send new posts to channels

Choose an option below 👇`,
};

// ─── Language select (plain sendMessage so it's always fresh) ─────────────────
const LANG_SELECT_MESSAGE = "🌐 Please choose your language / زبان خود را انتخاب کنید:";
const LANG_SELECT_KEYBOARD = {
  inline_keyboard: [[
    { text: "🇮🇷 فارسی", callback_data: "fa_start" },
    { text: "🇬🇧 English", callback_data: "en_start" },
  ]],
};

// ═══════════════════════════════════════════════════════════════════════════════
//  API helpers
// ═══════════════════════════════════════════════════════════════════════════════
async function tg(cfg, method, body) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, description: String(err) };
  }
}

async function callApi(cfg, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[${method}] ${res.status}: ${err}`);
    await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: body.chat_id, text: `⚠️ Error (${res.status}): ${err}` }),
    });
  }
}

async function sendPlain(cfg, chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi(cfg, "sendMessage", body);
}

async function sendRichMarkdown(cfg, chatId, markdown, replyMarkup) {
  const body = { chat_id: chatId, rich_message: { markdown } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi(cfg, "sendRichMessage", body);
}

async function sendRichHtml(cfg, chatId, html, replyMarkup) {
  const body = { chat_id: chatId, rich_message: { html } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi(cfg, "sendRichMessage", body);
}

async function editRichMarkdown(cfg, chatId, messageId, markdown, replyMarkup) {
  const body = { chat_id: chatId, message_id: messageId, rich_message: { markdown } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi(cfg, "editMessageText", body);
}

// Send Rich Markdown/HTML message and return result (for sending to channels)
async function sendRichMarkdownResult(cfg, chatId, markdown, replyMarkup) {
  const body = { chat_id: chatId, rich_message: { markdown } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return await tg(cfg, "sendRichMessage", body);
}

async function sendRichHtmlResult(cfg, chatId, html, replyMarkup) {
  const body = { chat_id: chatId, rich_message: { html } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return await tg(cfg, "sendRichMessage", body);
}

// Just update the keyboard of a message (to tick channels without changing text)
async function editKeyboardOnly(cfg, chatId, messageId, replyMarkup) {
  await callApi(cfg, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AI MODULE  —  content generation, multi-turn chat, scheduling
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Call the configured OpenAI-compatible chat completions API.
 * Returns { ok: true, text } on success or { ok: false, error } on failure.
 * The caller is responsible for surfacing the error to the user.
 */
/**
 * Call AI API with retry logic and better error handling.
 * Supports streaming for better UX.
 */
async function callAi(env, messages, options = {}) {
  const config = await getAiConfig(env);
  if (!config.apiKey) {
    return { ok: false, error: "AI not configured. Admin must use /aiconfig to set up." };
  }
  if (!config.baseUrl) {
    return { ok: false, error: "AI base URL not set. Use /aiconfig custom <key> <baseUrl>." };
  }

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "system", content: config.systemPrompt }, ...messages],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 4000,
          stream: options.stream || false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error?.message || data.error || `API error ${res.status}`;
        lastError = typeof msg === "string" ? msg : JSON.stringify(msg);
        
        // Don't retry on auth errors
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: `Auth error: ${lastError}` };
        }
        
        // Retry on rate limit or server errors
        if (res.status === 429 || res.status >= 500) {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
        }
        
        return { ok: false, error: lastError };
      }

      // Handle streaming response
      if (options.stream) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
          
          for (const line of lines) {
            if (line === "data: [DONE]") break;
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content;
              if (delta) fullText += delta;
            } catch {}
          }
        }
        
        if (!fullText) return { ok: false, error: "AI returned empty response." };
        return { ok: true, text: fullText };
      }

      // Handle non-streaming response
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (!text) return { ok: false, error: "AI returned empty response." };
      
      // Include usage stats if available
      const usage = data.usage;
      return { 
        ok: true, 
        text,
        usage: usage ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        } : undefined,
      };
    } catch (err) {
      lastError = String(err?.message || err);
      
      // Don't retry on abort (timeout)
      if (err.name === "AbortError") {
        return { ok: false, error: "AI request timed out (60s). Try a shorter prompt." };
      }
      
      // Retry on network errors
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  return { ok: false, error: `AI failed after ${maxRetries + 1} attempts: ${lastError}` };
}

/**
 * Handle /ai <prompt> — generate content, show preview with action buttons.
 * `existingState` is passed when regenerating (preserves scheduleMode flag).
 */
async function handleAiGenerate(env, cfg, chatId, userId, prompt, existingState) {
  const aiConfig = await getAiConfig(env);
  if (!aiConfig.apiKey) {
    await sendPlain(cfg, chatId, langFa(cfg, userId)
      ? "⚠️ هوش مصنوعی تنظیم نشده. ادمین باید از /aiconfig استفاده کند.\n\nمثال: `/aiconfig openai sk-your-key`"
      : "⚠️ AI not configured. Admin must use /aiconfig first.\n\nExample: `/aiconfig openai sk-your-key`");
    return;
  }

  await sendPlain(cfg, chatId, "🤖 " + (langFa(cfg, userId) ? "در حال تولید..." : "Generating..."));
  
  const result = await callAi(env, [{ role: "user", content: prompt }]);
  if (!result.ok) {
    await sendPlain(cfg, chatId, `❌ AI error: ${result.error}`);
    return;
  }

  const lang = existingState?.lang || (langFa(cfg, userId) ? "fa" : "en");
  const newState = {
    action: "ai_preview",
    lang,
    prompt,
    generatedText: result.text,
    scheduleMode: existingState?.scheduleMode || false,
  };
  await setState(env, userId, newState);

  // Render the generated content as a rich message preview.
  const isHtml = result.text.startsWith("<") || /<\/?\w/.test(result.text);
  if (isHtml) await sendRichHtml(cfg, chatId, result.text);
  else await sendRichMarkdown(cfg, chatId, result.text);

  // Show usage stats if available
  const usageText = result.usage
    ? `\n📊 Tokens: ${result.usage.totalTokens} (↑${result.usage.promptTokens} ↓${result.usage.completionTokens})`
    : "";

  await sendPlain(cfg, chatId,
    (lang === "fa"
      ? "👆 محتوای تولید‌شده. چه کار کنم؟"
      : "👆 AI-generated content. What next?") + usageText,
    aiPreviewKeyboard(lang)
  );
}

/**
 * Handle /aiconfig command (admin only).
 * Format: /aiconfig <provider> <apiKey> [baseUrl]
 * Or:    /aiconfig show   → display current config
 * Or:    /aiconfig        → show help
 */
async function handleAiConfigCommand(env, cfg, chatId, userId, argText) {
  if (!argText || argText === "help") {
    await sendPlain(cfg, chatId,
      "🔑 **AI Config**\n\n" +
      "Usage:\n" +
      "`/aiconfig openai sk-xxx` — set provider + key\n" +
      "`/aiconfig groq gsk_xxx` — use Groq\n" +
      "`/aiconfig custom sk-xxx https://my-api.com/v1`\n" +
      "`/aiconfig show` — display current config\n\n" +
      "Providers: `openai` · `groq` · `together` · `openrouter` · `custom`\n\n" +
      "After setting, use `/aimodel <name>` to change the model."
    );
    return;
  }

  if (argText === "show") {
    const c = await getAiConfig(env);
    const masked = c.apiKey ? c.apiKey.slice(0, 6) + "…" + c.apiKey.slice(-4) : "(not set)";
    await sendPlain(cfg, chatId,
      `⚙️ **Current AI Config**\n\n` +
      `• Provider: \`${c.provider}\`\n` +
      `• Model: \`${c.model}\`\n` +
      `• API Key: \`${masked}\`\n` +
      `• Base URL: \`${c.baseUrl}\`\n` +
      `• System Prompt: ${c.systemPrompt.slice(0, 100)}…`
    );
    return;
  }

  const parts = argText.split(/\s+/);
  if (parts.length < 2) {
    await sendPlain(cfg, chatId, "⚠️ Format: `/aiconfig <provider> <apiKey> [baseUrl]`\nExample: `/aiconfig openai sk-xxx`");
    return;
  }

  const provider = parts[0].toLowerCase();
  if (!AI_PROVIDER_DEFAULTS[provider]) {
    await sendPlain(cfg, chatId, `⚠️ Unknown provider. Options: ${Object.keys(AI_PROVIDER_DEFAULTS).join(" · ")}`);
    return;
  }

  const apiKey = parts[1];
  const baseUrl = parts[2] || AI_PROVIDER_DEFAULTS[provider].baseUrl;
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  const config = {
    provider,
    apiKey,
    baseUrl: baseUrl || defaults.baseUrl,
    model: defaults.model || "gpt-4o-mini",
    systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
  };

  // Preserve existing model + systemPrompt if set.
  const existing = await getAiConfig(env);
  if (existing.model && existing.model !== defaults.model) config.model = existing.model;
  if (existing.systemPrompt && existing.systemPrompt !== DEFAULT_AI_SYSTEM_PROMPT) config.systemPrompt = existing.systemPrompt;

  await setAiConfig(env, config);
  await sendPlain(cfg, chatId,
    `✅ AI configured!\n\n` +
    `• Provider: \`${provider}\`\n` +
    `• Model: \`${config.model}\`\n` +
    `• Base URL: \`${config.baseUrl}\`\n\n` +
    `Now use /ai <prompt> to generate content.`
  );
}

/**
 * Show list of scheduled AI posts (pending + recently sent).
 */
async function showScheduledList(env, cfg, chatId, userId, msgId, lang) {
  const posts = await getScheduledPosts(env);
  const now = Date.now();

  // Sort: pending (soonest first) then sent (most recent first)
  const sorted = posts.sort((a, b) => {
    if (a.sent !== b.sent) return a.sent ? 1 : -1;
    return a.sent ? (b.sentAt - a.sentAt) : (a.sendAt - b.sendAt);
  });

  if (sorted.length === 0) {
    const txt = lang === "fa"
      ? "📋 هیچ زمان‌بندی‌ای ثبت نشده.\n\nبرای ثبت: /scheduleai"
      : "📋 No scheduled posts.\n\nTo schedule: /scheduleai";
    if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, backKeyboard(lang));
    else await sendPlain(cfg, chatId, txt);
    return;
  }

  const lines = sorted.slice(0, 15).map(p => {
    const dateStr = new Date(p.sendAt + TIMEZONE_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16).replace("Z", "") + " (IR)";
    const status = p.sent
      ? (lang === "fa" ? "✅ ارسال شد" : "✅ Sent")
      : (p.sendAt <= now
          ? (lang === "fa" ? "⏳ در انتظار ارسال" : "⏳ Due")
          : (lang === "fa" ? "⏰ برنامه‌ریزی شده" : "⏰ Scheduled"));
    const promptPreview = (p.prompt || "").slice(0, 50);
    const cancelBtn = p.sent ? "" : `\n   ↳ Cancel: /cancel_${p.id}`;
    return `• ${status} — \`${dateStr}\`\n   📝 ${promptPreview}…\n   📡 ${p.channelIds.length} ch · 🆔 \`${p.id}\`${cancelBtn}`;
  });

  const txt = (lang === "fa"
    ? `📋 **زمان‌بندی‌های AI** (${posts.length})\n\n`
    : `📋 **Scheduled AI Posts** (${posts.length})\n\n`) + lines.join("\n\n");

  // Build a keyboard with cancel buttons for pending posts
  const kbRows = [];
  for (const p of sorted.slice(0, 10)) {
    if (!p.sent) {
      kbRows.push([{ text: `❌ Cancel ${p.id.slice(-6)}`, callback_data: `${lang}_ai_cancel_scheduled_${p.id}` }]);
    }
  }
  kbRows.push([{ text: lang === "fa" ? "⬅️ بازگشت" : "⬅️ Back", callback_data: `${lang}_back` }]);
  const kb = { inline_keyboard: kbRows };

  if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, kb);
  else await sendRichMarkdown(cfg, chatId, txt, kb);
}

/**
 * Scheduled event handler — called by the cron trigger every 5 minutes.
 * Picks up due scheduled AI posts, sends them, marks them sent.
 * If `viaHttp` is true, returns a JSON response (for the /run-scheduler endpoint).
 */
/**
 * Run all due scheduled posts.
 * Enhanced with retry logic and better error handling.
 */
async function runScheduledPosts(env, cfg, viaHttp) {
  const posts = await getScheduledPosts(env);
  const now = Date.now();
  const due = posts.filter(p => !p.sent && p.sendAt <= now);

  if (due.length === 0) {
    if (viaHttp) return json({ ok: true, sent: 0, message: "No due posts." });
    return { sent: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;
  const results = [];

  for (const post of due) {
    const channelResults = [];
    const postState = post.postState || {};
    const text = post.generatedText || postState.text || "";
    const retryCount = post.retryCount || 0;
    const maxRetries = 3;

    for (const chId of post.channelIds) {
      try {
        // Send text post if there's text content
        let textOk = true;
        if (text) {
          const isHtml = text.startsWith("<") || /<\/?\w/.test(text);
          const replyMarkup = postState.buttons ? { inline_keyboard: postState.buttons } : undefined;
          const res = isHtml
            ? await sendRichHtmlResult(cfg, chId, text, replyMarkup)
            : await sendRichMarkdownResult(cfg, chId, text, replyMarkup);
          textOk = !!res?.ok;
          
          if (!textOk) {
            channelResults.push({ 
              channelId: chId, 
              ok: false, 
              error: res?.description || "Send failed",
              retryable: true 
            });
            continue;
          }
        }

        // Send polls if exist (array of polls)
        let pollOk = false;
        const polls = postState.polls || (postState.poll ? [postState.poll] : []);
        for (const poll of polls) {
          try {
            const pollBody = {
              chat_id: chId,
              question: poll.question,
              options: poll.options,
              is_anonymous: poll.anonymous !== false,
            };
            if (poll.type === "quiz") {
              pollBody.type = "quiz";
              pollBody.correct_option_id = poll.correctOptionId;
            }
            const pollRes = await tg(cfg, "sendPoll", pollBody);
            if (pollRes?.ok) {
              pollOk = true;
              const pollRecord = {
                id: `poll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                pollId: pollRes.result.poll.id,
                question: poll.question,
                options: poll.options,
                chatId: chId,
                messageId: pollRes.result.message_id,
                type: poll.type,
                anonymous: poll.anonymous !== false,
                correctOptionId: poll.correctOptionId,
                createdAt: Date.now(),
              };
              await addPoll(env, pollRecord);
            }
          } catch (err) {
            console.error(`Poll send error: ${err}`);
          }
        }

        channelResults.push({ channelId: chId, ok: true, pollSent: pollOk });
      } catch (err) {
        channelResults.push({ 
          channelId: chId, 
          ok: false, 
          error: String(err),
          retryable: true 
        });
      }
    }

    const allOk = channelResults.every(r => r.ok);
    const anyRetryable = channelResults.some(r => r.retryable);

    if (allOk) {
      post.sent = true;
      post.sentAt = now;
      post.sendResults = channelResults;
      sentCount++;
    } else if (anyRetryable && retryCount < maxRetries) {
      // Retry later (exponential backoff: 1min, 5min, 15min)
      const backoffMs = [60000, 300000, 900000][retryCount] || 900000;
      post.retryCount = retryCount + 1;
      post.retryAt = now + backoffMs;
      post.sendResults = channelResults;
      failedCount++;
    } else {
      // Max retries exceeded or non-retryable error
      post.sent = true;
      post.sentAt = now;
      post.failed = true;
      post.sendResults = channelResults;
      failedCount++;
    }

    results.push({ 
      id: post.id, 
      channels: channelResults,
      status: allOk ? "sent" : (anyRetryable && retryCount < maxRetries ? "retrying" : "failed")
    });
  }

  await saveScheduledPosts(env, posts);

  if (viaHttp) {
    return json({ 
      ok: true, 
      sent: sentCount, 
      failed: failedCount,
      results 
    });
  }
  return { sent: sentCount, failed: failedCount };
}

/**
 * Handle /scheduled command - list all scheduled posts with details.
 */
async function handleScheduledList(env, cfg, chatId, userId, msgId, lang) {
  const posts = await getScheduledPosts(env);
  
  if (posts.length === 0) {
    const txt = lang === "fa"
      ? "📋 هیچ زمان‌بندی ثبت نشده.\n\nبرای ثبت: /scheduleai"
      : "📋 No scheduled posts.\n\nTo schedule: /scheduleai";
    if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, backKeyboard(lang));
    else await sendPlain(cfg, chatId, txt);
    return;
  }

  const lines = [];
  const pending = posts.filter(p => !p.sent);
  const sent = posts.filter(p => p.sent && !p.failed);
  const failed = posts.filter(p => p.failed);

  if (pending.length > 0) {
    lines.push(lang === "fa" ? "⏳ **در انتظار ارسال:**\n" : "⏳ **Pending:**\n");
    for (const post of pending.slice(-5)) {
      const dateStr = new Date(post.sendAt).toLocaleString(lang === "fa" ? "fa-IR" : "en-US");
      const channels = post.channelIds.length;
      lines.push(`   📌 \`${post.id}\`\n      📅 ${dateStr}\n      📡 ${channels} ${lang === "fa" ? "کانال" : "channels"}\n`);
    }
  }

  if (failed.length > 0) {
    lines.push(lang === "fa" ? "\n❌ **ناموفق:**\n" : "\n❌ **Failed:**\n");
    for (const post of failed.slice(-3)) {
      const dateStr = new Date(post.sentAt || post.sendAt).toLocaleString(lang === "fa" ? "fa-IR" : "en-US");
      const errors = (post.sendResults || []).filter(r => !r.ok).map(r => r.error).join(", ");
      lines.push(`   📌 \`${post.id}\`\n      📅 ${dateStr}\n      ⚠️ ${errors.slice(0, 50)}\n`);
    }
  }

  const summary = lang === "fa"
    ? `📋 **زمان‌بندی‌ها** (${posts.length})\n\n⏳ ${pending.length} در انتظار · ✅ ${sent.length} ارسال‌شده · ❌ ${failed.length} ناموفق\n\n`
    : `📋 **Scheduled Posts** (${posts.length})\n\n⏳ ${pending.length} pending · ✅ ${sent.length} sent · ❌ ${failed.length} failed\n\n`;

  const txt = summary + lines.join("\n");

  if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, backKeyboard(lang));
  else await sendRichMarkdown(cfg, chatId, txt, backKeyboard(lang));
}

/**
 * Handle /cancel <id> command - cancel a scheduled post.
 */
async function handleCancelScheduled(env, cfg, chatId, userId, postId, lang) {
  const posts = await getScheduledPosts(env);
  const post = posts.find(p => p.id === postId && !p.sent);
  
  if (!post) {
    await sendPlain(cfg, chatId, lang === "fa"
      ? `❌ زمان‌بندی \`${postId}\` یافت نشد یا قبلاً ارسال شده.`
      : `❌ Scheduled post \`${postId}\` not found or already sent.`);
    return;
  }

  // Remove from list
  const idx = posts.indexOf(post);
  posts.splice(idx, 1);
  await saveScheduledPosts(env, posts);

  await sendPlain(cfg, chatId, lang === "fa"
    ? `✅ زمان‌بندی \`${postId}\` لغو شد.`
    : `✅ Scheduled post \`${postId}\` cancelled.`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MEDIA DOWNLOADER  —  Multi-backend (RapidAPI / cobalt / GitHub direct)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle /dl <url> — detect source, fetch media, send to chat.
 * Supports:
 *   • GitHub (raw, blob, releases) → fetch directly
 *   • YouTube/TikTok/Instagram/Twitter → RapidAPI (if configured) or cobalt
 *   • Everything else → cobalt API
 */
async function handleDownload(cfg, chatId, userId, url) {
  if (!/^https?:\/\//i.test(url)) {
    await sendPlain(cfg, chatId, "⚠️ Please send a valid URL starting with http:// or https://");
    return;
  }

  await sendPlain(cfg, chatId, "📥 Downloading...");

  try {
    // GitHub special handling
    if (/github\.com|raw\.githubusercontent\.com|gist\.github\.com/i.test(url)) {
      const result = await downloadFromGithub(cfg, chatId, url);
      if (result.handled) return;
    }

    // Detect platform for RapidAPI routing
    const platform = detectPlatform(url);

    // Try RapidAPI first if configured and platform is supported
    if (cfg.rapidApiKey && platform) {
      const rapidResult = await downloadViaRapidApi(url, platform, cfg);
      if (rapidResult.ok) {
        await sendMediaFile(cfg, chatId, rapidResult.url, rapidResult.filename, rapidResult.type);
        return;
      }
      // RapidAPI failed — fall through to cobalt
    }

    // Fallback to cobalt
    const cobaltResult = await downloadViaCobalt(url, cfg.cobaltUrl);
    if (!cobaltResult.ok) {
      const errorMsg = cfg.rapidApiKey
        ? `❌ Download failed: ${cobaltResult.error}\n\nBoth RapidAPI and cobalt failed. The URL may not be supported.`
        : `❌ Download failed: ${cobaltResult.error}\n\nSet RAPIDAPI_KEY for more platform support, or self-host cobalt.`;
      await sendPlain(cfg, chatId, errorMsg);
      return;
    }

    await sendMediaFile(cfg, chatId, cobaltResult.url, cobaltResult.filename, cobaltResult.type);
  } catch (err) {
    await sendPlain(cfg, chatId, `❌ Error: ${err?.message || err}`);
  }
}

/**
 * Detect the platform from a URL.
 * Returns a platform key for RapidAPI routing, or null if unknown.
 */
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/twitter\.com|x\.com/i.test(url)) return "twitter";
  if (/facebook\.com|fb\.watch/i.test(url)) return "facebook";
  if (/reddit\.com/i.test(url)) return "reddit";
  if (/pinterest\.(com|ca|co\.\w+)/i.test(url)) return "pinterest";
  return null;
}

/**
 * Call RapidAPI to resolve a media URL.
 * Returns { ok, url, filename, type } or { ok: false, error }.
 *
 * RapidAPI services used (configurable via env):
 *   RAPIDAPI_YOUTUBE_KEY  → "youtube-media-downloader" or similar
 *   RAPIDAPI_TIKTOK_KEY   → "tiktok-video-downloader" or similar
 *   RAPIDAPI_IG_KEY       → "instagram-downloader" or similar
 *   RAPIDAPI_KEY          → fallback key for all platforms
 */
async function downloadViaRapidApi(url, platform, cfg) {
  try {
    // Map platform to RapidAPI service + host
    const services = {
      youtube: {
        host: cfg.rapidApiYoutubeHost || "youtube-media-downloader1.p.rapidapi.com",
        key: cfg.rapidApiYoutubeKey || cfg.rapidApiKey,
        endpoint: "/download",
        buildBody: (u) => ({ url: u }),
      },
      tiktok: {
        host: cfg.rapidApiTiktokHost || "tiktok-downloader-api-tiktok.p.rapidapi.com",
        key: cfg.rapidApiTiktokKey || cfg.rapidApiKey,
        endpoint: "/video_no_watermark",
        buildBody: (u) => ({ url: u }),
      },
      instagram: {
        host: cfg.rapidApiIgHost || "instagram-downloader.p.rapidapi.com",
        key: cfg.rapidApiIgKey || cfg.rapidApiKey,
        endpoint: "/download",
        buildBody: (u) => ({ url: u }),
      },
      twitter: {
        host: cfg.rapidApiTwitterHost || "twitter-api45.p.rapidapi.com",
        key: cfg.rapidApiTwitterKey || cfg.rapidApiKey,
        endpoint: "/timeline.php",
        buildBody: (u) => ({ url: u }),
      },
      facebook: {
        host: cfg.rapidApiFbHost || "facebook-reel-and-video-downloader.p.rapidapi.com",
        key: cfg.rapidApiFbKey || cfg.rapidApiKey,
        endpoint: "/app.php",
        buildBody: (u) => ({ url: u }),
      },
      reddit: {
        host: cfg.rapidApiRedditHost || "reddit-downloader.p.rapidapi.com",
        key: cfg.rapidApiRedditKey || cfg.rapidApiKey,
        endpoint: "/download",
        buildBody: (u) => ({ url: u }),
      },
      pinterest: {
        host: cfg.rapidApiPinterestHost || "pinterest-downloader.p.rapidapi.com",
        key: cfg.rapidApiPinterestKey || cfg.rapidApiKey,
        endpoint: "/download",
        buildBody: (u) => ({ url: u }),
      },
    };

    const service = services[platform];
    if (!service) return { ok: false, error: `No RapidAPI service for ${platform}` };

    const apiUrl = `https://${service.host}${service.endpoint}`;
    const body = service.buildBody(url);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": service.key,
        "X-RapidAPI-Host": service.host,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { ok: false, error: `RapidAPI HTTP ${res.status}` };
    }

    const data = await res.json();

    // Extract download URL from various response formats
    const downloadUrl =
      data.url ||
      data.download_url ||
      data.video_url ||
      data.media_url ||
      data.result?.url ||
      data.data?.url ||
      data.data?.video ||
      data.data?.download_url ||
      (Array.isArray(data.data) && data.data[0]?.url) ||
      (Array.isArray(data.data) && data.data[0]?.download) ||
      null;

    if (!downloadUrl) {
      return { ok: false, error: `RapidAPI returned no download URL for ${platform}` };
    }

    const filename = extractFilename(downloadUrl, platform);
    const type = platform === "youtube" ? "video" : "video";

    return { ok: true, url: downloadUrl, filename, type };
  } catch (err) {
    return { ok: false, error: `RapidAPI ${platform} failed: ${err?.message || err}` };
  }
}

/**
 * Call the cobalt API to resolve a media URL.
 * Returns { ok, url, filename, type } or { ok: false, error }.
 */
async function downloadViaCobalt(url, cobaltUrl) {
  try {
    const res = await fetch(cobaltUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!res.ok || data.status === "error") {
      const errCode = data.error?.code || data.error || "unknown";
      return { ok: false, error: typeof errCode === "string" ? errCode : JSON.stringify(errCode) };
    }

    if (data.status === "redirect" || data.status === "stream") {
      return {
        ok: true,
        url: data.url,
        filename: data.filename || "media",
        type: data.type || data.audio ? "audio" : "video",
      };
    }

    return { ok: false, error: `Unexpected cobalt response: ${data.status || "unknown"}` };
  } catch (err) {
    return { ok: false, error: `Cobalt request failed: ${err?.message || err}` };
  }
}

/**
 * Extract a filename from a URL for a given platform.
 */
function extractFilename(url, platform) {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);
    const last = pathParts[pathParts.length - 1];
    if (last && last.includes(".")) return last;
  } catch {}
  const id = Date.now().toString(36);
  return `${platform}_${id}.mp4`;
}

/**
 * Download a file from cobalt's URL and send it to the chat as the appropriate
 * media type. Files >45MB are sent as a clickable link instead (Telegram bot
 * API upload limit is 50MB; 45MB is a safe margin).
 */
async function sendMediaFile(cfg, chatId, url, filename, mediaType) {
  // HEAD request to check size (best-effort; not all CDNs support HEAD)
  let size = 0;
  let contentType = "";
  try {
    const head = await fetch(url, { method: "HEAD" });
    size = Number(head.headers.get("content-length") || 0);
    contentType = head.headers.get("content-type") || "";
  } catch {
    // HEAD failed — proceed with GET and hope for the best
  }

  if (size > 45 * 1024 * 1024) {
    const sizeMB = (size / 1024 / 1024).toFixed(1);
    await sendPlain(cfg, chatId,
      `📥 File too large to send directly (${sizeMB} MB).\n\n` +
      `Direct download link (may expire):\n${url}\n\n` +
      `Filename: ${filename}`
    );
    return;
  }

  // Download the file
  const res = await fetch(url);
  if (!res.ok) {
    await sendPlain(cfg, chatId, `❌ Download failed: HTTP ${res.status}`);
    return;
  }

  const blob = await res.blob();
  if (!contentType) contentType = blob.type || "application/octet-stream";

  // Determine the Telegram API method + field based on content type
  let method = "sendDocument";
  let field = "document";
  if (contentType.startsWith("video/")) { method = "sendVideo"; field = "video"; }
  else if (contentType.startsWith("audio/")) { method = "sendAudio"; field = "audio"; }
  else if (contentType.startsWith("image/")) { method = "sendPhoto"; field = "photo"; }

  // Build multipart form data
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append(field, blob, filename || "media");
  // A short caption identifying the source
  formData.append("caption", `📥 ${filename || "media"}`);

  const result = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
    method: "POST",
    body: formData,
  });
  const data = await result.json();

  if (!data.ok) {
    // Fallback: send the link as a message
    await sendPlain(cfg, chatId,
      `⚠️ Couldn't upload file directly (${data.description || "error"}).\n\nDirect link:\n${url}`
    );
  }
}

/**
 * Handle GitHub URLs natively (cobalt doesn't support GitHub).
 * Converts blob URLs to raw, fetches release assets, etc.
 * Returns { handled: true } if we processed it (sent or errored).
 */
async function downloadFromGithub(cfg, chatId, url) {
  let rawUrl = url;

  // github.com/user/repo/blob/branch/path → raw.githubusercontent.com/user/repo/branch/path
  if (/github\.com\/[^/]+\/[^/]+\/blob\//.test(url)) {
    rawUrl = url
      .replace("https://github.com/", "https://raw.githubusercontent.com/")
      .replace("http://github.com/", "http://raw.githubusercontent.com/")
      .replace("/blob/", "/");
  }
  // github.com/user/repo/raw/branch/path → raw.githubusercontent.com/user/repo/branch/path
  else if (/github\.com\/[^/]+\/[^/]+\/raw\//.test(url)) {
    rawUrl = url
      .replace("https://github.com/", "https://raw.githubusercontent.com/")
      .replace("http://github.com/", "http://raw.githubusercontent.com/")
      .replace("/raw/", "/");
  }
  // github.com/user/repo/releases/download/tag/asset → follow redirect to the actual file
  else if (/github\.com\/[^/]+\/[^/]+\/releases\/download\//.test(url)) {
    // The release asset URL redirects to objects.githubusercontent.com —
    // fetch() follows redirects by default, so we can just use the URL.
    rawUrl = url;
  }
  // raw.githubusercontent.com — already raw, use as-is
  else if (/raw\.githubusercontent\.com/.test(url)) {
    rawUrl = url;
  }
  // gist.github.com — convert to gist.githubusercontent.com
  else if (/gist\.github\.com/.test(url)) {
    // This is tricky (need the raw URL with commit hash). For now, just
    // tell the user to use the raw URL.
    await sendPlain(cfg, chatId,
      "⚠️ GitHub Gist URLs need the raw link. Click \"Raw\" on the gist page and send that URL.\n\n" +
      `Original: ${url}`
    );
    return { handled: true };
  }
  // Regular github.com page (not a file) — not directly downloadable
  else if (/github\.com/.test(url) && !/\/blob\/|\/raw\/|\/releases\/download\//.test(url)) {
    await sendPlain(cfg, chatId,
      "⚠️ This is a GitHub page, not a file. Send a direct file URL:\n" +
      "• `github.com/user/repo/blob/branch/file.ext`\n" +
      "• `raw.githubusercontent.com/user/repo/branch/file.ext`\n" +
      "• `github.com/user/repo/releases/download/tag/asset.ext`"
    );
    return { handled: true };
  }

  // Fetch and send the GitHub file
  try {
    const filename = rawUrl.split("/").pop()?.split("?")[0] || "github-file";

    // Check size
    const head = await fetch(rawUrl, { method: "HEAD" }).catch(() => null);
    const size = Number(head?.headers?.get("content-length") || 0);

    if (size > 45 * 1024 * 1024) {
      const sizeMB = (size / 1024 / 1024).toFixed(1);
      await sendPlain(cfg, chatId,
        `📥 File too large (${sizeMB} MB).\n\nDirect link:\n${rawUrl}\n\nFilename: ${filename}`
      );
      return { handled: true };
    }

    const res = await fetch(rawUrl);
    if (!res.ok) {
      await sendPlain(cfg, chatId, `❌ GitHub fetch failed: HTTP ${res.status}`);
      return { handled: true };
    }

    const blob = await res.blob();
    const ct = blob.type || "application/octet-stream";

    let method = "sendDocument";
    let field = "document";
    if (ct.startsWith("video/")) { method = "sendVideo"; field = "video"; }
    else if (ct.startsWith("audio/")) { method = "sendAudio"; field = "audio"; }
    else if (ct.startsWith("image/")) { method = "sendPhoto"; field = "photo"; }

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append(field, blob, filename);
    formData.append("caption", `📥 ${filename}\n📦 GitHub`);

    const result = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
      method: "POST",
      body: formData,
    });
    const data = await result.json();

    if (!data.ok) {
      await sendPlain(cfg, chatId, `⚠️ Upload failed: ${data.description || "error"}\n\nDirect link:\n${rawUrl}`);
    }
    return { handled: true };
  } catch (err) {
    await sendPlain(cfg, chatId, `❌ GitHub download error: ${err?.message || err}`);
    return { handled: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POLLS & SURVEYS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle /poll or /quiz command.
 * Format: /poll Question | option1 | option2 | ...
 * Format: /poll! Question | option1 | option2 | ...  (non-anonymous)
 * Format: /quiz Question | option1 | option2 | !option3  (option3 is correct)
 * Format: /quiz! Question | option1 | !option2 | option3  (non-anonymous quiz)
 * Options: Add :<time>m or :<time>h for expiration (e.g., :30m, :2h)
 */
async function handlePollCommand(env, cfg, chatId, userId, cmd, argText) {
  // Check for non-anonymous flag (!)
  const isAnonymous = !cmd.endsWith("!");
  const actualCmd = cmd.endsWith("!") ? cmd.slice(0, -1) : cmd;
  
  // Parse "question | opt1 | opt2 | ..."
  const parts = argText.split("|").map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length < 3) {
    await sendPlain(cfg, chatId,
      langFa(cfg, userId)
        ? "⚠️ فرمت:\n\n" +
          "`/poll سوال؟ | گزینه ۱ | گزینه ۲ | گزینه ۳`\n\n" +
          "برای نظرسنجی غیر-anonymous:\n" +
          "`/poll! سوال؟ | گزینه ۱ | گزینه ۲`\n\n" +
          "برای مسابقه (یک پاسخ صحیح با `!`):\n" +
          "`/quiz پایتخت فرانسه؟ | لندن | !پاریس | برلین`\n\n" +
          "محدودیت زمانی (اختیاری):\n" +
          "`/poll سوال؟ | گزینه۱ | گزینه۲ | :30m`\n" +
          "`/poll سوال؟ | گزینه۱ | گزینه۲ | :2h`"
        : "⚠️ Format:\n\n" +
          "`/poll Question? | Option 1 | Option 2 | Option 3`\n\n" +
          "For non-anonymous poll:\n" +
          "`/poll! Question? | Option 1 | Option 2`\n\n" +
          "For quiz (correct answer marked with `!`):\n" +
          "`/quiz Capital of France? | London | !Paris | Berlin`\n\n" +
          "Time limit (optional):\n" +
          "`/poll Q? | Opt1 | Opt2 | :30m`\n" +
          "`/poll Q? | Opt1 | Opt2 | :2h`"
    );
    return;
  }

  let question = parts[0];
  let options = parts.slice(1);
  let correctOptionId = -1;
  let closeDate = null;

  // Check for time limit in last option
  const lastOpt = options[options.length - 1];
  const timeMatch = lastOpt.match(/^:(\d+)(m|h|s)$/);
  if (timeMatch) {
    const num = parseInt(timeMatch[1]);
    const unit = timeMatch[2];
    const ms = unit === "s" ? num * 1000 : unit === "m" ? num * 60000 : num * 3600000;
    closeDate = Math.floor((Date.now() + ms) / 1000); // Telegram uses Unix timestamp
    options = options.slice(0, -1);
  }

  // For /quiz, find the option marked with "!" prefix
  if (actualCmd === "quiz") {
    options = options.map((opt, idx) => {
      if (opt.startsWith("!")) {
        correctOptionId = idx;
        return opt.slice(1).trim();
      }
      return opt;
    });
    if (correctOptionId === -1) {
      await sendPlain(cfg, chatId, langFa(cfg, userId)
        ? "⚠️ برای /quiz، پاسخ صحیح را با `!` علامت بزنید:\n`/quiz سوال؟ | غلط | !صحیح | غلط`"
        : "⚠️ For /quiz, mark the correct answer with `!`:\n`/quiz Q? | wrong | !correct | wrong`");
      return;
    }
  }

  // Telegram requires 2-10 options
  if (options.length < 2 || options.length > 10) {
    await sendPlain(cfg, chatId, langFa(cfg, userId)
      ? "⚠️ نظرسنجی به ۲ تا ۱۰ گزینه نیاز دارد."
      : "⚠️ Polls need 2-10 options.");
    return;
  }

  const body = {
    chat_id: chatId,
    question,
    options: options,
    is_anonymous: isAnonymous,
  };

  if (actualCmd === "quiz") {
    body.type = "quiz";
    body.correct_option_id = correctOptionId;
  }

  if (closeDate) {
    body.close_date = closeDate;
  }

  const res = await tg(cfg, "sendPoll", body);
  if (!res.ok) {
    await sendPlain(cfg, chatId, `❌ Poll creation failed: ${res.description || "error"}`);
    return;
  }

  // Store the poll for tracking
  const pollMsg = res.result;
  const poll = pollMsg.poll;
  const pollRecord = {
    id: `poll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    pollId: poll.id,
    question,
    options,
    chatId,
    messageId: pollMsg.message_id,
    type: actualCmd === "quiz" ? "quiz" : "regular",
    anonymous: isAnonymous,
    correctOptionId: correctOptionId >= 0 ? correctOptionId : null,
    closeDate: closeDate ? closeDate * 1000 : null,
    createdAt: Date.now(),
  };
  await addPoll(env, pollRecord);

  const anonText = isAnonymous
    ? (langFa(cfg, userId) ? "🔒 Anonymous" : "🔒 Anonymous")
    : (langFa(cfg, userId) ? "👁 Visible" : "👁 Visible");
  const timeText = closeDate
    ? (langFa(cfg, userId) ? `⏰ ${formatDuration(closeDate * 1000 - Date.now(), "fa")}` : `⏰ ${formatDuration(closeDate * 1000 - Date.now(), "en")}`)
    : (langFa(cfg, userId) ? "♾ بدون محدودیت" : "♾ No limit");

  await sendPlain(cfg, chatId,
    langFa(cfg, userId)
      ? `✅ نظرسنجی ساخته شد!\n\n${anonText} · ${timeText}\nشناسه: \`${pollRecord.id}\``
      : `✅ Poll created!\n\n${anonText} · ${timeText}\nID: \`${pollRecord.id}\``,
    { inline_keyboard: [[{ text: langFa(cfg, userId) ? "📋 لیست نظرسنجی‌ها" : "📋 View All Polls", callback_data: "fa_poll_list" }]] }
  );
}

/**
 * Format duration as human-readable string.
 */
function formatDuration(ms, lang) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (lang === "fa") {
    if (days > 0) return `${days} روز`;
    if (hours > 0) return `${hours} ساعت`;
    if (minutes > 0) return `${minutes} دقیقه`;
    return `${seconds} ثانیه`;
  }
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Handle PollAnswer updates — store who voted for what.
 */
async function handlePollAnswer(answer, env) {
  const pollId = answer.poll_id;
  const userId = answer.user.id;
  const optionIds = answer.option_ids || [];

  const answers = await getPollAnswers(env, pollId);
  // Remove any previous vote by this user (Telegram sends the full new selection)
  const filtered = answers.filter(a => a.userId !== userId);
  if (optionIds.length > 0) {
    filtered.push({ userId, optionIds, at: Date.now() });
  }
  await savePollAnswers(env, pollId, filtered);
}

/**
 * Show all tracked polls with their current vote counts.
 * Enhanced with better statistics and voter information.
 */
async function showPollStats(env, cfg, chatId, userId, msgId, lang) {
  const polls = await getPolls(env);

  if (polls.length === 0) {
    const txt = lang === "fa"
      ? "📊 هیچ نظرسنجی ثبت نشده.\n\nبرای ساخت: `/poll سوال | گزینه۱ | گزینه۲`"
      : "📊 No polls tracked.\n\nCreate one: `/poll Question? | Opt1 | Opt2`";
    if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, pollMenuKeyboard(lang));
    else await sendPlain(cfg, chatId, txt);
    return;
  }

  const lines = [];
  let totalVotes = 0;
  let activePolls = 0;

  for (const poll of polls.slice(-10)) {  // last 10 polls
    const answers = await getPollAnswers(env, poll.pollId);
    const voteCounts = poll.options.map(() => 0);
    const voterMap = new Map(); // userId -> optionIds
    
    for (const a of answers) {
      voterMap.set(a.userId, a.optionIds);
      for (const optId of a.optionIds) {
        if (voteCounts[optId] !== undefined) voteCounts[optId]++;
      }
    }
    
    const pollTotalVotes = voteCounts.reduce((s, c) => s + c, 0);
    totalVotes += pollTotalVotes;
    
    const dateStr = new Date(poll.createdAt).toISOString().slice(0, 10);
    const isActive = poll.closeDate ? poll.closeDate > Date.now() : true;
    if (isActive) activePolls++;
    
    const statusIcon = isActive ? "🟢" : "🔴";
    const typeIcon = poll.type === "quiz" ? "🧠" : "📊";
    const anonIcon = poll.anonymous === false ? "👁" : "🔒";

    let pollLine = `${statusIcon} ${typeIcon} **${poll.question}**\n`;
    pollLine += `   🆔 \`${poll.id}\` · 📅 ${dateStr} · 👥 ${pollTotalVotes} ${lang === "fa" ? "رأی" : "votes"} · ${anonIcon}\n`;
    
    poll.options.forEach((opt, idx) => {
      const pct = pollTotalVotes > 0 ? Math.round(voteCounts[idx] / pollTotalVotes * 100) : 0;
      const barLen = Math.round(pct / 10);
      const bar = "█".repeat(barLen).padEnd(10, "░");
      const correct = poll.type === "quiz" && poll.correctOptionId === idx ? " ✅" : "";
      pollLine += `   ${bar} ${pct.toString().padStart(3)}% ${opt} (${voteCounts[idx]})${correct}\n`;
    });
    
    // Show voter names if not anonymous
    if (poll.anonymous === false && voterMap.size > 0) {
      const voterList = Array.from(voterMap.entries()).slice(0, 5).map(([uid, opts]) => {
        const optNames = opts.map(o => poll.options[o] || `?${o}`).join(", ");
        return `      • ${uid}: ${optNames}`;
      }).join("\n");
      pollLine += `   👤 Voters:\n${voterList}`;
      if (voterMap.size > 5) {
        pollLine += `\n      ... +${voterMap.size - 5} more`;
      }
    }
    
    // Show time remaining if has expiration
    if (poll.closeDate && isActive) {
      const remaining = poll.closeDate - Date.now();
      pollLine += `   ⏰ ${lang === "fa" ? "زمان باقیمانده" : "Time left"}: ${formatDuration(remaining, lang)}\n`;
    }
    
    lines.push(pollLine);
  }

  const summary = lang === "fa"
    ? `📊 **نظرسنجی‌ها** (${polls.length})\n\n🟢 فعال: ${activePolls} · 👥 مجموع آرا: ${totalVotes}\n\n`
    : `📊 **Polls** (${polls.length})\n\n🟢 Active: ${activePolls} · 👥 Total votes: ${totalVotes}\n\n`;

  const txt = summary + lines.join("\n");

  if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, pollMenuKeyboard(lang));
  else await sendRichMarkdown(cfg, chatId, txt, pollMenuKeyboard(lang));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CHANNEL ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show channel analytics: member count + delivery stats + growth tracking.
 * Enhanced with time-range filtering and growth indicators.
 */
async function showChannelStats(env, cfg, chatId, userId, msgId, lang) {
  const channels = await getChannels(env);

  if (channels.length === 0) {
    const txt = lang === "fa"
      ? "📈 هیچ کانالی ثبت نشده.\n\nابتدا از پنل ادمین کانال اضافه کنید."
      : "📈 No channels registered.\n\nAdd a channel from the admin panel first.";
    if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, backKeyboard(lang));
    else await sendPlain(cfg, chatId, txt);
    return;
  }

  const scheduledPosts = await getScheduledPosts(env);
  const polls = await getPolls(env);
  
  // Load growth history from KV
  const growthHistory = await getGrowthHistory(env);

  const lines = [];
  let totalMembers = 0;
  let totalGrowth = 0;

  for (const ch of channels) {
    // Member count (bot must be admin in the channel)
    const countRes = await tg(cfg, "getChatMemberCount", { chat_id: ch.id });
    const memberCount = countRes.ok ? countRes.result : "—";
    
    if (typeof memberCount === "number") totalMembers += memberCount;

    // Calculate growth from history
    const prevCount = growthHistory[ch.id]?.count || 0;
    const growth = typeof memberCount === "number" && prevCount > 0
      ? memberCount - prevCount
      : 0;
    const growthPercent = prevCount > 0
      ? ((growth / prevCount) * 100).toFixed(1)
      : "0.0";
    totalGrowth += growth;
    
    const growthIcon = growth > 0 ? "📈" : growth < 0 ? "📉" : "➡️";
    const growthText = growth > 0 ? `+${growth}` : String(growth);

    // Delivery stats for this channel
    const chPosts = scheduledPosts.filter(p => p.channelIds.some(c => String(c) === String(ch.id)));
    const sentPosts = chPosts.filter(p => p.sent);
    const failedResults = sentPosts.flatMap(p =>
      (p.sendResults || []).filter(r => String(r.channelId) === String(ch.id) && !r.ok)
    );
    const successRate = sentPosts.length > 0
      ? ((sentPosts.length - failedResults.length) / sentPosts.length * 100).toFixed(0)
      : "—";
    
    // Visual progress bar for success rate
    const progressBar = typeof successRate === "string" && successRate !== "—"
      ? "█".repeat(Math.round(parseInt(successRate) / 10)) + "░".repeat(10 - Math.round(parseInt(successRate) / 10))
      : "░░░░░░░░░░";

    // Last post time
    const lastPost = sentPosts.length > 0
      ? new Date(Math.max(...sentPosts.map(p => new Date(p.sentAt || 0).getTime())))
      : null;
    const lastPostText = lastPost && lastPost.getTime() > 0
      ? formatRelativeTime(lastPost, lang)
      : (lang === "fa" ? "هرگز" : "Never");

    lines.push(
      `📡 **${ch.title}**\n` +
      `   👥 Members: \`${memberCount}\` ${growthIcon} ${growthText} (${growthPercent}%)\n` +
      `   📤 Posts: \`${sentPosts.length}\`/${chPosts.length}\n` +
      `   ✅ Success: \`${successRate}%\` ${progressBar}\n` +
      `   🕐 Last: ${lastPostText}\n`
    );
  }

  // Store current counts for next time
  await saveGrowthHistory(env, channels, await Promise.all(
    channels.map(async ch => {
      const res = await tg(cfg, "getChatMemberCount", { chat_id: ch.id });
      return res.ok ? res.result : 0;
    })
  ));

  // Overall summary
  const totalScheduled = scheduledPosts.length;
  const totalSent = scheduledPosts.filter(p => p.sent).length;
  const overallGrowthIcon = totalGrowth > 0 ? "📈" : totalGrowth < 0 ? "📉" : "➡️";
  const overallGrowthText = totalGrowth > 0 ? `+${totalGrowth}` : String(totalGrowth);

  const summary = lang === "fa"
    ? `📈 **آمار کانال‌ها**\n\n📅 مجموع: ${channels.length} کانال · ${totalMembers} عضو ${overallGrowthIcon} ${overallGrowthText}\n📤 ${totalSent}/${totalScheduled} ارسال‌شده · ${polls.length} نظرسنجی\n\n`
    : `📈 **Channel Analytics**\n\n📅 Total: ${channels.length} channels · ${totalMembers} members ${overallGrowthIcon} ${overallGrowthText}\n📤 ${totalSent}/${totalScheduled} sent · ${polls.length} polls\n\n`;

  const txt = summary + lines.join("\n");

  if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, backKeyboard(lang));
  else await sendRichMarkdown(cfg, chatId, txt, backKeyboard(lang));
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago").
 */
function formatRelativeTime(date, lang) {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === "fa") {
    if (minutes < 1) return "همین الان";
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    if (hours < 24) return `${hours} ساعت پیش`;
    return `${days} روز پیش`;
  }
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Get growth history from KV.
 */
async function getGrowthHistory(env) {
  try {
    const val = await env.BOT_DB.get("growth_history", "json");
    return val || {};
  } catch {
    return {};
  }
}

/**
 * Save current member counts to growth history.
 */
async function saveGrowthHistory(env, channels, counts) {
  const history = await getGrowthHistory(env);
  const now = Date.now();
  
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    const count = counts[i];
    if (count > 0) {
      history[ch.id] = {
        count,
        updatedAt: now,
      };
    }
  }
  
  try {
    await env.BOT_DB.put("growth_history", JSON.stringify(history));
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INLINE QUERY HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle inline queries (@bot ...).
 * Returns articles for:
 *   • A URL → "Download" article (sends /dl <url>)
 *   • "ai <prompt>" → AI generates a short response
 *   • Empty/help → list of commands
 */
async function handleInlineQuery(query, env, cfg) {
  const q = (query.query || "").trim();
  const results = [];

  // Helper to build an InlineQueryResult article
  const article = (id, title, description, messageText, parseMode) => ({
    type: "article",
    id,
    title,
    description,
    input_message_content: {
      message_text: messageText,
      ...(parseMode ? { parse_mode: parseMode } : {}),
    },
  });

  if (!q || q === "help") {
    results.push(article("cmd_ai", "🤖 AI Content", "Generate content with AI", "/ai ", "Markdown"));
    results.push(article("cmd_askai", "💬 AI Chat", "Enter multi-turn AI chat", "/askai", "Markdown"));
    results.push(article("cmd_schedule", "⏰ Schedule AI", "Schedule AI-generated post", "/scheduleai", "Markdown"));
    results.push(article("cmd_dl", "📥 Download", "Download media from URL", "/dl ", "Markdown"));
    results.push(article("cmd_poll", "📊 Poll", "Create a poll", "/poll Question? | Opt1 | Opt2", "Markdown"));
    results.push(article("cmd_stats", "📈 Stats", "Channel analytics", "/stats", "Markdown"));
    results.push(article("cmd_webapp", "🌐 Web Panel", "Open web admin panel", "/webapp", "Markdown"));
  } else if (q.toLowerCase().startsWith("ai ")) {
    // AI generation inline (best-effort, short response)
    const prompt = q.slice(3).trim();
    if (prompt) {
      const aiConfig = await getAiConfig(env);
      if (aiConfig.apiKey) {
        const result = await callAi(env, [{ role: "user", content: prompt }]);
        if (result.ok) {
          const text = result.text.slice(0, 4000); // Telegram message limit
          results.push(article("ai_resp", "🤖 AI Response", prompt, text, "Markdown"));
        } else {
          results.push(article("ai_err", "⚠️ AI Error", result.error, `❌ AI error: ${result.error}`));
        }
      } else {
        results.push(article("ai_nocfg", "⚠️ AI Not Configured", "Use /aiconfig to set up", "⚠️ AI not configured. Use /aiconfig first."));
      }
    }
  } else if (/^https?:\/\//i.test(q)) {
    // URL → download article
    results.push(article("dl_url", "📥 Download Media", q, `/dl ${q}`, "Markdown"));
    results.push(article("dl_link", "🔗 Direct Link", "Send the URL as-is", q));
  } else {
    // Default: suggest commands
    results.push(article("def_ai", "🤖 Generate with AI", `Generate content about: ${q.slice(0, 60)}`, `/ai ${q}`, "Markdown"));
    results.push(article("def_dl", "📥 Try as URL", "If this is a media URL", `/dl ${q}`, "Markdown"));
  }

  // Always include a help article at the end
  if (results.length === 0) {
    results.push(article("empty", "ℹ️ No results", "Type a URL or 'ai <prompt>'", "Sent via inline query."));
  }

  await tg(cfg, "answerInlineQuery", {
    inline_query_id: query.id,
    results: JSON.stringify(results),
    cache_time: 10, // short cache so AI responses don't get stale
    is_personal: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

const WELCOME = {
  fa: `# 🤖 Arefera Bot

**به ربات مدیریت محتوا خوش آمدید!**

🚀 امکانات:
• 🤖 تولید محتوا با هوش مصنوعی
• 📥 دانلود از یوتیوب، اینستاگرام و...
• 📊 ساخت نظرسنجی و کوییز
• 📈 آمار کانال با رهگیری رشد

یکی از گزینه‌ها را انتخاب کنید 👇`,

  en: `# 🤖 Arefera Bot

**Welcome to Content Management Bot!**

🚀 Features:
• 🤖 AI content generation
• 📥 Download from YouTube, Instagram & more
• 📊 Create polls and quizzes
• 📈 Channel analytics with growth tracking

Choose an option below 👇`,
};

// ─── About ────────────────────────────────────────────────────────────────────
const ABOUT = {
  fa: `# 🤖 Arefera Bot

ربات مدیریت محتوای کانال تلگرام

**امکانات:**
• 🤖 تولید محتوا با AI
• 📥 دانلود مدیا
• 📊 نظرسنجی و کوییز
• 📈 آمار کانال

[GitHub](https://github.com/Arefmtl/arefera_admin_panel)`,

  en: `# 🤖 Arefera Bot

Telegram channel content management bot

**Features:**
• 🤖 AI content generation
• 📥 Media downloader
• 📊 Polls & quizzes
• 📈 Channel analytics

  [GitHub](https://github.com/Arefmtl/arefera_admin_panel)`,
};

// ─── Markdown Help ────────────────────────────────────────────────────────────
const HELP_MD = {
  fa: `# 📖 راهنمای Markdown

متن Markdown بفرستید، رندر شده برمیگرده.
کادر خاکستری = چیزی که تایپ میکنید ↓ نتیجه بعدشه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

\`\`\`
**bold**  *italic*  ~~strike~~  \`code\`  ==marked==  ||spoiler||
\`\`\`

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||

---

## Headings

\`\`\`
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
\`\`\`

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## Lists

\`\`\`
- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it
\`\`\`

- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it

---

## Links & Quotes

\`\`\`
[Telegram](https://telegram.org)

>To be, or not to be.
\`\`\`

[Telegram](https://telegram.org)

>To be, or not to be.

---

## Block Quote (چند خط)

\`\`\`
>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation
\`\`\`

>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation

---

## Unordered List (علامت‌های مختلف)

\`\`\`
- unordered list item
* unordered list item
+ unordered list item
\`\`\`

- unordered list item
* unordered list item
+ unordered list item

---

## Divider

\`\`\`
---
\`\`\`

---

## Code Blocks

\`\`\`\`
\`\`\`python
print("hello")
\`\`\`
\`\`\`\`

\`\`\`python
print("hello")
\`\`\`

---

## Tables

\`\`\`\`
| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |
\`\`\`\`

| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |

---

## Math

\`\`\`\`
Inline $E = mc^2$ and a block:
$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$
\`\`\`\`

Inline $E = mc^2$ and a block:

$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$

---

## Details

\`\`\`\`
<details><summary>**کلیک کن**</summary>
محتوای مخفی!
</details>
\`\`\`\`

<details><summary>**کلیک کن**</summary>
محتوای مخفی!
</details>

---

*محدودیت: تا 32,768 کاراکتر در هر پیام* ✨`,

  en: `# 📖 Markdown Guide

Send Markdown text and get it echoed back rendered.
Grey box = what you type ↓ result comes right after.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)
---

## Text Styles

\`\`\`
**bold**  *italic*  ~~strike~~  \`code\`  ==marked==  ||spoiler||
\`\`\`

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||

---

## Headings

\`\`\`
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
\`\`\`

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## Lists

\`\`\`
- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it
\`\`\`

- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it

---

## Unordered List (all markers)

\`\`\`
- unordered list item
* unordered list item
+ unordered list item
\`\`\`

- unordered list item
* unordered list item
+ unordered list item

---

## Links & Quotes

\`\`\`
[Telegram](https://telegram.org)

>To be, or not to be.
\`\`\`

[Telegram](https://telegram.org)

>To be, or not to be.

---

## Block Quote (multi-line)

\`\`\`
>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation
\`\`\`

>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation

---

## Divider

\`\`\`
---
\`\`\`

---

## Code Blocks

\`\`\`\`
\`\`\`python
print("hello")
\`\`\`
\`\`\`\`

\`\`\`python
print("hello")
\`\`\`

---

## Tables

\`\`\`
| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |
\`\`\`

| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |

---

## Math

\`\`\`
Inline $E = mc^2$ and a block:
$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$
\`\`\`

Inline $E = mc^2$ and a block:

$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$

---

## Details (Collapsible)

\`\`\`
<details><summary>**Click me**</summary>
Hidden content!
</details>
\`\`\`

<details><summary>**Click me**</summary>
Hidden content!
</details>

---

*Limit: up to 32,768 characters per message* ✨`,
};

// ─── HTML Help ────────────────────────────────────────────────────────────────
const HELP_HTML = {
  fa: `# 🌐 راهنمای HTML

اگه پیامت با \`<\` شروع بشه، بات به عنوان HTML رندر میکنه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

\`\`\`
<b>bold</b> <i>italic</i> <u>underline</u>
<s>strike</s> <code>code</code> <mark>marked</mark>
<tg-spoiler>spoiler</tg-spoiler>
<sup>superscript</sup> <sub>subscript</sub>
\`\`\`

<b>bold</b> <i>italic</i> <u>underline</u> <s>strike</s> <code>code</code> <mark>marked</mark> <tg-spoiler>spoiler</tg-spoiler> <sup>sup</sup> <sub>sub</sub>

---

## Headings

\`\`\`
<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>
\`\`\`

<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>

---

## Lists

\`\`\`
<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul>
  <li><input type="checkbox" checked>done</li>
  <li><input type="checkbox">todo</li>
</ul>
\`\`\`

<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul><li><input type="checkbox" checked>done</li><li><input type="checkbox">todo</li></ul>

---

## Links & Quotes

\`\`\`
<a href="https://telegram.org">Telegram</a>
<blockquote>متن نقل‌قول<cite>نویسنده</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>
\`\`\`

<a href="https://telegram.org">Telegram</a>
<blockquote>متن نقل‌قول<cite>نویسنده</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>

---

## Superscript & Subscript

\`\`\`
<sub>subscript text</sub>
<sup>superscript text</sup>
\`\`\`

متن نرمال با <sub>subscript text</sub> و <sup>superscript text</sup>

---

## Footnotes

\`\`\`
Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.
\`\`\`

Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.

---

## Code

\`\`\`
<pre><code class="language-python">print("hello")</code></pre>
\`\`\`

<pre><code class="language-python">print("hello")</code></pre>

---

## Table

\`\`\`
<table>
  <tr><th>Lang</th><th>Speed</th></tr>
  <tr><td>Rust</td><td>fast</td></tr>
  <tr><td>Py</td><td>comfy</td></tr>
</table>
\`\`\`

<table><tr><th>Lang</th><th>Speed</th></tr><tr><td>Rust</td><td>fast</td></tr><tr><td>Py</td><td>comfy</td></tr></table>

---

## Math

\`\`\`
<tg-math>x^2 + y^2</tg-math>
<tg-math-block>E = mc^2</tg-math-block>
\`\`\`

<tg-math>x^2 + y^2</tg-math>

<tg-math-block>E = mc^2</tg-math-block>

---

## Details

\`\`\`
<details open><summary>عنوان</summary>محتوا</details>
\`\`\`

<details open><summary>عنوان</summary>محتوا</details>

---

*یه HTML بفرست و ببین چطور رندر میشه* ✨`,

  en: `# 🌐 HTML Guide

If your message starts with \`<\`, the bot renders it as HTML.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

\`\`\`
<b>bold</b> <i>italic</i> <u>underline</u>
<s>strike</s> <code>code</code> <mark>marked</mark>
<tg-spoiler>spoiler</tg-spoiler>
<sup>superscript</sup> <sub>subscript</sub>
\`\`\`

<b>bold</b> <i>italic</i> <u>underline</u> <s>strike</s> <code>code</code> <mark>marked</mark> <tg-spoiler>spoiler</tg-spoiler> <sup>sup</sup> <sub>sub</sub>

---

## Headings

\`\`\`
<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>
\`\`\`

<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>

---

## Lists

\`\`\`
<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul>
  <li><input type="checkbox" checked>done</li>
  <li><input type="checkbox">todo</li>
</ul>
\`\`\`

<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul><li><input type="checkbox" checked>done</li><li><input type="checkbox">todo</li></ul>

---

## Links & Quotes

\`\`\`
<a href="https://telegram.org">Telegram</a>
<blockquote>Quote text<cite>Author</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>
\`\`\`

<a href="https://telegram.org">Telegram</a>
<blockquote>Quote text<cite>Author</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>

---

## Superscript & Subscript

\`\`\`
<sub>subscript text</sub>
<sup>superscript text</sup>
\`\`\`

Normal text with <sub>subscript text</sub> and <sup>superscript text</sup>

---

## Footnotes

\`\`\`
Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.
\`\`\`

Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.

---

## Code

\`\`\`
<pre><code class="language-python">print("hello")</code></pre>
\`\`\`

<pre><code class="language-python">print("hello")</code></pre>

---

## Table

\`\`\`
<table>
  <tr><th>Lang</th><th>Speed</th></tr>
  <tr><td>Rust</td><td>fast</td></tr>
  <tr><td>Py</td><td>comfy</td></tr>
</table>
\`\`\`

<table><tr><th>Lang</th><th>Speed</th></tr><tr><td>Rust</td><td>fast</td></tr><tr><td>Py</td><td>comfy</td></tr></table>

---

## Math

\`\`\`
<tg-math>x^2 + y^2</tg-math>
<tg-math-block>E = mc^2</tg-math-block>
\`\`\`

<tg-math>x^2 + y^2</tg-math>

<tg-math-block>E = mc^2</tg-math-block>

---

## Details (Collapsible)

\`\`\`
<details open><summary>Title</summary>Content here</details>
\`\`\`

<details open><summary>Title</summary>Content here</details>

---

*Send some HTML and watch it render* ✨`,
};

// ─── Media Help ───────────────────────────────────────────────────────────────
const HELP_MEDIA = {
  fa: `# 🖼 راهنمای مدیا

برای ارسال مدیا در Rich Message از سینتکس تصویر Markdown استفاده کنید.
URL پسوند فایل تعیین می‌کنه چه نوع مدیایی نمایش داده بشه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## نقشه

\`\`\`
<tg-map lat="41.9" long="12.5" zoom="14"/>
\`\`\`

<tg-map lat="41.9" long="12.5" zoom="14"/>

---

## عکس

\`\`\`
![](https://telegram.org/example/photo.jpg)
\`\`\`

![](https://telegram.org/example/photo.jpg)

---

## ویدیو

\`\`\`
![](https://telegram.org/example/video.mp4)
\`\`\`

![](https://telegram.org/example/video.mp4)

---

## فایل صوتی

\`\`\`
![](https://telegram.org/example/audio.mp3)
\`\`\`

![](https://telegram.org/example/audio.mp3)

---

## ویس نوت (ogg)

\`\`\`
![](https://telegram.org/example/audio.ogg)
\`\`\`

![](https://telegram.org/example/audio.ogg)

---

## انیمیشن (gif)

\`\`\`
![](https://telegram.org/example/animation.gif)
\`\`\`

![](https://telegram.org/example/animation.gif)

---

## مدیا با کپشن

\`\`\`
![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")
\`\`\`

![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")

---

## اسلایدشو (ترکیبی)

\`\`\`
<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>
\`\`\`

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

---

*پسوند URL = نوع مدیا: jpg/png=عکس · mp4=ویدیو · mp3=صوت · ogg=ویس · gif=انیمیشن* ✨`,

  en: `# 🖼 Media Guide

Use Markdown image syntax to embed media in Rich Messages.
The URL file extension determines the media type rendered.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Map

\`\`\`
<tg-map lat="41.9" long="12.5" zoom="14"/>
\`\`\`

<tg-map lat="41.9" long="12.5" zoom="14"/>

---

## Photo

\`\`\`
![](https://telegram.org/example/photo.jpg)
\`\`\`

![](https://telegram.org/example/photo.jpg)

---

## Video

\`\`\`
![](https://telegram.org/example/video.mp4)
\`\`\`

![](https://telegram.org/example/video.mp4)

---

## Audio

\`\`\`
![](https://telegram.org/example/audio.mp3)
\`\`\`

![](https://telegram.org/example/audio.mp3)

---

## Voice Note (ogg)

\`\`\`
![](https://telegram.org/example/audio.ogg)
\`\`\`

![](https://telegram.org/example/audio.ogg)

---

## Animation (gif)

\`\`\`
![](https://telegram.org/example/animation.gif)
\`\`\`

![](https://telegram.org/example/animation.gif)

---

## Media with Captions

\`\`\`
![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")
\`\`\`

![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")

---

## Slideshow (Combined)

\`\`\`
<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>
\`\`\`

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

---

*URL extension = media type: jpg/png=photo · mp4=video · mp3=audio · ogg=voice · gif=animation* ✨`,
};

// ─── Demo ─────────────────────────────────────────────────────────────────────
const DEMO = {
  fa: `# 🎨 دمو کامل — نمونه خروجی

این پیام نمونه خروجی واقعی همه قابلیت‌هاست.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||
<u>underline</u> <sup>super</sup> <sub>sub</sub>

---

## Nested Formatting

**Bold _italic <u>underlined italic bold</u> italic_ bold**

>نقل‌قول با **bold**، ~~strikethrough~~، و ||spoiler||، و [لینک](https://t.me/).

---

## Lists

- آیتم با \`inline code\` و **bold**
- آیتم با ~~strikethrough~~ و ==highlight==
- [ ] کار انجام نشده
- [x] کار انجام شده

1. اول
2. دوم
3. سوم

---

## Code Block

\`\`\`python
def greet(name: str) -> str:
    return f"سلام، {name}!"

print(greet("تلگرام"))
\`\`\`

---

## Table

| متریک  | مقدار     | وضعیت    |
|:--------|:---------:|---------:|
| سرعت   | **42** ms | ==fast== |
| حافظه  | 128 MB    | ==ok==   |
| آپتایم | 99.9%     | ~~down~~ |

---

## Math

Inline: $E = mc^2$ و $x^2 + y^2 = r^2$

$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

---

## Details

<details open><summary>**جزئیات بیشتر — کلیک کن**</summary>

### داخل Details

- **Markdown** داخل details کار میکنه
- جدول، کد، لیست همه سازگارن

| Key | Value |
|:----|------:|
| A   | 1     |
| B   | 2     |

\`\`\`js
console.log("inside details!");
\`\`\`

</details>

---

## Media — اسلایدشو ترکیبی

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

---

🗽 [GitHub](https://github.com/DarknessShade) •|• 🗽 [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom) •|• 🗽 [ConfigWireguard](https://t.me/ConfigWireguard)`,

  en: `# 🎨 Full Demo — Live Output Sample

This message demonstrates every supported feature rendered live.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||
<u>underline</u> <sup>super</sup> <sub>sub</sub>

---

## Nested Formatting

**Bold _italic <u>underlined italic bold</u> italic_ bold**

>Quote with **bold**, ~~strikethrough~~, and ||spoiler||, plus [a link](https://t.me/).

---

## Lists

- Item with \`inline code\` and **bold**
- Item with ~~strikethrough~~ and ==highlight==
- [ ] Task todo
- [x] Task done

1. First
2. Second
3. Third

---

## Code Block

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Telegram"))
\`\`\`

---

## Table

| Metric  | Value      | Status    |
|:--------|:----------:|---------:|
| Speed   | **42** ms  | ==fast==  |
| Memory  | 128 MB     | ==ok==    |
| Uptime  | 99.9%      | ~~down~~  |

---

## Math

Inline: $E = mc^2$ and $x^2 + y^2 = r^2$

$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

---

## Details (Collapsible)

<details open><summary>**More details — click me**</summary>

### Inside Details

- **Markdown** works inside details
- Tables, code, lists all supported

| Key | Value |
|:----|------:|
| A   | 1     |
| B   | 2     |

\`\`\`js
console.log("inside details!");
\`\`\`

</details>

---

## Media — Combined Slideshow

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

`,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  NEW HELP TEXTS (v2 features)
// ═══════════════════════════════════════════════════════════════════════════════

const AI_HELP = {
  fa: `# 🤖 هوش مصنوعی

با AI محتوا تولید کنید و به کانال‌ها بفرستید یا زمان‌بندی کنید.

## دستورات

— \`/ai <پرامپت>\` — تولید محتوا + پیش‌نمایش + دکمه‌های ارسال/زمان‌بندی
— \`/askai\` — ورود به حالت چت چندنوبته با AI (حافظه مکالمه)
— \`/scheduleai\` — تولید + انتخاب کانال + انتخاب زمان + ارسال خودکار
— \`/scheduled\` — لیست زمان‌بندی‌های ثبت‌شده با جزئیات
— \`/cancel <id>\` — لغو زمان‌بندی
— \`/aiconfig <provider> <apiKey>\` — تنظیم AI (ادمین)
— \`/aimodel <model>\` — تغییر مدل (ادمین)
— \`/aisystem <text>\` — تغییر system prompt (ادمین)

## Providers پشتیبانی‌شده

— \`openai\` — GPT-4o, GPT-4o-mini, ...
— \`groq\` — Llama 3.3 70B (رایگان و سریع)
— \`together\` — مدل‌های متن‌باز
— \`openrouter\` — دسترسی به ده‌ها مدل
— \`custom\` — هر API سازگار با OpenAI

## شروع سریع

1. ادمین: \`/aiconfig groq gsk_your_key\`
2. همه: \`/ai یک پست جذاب درباره هوش مصنوعی بنویس\`
3. روی دکمه‌ها کلیک کنید: ارسال فوری یا زمان‌بندی

## نکات

— حداکثر 4000 توکن در هر درخواست
— پشتیبانی از streaming برای پاسخ‌های سریع‌تر
— نمایش مصرف توکن بعد از تولید
— تلاش مجدد خودکار در صورت خطا`,

  en: `# 🤖 AI Module

Generate content with AI, send to channels, or schedule for later.

## Commands

— \`/ai <prompt>\` — generate content + preview + send/schedule buttons
— \`/askai\` — enter multi-turn AI chat mode (conversation memory)
— \`/scheduleai\` — generate + pick channels + pick time + auto-send
— \`/scheduled\` — list scheduled posts with details
— \`/cancel <id>\` — cancel a scheduled post
— \`/aiconfig <provider> <apiKey>\` — configure AI (admin)
— \`/aimodel <model>\` — change model (admin)
— \`/aisystem <text>\` — change system prompt (admin)

## Supported Providers

— \`openai\` — GPT-4o, GPT-4o-mini, ...
— \`groq\` — Llama 3.3 70B (free & fast)
— \`together\` — open-source models
— \`openrouter\` — access dozens of models
— \`custom\` — any OpenAI-compatible API

## Quick Start

1. Admin: \`/aiconfig groq gsk_your_key\`
2. Anyone: \`/ai Write an engaging post about AI\`
3. Click buttons: send now or schedule

## Notes

— Max 4000 tokens per request
— Streaming support for faster responses
— Token usage shown after generation
— Auto-retry on errors`,
};

const AI_CONFIG_HELP = {
  fa: `⚙️ **تنظیمات AI**

برای فعال‌سازی AI، Provider و API Key را تنظیم کنید:

**فرمت:**
\`/aiconfig <provider> <apiKey>\`

**مثال‌ها:**
\`/aiconfig openai sk-proj-xxxxx\`
\`/aiconfig groq gsk_xxxxx\`
\`/aiconfig custom sk-xxx https://my-api.com/v1\`

**Providers:** openai · groq · together · openrouter · custom

بعد از تنظیم، می‌توانید مدل را هم عوض کنید:
\`/aimodel gpt-4o\``,

  en: `⚙️ **AI Settings**

To enable AI, set the Provider and API Key:

**Format:**
\`/aiconfig <provider> <apiKey>\`

**Examples:**
\`/aiconfig openai sk-proj-xxxxx\`
\`/aiconfig groq gsk_xxxxx\`
\`/aiconfig custom sk-xxx https://my-api.com/v1\`

**Providers:** openai · groq · together · openrouter · custom

After setting, you can change the model:
\`/aimodel gpt-4o\``,
};

const TOOLS_HELP = {
  fa: `# 🛠 ابزارها

## 📥 دانلود مدیا

لینک بده، فایل بگیر.

**پشتیبانی از:**
— YouTube (ویدیو/صدا)
— TikTok · Instagram · Twitter/X
— Facebook · Reddit · Pinterest
— SoundCloud · Bandcamp
— GitHub (فایل مستقیم)
— و ده‌ها سایت دیگر

**نحوه استفاده:**
\`/dl https://youtu.be/xxxxx\`
\`/dl https://github.com/user/repo/raw/main/file.py\`

⚠️ فایل‌های بزرگ‌تر از 45MB به صورت لینک ارسال می‌شوند.

**پشتیبانی از RapidAPI:**
\`RAPIDAPI_KEY\` را تنظیم کنید برای دانلود سریع‌تر و بدون محدودیت.

## 📈 آمار کانال‌ها

\`/stats\` — نمایش آمار زنده کانال‌ها

**قابلیت‌ها:**
— تعداد اعضا و رشد (+📈/📉)
— نرخ موفقیت ارسال با نوار پیشرفت
— زمان آخرین ارسال
— ذخیره تاریخچه رشد در KV

## ⚡ دستورات اینلاین

در هر چتی تایپ کن \`@botname\` سپس:
— یک URL → پیشنهاد دانلود
— \`ai <prompt>\` → تولید محتوا
— \`help\` → لیست دستورات`,

  en: `# 🛠 Tools

## 📥 Media Downloader

Give a link, get the file.

**Supports:**
— YouTube (video/audio)
— TikTok · Instagram · Twitter/X
— Facebook · Reddit · Pinterest
— SoundCloud · Bandcamp
— GitHub (direct files)
— and dozens more sites

**Usage:**
\`/dl https://youtu.be/xxxxx\`
\`/dl https://github.com/user/repo/raw/main/file.py\`

⚠️ Files larger than 45MB are sent as download links.

**RapidAPI Support:**
Set \`RAPIDAPI_KEY\` for faster, unlimited downloads.

## 📈 Channel Analytics

\`/stats\` — live channel statistics

**Features:**
— Member count and growth (+📈/📉)
— Delivery success rate with progress bars
— Last post time
— Growth history stored in KV

## ⚡ Inline Commands

In any chat, type \`@botname\` then:
— a URL → download suggestion
— \`ai <prompt>\` → generate content
— \`help\` → list all commands`,
};

const DOWNLOAD_HELP = {
  fa: `# 📥 دانلود مدیا

لینک بفرست، فایل بگیر.

## نمونه‌ها

\`\`\`
/dl https://youtu.be/dQw4w9WgXcQ
/dl https://www.tiktok.com/@user/video/123
/dl https://github.com/user/repo/raw/main/script.py
/dl https://github.com/user/repo/blob/main/README.md
/dl https://github.com/user/repo/releases/download/v1.0/app.exe
\`\`\`

## پشتیبانی از

— **YouTube** — ویدیو یا صدا
— **Spotify** — metadata / preview (صوت کامل نیاز به Premium دارد)
— **TikTok** · **Instagram** · **Twitter/X**
— **SoundCloud** · **Bandcamp** · **Pinterest**
— **GitHub** — فایل‌های مستقیم (raw / blob / releases)
— و ده‌ها سایت دیگر (از طریق cobalt)

## محدودیت‌ها

— حداکثر 45MB برای ارسال مستقیم (محدودیت Telegram Bot API)
— فایل‌های بزرگ‌تر به صورت لینک ارسال می‌شوند
— برخی سایت‌ها ممکن است نیاز به ورود داشته باشند (پشتیبانی نمی‌شود)

## خود-میزبان cobalt

برای پایداری بیشتر، می‌توانید cobalt را خودتان میزبانی کنید و آدرس آن را در \`COBALT_API_URL\` تنظیم کنید.

## RapidAPI

برای دانلود سریع‌تر و بدون محدودیت، کلید RapidAPI خود را تنظیم کنید:
\`RAPIDAPI_KEY=your_key\`

سرویس‌های پشتیبانی شده:
— YouTube: youtube-media-downloader1.p.rapidapi.com
— TikTok: tiktok-downloader-api-tiktok.p.rapidapi.com
— Instagram: instagram-downloader.p.rapidapi.com
— Twitter: twitter-api45.p.rapidapi.com`,

  en: `# 📥 Media Downloader

Send a link, get the file.

## Examples

\`\`\`
/dl https://youtu.be/dQw4w9WgXcQ
/dl https://www.tiktok.com/@user/video/123
/dl https://github.com/user/repo/raw/main/script.py
/dl https://github.com/user/repo/blob/main/README.md
/dl https://github.com/user/repo/releases/download/v1.0/app.exe
\`\`\`

## Supported

— **YouTube** — video or audio
— **Spotify** — metadata / preview (full audio requires Premium)
— **TikTok** · **Instagram** · **Twitter/X**
— **SoundCloud** · **Bandcamp** · **Pinterest**
— **GitHub** — direct files (raw / blob / releases)
— and dozens more sites (via cobalt)

## Limitations

— Max 45MB for direct upload (Telegram Bot API limit)
— Larger files are sent as download links
— Some sites may require login (not supported)

## Self-host cobalt

For better reliability, you can self-host cobalt and set its URL in \`COBALT_API_URL\`.

## RapidAPI

For faster, unlimited downloads, set your RapidAPI key:
\`RAPIDAPI_KEY=your_key\`

Supported services:
— YouTube: youtube-media-downloader1.p.rapidapi.com
— TikTok: tiktok-downloader-api-tiktok.p.rapidapi.com
— Instagram: instagram-downloader.p.rapidapi.com
— Twitter: twitter-api45.p.rapidapi.com`,
};

const POLL_HELP = {
  fa: `# 📊 نظرسنجی و کوییز

## ساخت نظرسنجی

\`\`\`
/poll سوال؟ | گزینه ۱ | گزینه ۲ | گزینه ۳
\`\`\`

مثال:
\`\`\`
/poll بهترین زبان برنامه‌نویسی؟ | Python | JavaScript | Rust | Go
\`\`\`

## نظرسنجی غیرناشناس

برای نمایش رأی‌دهندگان:
\`\`\`
/poll! سوال؟ | گزینه ۱ | گزینه ۲
\`\`\`

## محدودیت زمانی

اضافه کردن \`:<زمان>\` در انتهای گزینه‌ها:
\`\`\`
/poll سوال؟ | گزینه۱ | گزینه۲ | :30m
/poll سوال؟ | گزینه۱ | گزینه۲ | :2h
\`\`\`

## ساخت کوییز (با جواب درست)

علامت \`!\` قبل از گزینه درست:
\`\`\`
/quiz پایتخت فرانسه؟ | لندن | !پاریس | برلین
\`\`\`

## مشاهده نتایج

\`/pollstats\` — لیست همه نظرسنجی‌ها با:
— درصد آرا و نمودار میله‌ای
— وضعیت فعال/غیرفعال (🟢/🔴)
— اطلاعات رأی‌دهندگان (برای نظرسنجی غیرناشناس)
— زمان باقیمانده (برای نظرسنجی با محدودیت زمانی)

## لغو زمان‌بندی

\`/cancel <id>\` — لغو پست زمان‌بندی شده

## نکات

— تا 10 گزینه قابل قبول
— نتایج به‌صورت زنده در \`/pollstats\` نمایش داده می‌شوند
— نظرسنجی‌های منقضی شده با 🔴 نشان داده می‌شوند`,

  en: `# 📊 Polls & Quizzes

## Create a Poll

\`\`\`
/poll Question? | Option 1 | Option 2 | Option 3
\`\`\`

Example:
\`\`\`
/poll Best programming language? | Python | JavaScript | Rust | Go
\`\`\`

## Non-Anonymous Poll

To show voters:
\`\`\`
/poll! Question? | Option 1 | Option 2
\`\`\`

## Time Limit

Add \`:<time>\` at the end of options:
\`\`\`
/poll Q? | Opt1 | Opt2 | :30m
/poll Q? | Opt1 | Opt2 | :2h
\`\`\`

## Create a Quiz (with correct answer)

Mark the correct option with \`!\`:
\`\`\`
/quiz Capital of France? | London | !Paris | Berlin
\`\`\`

## View Results

\`/pollstats\` — list all polls with:
— Vote percentages and bar charts
— Active/inactive status (🟢/🔴)
— Voter information (for non-anonymous polls)
— Time remaining (for time-limited polls)

## Cancel Scheduled

\`/cancel <id>\` — cancel a scheduled post

## Notes

— Up to 10 options
— Results update live in \`/pollstats\`
— Expired polls shown with 🔴`,
};
