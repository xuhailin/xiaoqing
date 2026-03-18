ALTER TABLE "Conversation"
ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Conversation_isInternal_updatedAt_idx"
ON "Conversation"("isInternal", "updatedAt");

CREATE TABLE "AgentConversationLink" (
  "id" TEXT NOT NULL,
  "requesterAgentId" "EntryAgentId" NOT NULL,
  "requesterConversationRef" TEXT NOT NULL,
  "localConversationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentConversationLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentConversationLink_requesterAgentId_requesterConversationRef_key"
ON "AgentConversationLink"("requesterAgentId", "requesterConversationRef");

CREATE INDEX "AgentConversationLink_localConversationId_idx"
ON "AgentConversationLink"("localConversationId");

ALTER TABLE "AgentConversationLink"
ADD CONSTRAINT "AgentConversationLink_localConversationId_fkey"
FOREIGN KEY ("localConversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
