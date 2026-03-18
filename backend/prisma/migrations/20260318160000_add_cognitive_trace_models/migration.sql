-- CreateTable
CREATE TABLE "CognitiveObservation" (
    "id" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "significance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "insightId" TEXT,
    "relatedTracePointIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "CognitiveObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CognitiveInsight" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "dimension" TEXT,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "patterns" JSONB,
    "metrics" JSONB,
    "observationCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CognitiveInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CognitiveEvolution" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evolutionType" TEXT NOT NULL,
    "triggerInsightId" TEXT,
    "changeDiff" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CognitiveEvolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CognitiveObservation_dimension_happenedAt_idx" ON "CognitiveObservation"("dimension", "happenedAt");

-- CreateIndex
CREATE INDEX "CognitiveObservation_kind_happenedAt_idx" ON "CognitiveObservation"("kind", "happenedAt");

-- CreateIndex
CREATE INDEX "CognitiveObservation_conversationId_idx" ON "CognitiveObservation"("conversationId");

-- CreateIndex
CREATE INDEX "CognitiveObservation_insightId_idx" ON "CognitiveObservation"("insightId");

-- CreateIndex
CREATE UNIQUE INDEX "CognitiveInsight_scope_periodKey_dimension_key" ON "CognitiveInsight"("scope", "periodKey", "dimension");

-- CreateIndex
CREATE INDEX "CognitiveInsight_scope_periodKey_idx" ON "CognitiveInsight"("scope", "periodKey");

-- CreateIndex
CREATE INDEX "CognitiveEvolution_evolutionType_createdAt_idx" ON "CognitiveEvolution"("evolutionType", "createdAt");

-- CreateIndex
CREATE INDEX "CognitiveEvolution_status_idx" ON "CognitiveEvolution"("status");

-- AddForeignKey
ALTER TABLE "CognitiveObservation" ADD CONSTRAINT "CognitiveObservation_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "CognitiveInsight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
