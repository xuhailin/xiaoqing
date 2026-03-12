-- CreateEnum
CREATE TYPE "ReminderScope" AS ENUM ('dev', 'system', 'chat');

-- AlterTable: DevReminder.sessionId 改为可选
ALTER TABLE "DevReminder" ALTER COLUMN "sessionId" DROP NOT NULL;

-- AlterTable: 新增 scope 字段
ALTER TABLE "DevReminder" ADD COLUMN "scope" "ReminderScope" NOT NULL DEFAULT 'dev';

-- CreateIndex
CREATE INDEX "DevReminder_scope_idx" ON "DevReminder"("scope");
