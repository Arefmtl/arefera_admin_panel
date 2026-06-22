# راهنمای دیپلوی روی Cloudflare

این پروژه شامل **دو بخش مستقل** است که هر دو روی Cloudflare دیپلوی می‌شوند:

| بخش | پلتفرم | فایل کانفیگ | دستور دیپلوی |
|------|--------|-------------|---------------|
| 🤖 ربات تلگرام (worker.js) | Cloudflare Workers | `wrangler.toml` | `npx wrangler deploy` |
| 🌐 پنل ادمین (Next.js) | Cloudflare Pages | `wrangler.pages.toml` | `bun run pages:deploy` |
| 🗄️ دیتابیس پنل | Cloudflare D1 | — | `bun run d1:migrate:prod` |
| 💾 دیتابیس ربات | Cloudflare KV | — | (خودکار) |

هر دو بخش از **همان Bot Token** استفاده می‌کنند — یعنی ربات و پنل با هم کار می‌کنند: پنل پیام‌های زمان‌بندی‌شده را می‌سازد و ربات آن‌ها را ارسال می‌کند.

---

## 📋 پیش‌نیازها

1. حساب Cloudflare (رایگان کافیه)
2. `wrangler` نصب شده (همراه پروژه نصب شده)
3. ربات تلگرام از [@BotFather](https://t.me/BotFather) ساخته شده و Token دارید
4. ربات را Admin کانال(های) هدف کرده‌اید

---

## 🚀 مرحله ۱ — ساخت منابع Cloudflare (یک‌بار)

ابتدا با `wrangler` لاگین کنید:

```bash
npx wrangler login
```

### ۱.۱ ساخت D1 database (برای پنل)
```bash
npx wrangler d1 create telegram-bot-panel
```
خروجی چیزی شبیه این می‌دهد:
```
[[d1_databases]]
binding = "DB"
database_name = "telegram-bot-panel"
database_id = "xxxx-xxxx-xxxx-xxxx"   ← این را کپی کن
```
این `database_id` را در `wrangler.pages.toml` جایگزین `REPLACE_WITH_YOUR_D1_DATABASE_ID` کن.

### ۱.۲ ساخت KV namespace (برای ربات)
```bash
npx wrangler kv:namespace create BOT_DB
```
خروجی:
```
id = "yyyy-yyyy-yyyy-yyyy"   ← این را کپی کن
```
این `id` را در `wrangler.toml` (کانفیگ ربات) جایگزین `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` کن.

---

## 🗄️ مرحله ۲ — ساخت schema در D1

فایل SQL از قبل ساخته شده (`prisma/migrations/init.sql`). آن را روی D1 اعمال کن:

```bash
# روی D1 پروداکشن (remote):
bun run d1:migrate:prod

# یا اگر اول می‌خوای لوکال تست کنی:
bun run d1:migrate:local
```

اگه بعداً schema عوض کردی، دوباره SQL تولید کن:
```bash
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/init.sql
```

---

## 🌐 مرحله ۳ — دیپلوی پنل Next.js روی Cloudflare Pages

### ۳.۱ تنظیم secrets پنل
```bash
# پسورد ورود به پنل (پیش‌فرض: admin123)
echo "your-strong-password" | npx wrangler secret put PANEL_PASSWORD --config wrangler.pages.toml

# Token ربات (همان که از BotFather گرفتی — ربات هم ازش استفاده می‌کنه)
echo "123456789:ABC..." | npx wrangler secret put BOT_TOKEN --config wrangler.pages.toml

# رشته تصادفی برای امضای cookie session (حداقل ۳۲ کاراکتر)
openssl rand -hex 32 | npx wrangler secret put PANEL_SESSION_SECRET --config wrangler.pages.toml

# (اختیاری) URL عمومی پنل — بعد از دیپلوی بذار
echo "https://telegram-bot-panel.your-subdomain.workers.dev" | npx wrangler secret put WEB_APP_URL --config wrangler.pages.toml
```

### ۳.۲ بیلد و دیپلوی
```bash
bun run pages:deploy
```

این دستور:
1. `next build` را اجرا می‌کند
2. `@opennextjs/cloudflare` را باندل می‌کند به `.open-next/worker.js`
3. آن را روی Cloudflare Pages دیپلوی می‌کند

بعد از تمام شدن، URL پنل را می‌گیری:
```
https://telegram-bot-panel.<your-subdomain>.workers.dev
```

### ۳.۳ تست پنل
URL را در مرورگر باز کن:
- یوزرنیم: `admin`
- پسورد: مقداری که در `PANEL_PASSWORD` گذاشتی (یا `admin123` اگه نذاشتی)

---

## 🤖 مرحله ۴ — دیپلوی ربات روی Cloudflare Workers

### ۴.۱ تنظیم secrets ربات
```bash
# Token ربات (همان که برای پنل هم گذاشتی)
echo "123456789:ABC..." | npx wrangler secret put BOT_TOKEN

# آیدی عددی اکانت تلگرام خودت (برای شناختن Owner)
# از @userinfobot بگیر
echo "123456789" | npx wrangler secret put OWNER_ID

# (اختیاری) رشته تصادفی برای محافظت از webhook
openssl rand -hex 32 | npx wrangler secret put WEBHOOK_SECRET

# URL پنل که دیپلوی کردی — برای دکمه WebApp
echo "https://telegram-bot-panel.your-subdomain.workers.dev" | npx wrangler secret put WEB_APP_URL

# (اختیاری) اگه می‌خوای AI داشته باشی:
echo "sk-..." | npx wrangler secret put AI_API_KEY
```

### ۴.۲ دیپلوی ربات
```bash
npx wrangler deploy
```

### ۴.۳ تنظیم webhook
```bash
# جایگزین کن با URL Worker خودت
curl "https://telegram-rich-markdown-bot.<your-subdomain>.workers.dev/setup-webhook"
```

خروجی باید `"ok":true` باشه.

### ۴.۴ (اختیاری) فعال‌کردن inline mode
به [@BotFather](https://t.me/BotFather) بفرست:
```
/setinline
```
رباتت رو انتخاب کن، یه پیام کوتاه بده (مثل `Search...`). حالا می‌تونی `@botname <query>` توی هر چتی استفاده کنی.

---

## 🧪 مرحله ۵ — تست نهایی

1. تلگرام رو باز کن، رباتت رو پیدا کن، `/start` بفرست
2. دکمه «🌐 Panel» پایین صفحه ظاهر می‌شه — بزن
3. پنل تو تلگرام باز می‌شه (هم تمام‌صفحه، هم با تم تلگرام)
4. لاگین کن (اگه `PANEL_PASSWORD` ست کرده باشی)
5. یه کانال اضافه کن، یه پیام زمان‌بندی‌شده بساز
6. ربات هر ۵ دقیقه (cron) چک می‌کنه و پیام‌های due را می‌فرسته

---

## 🔧 دستورات مفید

| کار | دستور |
|-----|-------|
| اجرای لوکال پنل | `bun run dev` |
| اجرای لوکال با D1 لوکال | `bun run pages:preview` |
| بیلد پنل برای Cloudflare | `bun run pages:build` |
| دیپلوی پنل | `bun run pages:deploy` |
| دیپلوی ربات | `npx wrangler deploy` |
| مهاجرت D1 (پروداکشن) | `bun run d1:migrate:prod` |
| مهاجرت D1 (لوکال) | `bun run d1:migrate:local` |
| لاگ‌های پنل (real-time) | `npx wrangler tail --config wrangler.pages.toml` |
| لاگ‌های ربات (real-time) | `npx wrangler tail` |
| مشاهده D1 (پروداکشن) | `npx wrangler d1 execute telegram-bot-panel --remote --command "SELECT * FROM Admin"` |
| تنظیم webhook | `curl https://your-worker.workers.dev/setup-webhook` |
| حذف webhook | `curl https://your-worker.workers.dev/delete-webhook` |
| وضعیت ربات | `curl https://your-worker.workers.dev/health` |

---

## 🌍 دامنه اختصاصی (اختیاری)

### برای پنل
در `wrangler.pages.toml` خط `routes` را از حالت کامنت درآور:
```toml
routes = [
  { pattern = "panel.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```
بعد در Cloudflare dashboard یک DNS record از نوع CNAME به `telegram-bot-panel.<your-subdomain>.workers.dev` اضافه کن.

### برای ربات
در `wrangler.toml`:
```toml
routes = [
  { pattern = "bot.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

---

## ⚠️ نکات مهم

1. **همان Bot Token** را هم برای پنل و هم برای ربات استفاده کن — اینطوری پنل می‌تونه پیام بفرسته و ربات هم آپدیت‌ها رو می‌گیره
2. **D1 محدودیت حجم داره**: ۵GB در پلن رایگان. برای پنل ادمین کافیه.
3. **Cron ربات هر ۵ دقیقه** اجرا می‌شه — برای تغییر، `crons` را در `wrangler.toml` عوض کن (حداقل `*/1 * * * *` ممکنه محدود باشه)
4. **پنل و ربات دیتابیس‌های جدا دارن**: پنل از D1 استفاده می‌کنه، ربات از KV. این به‌خودی خود مشکل نیست چون هرکدام وظیفه جداگانه‌ای دارن.
5. **اگه schema عوض کردی**: اول `bun run db:generate` بزن، بعد `bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/init.sql`، بعد `bun run d1:migrate:prod`
6. **localStorage در Cloudflare Pages کار نمی‌کنه** — اگه کدی داری که از `localStorage` استفاده می‌کنه، به cookie یا KV منتقل کن

---

## 🆘 عیب‌یابی

### پنل باز نمی‌شه در تلگرام
- مطمئن شو `WEB_APP_URL` روی Worker ست شده (`npx wrangler secret list`)
- مطمئن شو URL با `https://` شروع می‌شه
- در تلگرام `/start` بفرست تا دکمه منو رفرش بشه

### پنل باز می‌شه ولی ارور دیتابیس می‌ده
- `bun run d1:migrate:prod` را اجرا کن
- با `npx wrangler d1 execute telegram-bot-panel --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` چک کن جداول ساخته شده

### ربات جواب نمی‌ده
- `curl https://your-worker.workers.dev/health` را بزن — باید `"ok":true` باشه
- `curl https://your-worker.workers.dev/setup-webhook` را دوباره بزن
- لاگ‌ها را ببین: `npx wrangler tail`

### پیام‌های زمان‌بندی‌شده ارسال نمی‌شن
- مطمئن شو `BOT_TOKEN` هم برای پنل و هم ربات ست شده
- مطمئن شو cron فعال هست (`crons = ["*/5 * * * *"]` در `wrangler.toml`)
- لاگ‌های scheduler را در Cloudflare dashboard بررسی کن

---

## 📐 معماری نهایی

```
┌─────────────────────────────────────────────────────────────────┐
│                      Telegram (Users + Channels)                │
└──────────────┬───────────────────────────────────┬──────────────┘
               │                                   │
               │ Updates (webhook)                 │ WebApp button
               ▼                                   ▼
┌──────────────────────────┐         ┌────────────────────────────┐
│  Cloudflare Worker       │         │  Cloudflare Pages          │
│  (telegram-rich-...-bot) │         │  (telegram-bot-panel)      │
│                          │         │                            │
│  • handleMessage         │◄────────│  Next.js 16 + App Router   │
│  • AI generation         │ shared  │  • Dashboard               │
│  • Media downloader      │  token  │  • Scheduled messages      │
│  • Polls                 │         │  • Broadcast               │
│  • Analytics             │         │  • Channels CRUD           │
│  • Inline queries        │         │  • Templates               │
│  • Cron scheduler (5min) │         │  • Analytics               │
│                          │         │  • Activity log            │
│  Storage: KV (BOT_DB)    │         │  Storage: D1 (DB)          │
└──────────────────────────┘         └────────────────────────────┘
               │                                   │
               │ sendRichMessage                   │ Prisma + adapter-d1
               │ sendPoll                          │
               │ sendDocument                      │
               ▼                                   ▼
         Telegram Bot API              Cloudflare D1 (SQLite)
```

تمام! حالا تمام پروژه روی Cloudflare است. 🎉
