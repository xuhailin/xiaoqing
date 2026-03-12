-- DropIndex
DROP INDEX IF EXISTS "UserClaim_contextTags_gin_idx";

-- AlterTable
ALTER TABLE "SessionState" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserClaim" ALTER COLUMN "updatedAt" DROP DEFAULT;
