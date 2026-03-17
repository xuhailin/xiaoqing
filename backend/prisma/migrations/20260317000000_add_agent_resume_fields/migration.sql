-- AlterTable: DevRun 增加 agent session resume 相关字段
ALTER TABLE "DevRun" ADD COLUMN "agentSessionId" TEXT;
ALTER TABLE "DevRun" ADD COLUMN "resumedFromRunId" TEXT;

-- AddForeignKey: resume 链自引用
ALTER TABLE "DevRun" ADD CONSTRAINT "DevRun_resumedFromRunId_fkey" FOREIGN KEY ("resumedFromRunId") REFERENCES "DevRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
