# 🤖 ربات تلگرام + پنل ادمین — نسخه کامل Cloudflare

> **یک ربات تلگرام حرفه‌ای با پنل وب ادمین، تماماً روی Cloudflare.**
> شامل: ارسال پیام زمان‌بندی‌شده، تولید محتوا با AI، دانلود از یوتیوب/اسپاتیفای/گیت‌هاب، نظرسنجی، تحلیل آمار.

[![Deploy on Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-83.3%25-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)

---

## 📑 فهرست

- [این پروژه چیست؟](#-این-پروژه-چیست)
- [چه امکاناتی دارد؟](#-چه-امکاناتی-دارد)
- [ترکیب تکنولوژی](#-ترکیب-تکنولوژی)
- [معماری پروژه](#-معماری-پروژه)
- [پیش‌نیازها](#-پیش‌نیازها)
- [راه‌اندازی گام‌به‌گام](#-راه‌اندازی-گام‌به‌گام)
- [ساختار پوشه‌ها](#-ساختار-پوشهها)
- [دستورات پرکاربرد](#-دستورات-پرکاربرد)
- [تنظیم دامنه اختصاصی](#-تنظیم-دامنه-اختصاصی-اختیاری)
- [سوالات متداول (FAQ)](#-سوالات-متداول-faq)
- [عیب‌یابی](#-عیب‌یابی)
- [امنیت](#-امنیت)
- [مستندات بیشتر](#-مستندات-بیشتر)
- [مجوز](#-مجوز)

---

## 🎯 این پروژه چیست؟

این پروژه شامل **دو بخش** است که با هم کار می‌کنند:

| بخش | توضیح ساده |
|------|------------|
| 🤖 **ربات تلگرام** | یک ربات تلگرام که کاربرها باهاش حرف می‌زنن. می‌تونه محتوا با AI بسازه، از یوتیوب/گیت‌هاب دانلود کنه، نظرسنجی بگیره، آمار بده. |
| 🌐 **پنل ادمین** | یک سایت وب که شما (به‌عنوان مدیر ربات) بازش می‌کنید تا پیام‌های زمان‌بندی‌شده بسازید، کانال مدیریت کنید، آمار ببینید. |

**نکته جذاب:** پنل ادمین رو می‌تونید از داخل خود تلگرام باز کنید (به‌صورت یک Mini App) — نیازی نیست URL جداگانه‌ای در مرورگر باز کنید!

هر دو بخش روی **[Cloudflare](https://www.cloudflare.com/)** اجرا می‌شن — یعنی:
- ⚡ سریع (سرورهای خود Cloudflare در سراسر دنیا)
- 💰 رایگان (برای استفاده‌های معمولی کافیه)
- 🔒 امن (HTTPS خودکار، محیط ایزوله)

---

## ✨ چه امکاناتی دارد؟

### 🤖 ربات تلگرام (Cloudflare Worker)

| امکان | توضیح |
|------|-------|
| 📝 **Markdown و HTML** | پیام‌های زیبا با فرمت‌بندی کامل |
| 🤖 **AI Content Generation** | تولید محتوا با OpenAI/Claude/Gemini/Groq |
| 📅 **Scheduled Messages** | زمان‌بندی ارسال (هر ۵ دقیقه بررسی) |
| 📊 **Analytics** | آمار کانال، رشد، نرخ موفقیت |
| 📋 **Polls & Quizzes** | نظرسنجی و تحلیل نتایج |
| 📥 **Media Downloader** | دانلود از YouTube/Spotify/Instagram/TikTok |
| 🐙 **GitHub Downloader** | دانلود فایل/Release/Repository |
| ⚡ **Inline Mode** | جستجو مستقیم در چت |
| 🌐 **WebApp Menu** | دکمه باز کردن پنل |
| 🌍 **Bilingual** | فارسی/انگلیسی |

### 🌐 پنل ادمین (Next.js + Cloudflare Pages)

| امکان | توضیح |
|------|-------|
| 📊 **Dashboard** | نمای کلی وضعیت و آمار |
| 📅 **Scheduled Messages** | ساخت/ویرایش پیام‌های تکراری |
| 📢 **Broadcast** | ارسال آنی به کانال |
| 📝 **Templates** | ذخیره و استفاده مجدد |
| 📺 **Channel Manager** | مدیریت کانال‌ها |
| 👥 **Admin Manager** | مدیریت دسترسی |
| 📈 **Analytics** | نمودار و تحلیل عمیق |
| 📜 **Activity Log** | تاریخچه تمام تغییرات |
| 🔐 **2FA** | ورود دو مرحله‌ای |
| 🌗 **Dark Mode** | تطبیق با تم |

---

## 📊 ترکیب تکنولوژی

```
TypeScript: 83.3%  (اصلی‌ترین زبان)
JavaScript: 14.6% (کانفیگ‌ها و ابزارها)
CSS: 2.1%         (استایل‌ها)
```

### فریم‌ورک‌ها و ابزارها

| بخش | تکنولوژی |
|------|----------|
| **Frontend** | Next.js 16, React, TypeScript, Tailwind CSS |
| **Backend** | Cloudflare Workers, D1, KV |
| **Database** | SQLite (D1), Redis-like (KV) |
| **ORM** | Prisma |
| **UI Components** | shadcn/ui |
| **CLI** | Wrangler, Bun |

---

## 🏗 معماری پروژه

```
┌──────────────────────────────────────────────────────────────┐
│            کاربران تلگرام + کانال‌های شما                      │
└──────────────┬────────────────────────────────┬──────────────┘
               │                                │
               │ ۱) Webhook Messages            │ ۹) WebApp Button
               ▼                                ▼
┌──────────────────────────────────┐  ┌──────────────────────────┐
│ 🤖 Cloudflare Worker             │  │ 🌐 Cloudflare Pages      │
│ (ربات تلگرام)                     │  │ (پنل ادمین)              │
│                                  │  │                          │
│ • پردازش پیام‌ها                   │◄─│ • Dashboard + Analytics  │
│ • تولید محتوا با AI              │  │ • Scheduled Messages     │
│ • دانلود مدیا                     │  │ • Broadcast              │
│ • نظرسنجی                         │  │ • Channel Manager        │
│ • Cron (هر ۵ دقیقه)              │  │ • Admin Manager + 2FA    │
│                                  │  │                          │
│ 💾 KV Database                   │  │ 💾 D1 (SQLite)           │
└──────────────┬────────────────────┘  └────────────┬────────────┘
               │                                    │
               │ ۲) Telegram Bot API                │ ۳) Telegram API
               └────────────────────────────────────┘
```

---

## 📋 پیش‌نیازها

### ۱. ربات تلگرام
- به [@BotFather](https://t.me/BotFather) برید و `/newbot` بفرستید
- **Bot Token** بگیرید (بعداً در Secrets ذخیره می‌کنید)

### ۲. Telegram User ID
- به [@userinfobot](https://t.me/userinfobot) پیام بدید
- آیدی عددی یادداشت کنید

### ۳. ابزارهای توسعه
```bash
# Node.js 20+
brew install node  # macOS
# یا: https://nodejs.org/

# Bun (پیشنهادی)
curl -fsSL https://bun.sh/install | bash

# Wrangler
npm install -g wrangler
```

### ۴. حساب Cloudflare
- ثبت‌نام رایگان: [dash.cloudflare.com](https://dash.cloudflare.com/sign-up)

---

## 🚀 راه‌اندازی گام‌به‌گام

### گام ۱: کلون و نصب

```bash
git clone https://github.com/Arefmtl/arefera_admin_panel.git
cd arefera_admin_panel

# نصب پکیج‌ها
bun install
# یا: npm install
```

### گام ۲: Cloudflare Login

```bash
wrangler login
# یه مرورگر باز می‌شه — دکمه Allow رو بزنید
```

### گام ۳: ساخت دیتابیس

```bash
# D1 (پنل)
wrangler d1 create telegram-bot-panel

# کپی `database_id` و در wrangler.pages.toml بگذارید

# KV (ربات)
wrangler kv:namespace create BOT_DB

# کپی `id` و در wrangler.toml بگذارید
```

### گام ۴: Secrets

**⚠️ هرگز Secrets رو در فایل‌های Git ذخیره نکنید!**

```bash
# Bot Token (از @BotFather)
wrangler secret put BOT_TOKEN

# Owner ID (Telegram User ID شما)
wrangler secret put OWNER_ID

# پسورد پنل (رمز قوی بسازید)
wrangler secret put PANEL_PASSWORD --config wrangler.pages.toml

# Session Secret (برای encryption cookies)
openssl rand -hex 32 | wrangler secret put PANEL_SESSION_SECRET --config wrangler.pages.toml

# Webhook Secret (برای تأیید درخواست‌های Telegram)
openssl rand -hex 32 | wrangler secret put WEBHOOK_SECRET

# [اختیاری] AI API Key
wrangler secret put AI_API_KEY

# [اختیاری] Web App URL
wrangler secret put WEB_APP_URL
```

### گام ۵: دیپلوی

```bash
# پنل
bun run pages:deploy

# ربات
wrangler deploy

# Setup Webhook
curl "https://your-worker-name.workers.dev/setup-webhook"
```

### گام ۶: تست

1. تلگرام رو باز کنید
2. رباتتون رو سرچ کنید و `/start` بفرستید
3. دکمه 🌐 Panel رو بزنید

🎉 **تبریک!**

---

## 📁 ساختار پوشه‌ها

```
.
├── 📁 src/                        # کد پنل (Next.js + TypeScript)
│   ├── 📁 app/                    # صفحات و API
│   ├── 📁 components/             # React Components
│   ├── 📁 lib/                    # Utilities
│   └── 📁 hooks/                  # Custom Hooks
│
├── 📁 prisma/                     # Database Schema
│   ├── schema.prisma              # Prisma Schema
│   └── migrations/                # SQL Migrations
│
├── 📁 public/                     # Static Files
│
├── worker.js                      # 🤖 Telegram Bot (Worker)
├── wrangler.toml                  # Worker Config
├── wrangler.pages.toml            # Pages Config
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
│
└── README.md                      # این فایل
```

---

## 🛠 دستورات پرکاربرد

| کار | دستور |
|-----|-------|
| 🏃 Dev Server | `bun run dev` |
| 🔍 Lint | `bun run lint` |
| 🌐 Build Panel | `bun run pages:build` |
| 🚀 Deploy Panel | `bun run pages:deploy` |
| ��� Deploy Bot | `wrangler deploy` |
| 📊 Migrate DB | `bun run d1:migrate:prod` |
| 📜 View Logs | `wrangler tail` |
| 🔍 Query DB | `wrangler d1 execute telegram-bot-panel --remote --command "SELECT * FROM Admin"` |
| ⚙️ Setup Webhook | `curl https://your-worker-name.workers.dev/setup-webhook` |
| 🏥 Health Check | `curl https://your-worker-name.workers.dev/health` |

---

## ❓ سوالات متداول (FAQ)

<details>
<summary><b>آیا واقعاً رایگانه؟</b></summary>

بله! پلن رایگان Cloudflare:
- **Workers**: ۱۰۰,۰۰۰ درخواست/روز
- **Pages**: bandwidth نامحدود
- **D1**: ۵GB ذخیره‌سازی
- **KV**: ۱۰۰,۰۰۰ خواندن/روز

برای ربات شخصی کاملاً کافیه.

</details>

<details>
<summary><b>چطور Schema عوض کنم؟</b></summary>

```bash
# ویرایش: prisma/schema.prisma
# سپس:
bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/init.sql

# اعمال:
bun run d1:migrate:prod
```

</details>

<details>
<summary><b>اگه Bot Token لو رفت؟</b></summary>

۱. `/revoke` در [@BotFather](https://t.me/BotFather)
۲. توکن جدید ست کنید:
```bash
wrangler secret put BOT_TOKEN
wrangler secret put BOT_TOKEN --config wrangler.pages.toml
```
۳. دوباره دیپلوی کنید

</details>

<details>
<summary><b>چطور Backup بگیرم؟</b></summary>

```bash
wrangler d1 export telegram-bot-panel --remote --output=backup.sql
```

</details>

---

## 🔧 عیب‌یابی

### پنل ارور دیتابیس می‌ده

```bash
wrangler d1 execute telegram-bot-panel --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# اگه خالی بود:
bun run d1:migrate:prod
```

### ربات جواب نمی‌ده

```bash
# چک کنید:
curl https://your-worker-name.workers.dev/health

# Setup مجدد:
curl https://your-worker-name.workers.dev/setup-webhook

# لاگ‌ها:
wrangler tail
```

### پیام‌های زمان‌بندی‌شده ارسال نمی‌شن

1. `BOT_TOKEN` ست شده؟
2. Cron فعال؟ (`crons = ["*/5 * * * *"]` در wrangler.toml)
3. Status پیام `pending`؟
4. لاگ‌ها: `wrangler tail`

---

## 🔐 امنیت

### ✅ اقدامات شده

- 🔒 HTTPS اجباری
- 🔑 Bot Token به‌صورت Secret (هرگز در کد نیست)
- 🧂 Password Hash (SHA-256 + salt)
- 🍪 Secure Cookies
- 🛡️ 2FA (TOTP)
- ⏱️ Rate Limiting
- 📝 Audit Log
- 🔐 Webhook Secret

### ⚠️ کارهایی که شما باید انجام بدید

- [ ] پسورد را یک رمز قوی انتخاب کنید
- [ ] 2FA فعال کنید
- [ ] `.env.local` یا `.env` رو به `.gitignore` اضافه کنید
- [ ] Bot Token رو با کسی نشریید
- [ ] Secrets رو هرگز در GitHub نگذارید

---

## 📚 مستندات بیشتر

| منبع | لینک |
|------|------|
| Telegram Bot API | https://core.telegram.org/bots/api |
| Cloudflare Workers | https://developers.cloudflare.com/workers/ |
| Cloudflare D1 | https://developers.cloudflare.com/d1/ |
| Next.js | https://nextjs.org/docs |
| Prisma | https://www.prisma.io/docs/ |

---

## 📜 مجوز

Open Source — آزادانه استفاده، تغییر و توزیع کنید.

اگه دوست داشتید، یه ⭐ بدید! 🌟

---

## 📞 پشتیبانی

مشکل دارید؟
1. بخش [عیب‌یابی](#-عیب‌یابی) رو بخونید
2. [FAQ](#-سوالات-متداول-faq) رو چک کنید
3. لاگ‌ها: `wrangler tail`
4. GitHub Issues

---

<div align="center">

**ساخته شده با ❤️ برای جامعه فارسی‌زبان**

</div>
