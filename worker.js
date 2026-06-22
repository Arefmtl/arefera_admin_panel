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
  return {
    botToken: token,
    ownerId: owner,
    webhookSecret: secret,
    webAppUrl,
    cobaltUrl,
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
          features: ["rich-markdown", "admin-panel", "ai", "media-downloader", "polls", "analytics", "web-app", "inline"],
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
  return json({
    ok: res.ok,
    webhook_url: hookUrl,
    setWebhook: res,
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
    const raw = await env.BOT_DB.get("admins");
    let list = raw ? JSON.parse(raw) : [];
    if (!list.includes(cfg.ownerId)) list = [cfg.ownerId, ...list];
    return list;
  } catch {
    return [cfg.ownerId];
  }
}

async function setAdmins(env, list, cfg) {
  if (!list.includes(cfg.ownerId)) list = [cfg.ownerId, ...list];
  list = [...new Set(list)];
  await env.BOT_DB.put("admins", JSON.stringify(list));
  return list;
}

async function isAdmin(env, userId, cfg) {
  const admins = await getAdmins(env, cfg);
  return admins.includes(userId);
}

async function getChannels(env) {
  try {
    const raw = await env.BOT_DB.get("channels");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setChannels(env, list) {
  await env.BOT_DB.put("channels", JSON.stringify(list));
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
// Stored config overrides env vars. getAiConfig() merges KV (if present) over
// env defaults so a worker redeploy doesn't wipe admin-set keys.
async function getAiConfig(env) {
  let kvConfig = null;
  try {
    const raw = await env.BOT_DB.get("ai_config");
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
  await env.BOT_DB.put("ai_config", JSON.stringify(config));
}

// ─── Scheduled AI posts (KV key "scheduled_posts") ───────────────────────────
async function getScheduledPosts(env) {
  try {
    const raw = await env.BOT_DB.get("scheduled_posts");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveScheduledPosts(env, list) {
  await env.BOT_DB.put("scheduled_posts", JSON.stringify(list));
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
    const raw = await env.BOT_DB.get("polls");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function savePolls(env, list) {
  await env.BOT_DB.put("polls", JSON.stringify(list));
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
//  Keyboards
// ═══════════════════════════════════════════════════════════════════════════════
function mainKeyboard(lang, admin, cfg) {
  const adminRow = admin
    ? (lang === "fa"
        ? [
            { text: "📝 ساخت پست", callback_data: "fa_newpost" },
            { text: "⚙️ پنل ادمین", callback_data: "fa_admin_panel" },
          ]
        : [
            { text: "📝 New Post", callback_data: "en_newpost" },
            { text: "⚙️ Admin Panel", callback_data: "en_admin_panel" },
          ])
    : null;

  if (lang === "fa") {
    const rows = [
      [
        { text: "📖 راهنمای Markdown", callback_data: "fa_help_md"   },
        { text: "🌐 راهنمای HTML",     callback_data: "fa_help_html" },
      ],
      [
        { text: "🤖 هوش مصنوعی", callback_data: "fa_ai_menu" },
        { text: "🛠 ابزارها",     callback_data: "fa_tools_menu" },
      ],
      [
        { text: "📊 نظرسنجی",  callback_data: "fa_poll_menu" },
        { text: "📈 آمار کانال", callback_data: "fa_stats_menu" },
      ],
      [
        { text: "🎨 دمو کامل",   callback_data: "fa_demo"  },
        { text: "ℹ️ درباره بات", callback_data: "fa_about" },
      ],
    ];
    if (cfg && cfg.webAppUrl) {
      rows.push([{ text: "🌐 پنل وب", web_app: { url: cfg.webAppUrl } }]);
    }
    rows.push([{ text: "🇬🇧 Switch to English", callback_data: "en_start" }]);
    if (adminRow) rows.push(adminRow);
    return { inline_keyboard: rows };
  }

  const rows = [
    [
      { text: "📖 Markdown Guide", callback_data: "en_help_md"   },
      { text: "🌐 HTML Guide",     callback_data: "en_help_html" },
    ],
    [
      { text: "🤖 AI", callback_data: "en_ai_menu" },
      { text: "🛠 Tools", callback_data: "en_tools_menu" },
    ],
    [
      { text: "📊 Polls", callback_data: "en_poll_menu" },
      { text: "📈 Analytics", callback_data: "en_stats_menu" },
    ],
    [
      { text: "🎨 Full Demo", callback_data: "en_demo"  },
      { text: "ℹ️ About",     callback_data: "en_about" },
    ],
  ];
  if (cfg && cfg.webAppUrl) {
    rows.push([{ text: "🌐 Web Panel", web_app: { url: cfg.webAppUrl } }]);
  }
  rows.push([{ text: "🇮🇷 تغییر به فارسی", callback_data: "fa_start" }]);
  if (adminRow) rows.push(adminRow);
  return { inline_keyboard: rows };
}

// ─── AI menu keyboard ─────────────────────────────────────────────────────────
function aiMenuKeyboard(lang, cfg) {
  const aiConfigured = cfg && cfg._aiConfigured;
  if (lang === "fa") {
    const rows = [
      [{ text: aiConfigured ? "💬 چت با AI (/askai)" : "⚙️ تنظیم AI اول", callback_data: "fa_ai_help" }],
      [{ text: "✨ تولید محتوا با AI", callback_data: "fa_ai_generate" }],
      [{ text: "⏰ زمان‌بندی ارسال AI", callback_data: "fa_ai_schedule" }],
      [{ text: "📋 لیست زمان‌بندی‌ها", callback_data: "fa_ai_scheduled_list" }],
      [{ text: "⚙️ تنظیمات AI", callback_data: "fa_ai_config_menu" }],
      [{ text: "⬅️ بازگشت به منو", callback_data: "fa_back" }],
    ];
    return { inline_keyboard: rows };
  }
  const rows = [
    [{ text: aiConfigured ? "💬 Chat with AI (/askai)" : "⚙️ Set up AI first", callback_data: "en_ai_help" }],
    [{ text: "✨ Generate Content", callback_data: "en_ai_generate" }],
    [{ text: "⏰ Schedule AI Post", callback_data: "en_ai_schedule" }],
    [{ text: "📋 Scheduled Posts", callback_data: "en_ai_scheduled_list" }],
    [{ text: "⚙️ AI Settings", callback_data: "en_ai_config_menu" }],
    [{ text: "⬅️ Back to Menu", callback_data: "en_back" }],
  ];
  return { inline_keyboard: rows };
}

// ─── Tools menu keyboard (download + misc) ────────────────────────────────────
function toolsMenuKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [{ text: "📥 دانلود مدیا (/dl)", callback_data: "fa_dl_help" }],
      [{ text: "📖 راهنمای مدیا", callback_data: "fa_help_media" }],
      [{ text: "⬅️ بازگشت به منو", callback_data: "fa_back" }],
    ],
  };
  return {
    inline_keyboard: [
      [{ text: "📥 Download Media (/dl)", callback_data: "en_dl_help" }],
      [{ text: "📖 Media Guide", callback_data: "en_help_media" }],
      [{ text: "⬅️ Back to Menu", callback_data: "en_back" }],
    ],
  };
}

// ─── Poll menu keyboard ───────────────────────────────────────────────────────
function pollMenuKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [{ text: "📊 ساخت نظرسنجی", callback_data: "fa_poll_help" }],
      [{ text: "🎯 ساخت کوییز", callback_data: "fa_poll_help" }],
      [{ text: "📋 لیست نظرسنجی‌ها", callback_data: "fa_poll_list" }],
      [{ text: "⬅️ بازگشت به منو", callback_data: "fa_back" }],
    ],
  };
  return {
    inline_keyboard: [
      [{ text: "📊 Create Poll", callback_data: "en_poll_help" }],
      [{ text: "🎯 Create Quiz", callback_data: "en_poll_help" }],
      [{ text: "📋 List Polls", callback_data: "en_poll_list" }],
      [{ text: "⬅️ Back to Menu", callback_data: "en_back" }],
    ],
  };
}

// ─── AI config menu keyboard (admin) ──────────────────────────────────────────
function aiConfigMenuKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [{ text: "🔑 تنظیم Provider + API Key", callback_data: "fa_ai_config_set" }],
      [{ text: "🤖 تغییر مدل", callback_data: "fa_ai_model_set" }],
      [{ text: "📝 تغییر System Prompt", callback_data: "fa_ai_system_set" }],
      [{ text: "👁 نمایش تنظیمات", callback_data: "fa_ai_config_show" }],
      [{ text: "⬅️ بازگشت", callback_data: "fa_ai_menu" }],
    ],
  };
  return {
    inline_keyboard: [
      [{ text: "🔑 Set Provider + API Key", callback_data: "en_ai_config_set" }],
      [{ text: "🤖 Change Model", callback_data: "en_ai_model_set" }],
      [{ text: "📝 Change System Prompt", callback_data: "en_ai_system_set" }],
      [{ text: "👁 Show Config", callback_data: "en_ai_config_show" }],
      [{ text: "⬅️ Back", callback_data: "en_ai_menu" }],
    ],
  };
}

