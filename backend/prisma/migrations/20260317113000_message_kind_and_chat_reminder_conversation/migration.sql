CREATE TYPE "MessageKind" AS ENUM (
  'user',
  'chat',
  'tool',
  'reminder_created',
  'reminder_list',
  'reminder_cancelled',
  'reminder_triggered',
  'system',
  'daily_moment'
);

ALTER TABLE "Message"
  ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'chat',
  ADD COLUMN "metadata" JSONB;

UPDATE "Message"
SET "kind" = 'user'
WHERE "role" = 'user';

ALTER TABLE "DevReminder"
  ADD COLUMN "conversationId" TEXT;

UPDATE "DevReminder" AS reminder
SET "conversationId" = session."conversationId"
FROM "DevSession" AS session
WHERE reminder."sessionId" = session."id"
  AND reminder."conversationId" IS NULL;

ALTER TABLE "DevReminder"
  ADD CONSTRAINT "DevReminder_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Message_conversationId_kind_createdAt_idx"
  ON "Message"("conversationId", "kind", "createdAt");

CREATE INDEX "DevReminder_conversationId_createdAt_idx"
  ON "DevReminder"("conversationId", "createdAt");
