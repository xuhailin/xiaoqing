-- Daily Moment module: diary entries, suggestion prompts, and feedback signals

CREATE TABLE "DailyMoment" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "triggerMode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "closingNote" TEXT NOT NULL,
  "moodTag" TEXT,
  "sourceSnippetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyMoment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyMoment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DailyMomentSuggestion" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "hint" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "moodTag" TEXT,
  "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "accepted" BOOLEAN NOT NULL DEFAULT false,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyMomentSuggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyMomentSuggestion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DailyMomentSignal" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "sourceText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyMomentSignal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyMomentSignal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DailyMoment_conversationId_createdAt_idx" ON "DailyMoment"("conversationId", "createdAt");
CREATE INDEX "DailyMoment_feedback_idx" ON "DailyMoment"("feedback");

CREATE INDEX "DailyMomentSuggestion_conversationId_createdAt_idx" ON "DailyMomentSuggestion"("conversationId", "createdAt");
CREATE INDEX "DailyMomentSuggestion_accepted_idx" ON "DailyMomentSuggestion"("accepted");

CREATE INDEX "DailyMomentSignal_conversationId_createdAt_idx" ON "DailyMomentSignal"("conversationId", "createdAt");
CREATE INDEX "DailyMomentSignal_type_idx" ON "DailyMomentSignal"("type");