// ─── AI preview keyboard (after generation, before send/schedule) ─────────────
function aiPreviewKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [
        { text: "📤 ارسال به کانال", callback_data: "fa_ai_send_now" },
        { text: "⏰ زمان‌بندی", callback_data: "fa_ai_schedule_this" },
      ],
      [
        { text: "🔄 تولید مجدد", callback_data: "fa_ai_regenerate" },
        { text: "✏️ ویرایش", callback_data: "fa_ai_edit" },
      ],
      [{ text: "❌ لغو", callback_data: "fa_cancel" }],
    ],
  };
  return {
    inline_keyboard: [
      [
        { text: "📤 Send to Channel", callback_data: "en_ai_send_now" },
        { text: "⏰ Schedule", callback_data: "en_ai_schedule_this" },
      ],
      [
        { text: "🔄 Regenerate", callback_data: "en_ai_regenerate" },
        { text: "✏️ Edit", callback_data: "en_ai_edit" },
      ],
      [{ text: "❌ Cancel", callback_data: "en_cancel" }],
    ],
  };
}

// ─── Channel select keyboard (reused for AI send + AI schedule) ───────────────
// `mode` is either "ai_send" or "ai_schedule" — stored in callback_data prefix.
function aiChannelSelectKeyboard(lang, channels, selected, mode) {
  const rows = channels.map(ch => {
    const checked = selected.includes(String(ch.id)) ? "✅ " : "▫️ ";
    return [{ text: `${checked}${ch.title}`, callback_data: `${lang}_ai_${mode}_ch_${ch.id}` }];
  });
  if (lang === "fa") {
    rows.push([{ text: "✅ ادامه", callback_data: `fa_ai_${mode}_confirm` }]);
    rows.push([{ text: "❌ لغو", callback_data: "fa_cancel" }]);
  } else {
    rows.push([{ text: "✅ Continue", callback_data: `en_ai_${mode}_confirm` }]);
    rows.push([{ text: "❌ Cancel", callback_data: "en_cancel" }]);
  }
  return { inline_keyboard: rows };
}

function backKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        lang === "fa"
          ? { text: "⬅️ بازگشت به منو", callback_data: "fa_back" }
          : { text: "⬅️ Back to Menu",  callback_data: "en_back" },
        lang === "fa"
          ? { text: "🇬🇧 English", callback_data: "en_start" }
          : { text: "🇮🇷 فارسی",  callback_data: "fa_start" },
      ],
    ],
  };
}

// ─── Admin panel ──────────────────────────────────────────────────────────────
function adminPanelKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [
        { text: "👤 مدیریت ادمین‌ها", callback_data: "fa_admins_menu" },
        { text: "📡 مدیریت کانال‌ها", callback_data: "fa_channels_menu" },
      ],
      [{ text: "📝 ساخت پست", callback_data: "fa_newpost" }],
      [{ text: "⬅️ بازگشت به منو", callback_data: "fa_back" }],
    ],
  };
  return {
    inline_keyboard: [
      [
        { text: "👤 Manage Admins", callback_data: "en_admins_menu" },
        { text: "📡 Manage Channels", callback_data: "en_channels_menu" },
      ],
      [{ text: "📝 New Post", callback_data: "en_newpost" }],
      [{ text: "⬅️ Back to Menu", callback_data: "en_back" }],
    ],
  };
}

function adminsMenuKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [{ text: "➕ افزودن ادمین", callback_data: "fa_admin_add" }],
      [{ text: "➖ حذف ادمین", callback_data: "fa_admin_remove" }],
      [{ text: "📋 لیست ادمین‌ها", callback_data: "fa_admin_list" }],
      [{ text: "⬅️ بازگشت", callback_data: "fa_admin_panel" }],
    ],
  };
  return {
    inline_keyboard: [
      [{ text: "➕ Add Admin", callback_data: "en_admin_add" }],
      [{ text: "➖ Remove Admin", callback_data: "en_admin_remove" }],
      [{ text: "📋 List Admins", callback_data: "en_admin_list" }],
      [{ text: "⬅️ Back", callback_data: "en_admin_panel" }],
    ],
  };
}

function channelsMenuKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [{ text: "➕ افزودن کانال", callback_data: "fa_channel_add" }],
      [{ text: "➖ حذف کانال", callback_data: "fa_channel_remove" }],
      [{ text: "📋 لیست کانال‌ها", callback_data: "fa_channel_list" }],
      [{ text: "⬅️ بازگشت", callback_data: "fa_admin_panel" }],
    ],
  };
  return {
    inline_keyboard: [
      [{ text: "➕ Add Channel", callback_data: "en_channel_add" }],
      [{ text: "➖ Remove Channel", callback_data: "en_channel_remove" }],
      [{ text: "📋 List Channels", callback_data: "en_channel_list" }],
      [{ text: "⬅️ Back", callback_data: "en_admin_panel" }],
    ],
  };
}

function cancelKeyboard(lang) {
  if (lang === "fa") return { inline_keyboard: [[{ text: "❌ لغو", callback_data: "fa_cancel" }]] };
  return { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "en_cancel" }]] };
}

// آیا برای پست دکمه اضافه شود؟
function askButtonsKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [
        { text: "✅ آره", callback_data: "fa_post_btn_yes" },
        { text: "❌ نه",  callback_data: "fa_post_btn_no" },
      ],
      [{ text: "❌ لغو", callback_data: "fa_cancel" }],
    ],
  };
  return {
    inline_keyboard: [
      [
        { text: "✅ Yes", callback_data: "en_post_btn_yes" },
        { text: "❌ No",  callback_data: "en_post_btn_no" },
      ],
      [{ text: "❌ Cancel", callback_data: "en_cancel" }],
    ],
  };
}

// پیش‌نمایش: تایید / ویرایش / لغو
function previewKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [{ text: "✅ تایید و ادامه", callback_data: "fa_post_confirm" }],
      [
        { text: "✏️ ویرایش متن", callback_data: "fa_post_edit_text" },
        { text: "✏️ ویرایش دکمه‌ها", callback_data: "fa_post_edit_btns" },
      ],
      [{ text: "❌ لغو", callback_data: "fa_cancel" }],
    ],
  };
  return {
    inline_keyboard: [
      [{ text: "✅ Confirm & Continue", callback_data: "en_post_confirm" }],
      [
        { text: "✏️ Edit Text", callback_data: "en_post_edit_text" },
        { text: "✏️ Edit Buttons", callback_data: "en_post_edit_btns" },
      ],
      [{ text: "❌ Cancel", callback_data: "en_cancel" }],
    ],
  };
}

