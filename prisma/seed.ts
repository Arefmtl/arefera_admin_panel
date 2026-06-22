import { db } from "../src/lib/db";

async function main() {
  // Wipe (order matters for FKs)
  await db.scheduledMessageLog.deleteMany();
  await db.scheduledMessage.deleteMany();
  await db.post.deleteMany();
  await db.template.deleteMany();
  await db.channel.deleteMany();
  await db.admin.deleteMany();
  await db.setting.deleteMany();
  await db.auditLog.deleteMany();

  // Admins
  const owner = await db.admin.create({
    data: { telegramId: "1278759197", name: "Owner", isOwner: true },
  });
  await db.admin.create({ data: { telegramId: "555000111", name: "Sara" } });
  await db.admin.create({ data: { telegramId: "777888999", name: "Reza" } });
  console.log("Seeded admins, owner:", owner.id);

  // Channels
  const ch1 = await db.channel.create({
    data: { telegramId: "-1001234567890", title: "Announcements", username: "my_announcements", type: "channel" },
  });
  const ch2 = await db.channel.create({
    data: { telegramId: "-1009876543210", title: "News & Updates", username: "news_updates", type: "channel" },
  });
  const ch3 = await db.channel.create({
    data: { telegramId: "-1005554443330", title: "Community Chat", username: null, type: "group" },
  });
  console.log("Seeded channels");

  // Posts (broadcast history)
  await db.post.create({
    data: { text: "*Welcome* to our channel!\n\nStay tuned for updates.", format: "markdown" },
  });
  await db.post.create({
    data: { text: "<b>Important:</b> Maintenance window tonight 22:00–23:00.", format: "html" },
  });
  console.log("Seeded posts");

  const now = new Date();
  const inHours = (h: number) => new Date(now.getTime() + h * 3600 * 1000);
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400 * 1000);

  // Scheduled messages — a healthy mix
  await db.scheduledMessage.create({
    data: {
      title: "Daily morning greeting",
      text: "🌅 *Good morning, everyone!*\n\nHave a wonderful day ahead.",
      format: "markdown",
      channelIds: JSON.stringify([ch1.id, ch2.id]),
      scheduledAt: inHours(2),
      repeat: "daily",
      status: "pending",
      nextRunAt: inHours(2),
    },
  });

  await db.scheduledMessage.create({
    data: {
      title: "Weekly newsletter",
      text: "📰 *This week in review*\n\nHere are the top stories from the past week.",
      format: "markdown",
      channelIds: JSON.stringify([ch1.id]),
      scheduledAt: daysAgo(-3),
      repeat: "weekly",
      status: "pending",
      nextRunAt: daysAgo(-3),
    },
  });

  await db.scheduledMessage.create({
    data: {
      title: "Product launch announcement",
      text: "<b>🚀 We just launched!</b>\n\nOur new feature is live. <a href=\"https://example.com\">Learn more</a>",
      format: "html",
      channelIds: JSON.stringify([ch1.id, ch2.id, ch3.id]),
      scheduledAt: inHours(26),
      repeat: "none",
      status: "pending",
    },
  });

  const sentMsg = await db.scheduledMessage.create({
    data: {
      title: "Yesterday's update (sent)",
      text: "*Update complete.* All systems nominal.",
      format: "markdown",
      channelIds: JSON.stringify([ch1.id, ch2.id]),
      scheduledAt: daysAgo(1),
      repeat: "none",
      status: "sent",
      lastRunAt: daysAgo(1),
    },
  });

  const failedMsg = await db.scheduledMessage.create({
    data: {
      title: "Broken broadcast (failed)",
      text: "This one failed because the bot was not admin.",
      format: "markdown",
      channelIds: JSON.stringify([ch3.id]),
      scheduledAt: daysAgo(2),
      repeat: "none",
      status: "failed",
      lastRunAt: daysAgo(2),
      error: "Some channels failed (see logs)",
    },
  });
  console.log("Seeded scheduled messages");

  // Delivery logs spread over the last 14 days for the trend chart
  const logTargets = [
    { msg: sentMsg.id, ch: ch1.id, title: ch1.title },
    { msg: sentMsg.id, ch: ch2.id, title: ch2.title },
    { msg: failedMsg.id, ch: ch3.id, title: ch3.title },
  ];
  for (let d = 0; d < 14; d++) {
    const day = daysAgo(d);
    const sentCount = 1 + ((d * 3) % 5); // pseudo-random-ish
    for (let k = 0; k < sentCount; k++) {
      const t = logTargets[k % 2];
      await db.scheduledMessageLog.create({
        data: {
          messageId: t.msg,
          channelId: t.ch,
          channelTitle: t.title,
          success: true,
          ranAt: day,
        },
      });
    }
    if (d % 3 === 0) {
      const t = logTargets[2];
      await db.scheduledMessageLog.create({
        data: {
          messageId: t.msg,
          channelId: t.ch,
          channelTitle: t.title,
          success: false,
          error: "Forbidden: bot is not an administrator of the channel",
          ranAt: day,
        },
      });
    }
  }
  console.log("Seeded delivery logs");

  // Templates
  await db.template.create({
    data: {
      name: "Welcome message",
      text: "👋 *Welcome to our channel!*\n\nWe're glad to have you here. Stay tuned for updates and announcements.",
      format: "markdown",
      category: "onboarding",
    },
  });
  await db.template.create({
    data: {
      name: "Maintenance notice",
      text: "🔧 *Scheduled Maintenance*\n\nWe'll be performing maintenance tonight from 22:00 to 23:00. The service may be temporarily unavailable.",
      format: "markdown",
      category: "announcements",
    },
  });
  await db.template.create({
    data: {
      name: "Weekly roundup",
      text: "📋 *This Week's Roundup*\n\nHere's a summary of everything that happened this week:\n\n• New features released\n• Community milestones\n• Upcoming events",
      format: "markdown",
      category: "newsletters",
    },
  });
  await db.template.create({
    data: {
      name: "Product launch",
      text: "<b>🚀 New Launch!</b>\n\nOur new feature is now live. <a href=\"https://example.com\">Learn more here</a>",
      format: "html",
      category: "announcements",
    },
  });
  await db.template.create({
    data: {
      name: "Holiday greeting",
      text: "🎉 *Happy Holidays!*\n\nWishing you and your loved ones a wonderful holiday season. 🎁✨",
      format: "markdown",
      category: "greetings",
    },
  });
  console.log("Seeded templates");

  // Seed audit log entries — span the last ~10 days so the Activity log looks alive.
  const auditNow = Date.now();
  const auditEntries: Array<{
    action: string;
    entity: string;
    title: string | null;
    detail: string | null;
    ago: number; // ms ago
    meta?: Record<string, unknown> | null;
  }> = [
    { action: "create", entity: "scheduled", title: "Product launch announcement", detail: "Scheduled for 22 Jun 2026, 17:12 · repeat=none · 3 channel(s)", ago: 8 * 60 * 1000, meta: { repeat: "none", channelCount: 3 } },
    { action: "create", entity: "scheduled", title: "Weekly digest", detail: "Scheduled for 23 Jun 2026, 09:00 · repeat=weekly · 2 channel(s)", ago: 26 * 60 * 1000, meta: { repeat: "weekly", channelCount: 2 } },
    { action: "run", entity: "scheduled", title: null, detail: "Scheduler fired 1 message(s): 1 sent, 0 failed", ago: 47 * 60 * 1000, meta: { processed: 1, sent: 1, failed: 0 } },
    { action: "update", entity: "scheduled", title: "Daily morning quote", detail: "Updated fields: scheduledAt, repeat", ago: 2 * 60 * 60 * 1000, meta: { fields: ["scheduledAt", "repeat"] } },
    { action: "send", entity: "broadcast", title: "Breaking: service post-mortem", detail: "Broadcast to 3 channel(s): 3 ok, 0 failed", ago: 5 * 60 * 60 * 1000, meta: { channelCount: 3, ok: 3, failed: 0, format: "markdown" } },
    { action: "create", entity: "channel", title: "Community Chat", detail: 'Added channel "Community Chat" (group)', ago: 7 * 60 * 60 * 1000, meta: { type: "group" } },
    { action: "create", entity: "template", title: "Maintenance window", detail: "Created template \"Maintenance window\" (category: operations)", ago: 9 * 60 * 60 * 1000, meta: { category: "operations", format: "markdown" } },
    { action: "clone", entity: "scheduled", title: "Weekly digest (copy)", detail: 'Cloned from "Weekly digest"', ago: 11 * 60 * 60 * 1000, meta: { repeat: "weekly" } },
    { action: "cancel", entity: "scheduled", title: "Old promo blast", detail: 'Cancelled scheduled message "Old promo blast"', ago: 26 * 60 * 60 * 1000 },
    { action: "delete", entity: "scheduled", title: "Test message", detail: 'Deleted scheduled message "Test message"', ago: 30 * 60 * 60 * 1000 },
    { action: "settings", entity: "settings", title: "Bot token updated", detail: "Bot token set (1234567:•••••••WXYZ)", ago: 2 * 24 * 60 * 60 * 1000 },
    { action: "update", entity: "channel", title: "Announcements", detail: 'Channel "Announcements" activated', ago: 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000, meta: { active: true } },
    { action: "create", entity: "admin", title: "Sara", detail: "Added admin Sara", ago: 3 * 24 * 60 * 60 * 1000, meta: { telegramId: "555000111" } },
    { action: "create", entity: "scheduled", title: "Daily morning quote", detail: "Scheduled for 18 Jun 2026, 08:00 · repeat=daily · 1 channel(s)", ago: 4 * 24 * 60 * 60 * 1000, meta: { repeat: "daily", channelCount: 1 } },
    { action: "send", entity: "broadcast", title: "Morning standup reminder", detail: "Broadcast to 2 channel(s): 2 ok, 0 failed", ago: 4 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000, meta: { channelCount: 2, ok: 2, failed: 0 } },
    { action: "delete", entity: "template", title: "Old draft", detail: 'Deleted template "Old draft"', ago: 5 * 24 * 60 * 60 * 1000 },
    { action: "create", entity: "channel", title: "Announcements", detail: 'Added channel "Announcements" (channel)', ago: 6 * 24 * 60 * 60 * 1000, meta: { type: "channel" } },
    { action: "run", entity: "scheduled", title: null, detail: "Scheduler fired 3 message(s): 2 sent, 1 failed", ago: 7 * 24 * 60 * 60 * 1000, meta: { processed: 3, sent: 2, failed: 1 } },
    { action: "update", entity: "scheduled", title: "Weekly digest", detail: "Updated fields: title, channelIds", ago: 8 * 24 * 60 * 60 * 1000, meta: { fields: ["title", "channelIds"] } },
    { action: "create", entity: "admin", title: "Reza", detail: "Added admin Reza", ago: 9 * 24 * 60 * 60 * 1000, meta: { telegramId: "777888999" } },
    { action: "create", entity: "channel", title: "News & Updates", detail: 'Added channel "News & Updates" (channel)', ago: 10 * 24 * 60 * 60 * 1000, meta: { type: "channel" } },
  ];
  for (const entry of auditEntries) {
    await db.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        title: entry.title,
        detail: entry.detail,
        actor: "admin",
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
        createdAt: new Date(auditNow - entry.ago),
      },
    });
  }
  console.log(`Seeded ${auditEntries.length} audit log entries`);

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
