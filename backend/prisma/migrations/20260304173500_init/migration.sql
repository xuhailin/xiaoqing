-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "summarizedAt" TIMESTAMP(3),
    "worldState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "content" TEXT NOT NULL,
    "shortSummary" TEXT,
    "sourceMessageIds" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decayScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "correctedMemoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "valueBoundary" TEXT NOT NULL DEFAULT '',
    "behaviorForbidden" TEXT NOT NULL DEFAULT '',
    "voiceStyle" TEXT NOT NULL DEFAULT '',
    "adaptiveRules" TEXT NOT NULL DEFAULT '',
    "silencePermission" TEXT NOT NULL DEFAULT '',
    "metaFilterPolicy" TEXT NOT NULL DEFAULT '',
    "evolutionAllowed" TEXT NOT NULL DEFAULT '',
    "evolutionForbidden" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaEvolutionLog" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaEvolutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userKey" TEXT NOT NULL,
    "preferredVoiceStyle" TEXT NOT NULL DEFAULT '',
    "praisePreference" TEXT NOT NULL DEFAULT '',
    "responseRhythm" TEXT NOT NULL DEFAULT '',
    "impressionCore" TEXT,
    "impressionDetail" TEXT,
    "pendingImpressionCore" TEXT,
    "pendingImpressionDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userKey")
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingInsight" (
    "id" TEXT NOT NULL,
    "readingId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "adopted" BOOLEAN NOT NULL DEFAULT false,
    "target" TEXT NOT NULL DEFAULT 'memory',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityAnchor" (
    "id" TEXT NOT NULL,
    "userKey" TEXT NOT NULL DEFAULT 'default-user',
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "nickname" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityAnchorHistory" (
    "id" TEXT NOT NULL,
    "anchorId" TEXT NOT NULL,
    "previousContent" TEXT NOT NULL,
    "newContent" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityAnchorHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CognitiveProfile" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastAppliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CognitiveProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipState" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "closenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "rhythmHint" TEXT,
    "boundaryNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoundaryEvent" (
    "id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoundaryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Memory_category_idx" ON "Memory"("category");

-- CreateIndex
CREATE INDEX "Memory_decayScore_idx" ON "Memory"("decayScore");

-- CreateIndex
CREATE INDEX "PersonaEvolutionLog_personaId_idx" ON "PersonaEvolutionLog"("personaId");

-- CreateIndex
CREATE INDEX "ReadingInsight_readingId_idx" ON "ReadingInsight"("readingId");

-- CreateIndex
CREATE INDEX "CognitiveProfile_kind_isActive_idx" ON "CognitiveProfile"("kind", "isActive");

-- CreateIndex
CREATE INDEX "CognitiveProfile_updatedAt_idx" ON "CognitiveProfile"("updatedAt");

-- CreateIndex
CREATE INDEX "CognitiveProfile_status_idx" ON "CognitiveProfile"("status");

-- CreateIndex
CREATE INDEX "RelationshipState_isActive_updatedAt_idx" ON "RelationshipState"("isActive", "updatedAt");

-- CreateIndex
CREATE INDEX "RelationshipState_status_idx" ON "RelationshipState"("status");

-- CreateIndex
CREATE INDEX "BoundaryEvent_createdAt_idx" ON "BoundaryEvent"("createdAt");

-- CreateIndex
CREATE INDEX "BoundaryEvent_severity_idx" ON "BoundaryEvent"("severity");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaEvolutionLog" ADD CONSTRAINT "PersonaEvolutionLog_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingInsight" ADD CONSTRAINT "ReadingInsight_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "Reading"("id") ON DELETE CASCADE ON UPDATE CASCADE;
