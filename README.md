# 🤖 ربات تلگرام + پنل ادمین — نسخه کامل Cloudflare

> **یک ربات تلگرام حرفه‌ای با پنل وب ادمین، تماماً روی Cloudflare.**
> شامل: ارسال پیام زمان‌بندی‌شده، تولید محتوا با AI، دانلود از یوتیوب/اسپاتیفای/گیت‌هاب، نظرسنجی، تحلیل آماری کانال و منوی تلگرامی WebApp.

[![Deploy on Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)

---

## 📑 فهرست

- [این پروژه چیست؟](#-این-پروژه-چیست)
- [چه امکاناتی دارد؟](#-چه-امکاناتی-دارد)
- [معماری پروژه](#-معماری-پروژه)
- [پیش‌نیازها](#-پیش‌نیازها)
- [راه‌اندازی گام‌به‌گام](#-راه‌اندازی-گام‌به‌گام)
  - [گام ۱: ساخت ربات تلگرام](#گام-۱-ساخت-ربات-تلگرام)
  - [گام ۲: نصب ابزارها](#گام-۲-نصب-ابزارها)
  - [گام ۳: ساخت حساب Cloudflare](#گام-۳-ساخت-حساب-cloudflare)
  - [گام ۴: ساخت دیتابیس D1 و KV](#گام-۴-ساخت-دیتابیس-d1-و-kv)
  - [گام ۵: تنظیم متغیرهای محیطی](#گام-۵-تنظیم-متغیرهای-محیطی)
  - [گام ۶: دیپلوی پنل ادمین](#گام-۶-دیپلوی-پنل-ادمین)
  - [گام ۷: دیپلوی ربات تلگرام](#گام-۷-دیپلوی-ربات-تلگرام)
  - [گام ۸: فعال‌کردن Inline Mode](#گام-۸-فعال‌کردن-inline-mode-اختیاری)
  - [گام ۹: تست نهایی](#گام-۹-تست-نهایی)
- [ساختار پوشه‌ها](#-ساختار-پوشهها)
- [دستورات پرکاربرد](#-دستورات-پرکاربرد)
- [تنظیم دامنه اختصاصی](#-تنظیم-دامنه-اختصاصی-اختیاری)
- [سوالات متداول (FAQ)](#-سوالات-متداول-faq)
- [عیب‌یابی](#-عیب‌یابی)
- [مستندات بیشتر](#-مستندات-بیشتر)
- [امنیت](#-امنیت)
- [مجوز](#-مجوز)

---

## 🎯 این پروژه چیست؟

این پروژه شامل **دو بخش** است که با هم کار می‌کنند:

| بخش | توضیح ساده |
|------|------------|
| 🤖 **ربات تلگرام** | یک ربات تلگرام که کاربرها باهاش حرف می‌زنن. می‌تونه محتوا با AI بسازه، از یوتیوب/گیت‌هاب دانلود کنه، نظرسنجی بذاره و... |
| 🌐 **پنل ادمین** | یک سایت وب که شما (به‌عنوان مدیر ربات) بازش می‌کنید تا پیام‌های زمان‌بندی‌شده بسازید، کانال‌ها رو مدیریت کنید و آمار ببینید. |

**نکته جذاب:** پنل ادمین رو می‌تونید از داخل خود تلگرام باز کنید (به‌صورت یک Mini App) — نیازی نیست URL جداگانه‌ای رو یادتون بمونه.

هر دو بخش روی **[Cloudflare](https://www.cloudflare.com/)** اجرا می‌شن — یعنی:
- ⚡ سریع (سرورهای خود Cloudflare در سراسر دنیا)
- 💰 رایگان (برای استفاده‌های معمولی کافیه)
- 🔒 امن (HTTPS خودکار، محیط ایزوله)

---

## ✨ چه امکاناتی دارد؟

### 🤖 ربات تلگرام (Worker)

| امکان | توضیح |
|------|-------|
| 📝 **پشتیبانی از Markdown و HTML** | پیام‌های زیبا با فرمت‌بندی کامل (بولد، ایتالیک، لیست، کد و...) |
| 🤖 **تولید محتوا با AI** | از OpenAI/Claude/Gemini/Groq و... برای تولید پست استفاده کنید |
| 📅 **زمان‌بندی ارسال** | پیام رو بسازید و بگید کی ارسال بشه (هر ۵ دقیقه توسط cron چک می‌شه) |
| 📊 **تحلیل کانال** | تعداد اعضا، رشد، نرخ موفقیت ارسال پیام‌های زمان‌بندی‌شده |
| 📋 **نظرسنجی و Quiz** | نظرسنجی در کانال بذارید و نتایج رو به‌صورت نمودار ببینید |
| 📥 **دانلود از یوتیوب/اسپاتیفای/اینستاگرام/تیک‌تاک** | لینک بدید، فایل رو براتون می‌فرسته |
| 🐙 **دانلود از گیت‌هاب** | فایل، Release یا Repository دانلود کنید |
| ⚡ **Inline Mode** | توی هر چتی `@botname <query>` بزنید و نتیجه بگیرید |
| 🌐 **منوی WebApp** | دکمه‌ای پایین تلگرام که پنل ادمین رو باز می‌کنه |
| 🌍 **دوزبانه (فارسی/انگلیسی)** | کاربر می‌تونه زبان ربات رو عوض کنه |
| 👥 **مدیریت ادمین‌ها** | چند ادمین با سطح دسترسی Owner |
| 📺 **مدیریت کانال‌ها** | کانال‌های هدف رو اضافه/حذف کنید |
| 📤 **ارسال چندکاناله** | یه پیام رو همزمان به چند کانال بفرستید |

### 🌐 پنل ادمین (Next.js)

| امکان | توضیح |
|------|-------|
| 📊 **داشبورد** | نمای کلی از وضعیت ربات، پیام‌های اخیر، آمار |
| 📅 **پیام‌های زمان‌بندی‌شده** | ساخت/ویرایش/حذف پیام‌های recurring (روزانه/هفتگی/ماهانه) |
| 📢 **ارسال آنی (Broadcast)** | پیام رو همین حالا به کانال بفرستید |
| 📝 **قالب‌ها (Templates)** | پیام‌های آماده برای استفاده مجدد |
| 📺 **مدیریت کانال‌ها** | افزودن/حذف کانال، بررسی سلامت |
| 👥 **مدیریت ادمین‌ها** | افزودن/حذف ادمین، تعیین Owner |
| 📈 **آنالیز عمیق** | نمودار رشد، نرخ موفقیت، بهترین زمان ارسال |
| 📜 **لاگ فعالیت** | تاریخچه کامل تغییرات (برای ممیزی) |
| ⚙️ **تنظیمات** | Bot Token، تست اتصال، امنیت |
| 🔐 **ورود دو مرحله‌ای (2FA)** | با کد TOTP (مثل Google Authenticator) |
| 🌗 **حالت تاریک/روشن** | تطبیق با تم تلگرام |
| 🌍 **دوزبانه (فارسی/انگلیسی)** | با پشتیبانی کامل RTL |
| ⌨️ **شورتکات‌های کیبورد** | با `Cmd/Ctrl + K` پنل دستوری باز می‌شه |
| 📅 **نمای تقویم و تایم‌لاین** | پیام‌های زمان‌بندی‌شده رو به‌صورت بصری ببینید |

---

## 🏗 معماری پروژه

```
┌─────────────────────────────────────────────────────────────────┐
│              کاربران تلگرام + کانال‌های شما                       │
└──────────────┬───────────────────────────────────┬──────────────┘
               │                                   │
               │ ۱) پیام‌ها و آپدیت‌ها              │ ۹) دکمه 🌐 Panel
               ▼                                   ▼
┌──────────────────────────┐         ┌────────────────────────────┐
│ 🤖 Cloudflare Worker     │         │ 🌐 Cloudflare Pages        │
│ (ربات تلگرام)            │         │ (پنل ادمین Next.js)         │
│                          │         │                            │
│  • پردازش پیام‌ها         │◄────────│  • داشبورد + آمار           │
│  • تولید محتوا با AI     │ ۳) توکن │  • پیام‌های زمان‌بندی‌شده     │
│  • دانلود مدیا           │ مشترک   │  • Broadcast آنی            │
│  • نظرسنجی               │         │  • مدیریت کانال/ادمین       │
│  • تحلیل آماری           │         │  • ۲FA + لاگ فعالیت         │
│  • Inline queries        │         │                            │
│  • Cron (هر ۵ دقیقه)     │         │                            │
│                          │         │                            │
│  💾 ذخیره‌سازی: KV        │         │  💾 ذخیره‌سازی: D1 (SQLite)  │
└──────────────┬───────────┘         └──────────────┬─────────────┘
               │                                    │
               │ ۲) فراخوانی Telegram Bot API       │ ۴) فراخوانی Telegram Bot API
               ▼                                    ▼
        ┌──────────────────────────────────────────────┐
        │       Telegram Bot API                       │
        │       (https://api.telegram.org)             │
        └──────────────────────────────────────────────┘
```

**به زبان ساده:**
1. کاربر به ربات پیام می‌ده → آپدیت به Worker می‌رسه (از طریق Webhook)
2. Worker پردازش می‌کنه و از طریق Telegram Bot API جواب می‌ده
3. Worker و Pages **همان Bot Token** رو دارن — پس پنل هم می‌تونه پیام بفرسته
4. پنل پیام‌های زمان‌بندی‌شده رو در D1 ذخیره می‌کنه
5. هر ۵ دقیقه Cron Worker اجرا می‌شه، پیام‌های due رو از KV می‌خونه و می‌فرسته
6. کاربر روی دکمه 🌐 در تلگرام می‌زنه → پنل داخل تلگرام باز می‌شه (به‌صورت Mini App)

---

## 📋 پیش‌نیازها

### ۱. یک ربات تلگرام
- به [@BotFather](https://t.me/BotFather) در تلگرام برید
- `/newbot` بفرستید و دستورالعمل رو دنبال کنید
- در آخر **Bot Token** می‌گیرید (مثل `123456789:ABCdefGhi...`)

> 📖 [راهنمای کامل ساخت ربات در BotFather](https://core.telegram.org/bots/features#creating-a-new-bot)

### ۲. آیدی عددی اکانت تلگرام خودتون (Owner ID)
- به [@userinfobot](https://t.me/userinfobot) پیام بدید
- آیدی عددی (مثل `123456789`) رو یادداشت کنید

### ۳. ابزارهای توسعه
| ابزار | لینک دانلود | چرا لازمه؟ |
|------|-------------|------------|
| Node.js 20+ | [nodejs.org](https://nodejs.org/) | اجرای ابزارهای جاوااسکریپتی |
| Bun | [bun.sh](https://bun.sh/) | مدیریت پکیج و اجرای سریع (پیشنهادی) |
| Wrangler CLI | `npm i -g wrangler` | دیپلوی روی Cloudflare |

نصب Wrangler:
```bash
npm install -g wrangler
# یا با bun:
bun add -g wrangler
```

### ۴. یک حساب Cloudflare (رایگان)
- به [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) برید و ثبت‌نام کنید
- نیازی به پرداخت نیست — پلن رایگان کافیه

---

## 🚀 راه‌اندازی گام‌به‌گام

### گام ۱: ساخت ربات تلگرام

1. تلگرام رو باز کنید و به **[@BotFather](https://t.me/BotFather)** پیام بدید
2. `/newbot` رو بفرستید
3. یه **اسم** برای ربات بدید (مثلاً `My Awesome Bot`)
4. یه **username** بدید که آخرش `bot` باشه (مثلاً `my_awesome_bot`)
5. BotFather بهتون **Bot Token** می‌ده — این رو ذخیره کنید:


> ⚠️ **هیچ‌کس** این توکن رو نبینه — هرکسی این رو داشته باشه می‌تونه رباتتون رو کنترل کنه!

### گام ۲: نصب ابزارها

```bash
# کلون کردن پروژه
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# نصب پکیج‌ها
bun install
# یا: npm install
```

> اگه `bun` ندارید: `curl -fsSL https://bun.sh/install | bash` — [راهنمای نصب](https://bun.sh/docs/installation)

### گام ۳: ساخت حساب Cloudflare

1. به [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) برید
2. ایمیل و پسورد بزنید
3. وارد پنل بشید

سپس در ترمینال:

```bash
wrangler login
```

این دستور یه مرورگر باز می‌کنه — دکمه **Allow** رو بزنید.

### گام ۴: ساخت دیتابیس D1 و KV

این کار فقط **یک‌بار** انجام می‌شه.

#### ۴.۱ ساخت D1 (دیتابیس پنل)
```bash
wrangler d1 create telegram-bot-panel
```

خروجی شبیه این می‌شه:
```
✅ Successfully created DB 'telegram-bot-panel'
[[d1_databases]]
binding = "DB"
database_name = "telegram-bot-panel"
database_id = "abc123-def456-..."  ← این رو کپی کنید
```

این `database_id` رو در فایل `wrangler.pages.toml` جایگزین `REPLACE_WITH_YOUR_D1_DATABASE_ID` کنید:

```toml
[[d1_databases]]
binding = "DB"
database_name = "telegram-bot-panel"
database_id = "abc123-def456-..."  # ← اینجا
```

#### ۴.۲ ساخت KV (دیتابیس ربات)
```bash
wrangler kv:namespace create BOT_DB
```

خروجی:
```
id = "xyz789-uvw123-..."  ← این رو کپی کنید
```

این `id` رو در فایل `wrangler.toml` (کانفیگ ربات) جایگزین `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` کنید:

```toml
[[kv_namespaces]]
binding = "BOT_DB"
id = "xyz789-uvw123-..."  # ← اینجا
```

#### ۴.۳ اعمال schema روی D1

```bash
# روی D1 پروداکشن (remote):
bun run d1:migrate:prod
```

این دستور تمام جداول (Admin, Channel, ScheduledMessage, ...) رو در دیتابیس می‌سازه.

### گام ۵: تنظیم متغیرهای محیطی

#### ۵.۱ Secrets پنل ادمین (Cloudflare Pages)

```bash
# پسورد ورود به پنل (پیش‌فرض: admin123)
echo "my-strong-password-123" | wrangler secret put PANEL_PASSWORD --config wrangler.pages.toml

# همون Bot Token که از BotFather گرفتید
echo "1234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw" | wrangler secret put BOT_TOKEN --config wrangler.pages.toml

# رشته تصادفی برای امنیت session (حداقل ۳۲ کاراکتر)
openssl rand -hex 32 | wrangler secret put PANEL_SESSION_SECRET --config wrangler.pages.toml
```

#### ۵.۲ Secrets ربات تلگرام (Cloudflare Workers)

```bash
# همون Bot Token
echo "1234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw" | wrangler secret put BOT_TOKEN

# آیدی عددی خودتون (از @userinfobot گرفتید)
echo "123456789" | wrangler secret put OWNER_ID

# رشته تصادفی برای محافظت از Webhook
openssl rand -hex 32 | wrangler secret put WEBHOOK_SECRET

# URL پنل — بعد از گام ۶ این رو ست می‌کنیم
# (فعلاً رد کنید، بعد از دیپلوی پنل برمی‌گردیم)

# (اختیاری) اگه می‌خواید AI داشته باشه:
echo "sk-..." | wrangler secret put AI_API_KEY
# یا Claude/Gemini/Groq — فایل worker.js رو ببینید
```

### گام ۶: دیپلوی پنل ادمین

```bash
bun run pages:deploy
```

این دستور:
1. پروژه Next.js رو بیلد می‌کنه
2. با OpenNext به فرمت Cloudflare Pages تبدیلش می‌کنه
3. روی Cloudflare دیپلوی می‌کنه

بعد از چند دقیقه، URL پنل رو می‌گیرید:
```
https://telegram-bot-panel.<your-subdomain>.workers.dev
```

این URL رو ذخیره کنید — در گام ۷ به ربات می‌گیم.

#### ۶.۱ تست پنل
- URL رو در مرورگر باز کنید
- یوزرنیم: `admin`
- پسورد: مقداری که در `PANEL_PASSWORD` گذاشتید (اگه نذاشتید: `admin123`)

> ⚠️ **حتماً پسورد پیش‌فرض رو عوض کنید!**

#### ۶.۲ تنظیم WEB_APP_URL روی ربات

حالا که URL پنل رو دارید، به ربات بگید:

```bash
echo "https://telegram-bot-panel.<your-subdomain>.workers.dev" | wrangler secret put WEB_APP_URL
```

### گام ۷: دیپلوی ربات تلگرام

```bash
wrangler deploy
```

خروجی:
```
Published telegram-rich-markdown-bot (x.xx sec)
  https://telegram-rich-markdown-bot.<your-subdomain>.workers.dev
```

#### ۷.۱ تنظیم Webhook

ربات باید بدونه آپدیت‌ها رو از کجا بگیره:

```bash
# URL Worker خودتون رو جایگزین کنید
curl "https://telegram-rich-markdown-bot.<your-subdomain>.workers.dev/setup-webhook"
```

خروجی باید این باشه:
```json
{"ok":true,"result":{"url":"https://...","has_custom_certificate":false,"pending_update_count":0}}
```

### گام ۸: فعال‌کردن Inline Mode (اختیاری)

اگه می‌خواید کاربرا بتونن توی هر چتی `@botname <query>` بزنن:

1. به [@BotFather](https://t.me/BotFather) پیام بدید
2. `/setinline` بفرستید
3. رباتتون رو انتخاب کنید
4. یه متن کوتاه بديد (مثلاً `Search...`)

> 📖 [راهنمای Inline Mode](https://core.telegram.org/bots/inline)

### گام ۹: تست نهایی

1. **تلگرام رو باز کنید** و رباتتون رو سرچ کنید (با username‌ای که انتخاب کردید)
2. **`/start`** بفرستید
3. منوی ربات ظاهر می‌شه — دکمه‌های مختلف رو امتحان کنید
4. **دکمه 🌐 Panel** پایین صفحه — بزنید تا پنل داخل تلگرام باز بشه
5. لاگین کنید و یه کانال اضافه کنید
6. یه پیام زمان‌بندی‌شده بسازید (مثلاً ۱ دقیقه بعد)
7. صبر کنید تا Cron اجرا بشه (هر ۵ دقیقه) و پیام ارسال بشه

🎉 **تبریک! ربات و پنل آماده‌ست!**

---

## 📁 ساختار پوشه‌ها

```
.
├── 📁 docs/                         # مستندات کامل
│   ├── README-worker.md             # راهنمای فنی ربات Worker
│   └── DEPLOY-CLOUDFLARE.md         # راهنمای دیپلوی پیشرفته
│
├── 📁 prisma/                       # دیتابیس (Prisma ORM)
│   ├── schema.prisma                # تعریف جداول
│   ├── seed.ts                      # داده اولیه
│   └── migrations/
│       └── init.sql                 # SQL برای D1
│
├── 📁 src/                          # کد پنل ادمین (Next.js)
│   ├── 📁 app/                      # صفحات و API routes
│   │   ├── page.tsx                 # صفحه اصلی پنل
│   │   ├── layout.tsx               # layout کلی
│   │   ├── globals.css              # استایل‌ها
│   │   └── 📁 api/                  # ۳۰+ API endpoint
│   ├── 📁 components/
│   │   ├── 📁 admin/                # کامپوننت‌های پنل
│   │   ├── 📁 ui/                   # shadcn/ui components
│   │   └── telegram-webapp.tsx      # ادغام Telegram WebApp
│   ├── 📁 lib/                      # منطق برنامه
│   │   ├── db.ts                    # Prisma client (D1 + SQLite)
│   │   ├── auth.ts                  # احراز هویت + 2FA
│   │   ├── telegram.ts              # فراخوانی Telegram Bot API
│   │   ├── scheduler.ts             # موتور زمان‌بندی
│   │   ├── audit.ts                 # لاگ فعالیت
│   │   ├── totp.ts                  # TOTP برای 2FA
│   │   ├── i18n.tsx                 # ترجمه FA/EN
│   │   ├── realtime.ts              # WebSocket
│   │   └── export-utils.ts          # خروجی CSV/JSON
│   ├── 📁 hooks/                    # React hooks
│   └── middleware.ts                # احراز هویت API
│
├── 📁 mini-services/                # سرویس‌های کمکی
│   ├── scheduler-service/           # سرویس زمان‌بندی
│   └── realtime-service/            # سرویس WebSocket
│
├── 📁 public/                       # فایل‌های استاتیک
│   ├── logo.svg
│   └── robots.txt
│
├── 📁 examples/                     # نمونه کد
│   └── websocket/
│
├── worker.js                        # 🤖 ربات تلگرام (Cloudflare Worker)
├── wrangler.toml                    # کانفیگ دیپلوی ربات
├── wrangler.pages.toml              # کانفیگ دیپلوی پنل
├── open-next.config.ts              # کانفیگ OpenNext برای Cloudflare
│
├── package.json                     # پکیج‌ها و اسکریپت‌ها
├── next.config.ts                   # کانفیگ Next.js
├── tsconfig.json                    # کانفیگ TypeScript
├── tailwind.config.ts               # کانفیگ Tailwind CSS
├── eslint.config.mjs                # کانفیگ ESLint
├── components.json                  # کانفیگ shadcn/ui
├── postcss.config.mjs               # کانفیگ PostCSS
│
├── .gitignore                       # فایل‌های نادیده گرفته‌شده
├── bun.lock                         # lock file
└── README.md                        # همین فایل!
```

---

## 🛠 دستورات پرکاربرد

| کار | دستور |
|-----|-------|
| 🏃 اجرای لوکال پنل | `bun run dev` |
| 🔍 بررسی کیفیت کد | `bun run lint` |
| 🗄️ بیلد Prisma client | `bun run db:generate` |
| 💾 اعمال schema روی SQLite لوکال | `bun run db:push` |
| 🌐 بیلد پنل برای Cloudflare | `bun run pages:build` |
| 👀 پیش‌نمایش لوکال با D1 | `bun run pages:preview` |
| 🚀 دیپلوی پنل | `bun run pages:deploy` |
| 🤖 دیپلوی ربات | `wrangler deploy` |
| 📊 مهاجرت D1 (پروداکشن) | `bun run d1:migrate:prod` |
| 📊 مهاجرت D1 (لوکال) | `bun run d1:migrate:local` |
| 📜 لاگ‌های پنل (real-time) | `wrangler tail --config wrangler.pages.toml` |
| 📜 لاگ‌های ربات (real-time) | `wrangler tail` |
| 🔍 مشاهده دیتابیس D1 | `wrangler d1 execute telegram-bot-panel --remote --command "SELECT * FROM Admin"` |
| ⚙️ تنظیم webhook ربات | `curl https://your-worker.workers.dev/setup-webhook` |
| 🗑️ حذف webhook ربات | `curl https://your-worker.workers.dev/delete-webhook` |
| 🏥 وضعیت ربات | `curl https://your-worker.workers.dev/health` |
| ℹ️ اطلاعات ربات | `curl https://your-worker.workers.dev/info` |

---

## 🌍 تنظیم دامنه اختصاصی (اختیاری)

اگه می‌خواید به‌جای `xxx.workers.dev` از دامنه خودتون استفاده کنید (مثلاً `panel.yourdomain.com`):

### برای پنل ادمین

1. در [Cloudflare Dashboard](https://dash.cloudflare.com) دامنه‌تون رو اضافه کنید (اگه هنوز نیست)
2. در فایل `wrangler.pages.toml` خط `routes` رو از حالت کامنت درآورید:

```toml
routes = [
  { pattern = "panel.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

3. در DNS Cloudflare یه رکورد CNAME اضافه کنید:
   - Type: `CNAME`
   - Name: `panel`
   - Target: `telegram-bot-panel.<your-subdomain>.workers.dev`
   - Proxy status: 🟠 Proxied

4. دوباره دیپلوی کنید: `bun run pages:deploy`

### برای ربات تلگرام

در فایل `wrangler.toml`:

```toml
routes = [
  { pattern = "bot.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

و یه CNAME مشابه برای `bot` اضافه کنید.

> 📖 [راهنمای Custom Domains در Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/routing/routes/)

---

## ❓ سوالات متداول (FAQ)

<details>
<summary><b>آیا واقعاً رایگانه؟</b></summary>

بله! پلن رایگان Cloudflare شامل:
- **Workers**: ۱۰۰,۰۰۰ درخواست در روز
- **Pages**: محدودیت bandwidth نامحدود + ۵۰۰ بیلد در ماه
- **D1**: ۵GB ذخیره‌سازی + ۵M ردیف خوانده‌شده در روز
- **KV**: ۱۰۰,۰۰۰ خواندن در روز

برای یه ربات تلگرام شخصی یا حتی کوچک‌تا-متوسط، این کاملاً کافیه. اگه ترافیکتون بیشتر شد، پلن پولی Workers Paid فقط $5/ماه است.

</details>

<details>
<summary><b>آیا دیتابیس روی Cloudflare امنه؟</b></summary>

بله. D1 و KV هر دو روی زیرساخت Cloudflare اجرا می‌شن و رمزنگاری در حال استراحت (at-rest encryption) دارن. اما:
- **هرگز** Bot Token یا پسورد رو در کد (commit) نذارید — همیشه از `wrangler secret put` استفاده کنید
- **هرگز** فایل `.env` یا `.dev.vars` رو به GitHub پوش نکنید (در `.gitignore` هست)
- پسورد پنل به‌صورت hash (SHA-256 + salt) ذخیره می‌شه، نه plaintext

</details>

<details>
<summary><b>اگه می‌خوام schema دیتابیس رو عوض کنم؟</b></summary>

1. فایل `prisma/schema.prisma` رو ویرایش کنید
2. SQL جدید تولید کنید:
   ```bash
   bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/init.sql
   ```
3. روی D1 پروداکشن اعمال کنید:
   ```bash
   bun run d1:migrate:prod
   ```
4. روی SQLite لوکال:
   ```bash
   bun run db:push
   ```
5. Prisma client رو بازسازی کنید:
   ```bash
   bun run db:generate
   ```

</details>

<details>
<summary><b>چرا ربات هر ۵ دقیقه پیام‌های زمان‌بندی‌شده رو چک می‌کنه؟</b></summary>

چون Cloudflare Workers محیط serverless هستن و نمی‌تونن یه پردازش رو همیشه نگه دارن. بنابراین از **Cron Triggers** استفاده می‌کنیم — هر ۵ دقیقه Worker اجرا می‌شه، چک می‌کنه آیا پیام due هست، اگه هست می‌فرسته.

اگه می‌خواید دقیق‌تر بشه (مثلاً هر ۱ دقیقه)، در فایل `wrangler.toml` این رو عوض کنید:
```toml
[triggers]
crons = ["*/1 * * * *"]  # هر ۱ دقیقه
```

> ⚠️ توجه: پلن رایگان Cloudflare محدودیت تعداد Cron داره — هر ۱ دقیقه ممکنه محدود باشه.

</details>

<details>
<summary><b>اگه پنل باز نمی‌شه در تلگرام؟</b></summary>

1. مطمئن شید `WEB_APP_URL` روی Worker ست شده:
   ```bash
   wrangler secret list
   ```
   باید `WEB_APP_URL` رو ببینید.

2. مطمئن شید URL با `https://` شروع می‌شه (نه `http://`)

3. در تلگرام `/start` بفرستید تا دکمه منو رفرش بشه

4. اگه هنوز مشکل هست، لاگ‌ها رو ببینید:
   ```bash
   wrangler tail
   ```

</details>

<details>
<summary><b>اگه می‌خوام چند ادمین اضافه کنم؟</b></summary>

۱. خودتون به‌صورت پیش‌فرض Owner هستید (با `OWNER_ID` که ست کردید)
۲. بعد از دیپلوی، در پنل ادمین → بخش Admins → Add Admin
۳. آیدی تلگرام شخص رو وارد کنید (از [@userinfobot](https://t.me/userinfobot) بگیرید)

</details>

<details>
<summary><b>آیا می‌تونم فقط ربات رو بدون پنل دیپلوی کنم؟</b></summary>

بله! اگه پنل نمی‌خواید:
- فقط `wrangler.toml` و `worker.js` رو نگه دارید
- `WEB_APP_URL` رو ست نکنید — دکمه 🌐 Panel ظاهر نمی‌شه
- `wrangler deploy` و `curl /setup-webhook` بزنید

ربات بدون پنل هم کامل کار می‌کنه — مدیریت از طریق دستورات تلگرامی.

</details>

<details>
<summary><b>اگه Bot Token لو رفت چی کار کنم؟</b></summary>

۱. سریع به [@BotFather](https://t.me/BotFather) بگید: `/revoke` → رباتتون رو انتخاب کنید
۲. توکن جدید می‌گیرید
۳. در Cloudflare توکن جدید رو ست کنید:
   ```bash
   echo "NEW_TOKEN" | wrangler secret put BOT_TOKEN
   echo "NEW_TOKEN" | wrangler secret put BOT_TOKEN --config wrangler.pages.toml
   ```
۴. دوباره دیپلوی کنید (هر دو):
   ```bash
   wrangler deploy
   bun run pages:deploy
   ```

</details>

<details>
<summary><b>چطور بک‌آپ بگیرم از دیتابیس؟</b></summary>

```bash
# خروجی کامل D1 به SQL:
wrangler d1 export telegram-bot-panel --remote --output=backup.sql

# یا فقط یه جدول خاص:
wrangler d1 execute telegram-bot-panel --remote --command "SELECT * FROM ScheduledMessage" --json > scheduled.json
```

</details>

<details>
<summary><b>چطور از AI استفاده کنم؟</b></summary>

۱. از یکی از این سرویس‌ها API key بگیرید:
- [OpenAI](https://platform.openai.com/api-keys)
- [Anthropic Claude](https://console.anthropic.com/)
- [Google Gemini](https://aistudio.google.com/apikey)
- [Groq](https://console.groq.com/keys) (رایگان + سریع، پیشنهادی)

۲. در Worker ست کنید:
```bash
echo "sk-..." | wrangler secret put AI_API_KEY

# (اختیاری) مدل و provider رو هم می‌تونید عوض کنید:
echo "groq" | wrangler secret put AI_PROVIDER
echo "llama-3.3-70b-versatile" | wrangler secret put AI_MODEL
```

۳. در تلگرام `/ai` بفرستید و پرامپت بدید.

</details>

---

## 🔧 عیب‌یابی

### پنل ارور دیتابیس می‌ده
```bash
# چک کنید جداول ساخته شدن:
wrangler d1 execute telegram-bot-panel --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# اگه خالی بود، مهاجرت رو اجرا کنید:
bun run d1:migrate:prod
```

### ربات جواب نمی‌ده
```bash
# ۱. وضعیت Worker:
curl https://your-worker.workers.dev/health
# باید: {"ok":true}

# ۲. تنظیم مجدد webhook:
curl https://your-worker.workers.dev/setup-webhook

# ۳. دیدن لاگ‌ها:
wrangler tail
```

### پیام‌های زمان‌بندی‌شده ارسال نمی‌شن
1. مطمئن شید `BOT_TOKEN` هم برای پنل و هم ربات ست شده
2. مطمئن شید Cron در `wrangler.toml` فعال هست: `crons = ["*/5 * * * *"]`
3. در پنل → بخش Scheduled → چک کنید status پیام `pending` باشه (نه `failed`)
4. لاگ‌ها رو ببینید: `wrangler tail`

### پنل داخل تلگرام باز نمی‌شه
1. `WEB_APP_URL` رو روی Worker ست کنید (با URL HTTPS پنل)
2. `/start` بفرستید تا منو رفرش بشه
3. اگه هنوز نیست، دستی باز کنید: در Worker URL پنل رو به‌صورت `https://panel-url` باز کنید

### خطای "Bot token not configured" در پنل
```bash
# توکن رو دوباره ست کنید:
echo "123456:ABC..." | wrangler secret put BOT_TOKEN --config wrangler.pages.toml

# دوباره دیپلوی:
bun run pages:deploy
```

### WebSocket کار نمی‌کنه روی Cloudflare
Cloudflare Pages از WebSocket پشتیبانی می‌کنه، اما نیازمند تنظیمات خاص هست. در حال حاضر، پنل به polling fallback می‌کنه — یعنی هر چند ثانیه اطلاعات رو رفرش می‌کنه. این کاملاً قابل قبوله.

---

## 📚 مستندات بیشتر

| منبع | لینک |
|------|------|
| 📖 راهنمای فنی ربات Worker | [docs/README-worker.md](docs/README-worker.md) |
| 📖 راهنمای دیپلوی پیشرفته | [docs/DEPLOY-CLOUDFLARE.md](docs/DEPLOY-CLOUDFLARE.md) |
| 📖 Telegram Bot API | https://core.telegram.org/bots/api |
| 📖 Telegram WebApp (Mini Apps) | https://core.telegram.org/bots/webapps |
| 📖 Telegram Inline Mode | https://core.telegram.org/bots/inline |
| 📖 Cloudflare Workers | https://developers.cloudflare.com/workers/ |
| 📖 Cloudflare D1 | https://developers.cloudflare.com/d1/ |
| 📖 Cloudflare KV | https://developers.cloudflare.com/kv/ |
| 📖 Cloudflare Pages | https://developers.cloudflare.com/pages/ |
| 📖 Wrangler CLI | https://developers.cloudflare.com/workers/wrangler/ |
| 📖 OpenNext for Cloudflare | https://opennext.js.org/cloudflare |
| 📖 Prisma + D1 | https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1 |
| 📖 Next.js 16 | https://nextjs.org/docs |
| 📖 shadcn/ui | https://ui.shadcn.com |
| 📖 Tailwind CSS | https://tailwindcss.com |

---

## 🔐 امنیت

### ✅ کارهایی که انجام دادیم
- 🔒 **HTTPS اجباری** — تمام ارتباطات رمزنگاری شده
- 🔑 **Bot Token به‌صورت secret** — هرگز در کد نیست
- 🧂 **پسورد با salt + SHA-256** — حتی اگه دیتابیس لو بره، پسوردها قابل بازیابی نیستن
- 🍪 **Cookie امن** — `httpOnly` + `secure` + `sameSite`
- 🛡️ **2FA (TOTP)** — ورود دو مرحله‌ای با Google Authenticator
- ⏱️ **Rate limiting** — جلوگیری از brute-force روی ورود
- 📝 **Audit log** — تمام تغییرات مهم لاگ می‌شن
- 🔐 **Webhook secret** — جعل آپدیت تلگرام غیرممکنه

### ⚠️ کارهایی که شما باید انجام بدید
- [ ] **پسورد پیش‌فرض `admin123` رو عوض کنید**
- [ ] **2FA رو فعال کنید** (در تنظیمات پنل)
- [ ] **`.env` رو هرگز به GitHub پوش نکنید** (در `.gitignore` هست، ولی دوباره چک کنید)
- [ ] **Bot Token رو با کسی به اشتراک نذارید**
- [ ] **اگه Token لو رفت، سریع `/revoke` بزنید در BotFather**
- [ ] **از پسورد قوی برای پنل استفاده کنید** (حداقل ۱۲ کاراکتر، شامل حروف/اعداد/علائم)

---

## 📜 مجوز

این پروژه به‌صورت **open source** منتشر شده. می‌تونید آزادانه استفاده، تغییر و توزیع کنید.

اگه پروژه رو دوست داشتید، یه ⭐ تو GitHub بدید! 🌟

---

## 🙏 تشکر و اعتبار

این پروژه از ابزارهای متن‌باز زیر استفاده می‌کنه:

- [Next.js](https://nextjs.org) — فریم‌ورک React
- [Cloudflare Workers](https://workers.cloudflare.com) — پلتفرم serverless
- [Prisma](https://www.prisma.io) — ORM
- [shadcn/ui](https://ui.shadcn.com) — کامپوننت‌های UI
- [Tailwind CSS](https://tailwindcss.com) — استایل
- [OpenNext](https://opennext.js.org) — سازگارساز Next.js با Cloudflare
- [Cobalt](https://github.com/imputnet/cobalt) — API دانلود مدیا

---

## 📞 پشتیبانی

اگه مشکلی دارید:

1. اول [بخش عیب‌یابی](#-عیب‌یابی) رو بخونید
2. [سوالات متداول](#-سوالات-متداول-faq) رو چک کنید
3. لاگ‌ها رو ببینید (`wrangler tail`)
4. در GitHub Issues مشکل رو گزارش بدید

---

<div align="center">

**ساخته شده با ❤️ برای جامعه فارسی‌زبان**

[⬆ برگشت به بالا](#-ربات-تلگرام--پنل-ادمین--نسخه-کامل-cloudflare)

</div>
