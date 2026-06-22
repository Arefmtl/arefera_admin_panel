"use client";

/**
 * Internationalization (i18n) system — FA/EN bilingual support.
 *
 * The original Telegram bot was bilingual (Persian / English). This system
 * mirrors that on the admin panel. Persian strings render RTL via the `dir`
 * attribute on the <html> element.
 *
 * Usage:
 *   const { t, locale, setLocale, dir } = useI18n();
 *   <p>{t("dashboard.title")}</p>
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type Locale = "en" | "fa";

type Dict = Record<string, string>;

const en: Dict = {
  // App-level
  "app.title": "Telegram Bot Admin",
  "app.subtitle": "Broadcast control center",
  "app.footer": "Telegram Bot Admin Panel · Scheduled messages engine",
  "app.runnerActive": "active",
  "app.runner30s": "Runner: active · 30s interval",
  "app.lastFire": "Last fire",

  // Nav groups
  "nav.group.overview": "OVERVIEW",
  "nav.group.messaging": "MESSAGING",
  "nav.group.config": "CONFIG",

  // Nav items
  "nav.dashboard": "Dashboard",
  "nav.analytics": "Analytics",
  "nav.activity": "Activity log",
  "nav.scheduled": "Scheduled",
  "nav.broadcast": "Broadcast",
  "nav.templates": "Templates",
  "nav.channels": "Channels",
  "nav.admins": "Admins",
  "nav.settings": "Settings",

  // Topbar
  "topbar.quickJump": "Quick jump…",
  "topbar.keyboardShortcuts": "Keyboard shortcuts",
  "topbar.notifications": "Notifications",
  "topbar.toggleTheme": "Toggle theme",
  "topbar.apiDocs": "API docs",
  "topbar.botConnected": "Bot connected",
  "topbar.noToken": "No token",

  // Sidebar
  "sidebar.runner": "RUNNER",
  "sidebar.live": "live",
  "sidebar.runnerDesc": "Polls for due scheduled messages every 30 seconds.",
  "sidebar.token": "Token",
  "sidebar.configured": "configured",
  "sidebar.notSet": "not set",

  // Common actions
  "action.runNow": "Run now",
  "action.export": "Export",
  "action.refresh": "Refresh",
  "action.new": "New schedule",
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.edit": "Edit",
  "action.clone": "Clone",
  "action.clearFilters": "Clear filters",
  "action.selectAll": "Select all",
  "action.clear": "Clear",
  "action.search": "Search",
  "action.close": "Close",
  "action.create": "Create",
  "action.update": "Update",

  // Statuses
  "status.pending": "Pending",
  "status.sent": "Sent",
  "status.failed": "Failed",
  "status.cancelled": "Cancelled",
  "status.paused": "Paused",

  // Repeat
  "repeat.once": "Once",
  "repeat.daily": "Daily",
  "repeat.weekly": "Weekly",
  "repeat.monthly": "Monthly",

  // Dashboard
  "dashboard.heading": "Dashboard",
  "dashboard.subtitle": "Overview & analytics",
  "dashboard.schedulerOnline": "Scheduler service online",
  "dashboard.schedulerOffline": "Scheduler service offline",
  "dashboard.schedulerOnlineDesc": "Background worker is polling every 60s — messages fire even when this panel is closed.",
  "dashboard.schedulerOfflineDesc": "Background worker not detected. Messages only fire while this panel is open or via manual 'Run now'.",
  "dashboard.running": "running",
  "dashboard.standby": "standby",
  "dashboard.pendingScheduled": "PENDING SCHEDULED",
  "dashboard.waitingToFire": "Waiting to fire",
  "dashboard.sent": "SENT",
  "dashboard.successRate": "success rate",
  "dashboard.channels": "CHANNELS",
  "dashboard.active": "active",
  "dashboard.admins": "ADMINS",
  "dashboard.botOperators": "Bot operators",
  "dashboard.deliveryTrend": "Delivery trend",
  "dashboard.deliveryTrendDesc": "Successful vs failed deliveries over the last 14 days",
  "dashboard.repeatDistribution": "Repeat distribution",
  "dashboard.repeatDistributionDesc": "How scheduled messages are configured",
  "dashboard.channelPerformance": "Channel performance",
  "dashboard.channelPerformanceDesc": "Deliveries per channel (last 30 days)",
  "dashboard.upcoming": "Upcoming messages",
  "dashboard.upcomingDesc": "Next scheduled broadcasts",
  "dashboard.viewAll": "View all",
  "dashboard.recentActivity": "Recent activity",
  "dashboard.recentActivityDesc": "Latest delivery results",
  "dashboard.details": "Details",
  "dashboard.scheduleOne": "Schedule one",
  "dashboard.noUpcoming": "No upcoming messages scheduled.",
  "dashboard.noDeliveries": "No deliveries yet.",

  // Scheduled
  "scheduled.heading": "Scheduled messages",
  "scheduled.subtitle": "Plan one-off or recurring broadcasts. The runner fires due messages automatically.",
  "scheduled.searchPlaceholder": "Search by title or content…",
  "scheduled.allRepeats": "All repeats",
  "scheduled.tabs.all": "All",
  "scheduled.tabs.pending": "Pending",
  "scheduled.tabs.sent": "Sent",
  "scheduled.tabs.failed": "Failed",
  "scheduled.logs": "Logs",
  "scheduled.dueNow": "due now",
  "scheduled.noMessages": "No scheduled messages yet",
  "scheduled.noMessagesDesc": "Create your first scheduled broadcast to automate your messaging.",
  "scheduled.messagesSelected": "messages selected",
  "scheduled.bulkClone": "Clone",
  "scheduled.bulkCancel": "Cancel",
  "scheduled.bulkDelete": "Delete",

  // Form
  "form.title": "Title",
  "form.scheduledAt": "Scheduled at",
  "form.repeat": "Repeat",
  "form.message": "Message",
  "form.inlineButtons": "Inline buttons",
  "form.targetChannels": "Target channels",
  "form.selected": "selected",
  "form.addRow": "Add row",
  "form.noButtons": "No buttons attached. Add a row to create inline URL buttons under your message.",
  "form.markdown": "Markdown",
  "form.html": "HTML",
  "form.chars": "characters",

  // Login
  "login.subtitle": "Sign in to manage your broadcast bot",
  "login.passwordLabel": "Panel password",
  "login.signIn": "Sign in",
  "login.signingIn": "Signing in…",
  "login.hint": "Default password is admin123 — change it from Settings after signing in.",
  "login.footerHint": "Protected by a panel-level password. Sessions last 7 days.",
  "login.signedOut": "You have been signed out",
  "login.logout": "Sign out",
  "login.authFailed": "Authentication required",

  // Auth / Settings — password management
  "settings.panelSecurity": "Panel security",
  "settings.panelSecurityDesc": "Change the password used to access this admin panel.",
  "settings.changePassword": "Change password",
  "settings.newPassword": "New password",
  "settings.confirmPassword": "Confirm password",
  "settings.passwordChanged": "Password updated — please sign in again",
  "settings.passwordMismatch": "Passwords do not match",
  "settings.passwordTooShort": "Password must be at least 4 characters",
  "settings.sessionActive": "Session active",
  "settings.sessionExpires": "Session expires",
  "settings.securityNote": "Sessions last 7 days. Changing the password signs out all other devices.",
  "settings.defaultPassword": "Default password is admin123 until you change it.",

  // Scheduled — view tabs
  "scheduled.tabs.list": "List",
  "scheduled.tabs.timeline": "Timeline",
  "scheduled.tabs.calendar": "Calendar",

  // Calendar view
  "calendar.today": "Today",
  "calendar.more": "more",
  "calendar.addOnDay": "Add schedule on this day",
  "calendar.add": "Add",
  "calendar.messages": "messages",

  // Timeline view
  "timeline.upcoming": "Upcoming schedules",
  "timeline.next14Days": "Next 14 days",
  "timeline.next7Days": "Next 7 days",
  "timeline.empty": "No upcoming schedules in the next 14 days",
  "timeline.emptyCta": "Create one now",
  "timeline.now": "Now",
  "timeline.fireAt": "Fires at",
  "timeline.channels": "channels",

  // Scheduled — message draft autosave
  "scheduled.draft.restoreTitle": "Unsaved draft found",
  "scheduled.draft.restoreDesc": "You have an unsaved draft from {{time}}. Restore it?",
  "scheduled.draft.restore": "Restore",
  "scheduled.draft.discard": "Discard",
  "scheduled.draft.save": "Save draft",
  "scheduled.draft.saveTooltip": "Save a local draft you can restore later",
  "scheduled.draft.saved": "Draft saved",

  // Scheduled — timezone picker (Task 10-a)
  "scheduled.timezone": "Timezone",
  "scheduled.timezoneHint": "Times shown in",
  "scheduled.timezoneNote": "Persists locally. Times on cards and in this dialog are interpreted in this zone.",
  "scheduled.inZone": "in {{zone}}",

  // Scheduled — dialog UX polish (Task 10-a)
  "scheduled.buttonsHelperText": "Buttons appear as tappable URL links below your message",
  "scheduled.tips.title": "Scheduling tips",
  "scheduled.tip.personalize": "Use {{channel}} to personalize per-target",
  "scheduled.tip.test": "Test your message with 'Send test' before scheduling",
  "scheduled.tip.conflicts": "Conflict warnings help you avoid sending 2 messages at once",
  "scheduled.steps.compose": "Compose",
  "scheduled.steps.schedule": "Schedule",
  "scheduled.steps.target": "Target",

  // Settings — security hardening (Task 7-a)
  "settings.security.rateLimited": "Too many login attempts. Try again in {{seconds}}s.",
  "settings.security.isDefaultWarning": "You're using the default password (admin123). Change it now to secure your panel.",
  "settings.security.changeNow": "Change password now",
  "settings.tokenShowFull": "Show full token",
  "settings.tokenHideFull": "Hide full token",

  // Saved Views — backend persistence (Task 7-a)
  "savedViews.loading": "Loading saved views…",
  "savedViews.migrating": "Migrating saved views…",
  "savedViews.saveError": "Failed to save view",
  "savedViews.deleteError": "Failed to delete view",
  "savedViews.loadError": "Failed to load saved views",

  // Channel Health Monitor (Task 7-c)
  "channels.health.title": "Channel Health Monitor",
  "channels.health.subtitle": "Operational status of all broadcast channels",
  "channels.health.summary": "{{healthy}} healthy · {{degraded}} degraded · {{critical}} critical",
  "channels.health.score": "Health score",
  "channels.health.total": "Total deliveries",
  "channels.health.successRate": "Success rate",
  "channels.health.lastDelivery": "Last delivery",
  "channels.health.lastError": "Last error",
  "channels.health.viewDeliveries": "View deliveries",
  "channels.health.empty": "No channels yet — add one in the Channels tab.",
  "channels.health.show": "Show health monitor",
  "channels.health.hide": "Hide health monitor",
  "channels.health.status.healthy": "Healthy",
  "channels.health.status.degraded": "Degraded",
  "channels.health.status.critical": "Critical",
  "channels.health.status.inactive": "Inactive",

  // Analytics — Top performing channels leaderboard (Task 7-c)
  "analytics.topChannels": "Top performing channels",
  "analytics.topChannelsSubtitle": "Channels with the highest success rates",
  "analytics.noChannels": "No channel data yet",

  // Settings — Active sessions card (Task 8-c)
  "settings.sessions.title": "Active sessions",
  "settings.sessions.subtitle": "Devices currently signed in to this admin panel",
  "settings.sessions.current": "Current",
  "settings.sessions.lastSeen": "Last seen",
  "settings.sessions.expires": "Expires in",
  "settings.sessions.revoke": "Revoke",
  "settings.sessions.revokeAll": "Revoke all other sessions",
  "settings.sessions.revokeConfirm": "This will immediately sign out every other device. They will need to enter the panel password to sign back in.",
  "settings.sessions.empty": "No active sessions",
  "settings.sessions.unknownDevice": "Unknown device",
  "settings.sessions.browser": "Browser",
  "settings.sessions.os": "Operating system",
  "settings.sessions.revoked": "Session revoked",
  "settings.sessions.revokedAll": "All other sessions revoked",

  // Templates — preview, bulk actions, filters (Task 10-c)
  "templates.preview": "Template preview",
  "templates.previewDesc": "How this template will appear in Telegram",
  "templates.useThis": "Use this template",
  "templates.useSuccess": "Template loaded — open the Scheduled tab and click \"New schedule\" to apply it",
  "templates.bulkSelected": "{{count}} selected",
  "templates.deleteSelected": "Delete selected",
  "templates.exportSelected": "Export selected",
  "templates.deleteConfirm": "Delete {{count}} template(s)? This cannot be undone.",
  "templates.deleted": "{{count}} templates deleted",
  "templates.exported": "{{count}} templates exported",
  "templates.selectAll": "Select all",
  "templates.clearSelection": "Clear",
  "templates.filterCategory": "Category",
  "templates.categoryAll": "All categories",
  "templates.sortBy": "Sort by",
  "templates.sortName": "Name (A-Z)",
  "templates.sortCreated": "Created (newest)",
  "templates.sortCategory": "Category (A-Z)",
  "templates.noMatch": "No templates match your filters",
  "templates.noMatchDesc": "Try clearing the search or category filter.",
  "templates.clearFilters": "Clear filters",
  "templates.buttons.count": "{{count}} buttons",

  // Channels — visual polish (Task 10-c)
  "channels.subscribers": "subscribers",
  "channels.lastMessage": "Last message",
  "channels.noActivity": "No messages yet",
  "channels.active": "Active",
  "channels.paused": "Paused",

  // Calendar — visual cues (Task 10-c)
  "calendar.messageCount": "{{count}} message(s)",
  "calendar.noMessages": "No messages",
  "calendar.clickToAdd": "Click to add a schedule",

  // Analytics — metric tooltips (Task 10-c)
  "analytics.metric.totalDeliveries": "Total delivery log entries written in the last 30 days. Each channel delivery counts as one entry.",
  "analytics.metric.successful": "Successful deliveries in the last 30 days. A delivery succeeds when Telegram accepts the message.",
  "analytics.metric.failed": "Failed deliveries in the last 30 days. Failures usually indicate the bot lacks admin rights or the channel was deleted.",
  "analytics.metric.scheduled": "All scheduled messages (pending, sent, failed, cancelled). The pending count is shown in the hint.",
  "analytics.metricInfo": "More info",

  // Settings — Two-factor authentication (Task 10-b)
  "settings.2fa.title": "Two-factor authentication",
  "settings.2fa.subtitle": "Add a TOTP code (Google Authenticator, Authy, 1Password) as a second sign-in factor.",
  "settings.2fa.enable": "Enable 2FA",
  "settings.2fa.disable": "Disable 2FA",
  "settings.2fa.enabled": "Enabled",
  "settings.2fa.notEnabled": "Not enabled",
  "settings.2fa.scanQR": "Scan this QR code with your authenticator app, or enter the secret manually.",
  "settings.2fa.enterCode": "Enter the 6-digit code from your authenticator app to verify.",
  "settings.2fa.verify": "Verify & enable",
  "settings.2fa.verifying": "Verifying…",
  "settings.2fa.backupCodes": "Backup codes",
  "settings.2fa.backupCodesDesc": "Save these one-time-use codes somewhere safe. Each can be used instead of a TOTP code if you lose your device.",
  "settings.2fa.savedCodes": "I've saved these codes",
  "settings.2fa.disableConfirm": "Re-enter your panel password to disable 2FA.",
  "settings.2fa.password": "Panel password",
  "settings.2fa.backupRemaining": "Backup codes remaining",
  "settings.2fa.copySecret": "Copy secret",
  "settings.2fa.copied": "Secret copied to clipboard",
  "settings.2fa.downloadCodes": "Download codes",
  "settings.2fa.step": "Step",
  "settings.2fa.of": "of",
  "settings.2fa.invalidToken": "Invalid code — check your device clock and try again.",
  "settings.2fa.setupFailed": "Failed to start 2FA setup",
  "settings.2fa.verifyFailed": "Verification failed",
  "settings.2fa.disabled": "2FA disabled",
  "settings.2fa.enableSuccess": "2FA enabled — future sign-ins will require a code",
  "settings.2fa.qrAlt": "QR code for TOTP authenticator app",

  // Login — 2FA prompt (Task 10-b)
  "login.2fa.title": "Two-factor authentication",
  "login.2fa.subtitle": "Enter the 6-digit code from your authenticator app to continue.",
  "login.2fa.enterCode": "Authentication code",
  "login.2fa.useBackup": "Use a backup code instead",
  "login.2fa.useTOTP": "Use authenticator code",
  "login.2fa.backupCode": "Backup code",
  "login.2fa.verify": "Verify & sign in",
  "login.2fa.verifying": "Verifying…",
  "login.2fa.invalid": "Invalid code — try again.",
  "login.2fa.back": "Back to password",
  "login.2fa.backupHint": "Enter one of the 8-char codes you saved during setup.",

  // Activity log — chip filters (Task 11-c)
  "activity.filterTitle": "Filters",
  "activity.entityGroup": "Entity",
  "activity.actionGroup": "Action",
  "activity.entity.all": "All",
  "activity.entity.scheduled": "Scheduled",
  "activity.entity.channel": "Channel",
  "activity.entity.template": "Template",
  "activity.entity.admin": "Admin",
  "activity.entity.settings": "Settings",
  "activity.entity.broadcast": "Broadcast",
  "activity.action.all": "All",
  "activity.action.create": "Create",
  "activity.action.update": "Update",
  "activity.action.delete": "Delete",
  "activity.action.cancel": "Cancel",
  "activity.action.run": "Run",
  "activity.action.send": "Send",
  "activity.action.login": "Login",
  "activity.action.pause": "Pause",
  "activity.action.resume": "Resume",
  "activity.clearFilters": "Clear filters",
  "activity.filteredCount": "{{count}} of {{total}} events match",

  // Analytics — refresh + last updated (Task 11-c)
  "analytics.refresh": "Refresh",
  "analytics.refreshing": "Refreshing…",
  "analytics.lastUpdated": "Last updated {{when}}",
  "analytics.neverRefreshed": "Not refreshed yet",

  // Templates — usage stats (Task 11-c)
  "templates.usedTimes": "Used {{count}} times",
  "templates.usedOnce": "Used 1 time",
  "templates.neverUsed": "Never used",
  "templates.lastUsed": "Last used {{when}}",
  "templates.sortUsageDesc": "Usage (high → low)",
  "templates.sortUsageAsc": "Usage (low → high)",

  // Settings — Test chat card (Task 11-b)
  "settings.testChat.title": "Test chat",
  "settings.testChat.description": "Default chat ID for sending test messages. Used by the 'Send test' buttons.",
  "settings.testChat.placeholder": "-1001234567890",
  "settings.testChat.label": "Test chat ID",
  "settings.testChat.save": "Save",
  "settings.testChat.sendTest": "Send test message",
  "settings.testChat.clear": "Clear",
  "settings.testChat.saved": "Test chat ID saved",
  "settings.testChat.cleared": "Test chat ID cleared",
  "settings.testChat.saving": "Saving…",
  "settings.testChat.sending": "Sending…",
  "settings.testChat.sendSuccess": "Test message sent",
  "settings.testChat.sendFailed": "Test message failed",
  "settings.testChat.noChatId": "Enter a chat ID first",
  "settings.testChat.configured": "Configured",
  "settings.testChat.notConfigured": "Not configured",
  "settings.testChat.tokenMissing": "Bot token not configured — set it in the Bot token card above first",

  // Channels — Send test action (Task 11-b)
  "channels.sendTest.title": "Send test",
  "channels.sendTest.sending": "Sending…",
  "channels.sendTest.success": "Test message sent to channel",
  "channels.sendTest.failed": "Test message failed",
  "channels.sendTest.tokenMissing": "Bot token not configured",
  "channels.sendTest.tooltip": "Send a test message to this channel",

  // Scheduled — Duplicate menu (Task 11-b)
  "scheduled.duplicate.label": "Duplicate",
  "scheduled.duplicate.asIs": "Duplicate as-is",
  "scheduled.duplicate.plus1d": "Duplicate +1 day",
  "scheduled.duplicate.plus1w": "Duplicate +1 week",
  "scheduled.duplicate.success": "Schedule duplicated",
  "scheduled.duplicate.failed": "Failed to duplicate schedule",
  "scheduled.duplicate.duplicating": "Duplicating…",
};

const fa: Dict = {
  // App-level
  "app.title": "پنل مدیریت ربات تلگرام",
  "app.subtitle": "مرکز کنترل پیام‌های گروهی",
  "app.footer": "پنل مدیریت ربات تلگرام · موتور زمان‌بندی پیام‌ها",
  "app.runnerActive": "فعال",
  "app.runner30s": "اجراگر: فعال · بازه ۳۰ ثانیه",
  "app.lastFire": "آخرین اجرا",

  // Nav groups
  "nav.group.overview": "نمای کلی",
  "nav.group.messaging": "پیام‌رسانی",
  "nav.group.config": "پیکربندی",

  // Nav items
  "nav.dashboard": "داشبورد",
  "nav.analytics": "تحلیل‌ها",
  "nav.activity": "لاگ فعالیت",
  "nav.scheduled": "زمان‌بندی شده",
  "nav.broadcast": "ارسال گروهی",
  "nav.templates": "قالب‌ها",
  "nav.channels": "کانال‌ها",
  "nav.admins": "مدیران",
  "nav.settings": "تنظیمات",

  // Topbar
  "topbar.quickJump": "پرش سریع…",
  "topbar.keyboardShortcuts": "میانبرهای صفحه‌کلید",
  "topbar.notifications": "اعلان‌ها",
  "topbar.toggleTheme": "تغییر تم",
  "topbar.apiDocs": "مستندات API",
  "topbar.botConnected": "ربات متصل",
  "topbar.noToken": "بدون توکن",

  // Sidebar
  "sidebar.runner": "اجراگر",
  "sidebar.live": "زنده",
  "sidebar.runnerDesc": "هر ۳۰ ثانیه پیام‌های زمان‌بندی شده را بررسی می‌کند.",
  "sidebar.token": "توکن",
  "sidebar.configured": "پیکربندی شده",
  "sidebar.notSet": "تنظیم نشده",

  // Common actions
  "action.runNow": "اکنون اجرا کن",
  "action.export": "خروجی",
  "action.refresh": "بازخوانی",
  "action.new": "زمان‌بندی جدید",
  "action.save": "ذخیره",
  "action.cancel": "لغو",
  "action.delete": "حذف",
  "action.edit": "ویرایش",
  "action.clone": "کپی",
  "action.clearFilters": "پاک کردن فیلترها",
  "action.selectAll": "انتخاب همه",
  "action.clear": "پاک کردن",
  "action.search": "جستجو",
  "action.close": "بستن",
  "action.create": "ایجاد",
  "action.update": "به‌روزرسانی",

  // Statuses
  "status.pending": "در انتظار",
  "status.sent": "ارسال شده",
  "status.failed": "ناموفق",
  "status.cancelled": "لغو شده",
  "status.paused": "متوقف",

  // Repeat
  "repeat.once": "یک‌بار",
  "repeat.daily": "روزانه",
  "repeat.weekly": "هفتگی",
  "repeat.monthly": "ماهانه",

  // Dashboard
  "dashboard.heading": "داشبورد",
  "dashboard.subtitle": "نمای کلی و تحلیل‌ها",
  "dashboard.schedulerOnline": "سرویس زمان‌بند آنلاین",
  "dashboard.schedulerOffline": "سرویس زمان‌بند آفلاین",
  "dashboard.schedulerOnlineDesc": "اجراگر پس‌زمینه هر ۶۰ ثانیه بررسی می‌کند — پیام‌ها حتی وقتی این پنل بسته است ارسال می‌شوند.",
  "dashboard.schedulerOfflineDesc": "اجراگر پس‌زمینه یافت نشد. پیام‌ها فقط وقتی این پنل باز است یا با «اکنون اجرا کن» ارسال می‌شوند.",
  "dashboard.running": "در حال اجرا",
  "dashboard.standby": "آماده به کار",
  "dashboard.pendingScheduled": "در انتظار زمان‌بندی",
  "dashboard.waitingToFire": "در انتظار ارسال",
  "dashboard.sent": "ارسال شده",
  "dashboard.successRate": "نرخ موفقیت",
  "dashboard.channels": "کانال‌ها",
  "dashboard.active": "فعال",
  "dashboard.admins": "مدیران",
  "dashboard.botOperators": "اپراتورهای ربات",
  "dashboard.deliveryTrend": "روند ارسال",
  "dashboard.deliveryTrendDesc": "ارسال‌های موفق در برابر ناموفق در ۱۴ روز گذشته",
  "dashboard.repeatDistribution": "توزیع تکرار",
  "dashboard.repeatDistributionDesc": "نحوه پیکربندی پیام‌های زمان‌بندی شده",
  "dashboard.channelPerformance": "عملکرد کانال",
  "dashboard.channelPerformanceDesc": "تعداد ارسال به هر کانال (۳۰ روز گذشته)",
  "dashboard.upcoming": "پیام‌های پیش‌رو",
  "dashboard.upcomingDesc": "برنامه‌های ارسال بعدی",
  "dashboard.viewAll": "مشاهده همه",
  "dashboard.recentActivity": "فعالیت اخیر",
  "dashboard.recentActivityDesc": "آخرین نتایج ارسال",
  "dashboard.details": "جزئیات",
  "dashboard.scheduleOne": "زمان‌بندی یکی",
  "dashboard.noUpcoming": "هیچ پیام زمان‌بندی شده‌ای موجود نیست.",
  "dashboard.noDeliveries": "هنوز ارسالی انجام نشده است.",

  // Scheduled
  "scheduled.heading": "پیام‌های زمان‌بندی شده",
  "scheduled.subtitle": "ارسال‌های گروهی یک‌باره یا دوره‌ای را برنامه‌ریزی کنید. اجراگر پیام‌های رسیده را خودکار ارسال می‌کند.",
  "scheduled.searchPlaceholder": "جستجو بر اساس عنوان یا محتوا…",
  "scheduled.allRepeats": "همه تکرارها",
  "scheduled.tabs.all": "همه",
  "scheduled.tabs.pending": "در انتظار",
  "scheduled.tabs.sent": "ارسال شده",
  "scheduled.tabs.failed": "ناموفق",
  "scheduled.logs": "لاگ‌ها",
  "scheduled.dueNow": "اکنون",
  "scheduled.noMessages": "هنوز پیام زمان‌بندی شده‌ای وجود ندارد",
  "scheduled.noMessagesDesc": "اولین ارسال زمان‌بندی شده خود را ایجاد کنید تا پیام‌رسانی خودکار شود.",
  "scheduled.messagesSelected": "پیام انتخاب شده",
  "scheduled.bulkClone": "کپی",
  "scheduled.bulkCancel": "لغو",
  "scheduled.bulkDelete": "حذف",

  // Form
  "form.title": "عنوان",
  "form.scheduledAt": "زمان ارسال",
  "form.repeat": "تکرار",
  "form.message": "پیام",
  "form.inlineButtons": "دکمه‌های درون‌خطی",
  "form.targetChannels": "کانال‌های هدف",
  "form.selected": "انتخاب شده",
  "form.addRow": "افزودن ردیف",
  "form.noButtons": "هیچ دکمه‌ای ضمیمه نشده. یک ردیف اضافه کنید تا دکمه‌های URL زیر پیام شما ساخته شود.",
  "form.markdown": "مارک‌داون",
  "form.html": "اچ‌تی‌ام‌ال",
  "form.chars": "کاراکتر",

  // Login
  "login.subtitle": "برای مدیریت ربات ارسال گروهی وارد شوید",
  "login.passwordLabel": "رمز پنل",
  "login.signIn": "ورود",
  "login.signingIn": "در حال ورود…",
  "login.hint": "رمز پیش‌فرض admin123 است — پس از ورود از تنظیمات تغییر دهید.",
  "login.footerHint": "محافظت‌شده با رمز پنل. نشست‌ها ۷ روز معتبرند.",
  "login.signedOut": "از پنل خارج شده‌اید",
  "login.logout": "خروج",
  "login.authFailed": "نیاز به احراز هویت",

  // Auth / Settings — password management
  "settings.panelSecurity": "امنیت پنل",
  "settings.panelSecurityDesc": "رمز دسترسی به این پنل مدیریت را تغییر دهید.",
  "settings.changePassword": "تغییر رمز",
  "settings.newPassword": "رمز جدید",
  "settings.confirmPassword": "تأیید رمز",
  "settings.passwordChanged": "رمز به‌روزرسانی شد — لطفاً دوباره وارد شوید",
  "settings.passwordMismatch": "رمزها مطابقت ندارند",
  "settings.passwordTooShort": "رمز باید حداقل ۴ کاراکتر باشد",
  "settings.sessionActive": "نشست فعال",
  "settings.sessionExpires": "انقضای نشست",
  "settings.securityNote": "نشست‌ها ۷ روز معتبرند. تغییر رمز باعث خروج سایر دستگاه‌ها می‌شود.",
  "settings.defaultPassword": "رمز پیش‌فرض admin123 است تا تغییر دهید.",

  // Scheduled — view tabs
  "scheduled.tabs.list": "لیست",
  "scheduled.tabs.timeline": "تقویم زمانی",
  "scheduled.tabs.calendar": "تقویم",

  // Calendar view
  "calendar.today": "امروز",
  "calendar.more": "بیشتر",
  "calendar.addOnDay": "افزودن زمان‌بندی در این روز",
  "calendar.add": "افزودن",
  "calendar.messages": "پیام",

  // Timeline view
  "timeline.upcoming": "زمان‌بندی‌های پیش‌رو",
  "timeline.next14Days": "۱۴ روز آینده",
  "timeline.next7Days": "۷ روز آینده",
  "timeline.empty": "هیچ زمان‌بندی‌ای در ۱۴ روز آینده وجود ندارد",
  "timeline.emptyCta": "اکنون یکی بسازید",
  "timeline.now": "اکنون",
  "timeline.fireAt": "اجرا در",
  "timeline.channels": "کانال‌ها",

  // Scheduled — message draft autosave
  "scheduled.draft.restoreTitle": "پیش‌نویس ذخیره‌نشده یافت شد",
  "scheduled.draft.restoreDesc": "یک پیش‌نویس ذخیره‌نشده از {{time}} دارید. بازیابی شود؟",
  "scheduled.draft.restore": "بازیابی",
  "scheduled.draft.discard": "صرف‌نظر",
  "scheduled.draft.save": "ذخیره پیش‌نویس",
  "scheduled.draft.saveTooltip": "یک پیش‌نویس محلی ذخیره کنید تا بعداً بازیابی کنید",
  "scheduled.draft.saved": "پیش‌نویس ذخیره شد",

  // Scheduled — timezone picker (Task 10-a)
  "scheduled.timezone": "منطقه زمانی",
  "scheduled.timezoneHint": "زمان‌ها نمایش داده شده در",
  "scheduled.timezoneNote": "به‌صورت محلی ذخیره می‌شود. زمان‌ها روی کارت‌ها و در این گفتگو بر اساس این منطقه تفسیر می‌شوند.",
  "scheduled.inZone": "در {{zone}}",

  // Scheduled — dialog UX polish (Task 10-a)
  "scheduled.buttonsHelperText": "دکمه‌ها به‌عنوان لینک‌های قابل‌لمس زیر پیام شما نمایش داده می‌شوند",
  "scheduled.tips.title": "نکات زمان‌بندی",
  "scheduled.tip.personalize": "از {{channel}} برای شخصی‌سازی بر اساس هدف استفاده کنید",
  "scheduled.tip.test": "پیام خود را با «ارسال آزمایشی» قبل از زمان‌بندی تست کنید",
  "scheduled.tip.conflicts": "هشدارهای تعارض به شما کمک می‌کنند از ارسال همزمان ۲ پیام جلوگیری کنید",
  "scheduled.steps.compose": "تألیف",
  "scheduled.steps.schedule": "زمان‌بندی",
  "scheduled.steps.target": "هدف",

  // Settings — security hardening (Task 7-a)
  "settings.security.rateLimited": "تلاش‌های ورود بیش از حد مجاز. {{seconds}} ثانیه دیگر تلاش کنید.",
  "settings.security.isDefaultWarning": "شما از رمز پیش‌فرض (admin123) استفاده می‌کنید. همین حالا آن را تغییر دهید تا پنل خود را امن کنید.",
  "settings.security.changeNow": "اکنون رمز را تغییر دهید",
  "settings.tokenShowFull": "نمایش توکن کامل",
  "settings.tokenHideFull": "پنهان کردن توکن کامل",

  // Saved Views — backend persistence (Task 7-a)
  "savedViews.loading": "در حال بارگیری نمای ذخیره‌شده…",
  "savedViews.migrating": "در حال انتقال نمای‌های ذخیره‌شده…",
  "savedViews.saveError": "ذخیره نمای ناموفق بود",
  "savedViews.deleteError": "حذف نما ناموفق بود",
  "savedViews.loadError": "بارگیری نمای‌های ذخیره‌شده ناموفق بود",

  // Channel Health Monitor (Task 7-c)
  "channels.health.title": "مانیتور سلامت کانال",
  "channels.health.subtitle": "وضعیت عملیاتی همه کانال‌های پخش",
  "channels.health.summary": "{{healthy}} سالم · {{degraded}} تخریب‌شده · {{critical}} بحرانی",
  "channels.health.score": "امتیاز سلامت",
  "channels.health.total": "کل ارسال‌ها",
  "channels.health.successRate": "نرخ موفقیت",
  "channels.health.lastDelivery": "آخرین ارسال",
  "channels.health.lastError": "آخرین خطا",
  "channels.health.viewDeliveries": "مشاهده ارسال‌ها",
  "channels.health.empty": "هنوز کانالی وجود ندارد — در تب کانال‌ها یکی اضافه کنید.",
  "channels.health.show": "نمایش مانیتور سلامت",
  "channels.health.hide": "پنهان کردن مانیتور سلامت",
  "channels.health.status.healthy": "سالم",
  "channels.health.status.degraded": "تخریب‌شده",
  "channels.health.status.critical": "بحرانی",
  "channels.health.status.inactive": "غیرفعال",

  // Analytics — Top performing channels leaderboard (Task 7-c)
  "analytics.topChannels": "کانال‌های برتر",
  "analytics.topChannelsSubtitle": "کانال‌هایی با بالاترین نرخ موفقیت",
  "analytics.noChannels": "هنوز داده کانالی وجود ندارد",

  // Settings — Active sessions card (Task 8-c)
  "settings.sessions.title": "نشست‌های فعال",
  "settings.sessions.subtitle": "دستگاه‌هایی که اکنون به این پنل وارد شده‌اند",
  "settings.sessions.current": "فعلی",
  "settings.sessions.lastSeen": "آخرین فعالیت",
  "settings.sessions.expires": "انقضا در",
  "settings.sessions.revoke": "ابطال",
  "settings.sessions.revokeAll": "ابطال سایر نشست‌ها",
  "settings.sessions.revokeConfirm": "این اقدام بلافاصله تمام دستگاه‌های دیگر را خارج می‌کند. آن‌ها باید برای ورود مجدد رمز پنل را وارد کنند.",
  "settings.sessions.empty": "هیچ نشست فعالی وجود ندارد",
  "settings.sessions.unknownDevice": "دستگاه ناشناخته",
  "settings.sessions.browser": "مرورگر",
  "settings.sessions.os": "سیستم‌عامل",
  "settings.sessions.revoked": "نشست ابطال شد",
  "settings.sessions.revokedAll": "تمام نشست‌های دیگر ابطال شدند",

  // Templates — preview, bulk actions, filters (Task 10-c)
  "templates.preview": "پیش‌نمایش قالب",
  "templates.previewDesc": "این قالب چگونه در تلگرام نمایش داده می‌شود",
  "templates.useThis": "استفاده از این قالب",
  "templates.useSuccess": "قالب بارگذاری شد — تب زمان‌بندی را باز کرده و روی «زمان‌بندی جدید» کلیک کنید",
  "templates.bulkSelected": "{{count}} انتخاب شده",
  "templates.deleteSelected": "حذف انتخاب‌شده‌ها",
  "templates.exportSelected": "خروجی انتخاب‌شده‌ها",
  "templates.deleteConfirm": "حذف {{count}} قالب؟ این عمل قابل بازگشت نیست.",
  "templates.deleted": "{{count}} قالب حذف شد",
  "templates.exported": "{{count}} قالب خروجی گرفته شد",
  "templates.selectAll": "انتخاب همه",
  "templates.clearSelection": "پاک کردن",
  "templates.filterCategory": "دسته",
  "templates.categoryAll": "همه دسته‌ها",
  "templates.sortBy": "مرتب‌سازی بر اساس",
  "templates.sortName": "نام (A-Z)",
  "templates.sortCreated": "ایجاد شده (جدیدترین)",
  "templates.sortCategory": "دسته (A-Z)",
  "templates.noMatch": "هیچ قالبی با فیلترهای شما مطابقت ندارد",
  "templates.noMatchDesc": "جستجو یا فیلتر دسته را پاک کنید.",
  "templates.clearFilters": "پاک کردن فیلترها",
  "templates.buttons.count": "{{count}} دکمه",

  // Channels — visual polish (Task 10-c)
  "channels.subscribers": "مشترک",
  "channels.lastMessage": "آخرین پیام",
  "channels.noActivity": "هنوز پیامی وجود ندارد",
  "channels.active": "فعال",
  "channels.paused": "متوقف",

  // Calendar — visual cues (Task 10-c)
  "calendar.messageCount": "{{count}} پیام",
  "calendar.noMessages": "بدون پیام",
  "calendar.clickToAdd": "برای افزودن زمان‌بندی کلیک کنید",

  // Analytics — metric tooltips (Task 10-c)
  "analytics.metric.totalDeliveries": "کل لاگ‌های ارسال در ۳۰ روز گذشته. هر ارسال به کانال یک رکورد محسوب می‌شود.",
  "analytics.metric.successful": "ارسال‌های موفق در ۳۰ روز گذشته. ارسال زمانی موفق است که تلگرام پیام را بپذیرد.",
  "analytics.metric.failed": "ارسال‌های ناموفق در ۳۰ روز گذشته. شکست معمولاً یعنی ربات دسترسی ادمین ندارد یا کانال حذف شده.",
  "analytics.metric.scheduled": "همه پیام‌های زمان‌بندی شده (در انتظار، ارسال شده، ناموفق، لغو شده). تعداد در انتظار در راهنما نمایش داده شده.",
  "analytics.metricInfo": "اطلاعات بیشتر",

  // Settings — Two-factor authentication (Task 10-b)
  "settings.2fa.title": "احراز هویت دومرحله‌ای",
  "settings.2fa.subtitle": "افزودن کد TOTP (Google Authenticator، Authy، 1Password) به‌عنوان عامل دوم ورود.",
  "settings.2fa.enable": "فعال‌سازی ۲FA",
  "settings.2fa.disable": "غیرفعال‌سازی ۲FA",
  "settings.2fa.enabled": "فعال",
  "settings.2fa.notEnabled": "غیرفعال",
  "settings.2fa.scanQR": "این کد QR را با برنامه احراز هویت خود اسکن کنید یا کلید را به‌صورت دستی وارد کنید.",
  "settings.2fa.enterCode": "کد ۶ رقمی از برنامه احراز هویت خود را وارد کنید تا تأیید شود.",
  "settings.2fa.verify": "تأیید و فعال‌سازی",
  "settings.2fa.verifying": "در حال تأیید…",
  "settings.2fa.backupCodes": "کدهای پشتیبان",
  "settings.2fa.backupCodesDesc": "این کدهای یک‌بارمصرف را در جای امنی ذخیره کنید. هر کدام می‌تواند به‌جای کد TOTP در صورت گم شدن دستگاه استفاده شود.",
  "settings.2fa.savedCodes": "کدها را ذخیره کرده‌ام",
  "settings.2fa.disableConfirm": "برای غیرفعال‌سازی ۲FA رمز پنل خود را دوباره وارد کنید.",
  "settings.2fa.password": "رمز پنل",
  "settings.2fa.backupRemaining": "کدهای پشتیبان باقی‌مانده",
  "settings.2fa.copySecret": "کپی کلید",
  "settings.2fa.copied": "کلید در کلیپ‌بورد کپی شد",
  "settings.2fa.downloadCodes": "دانلود کدها",
  "settings.2fa.step": "مرحله",
  "settings.2fa.of": "از",
  "settings.2fa.invalidToken": "کد نامعتبر — ساعت دستگاه خود را بررسی کنید و دوباره امتحان کنید.",
  "settings.2fa.setupFailed": "شروع راه‌اندازی ۲FA ناموفق بود",
  "settings.2fa.verifyFailed": "تأیید ناموفق بود",
  "settings.2fa.disabled": "۲FA غیرفعال شد",
  "settings.2fa.enableSuccess": "۲FA فعال شد — ورودهای بعدی نیاز به کد دارند",
  "settings.2fa.qrAlt": "کد QR برای برنامه احراز هویت TOTP",

  // Login — 2FA prompt (Task 10-b)
  "login.2fa.title": "احراز هویت دومرحله‌ای",
  "login.2fa.subtitle": "برای ادامه، کد ۶ رقمی از برنامه احراز هویت خود را وارد کنید.",
  "login.2fa.enterCode": "کد احراز هویت",
  "login.2fa.useBackup": "استفاده از کد پشتیبان",
  "login.2fa.useTOTP": "استفاده از کد احراز هویت",
  "login.2fa.backupCode": "کد پشتیبان",
  "login.2fa.verify": "تأیید و ورود",
  "login.2fa.verifying": "در حال تأیید…",
  "login.2fa.invalid": "کد نامعتبر — دوباره امتحان کنید.",
  "login.2fa.back": "بازگشت به رمز",
  "login.2fa.backupHint": "یکی از کدهای ۸ کاراکتری که هنگام راه‌اندازی ذخیره کرده‌اید را وارد کنید.",

  // Activity log — chip filters (Task 11-c)
  "activity.filterTitle": "فیلترها",
  "activity.entityGroup": "نوع موجودیت",
  "activity.actionGroup": "نوع عمل",
  "activity.entity.all": "همه",
  "activity.entity.scheduled": "زمان‌بندی",
  "activity.entity.channel": "کانال",
  "activity.entity.template": "قالب",
  "activity.entity.admin": "ادمین",
  "activity.entity.settings": "تنظیمات",
  "activity.entity.broadcast": "پخش",
  "activity.action.all": "همه",
  "activity.action.create": "ایجاد",
  "activity.action.update": "بروزرسانی",
  "activity.action.delete": "حذف",
  "activity.action.cancel": "لغو",
  "activity.action.run": "اجرا",
  "activity.action.send": "ارسال",
  "activity.action.login": "ورود",
  "activity.action.pause": "توقف",
  "activity.action.resume": "از سرگیری",
  "activity.clearFilters": "پاک کردن فیلترها",
  "activity.filteredCount": "{{count}} از {{total}} رویداد مطابقت دارد",

  // Analytics — refresh + last updated (Task 11-c)
  "analytics.refresh": "بازخوانی",
  "analytics.refreshing": "در حال بازخوانی…",
  "analytics.lastUpdated": "آخرین بروزرسانی {{when}}",
  "analytics.neverRefreshed": "هنوز بازخوانی نشده",

  // Templates — usage stats (Task 11-c)
  "templates.usedTimes": "{{count}} بار استفاده شده",
  "templates.usedOnce": "۱ بار استفاده شده",
  "templates.neverUsed": "هرگز استفاده نشده",
  "templates.lastUsed": "آخرین استفاده {{when}}",
  "templates.sortUsageDesc": "استفاده (زیاد → کم)",
  "templates.sortUsageAsc": "استفاده (کم → زیاد)",

  // Settings — Test chat card (Task 11-b)
  "settings.testChat.title": "چت آزمایشی",
  "settings.testChat.description": "شناسه پیش‌فرض چت برای ارسال پیام‌های آزمایشی. توسط دکمه‌های «ارسال آزمایشی» استفاده می‌شود.",
  "settings.testChat.placeholder": "-1001234567890",
  "settings.testChat.label": "شناسه چت آزمایشی",
  "settings.testChat.save": "ذخیره",
  "settings.testChat.sendTest": "ارسال پیام آزمایشی",
  "settings.testChat.clear": "پاک کردن",
  "settings.testChat.saved": "شناسه چت آزمایشی ذخیره شد",
  "settings.testChat.cleared": "شناسه چت آزمایشی پاک شد",
  "settings.testChat.saving": "در حال ذخیره…",
  "settings.testChat.sending": "در حال ارسال…",
  "settings.testChat.sendSuccess": "پیام آزمایشی ارسال شد",
  "settings.testChat.sendFailed": "ارسال پیام آزمایشی ناموفق بود",
  "settings.testChat.noChatId": "ابتدا یک شناسه چت وارد کنید",
  "settings.testChat.configured": "پیکربندی شده",
  "settings.testChat.notConfigured": "پیکربندی نشده",
  "settings.testChat.tokenMissing": "توکن ربات پیکربندی نشده — ابتدا آن را در کارت توکن ربات بالا تنظیم کنید",

  // Channels — Send test action (Task 11-b)
  "channels.sendTest.title": "ارسال آزمایشی",
  "channels.sendTest.sending": "در حال ارسال…",
  "channels.sendTest.success": "پیام آزمایشی به کانال ارسال شد",
  "channels.sendTest.failed": "ارسال پیام آزمایشی ناموفق بود",
  "channels.sendTest.tokenMissing": "توکن ربات پیکربندی نشده",
  "channels.sendTest.tooltip": "ارسال یک پیام آزمایشی به این کانال",

  // Scheduled — Duplicate menu (Task 11-b)
  "scheduled.duplicate.label": "تکثیر",
  "scheduled.duplicate.asIs": "تکثیر همان‌طور که هست",
  "scheduled.duplicate.plus1d": "تکثیر +۱ روز",
  "scheduled.duplicate.plus1w": "تکثیر +۱ هفته",
  "scheduled.duplicate.success": "زمان‌بندی تکثیر شد",
  "scheduled.duplicate.failed": "تکثیر زمان‌بندی ناموفق بود",
  "scheduled.duplicate.duplicating": "در حال تکثیر…",
};

const DICTS: Record<Locale, Dict> = { en, fa };

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
};

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (k) => k,
  dir: "ltr",
});

const STORAGE_KEY = "tg-bot-admin:locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
        if (saved === "en" || saved === "fa") {
          setLocaleState(saved);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const dir = locale === "fa" ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string) => {
      const dict = DICTS[locale];
      return dict[key] ?? DICTS.en[key] ?? key;
    },
    [locale],
  );

  const dir = locale === "fa" ? "rtl" : "ltr";

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
