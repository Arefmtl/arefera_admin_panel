-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramId" TEXT NOT NULL,
    "name" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "type" TEXT NOT NULL DEFAULT 'channel',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "buttons" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "buttons" TEXT,
    "channelIds" TEXT NOT NULL DEFAULT '[]',
    "scheduledAt" DATETIME NOT NULL,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScheduledMessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledMessageLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ScheduledMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledMessageLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "buttons" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "title" TEXT,
    "detail" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'admin',
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_telegramId_key" ON "Admin"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_telegramId_key" ON "Channel"("telegramId");

-- CreateIndex
CREATE INDEX "SavedView_updatedAt_idx" ON "SavedView"("updatedAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Session_active_idx" ON "Session"("active");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