// Select channels to send (multiple selection)
function channelSelectKeyboard(lang, channels, selected) {
  const rows = channels.map(ch => {
    const checked = selected.includes(String(ch.id)) ? "✅ " : "▫️ ";
    return [{ text: `${checked}${ch.title}`, callback_data: `${lang}_post_ch_${ch.id}` }];
  });
  if (lang === "fa") {
    rows.push([{ text: "📤 ارسال به موارد انتخاب شده", callback_data: "fa_post_send" }]);
    rows.push([{ text: "❌ لغو", callback_data: "fa_cancel" }]);
  } else {
    rows.push([{ text: "📤 Send to Selected", callback_data: "en_post_send" }]);
    rows.push([{ text: "❌ Cancel", callback_data: "en_cancel" }]);
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
  if (cmd === "cancel") {
    await setState(env, userId, null);
    await sendPlain(cfg, chatId, langFa(cfg, userId) ? "❌ عملیات لغو شد." : "❌ Operation cancelled.");
    return;
  }

  // /webapp — open web panel
  if (cmd === "webapp" || cmd === "panel") {
    if (cfg.webAppUrl) {
      await sendPlain(cfg, chatId,
        langFa(cfg, userId) ? "🌐 پنل ادمین وب:" : "🌐 Web admin panel:",
        { inline_keyboard: [[{ text: langFa(cfg, userId) ? "🌐 باز کردن پنل" : "🌐 Open Panel", web_app: { url: cfg.webAppUrl } }]] }
      );
    } else {
      await sendPlain(cfg, chatId, langFa(cfg, userId)
        ? "⚠️ پنل وب تنظیم نشده. WEB_APP_URL را در تنظیمات Worker قرار دهید."
        : "⚠️ Web panel not configured. Set WEB_APP_URL in the Worker settings.");
    }
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
    await showScheduledList(env, cfg, chatId, userId);
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
        ? "📥 دانلود مدیا\n\nنحوه استفاده:\n`/dl https://youtu.be/xxxxx`\n`/dl https://github.com/user/repo/raw/...`\n\nپشتیبانی از: YouTube, Spotify (metadata), TikTok, Instagram, Twitter/X, SoundCloud, GitHub و...\n\n⚠️ فایل‌های بزرگ‌تر از 45MB به صورت لینک ارسال می‌شوند."
        : "📥 Media Downloader\n\nUsage:\n`/dl https://youtu.be/xxxxx`\n`/dl https://github.com/user/repo/raw/...`\n\nSupports: YouTube, Spotify (metadata), TikTok, Instagram, Twitter/X, SoundCloud, GitHub, and more.\n\n⚠️ Files larger than 45MB are sent as download links.");
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

    const isHtml = text.startsWith("<") || /<\/?\w/.test(text);
    const newState = {
      action: "post_await_buttons_choice",
      lang,
      text,
      isHtml,
      buttons: null,
    };
    await setState(env, userId, newState);

    // Show converted post (preview)
    if (isHtml) await sendRichHtml(cfg, chatId, text);
    else await sendRichMarkdown(cfg, chatId, text);

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
        ? "⚠️ فرمت دکمه‌ها نامعتبر است. لطفاً مطابق نمونه ارسال کنید یا /cancel بزنید.\n\nنمونه:\nButton💠 - https://link.com\n\nButton🩵 - http://a.ai | Button💙 - http://b.ai\n\nButton🟣 - http://d.ai | Button🟠 - http://c.ai | Button💚 - http://e.ai"
        : "⚠️ Invalid button format. Please follow the example or /cancel.\n\nExample:\nButton💠 - https://link.com\n\nButton🩵 - http://a.ai | Button💙 - http://b.ai\n\nButton🟣 - http://d.ai | Button🟠 - http://c.ai | Button💚 - http://e.ai");
      return true;
    }

    const newState = { ...state, action: "post_preview", buttons: parsed };
    await setState(env, userId, newState);
    await sendPostPreview(env, cfg, chatId, newState);
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
    // Parse "YYYY-MM-DD HH:MM" in the user's local time. We treat the input
    // as UTC for simplicity — the admin can adjust. Also accept relative
    // formats like "in 2h" or "in 30m" for convenience.
    let sendAt = null;
    const relMatch = trimmed.match(/^in\s+(\d+)\s*(m|min|minutes?|h|hr|hours?|d|days?)$/i);
    if (relMatch) {
      const num = parseInt(relMatch[1], 10);
      const unit = relMatch[2].toLowerCase();
      const mult = unit.startsWith("m") ? 60000 : unit.startsWith("h") ? 3600000 : 86400000;
      sendAt = Date.now() + num * mult;
    } else {
      // Try YYYY-MM-DD HH:MM
      const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[\s T]+(\d{2}):(\d{2})/);
      if (m) {
        sendAt = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`).getTime();
      }
    }

    if (!sendAt || isNaN(sendAt)) {
      await sendPlain(cfg, chatId, lang === "fa"
        ? "⚠️ فرمت زمان نامعتبر. استفاده:\n• `2024-12-25 14:30`\n• `in 2h`\n• `in 30m`\n• `in 1d`\n\nبرای لغو /cancel"
        : "⚠️ Invalid time format. Use:\n• `2024-12-25 14:30`\n• `in 2h`\n• `in 30m`\n• `in 1d`\n\n/cancel to abort");
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

    const dateStr = new Date(sendAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
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

// ─── Send a post preview with approve/edit/cancel buttons and options ────────
async function sendPostPreview(env, cfg, chatId, state) {
  const lang = state.lang || "fa";
  const replyMarkup = state.buttons ? { inline_keyboard: state.buttons } : undefined;

  if (state.isHtml) await sendRichHtml(cfg, chatId, state.text, replyMarkup);
  else await sendRichMarkdown(cfg, chatId, state.text, replyMarkup);

  await sendPlain(cfg, chatId,
    lang === "fa"
      ? "👆 این پیش‌نمایش پست شماست. در صورت تایید، در مرحله بعد کانال‌های ارسال را انتخاب کنید."
      : "👆 This is your post preview. If confirmed, you'll choose channels to send to next.",
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
        ? "⏰ زمان ارسال را بفرستید:\n• `2024-12-25 14:30` (UTC)\n• `in 2h`\n• `in 30m`\n• `in 1d`\n\nبرای لغو /cancel"
        : "⏰ Send the time:\n• `2024-12-25 14:30` (UTC)\n• `in 2h`\n• `in 30m`\n• `in 1d`\n\n/cancel to abort",
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
  if (action === "poll_list") {
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

  if (action === "admin_add") {
    await setState(env, userId, { action: "admin_add", lang });
    const txt = lang === "fa"
      ? "➕ **افزودن ادمین**\n\nآیدی عددی تلگرام کاربر مورد نظر را ارسال کنید.\nبرای گرفتن آیدی عددی می‌توانید از بات‌هایی مثل @userinfobot استفاده کنید.\n\nبرای لغو /cancel را ارسال کنید."
      : "➕ **Add Admin**\n\nSend the numeric Telegram user ID of the user.\nYou can use bots like @userinfobot to get a user's numeric ID.\n\nSend /cancel to abort.";
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  if (action === "admin_remove") {
    await setState(env, userId, { action: "admin_remove", lang });
    const admins = await getAdmins(env, cfg);
    const txt = (lang === "fa"
      ? `➖ **حذف ادمین**\n\nآیدی عددی ادمینی که می‌خواهید حذف کنید را ارسال کنید.\n(مالک اصلی \`${cfg.ownerId}\` قابل حذف نیست.)\n\nلیست فعلی: `
      : `➖ **Remove Admin**\n\nSend the numeric ID of the admin to remove.\n(Owner \`${cfg.ownerId}\` cannot be removed.)\n\nCurrent list: `) + admins.map(a => `\`${a}\``).join(", ") + (lang === "fa" ? "\n\nبرای لغو /cancel را ارسال کنید." : "\n\nSend /cancel to abort.");
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  if (action === "admin_list") {
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

  if (action === "channel_add") {
    await setState(env, userId, { action: "channel_add", lang });
    const txt = lang === "fa"
      ? "➕ **افزودن کانال**\n\n1. ربات را به کانال مورد نظر اضافه کنید.\n2. ربات را **ادمین کانال** کنید (با دسترسی ارسال پیام).\n3. آیدی عددی کانال (مثل `-1001234567890`) یا یوزرنیم آن (مثل `@mychannel`) را اینجا ارسال کنید.\n\nبرای لغو /cancel را ارسال کنید."
      : "➕ **Add Channel**\n\n1. Add the bot to the channel.\n2. Make the bot a **channel admin** (with post permission).\n3. Send the channel's numeric ID (e.g. `-1001234567890`) or username (e.g. `@mychannel`) here.\n\nSend /cancel to abort.";
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  if (action === "channel_remove") {
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

  if (action === "channel_list") {
    const channels = await getChannels(env);
    const txt = channels.length === 0
      ? (lang === "fa" ? "ℹ️ هیچ کانالی ثبت نشده است." : "ℹ️ No channels registered.")
      : (lang === "fa" ? `📋 **لیست کانال‌ها** (${channels.length})\n\n` : `📋 **Channel List** (${channels.length})\n\n`) +
        channels.map(c => `• **${c.title}** — \`${c.id}\``).join("\n");
    await editRichMarkdown(cfg, chatId, msgId, txt, channelsMenuKeyboard(lang));
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
    await setState(env, userId, { ...state, action: "post_await_buttons_text" });
    const txt = lang === "fa"
      ? `⛓ **افزودن دکمه به پست**\n\nدکمه‌ها را به فرمت زیر ارسال کنید:\n\nButton💠 - https://link.com\n\nButton🩵 - http://a.ai | Button💙 - http://b.ai\n\nButton🟣 - http://d.ai | Button🟠 - http://c.ai | Button💚 - http://e.ai\n\n— هر خط = یک ردیف دکمه\n— با \`|\` چند دکمه را در یک ردیف قرار دهید\n\nبرای لغو /cancel را ارسال کنید.`
      : `⛓ **Add Buttons to Post**\n\nSend the buttons in the following format:\n\nButton💠 - https://link.com\n\nButton🩵 - http://a.ai | Button💙 - http://b.ai\n\nButton🟣 - http://d.ai | Button🟠 - http://c.ai | Button💚 - http://e.ai\n\n— each line = one button row\n— use \`|\` to put multiple buttons in one row\n\nSend /cancel to abort.`;
    await editRichMarkdown(cfg, chatId, msgId, txt, cancelKeyboard(lang));
    return;
  }

  if (action === "post_btn_no") {
    const state = await getState(env, userId);
    if (!state || state.action !== "post_await_buttons_choice") return;
    const newState = { ...state, action: "post_preview", buttons: null };
    await setState(env, userId, newState);
    await sendPostPreview(env, cfg, chatId, newState);
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

    const results = [];
    for (const chId of selected) {
      const ch = channels.find(c => String(c.id) === String(chId));
      if (!ch) continue;
      let res;
      if (state.isHtml) res = await sendRichHtmlResult(cfg, ch.id, state.text, replyMarkup);
      else res = await sendRichMarkdownResult(cfg, ch.id, state.text, replyMarkup);
      results.push({ title: ch.title, ok: res?.ok });
    }

    await setState(env, userId, null);

    const lines = results.map(r =>
      r.ok
        ? (lang === "fa" ? `✅ با موفقیت در کانال **${r.title}** ارسال شد.` : `✅ Successfully sent to channel **${r.title}**.`)
        : (lang === "fa" ? `❌ ارسال به کانال **${r.title}** ناموفق بود.` : `❌ Failed to send to channel **${r.title}**.`)
    );
    const txt = (lang === "fa" ? "📤 **نتیجه ارسال پست:**\n\n" : "📤 **Post send result:**\n\n") + lines.join("\n");
    await sendRichMarkdown(cfg, chatId, txt, adminPanelKeyboard(lang));
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
async function callAi(env, messages) {
  const config = await getAiConfig(env);
  if (!config.apiKey) {
    return { ok: false, error: "AI not configured. Admin must use /aiconfig to set up." };
  }
  if (!config.baseUrl) {
    return { ok: false, error: "AI base URL not set. Use /aiconfig custom <key> <baseUrl>." };
  }

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "system", content: config.systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 2000,
      }),
      // Cloudflare Workers have a 30s wall-clock limit on the free plan.
      // The AI call should finish well within that for short content.
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || data.error || `API error ${res.status}`;
      return { ok: false, error: typeof msg === "string" ? msg : JSON.stringify(msg) };
    }
    const text = data.choices?.[0]?.message?.content || "";
    if (!text) return { ok: false, error: "AI returned empty response." };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Handle /ai <prompt> — generate content, show preview with action buttons.
 * `existingState` is passed when regenerating (preserves scheduleMode flag).
 */
async function handleAiGenerate(env, cfg, chatId, userId, prompt, existingState) {
  const aiConfig = await getAiConfig(env);
  if (!aiConfig.apiKey) {
    await sendPlain(cfg, chatId, "⚠️ AI not configured. Admin must use /aiconfig first.\n\nExample: `/aiconfig openai sk-your-key`");
    return;
  }

  await sendPlain(cfg, chatId, "🤖 Generating...");
  const result = await callAi(env, [{ role: "user", content: prompt }]);
  if (!result.ok) {
    await sendPlain(cfg, chatId, `❌ AI error: ${result.error}`);
    return;
  }

  const lang = existingState?.lang || "fa";
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

  await sendPlain(cfg, chatId,
    lang === "fa"
      ? "👆 محتوای تولید‌شده. چه کار کنم؟"
      : "👆 AI-generated content. What next?",
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
    const dateStr = new Date(p.sendAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
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
async function runScheduledPosts(env, cfg, viaHttp) {
  const posts = await getScheduledPosts(env);
  const now = Date.now();
  const due = posts.filter(p => !p.sent && p.sendAt <= now);

  if (due.length === 0) {
    if (viaHttp) return json({ ok: true, sent: 0, message: "No due posts." });
    return { sent: 0 };
  }

  let sentCount = 0;
  const results = [];

  for (const post of due) {
    const channelResults = [];
    for (const chId of post.channelIds) {
      try {
        const isHtml = post.generatedText.startsWith("<") || /<\/?\w/.test(post.generatedText);
        const res = isHtml
          ? await sendRichHtmlResult(cfg, chId, post.generatedText)
          : await sendRichMarkdownResult(cfg, chId, post.generatedText);
        channelResults.push({ channelId: chId, ok: !!res?.ok });
      } catch (err) {
        channelResults.push({ channelId: chId, ok: false, error: String(err) });
      }
    }
    post.sent = true;
    post.sentAt = now;
    post.sendResults = channelResults;
    sentCount++;
    results.push({ id: post.id, channels: channelResults });
  }

  await saveScheduledPosts(env, posts);

  if (viaHttp) {
    return json({ ok: true, sent: sentCount, results });
  }
  return { sent: sentCount };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MEDIA DOWNLOADER  —  cobalt API + GitHub direct
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle /dl <url> — detect source, fetch media, send to chat.
 * Supports:
 *   • GitHub (raw, blob, releases) → fetch directly
 *   • Everything else → cobalt API (YouTube, Spotify, TikTok, Instagram, etc.)
 */
async function handleDownload(cfg, chatId, userId, url) {
  // Basic URL validation
  if (!/^https?:\/\//i.test(url)) {
    await sendPlain(cfg, chatId, "⚠️ Please send a valid URL starting with http:// or https://");
    return;
  }

  await sendPlain(cfg, chatId, "📥 Downloading...");

  try {
    // GitHub special handling (cobalt doesn't do GitHub)
    if (/github\.com|raw\.githubusercontent\.com|gist\.github\.com/i.test(url)) {
      const result = await downloadFromGithub(cfg, chatId, url);
      if (result.handled) return; // either sent or error reported
    }

    // Cobalt for everything else (YouTube, Spotify, TikTok, Instagram, Twitter/X, SoundCloud, etc.)
    const cobaltResult = await downloadViaCobalt(url, cfg.cobaltUrl);
    if (!cobaltResult.ok) {
      await sendPlain(cfg, chatId, `❌ Download failed: ${cobaltResult.error}\n\nThe URL may not be supported, or the cobalt service is unavailable. You can self-host cobalt and set COBALT_API_URL.`);
      return;
    }

    // Send the media file to the chat
    await sendMediaFile(cfg, chatId, cobaltResult.url, cobaltResult.filename, cobaltResult.type);
  } catch (err) {
    await sendPlain(cfg, chatId, `❌ Error: ${err?.message || err}`);
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

    // cobalt returns { status: "redirect"|"stream", url, filename, ... }
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
 * Format: /quiz Question | option1 | option2 | !option3  (option3 is correct)
 */
async function handlePollCommand(env, cfg, chatId, userId, cmd, argText) {
  // Parse "question | opt1 | opt2 | ..."
  const parts = argText.split("|").map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length < 3) {
    await sendPlain(cfg, chatId,
      "⚠️ Format:\n" +
      "`/poll Question? | Option 1 | Option 2 | Option 3`\n\n" +
      "For quiz (one correct answer marked with `!`):\n" +
      "`/quiz Capital of France? | London | !Paris | Berlin`"
    );
    return;
  }

  const question = parts[0];
  let options = parts.slice(1);
  let correctOptionId = -1;

  // For /quiz, find the option marked with "!" prefix
  if (cmd === "quiz") {
    options = options.map((opt, idx) => {
      if (opt.startsWith("!")) {
        correctOptionId = idx;
        return opt.slice(1).trim();
      }
      return opt;
    });
    if (correctOptionId === -1) {
      await sendPlain(cfg, chatId, "⚠️ For /quiz, mark the correct answer with `!`:\n`/quiz Q | wrong | !correct | wrong`");
      return;
    }
  }

  // Telegram requires 2-10 options
  if (options.length < 2 || options.length > 10) {
    await sendPlain(cfg, chatId, "⚠️ Polls need 2-10 options.");
    return;
  }

  const body = {
    chat_id: chatId,
    question,
    options: JSON.stringify(options),
    is_anonymous: false, // so we can track who voted what
  };

  if (cmd === "quiz") {
    body.type = "quiz";
    body.correct_option_id = correctOptionId;
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
    type: cmd === "quiz" ? "quiz" : "regular",
    correctOptionId: correctOptionId >= 0 ? correctOptionId : null,
    createdAt: Date.now(),
  };
  await addPoll(env, pollRecord);

  await sendPlain(cfg, chatId,
    `📊 Poll created! Track results with /pollstats\nPoll ID: \`${pollRecord.id}\``,
    { inline_keyboard: [[{ text: "📋 View All Polls", callback_data: "fa_poll_list" }]] }
  );
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
 * Fetches live poll data from Telegram via getPolls (stopPoll with no close_date
 * returns current state) — but actually, we use the stored PollAnswer data
 * since bots can't query arbitrary poll results without the message.
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
  for (const poll of polls.slice(-10)) {  // last 10 polls
    const answers = await getPollAnswers(env, poll.pollId);
    const voteCounts = poll.options.map(() => 0);
    for (const a of answers) {
      for (const optId of a.optionIds) {
        if (voteCounts[optId] !== undefined) voteCounts[optId]++;
      }
    }
    const totalVotes = voteCounts.reduce((s, c) => s + c, 0);
    const dateStr = new Date(poll.createdAt).toISOString().slice(0, 10);

    let pollLine = `📊 **${poll.question}**\n`;
    pollLine += `   🆔 \`${poll.id}\` · 📅 ${dateStr} · 👥 ${totalVotes} votes · ${poll.type}\n`;
    poll.options.forEach((opt, idx) => {
      const pct = totalVotes > 0 ? Math.round(voteCounts[idx] / totalVotes * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 10)).padEnd(10, "░");
      const correct = poll.type === "quiz" && poll.correctOptionId === idx ? " ✅" : "";
      pollLine += `   ${bar} ${pct}% ${opt} (${voteCounts[idx]})${correct}\n`;
    });
    lines.push(pollLine);
  }

  const txt = (lang === "fa"
    ? `📊 **نظرسنجی‌ها** (${polls.length})\n\n`
    : `📊 **Polls** (${polls.length})\n\n`) + lines.join("\n");

  if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, pollMenuKeyboard(lang));
  else await sendRichMarkdown(cfg, chatId, txt, pollMenuKeyboard(lang));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CHANNEL ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show channel analytics: member count + delivery stats from scheduled posts.
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

  const lines = [];
  for (const ch of channels) {
    // Member count (bot must be admin in the channel)
    const countRes = await tg(cfg, "getChatMemberCount", { chat_id: ch.id });
    const memberCount = countRes.ok ? countRes.result : "—";

    // Delivery stats for this channel
    const chPosts = scheduledPosts.filter(p => p.channelIds.some(c => String(c) === String(ch.id)));
    const sentPosts = chPosts.filter(p => p.sent);
    const failedResults = sentPosts.flatMap(p =>
      (p.sendResults || []).filter(r => String(r.channelId) === String(ch.id) && !r.ok)
    );
    const successRate = sentPosts.length > 0
      ? ((sentPosts.length - failedResults.length) / sentPosts.length * 100).toFixed(0) + "%"
      : "—";

    // Polls created in this channel (by chatId match)
    // Note: polls are created in the bot DM, not channels. This counts all polls.
    const pollCount = polls.length;

    lines.push(
      `📡 **${ch.title}**\n` +
      `   👥 Members: \`${memberCount}\`\n` +
      `   📤 Scheduled: \`${chPosts.length}\` (sent: ${sentPosts.length})\n` +
      `   ✅ Success rate: \`${successRate}\`\n`
    );
  }

  // Overall summary
  const totalMembers = lines.length;
  const totalScheduled = scheduledPosts.length;
  const totalSent = scheduledPosts.filter(p => p.sent).length;

  const summary = lang === "fa"
    ? `📈 **آمار کانال‌ها**\n\n📅 مجموع: ${totalMembers} کانال · ${totalScheduled} زمان‌بندی · ${totalSent} ارسال‌شده · ${polls.length} نظرسنجی\n\n`
    : `📈 **Channel Analytics**\n\n📅 Total: ${totalMembers} channels · ${totalScheduled} scheduled · ${totalSent} sent · ${polls.length} polls\n\n`;

  const txt = summary + lines.join("\n");

  if (msgId) await editRichMarkdown(cfg, chatId, msgId, txt, backKeyboard(lang));
  else await sendRichMarkdown(cfg, chatId, txt, backKeyboard(lang));
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
  fa: `# 🤖 Rich Markdown Bot

هر متن **Markdown** یا **HTML** بفرستید، به صورت Rich Message رندر میشه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

از دکمه‌های زیر برای دیدن راهنما و دمو استفاده کنید 👇`,

  en: `# 🤖 Rich Markdown Bot

Send any **Markdown** or **HTML** text and it will be echoed back as a rendered Rich Message.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

Use the buttons below to explore 👇`,
};

// ─── About ────────────────────────────────────────────────────────────────────
const ABOUT = {
  fa: `https://github.com/Arefmtl/arefera_admin_panel`,

  en: `https://github.com/Arefmtl/arefera_admin_panel`,
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
— \`/scheduled\` — لیست زمان‌بندی‌های ثبت‌شده
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

✨`,


  en: `# 🤖 AI Module

Generate content with AI, send to channels, or schedule for later.

## Commands

— \`/ai <prompt>\` — generate content + preview + send/schedule buttons
— \`/askai\` — enter multi-turn AI chat mode (conversation memory)
— \`/scheduleai\` — generate + pick channels + pick time + auto-send
— \`/scheduled\` — list scheduled posts
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

✨`,
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
— Spotify (metadata/preview)
— TikTok · Instagram · Twitter/X
— SoundCloud · Bandcamp
— GitHub (فایل مستقیم)
— و ده‌ها سایت دیگر

**نحوه استفاده:**
\`/dl https://youtu.be/xxxxx\`
\`/dl https://github.com/user/repo/raw/main/file.py\`

⚠️ فایل‌های بزرگ‌تر از 45MB به صورت لینک ارسال می‌شوند.

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
— Spotify (metadata/preview)
— TikTok · Instagram · Twitter/X
— SoundCloud · Bandcamp
— GitHub (direct files)
— and dozens more sites

**Usage:**
\`/dl https://youtu.be/xxxxx\`
\`/dl https://github.com/user/repo/raw/main/file.py\`

⚠️ Files larger than 45MB are sent as download links.

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

برای پایداری بیشتر، می‌توانید cobalt را خودتان میزبانی کنید و آدرس آن را در \`COBALT_API_URL\` تنظیم کنید.`,

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

For better reliability, you can self-host cobalt and set its URL in \`COBALT_API_URL\`.`,
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

## ساخت کوییز (با جواب درست)

علامت \`!\` قبل از گزینه درست:

\`\`\`
/quiz پایتخت فرانسه؟ | لندن | !پاریس | برلین
\`\`\`

## مشاهده نتایج

\`/pollstats\` — لیست همه نظرسنجی‌ها با درصد آرا و نمودار میله‌ای

## نکات

— نظرسنجی‌ها غیرناشناس هستند (برای رهگیری آراء)
— تا 10 گزینه قابل قبول
— نتایج به‌صورت زنده در \`/pollstats\` نمایش داده می‌شوند`,

  en: `# 📊 Polls & Quizzes

## Create a Poll

\`\`\`
/poll Question? | Option 1 | Option 2 | Option 3
\`\`\`

Example:
\`\`\`
/poll Best programming language? | Python | JavaScript | Rust | Go
\`\`\`

## Create a Quiz (with correct answer)

Mark the correct option with \`!\`:

\`\`\`
/quiz Capital of France? | London | !Paris | Berlin
\`\`\`

## View Results

\`/pollstats\` — list all polls with vote percentages and bar charts

## Notes

— Polls are non-anonymous (for vote tracking)
— Up to 10 options
— Results update live in \`/pollstats\``,
};
