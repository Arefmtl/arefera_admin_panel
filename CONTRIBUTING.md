# Contributing Guide — راهنمای مشارکت

از مشارکت شما در این پروژه سپاسگزاریم! 🎉

## 🚀 شروع به کار

```bash
# کلون کردن پروژه
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# نصب پکیج‌ها
bun install

# اجرای لوکال
bun run dev

# باز کردن در مرورگر
# http://localhost:3000
```

## 🛠 گردش کار توسعه

1. یه branch جدید بسازید:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. تغییراتتون رو اعمال کنید

3. کدتون رو تست کنید:
   ```bash
   bun run lint    # بررسی کیفیت کد
   bun run dev     # اجرای لوکال
   ```

4. Commit بزنید (با پیام واضح):
   ```bash
   git commit -m "feat: add new analytics chart"
   ```

   از [Conventional Commits](https://www.conventionalcommits.org/) استفاده کنید:
   - `feat:` قابلیت جدید
   - `fix:` رفع باگ
   - `docs:` تغییر مستندات
   - `refactor:` بازنویسی کد بدون تغییر رفتار
   - `chore:` کارهای نگهداری

5. Push کنید و Pull Request بزنید:
   ```bash
   git push origin feature/your-feature-name
   ```

## 📐 استانداردهای کد

- **TypeScript** — تمام کد باید type-safe باشه
- **ESLint** — `bun run lint` باید بدون خطا باشه
- **shadcn/ui** — برای کامپوننت‌های UI از shadcn استفاده کنید (نه کتابخانه دیگه)
- **Tailwind CSS** — برای استایل‌دهی
- **پوشه‌بندی**:
  - `src/components/admin/` — کامپوننت‌های پنل
  - `src/components/ui/` — shadcn components
  - `src/lib/` — منطق برنامه
  - `src/app/api/` — API routes

## 🌍 ترجمه (i18n)

تمام متن‌های قابل‌مشاهده توسط کاربر باید در `src/lib/i18n.tsx` اضافه بشن (هم با کلید EN، هم FA).

## 📝 گزارش باگ

اگه باگی پیدا کردید، یه [Issue جدید](../../issues/new) باز کنید با:
- توضیح واضح مشکل
- مراحل بازتولید
- محیط (مرورگر، سیستم‌عامل)
- در صورت امکان، screenshot

## 💡 پیشنهاد قابلیت

اگه ایده‌ای برای قابلیت جدید دارید، اول یه Issue با تگ `enhancement` باز کنید تا بحث بشه.

## 📜 کد رفتار

با احترام رفتار کنید. ما یه جامعه دوستانه داریم و هیچ‌گونه توهین یا تبعیض تحمل نمی‌کنیم.

---

سپاس از مشارکتتون! 🙏
