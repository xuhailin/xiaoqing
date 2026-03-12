-- DevAgent reminder infrastructure: one-shot + cron reminders

CREATE TABLE "DevReminder" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "title" TEXT,
  "message" TEXT NOT NULL,
  "cronExpr" TEXT,
  "runAt" TIMESTAMP(3),
  "timezone" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "nextRunAt" TIMESTAMP(3),
  "lastTriggeredAt" TIMESTAMP(3),
  "lastRunId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DevReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DevReminder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DevSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DevReminder_sessionId_createdAt_idx" ON "DevReminder"("sessionId", "createdAt");
CREATE INDEX "DevReminder_enabled_nextRunAt_idx" ON "DevReminder"("enabled", "nextRunAt");
