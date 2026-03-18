CREATE TYPE "EntryAgentId" AS ENUM ('xiaoqing', 'xiaoqin');

ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'agent_receipt';
ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'agent_result';

ALTER TABLE "Conversation"
  ADD COLUMN "entryAgentId" "EntryAgentId" NOT NULL DEFAULT 'xiaoqing';

CREATE INDEX "Conversation_entryAgentId_updatedAt_idx"
  ON "Conversation"("entryAgentId", "updatedAt");

CREATE TYPE "AgentDelegationStatus" AS ENUM (
  'queued',
  'acknowledged',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE "AgentDelegation" (
  "id" TEXT NOT NULL,
  "originConversationId" TEXT NOT NULL,
  "originMessageId" TEXT,
  "requesterAgentId" "EntryAgentId" NOT NULL,
  "executorAgentId" "EntryAgentId" NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'assist_request',
  "status" "AgentDelegationStatus" NOT NULL DEFAULT 'queued',
  "title" TEXT,
  "summary" TEXT,
  "payloadJson" JSONB NOT NULL,
  "resultJson" JSONB,
  "failureReason" TEXT,
  "receiptMessageId" TEXT,
  "resultMessageId" TEXT,
  "ackedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentDelegation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentDelegationEvent" (
  "id" TEXT NOT NULL,
  "delegationId" TEXT NOT NULL,
  "actorAgentId" "EntryAgentId" NOT NULL,
  "eventType" TEXT NOT NULL,
  "message" TEXT,
  "payloadJson" JSONB,
  "relatedMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentDelegationEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentDelegation"
  ADD CONSTRAINT "AgentDelegation_originConversationId_fkey"
  FOREIGN KEY ("originConversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentDelegationEvent"
  ADD CONSTRAINT "AgentDelegationEvent_delegationId_fkey"
  FOREIGN KEY ("delegationId") REFERENCES "AgentDelegation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AgentDelegation_originConversationId_createdAt_idx"
  ON "AgentDelegation"("originConversationId", "createdAt");

CREATE INDEX "AgentDelegation_status_updatedAt_idx"
  ON "AgentDelegation"("status", "updatedAt");

CREATE INDEX "AgentDelegation_requesterAgentId_executorAgentId_createdAt_idx"
  ON "AgentDelegation"("requesterAgentId", "executorAgentId", "createdAt");

CREATE INDEX "AgentDelegationEvent_delegationId_createdAt_idx"
  ON "AgentDelegationEvent"("delegationId", "createdAt");

CREATE INDEX "AgentDelegationEvent_actorAgentId_createdAt_idx"
  ON "AgentDelegationEvent"("actorAgentId", "createdAt");
