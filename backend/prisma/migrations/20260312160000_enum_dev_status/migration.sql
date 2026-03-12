-- CreateEnum
CREATE TYPE "DevSessionStatus" AS ENUM ('active', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DevRunStatus" AS ENUM ('queued', 'pending', 'running', 'success', 'failed', 'cancelled');

-- Migrate existing data: normalize 'canceled' → 'cancelled' in DevRun
UPDATE "DevRun" SET "status" = 'cancelled' WHERE "status" = 'canceled';

-- AlterTable: DevSession.status String → DevSessionStatus enum
ALTER TABLE "DevSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DevSession" ALTER COLUMN "status" TYPE "DevSessionStatus" USING "status"::"DevSessionStatus";
ALTER TABLE "DevSession" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable: DevRun.status String → DevRunStatus enum
ALTER TABLE "DevRun" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DevRun" ALTER COLUMN "status" TYPE "DevRunStatus" USING "status"::"DevRunStatus";
ALTER TABLE "DevRun" ALTER COLUMN "status" SET DEFAULT 'pending';
