-- CreateEnum
CREATE TYPE "MemoryProposalStatus" AS ENUM ('pending', 'approved', 'rejected', 'merged');

-- CreateTable
CREATE TABLE "MemoryProposal" (
    "id" TEXT NOT NULL,
    "delegationId" TEXT,
    "proposerAgentId" "EntryAgentId" NOT NULL,
    "ownerAgentId" "EntryAgentId" NOT NULL DEFAULT 'xiaoqing',
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "scope" TEXT NOT NULL DEFAULT 'long_term',
    "status" "MemoryProposalStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "resultMemoryId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryProposal_status_createdAt_idx" ON "MemoryProposal"("status", "createdAt");
CREATE INDEX "MemoryProposal_delegationId_idx" ON "MemoryProposal"("delegationId");
CREATE INDEX "MemoryProposal_proposerAgentId_createdAt_idx" ON "MemoryProposal"("proposerAgentId", "createdAt");
