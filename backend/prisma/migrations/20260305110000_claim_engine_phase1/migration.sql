-- Claim Engine Phase 1: unified long-term claims + short-lived session state

-- Enums
CREATE TYPE "ClaimType" AS ENUM (
  'JUDGEMENT_PATTERN',
  'VALUE',
  'INTERACTION_PREFERENCE',
  'EMOTIONAL_TENDENCY',
  'RELATION_RHYTHM'
);

CREATE TYPE "ClaimStatus" AS ENUM (
  'CANDIDATE',
  'WEAK',
  'STABLE',
  'CORE',
  'DEPRECATED'
);

CREATE TYPE "EvidencePolarity" AS ENUM (
  'SUPPORT',
  'CONTRA',
  'NEUTRAL'
);

-- UserClaim: long-term evidence-backed claims
CREATE TABLE "UserClaim" (
  "id" TEXT NOT NULL,
  "userKey" TEXT NOT NULL DEFAULT 'default-user',
  "type" "ClaimType" NOT NULL,
  "key" TEXT NOT NULL,
  "valueJson" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "counterEvidenceCount" INTEGER NOT NULL DEFAULT 0,
  "status" "ClaimStatus" NOT NULL DEFAULT 'CANDIDATE',
  "decayRate" DOUBLE PRECISION,
  "contextTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lastSourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPromotedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserClaim_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "UserClaim_evidence_non_negative" CHECK ("evidenceCount" >= 0),
  CONSTRAINT "UserClaim_counter_evidence_non_negative" CHECK ("counterEvidenceCount" >= 0)
);

-- ClaimEvidence: auditable support/counter-evidence events
CREATE TABLE "ClaimEvidence" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "userKey" TEXT NOT NULL DEFAULT 'default-user',
  "messageId" TEXT,
  "sessionId" TEXT,
  "snippet" TEXT NOT NULL,
  "polarity" "EvidencePolarity" NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "sourceModel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClaimEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClaimEvidence_weight_range" CHECK ("weight" >= 0 AND "weight" <= 1),
  CONSTRAINT "ClaimEvidence_snippet_max_len" CHECK (char_length("snippet") <= 120),
  CONSTRAINT "ClaimEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "UserClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClaimEvidence_claimId_messageId_polarity_key"
  ON "ClaimEvidence"("claimId", "messageId", "polarity");

-- SessionState: short-term state with TTL
CREATE TABLE "SessionState" (
  "id" TEXT NOT NULL,
  "userKey" TEXT NOT NULL DEFAULT 'default-user',
  "sessionId" TEXT NOT NULL,
  "stateJson" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "ttlSeconds" INTEGER NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sourceModel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionState_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "SessionState_ttl_positive" CHECK ("ttlSeconds" > 0)
);

-- Indexes
CREATE INDEX "UserClaim_userKey_type_status_idx"
  ON "UserClaim"("userKey", "type", "status");

CREATE INDEX "UserClaim_userKey_type_key_idx"
  ON "UserClaim"("userKey", "type", "key");

CREATE INDEX "UserClaim_updatedAt_idx"
  ON "UserClaim"("updatedAt");

CREATE INDEX "ClaimEvidence_userKey_createdAt_idx"
  ON "ClaimEvidence"("userKey", "createdAt");

CREATE INDEX "ClaimEvidence_claimId_createdAt_idx"
  ON "ClaimEvidence"("claimId", "createdAt");

CREATE INDEX "SessionState_userKey_sessionId_expiresAt_idx"
  ON "SessionState"("userKey", "sessionId", "expiresAt");

CREATE INDEX "SessionState_userKey_expiresAt_idx"
  ON "SessionState"("userKey", "expiresAt");

CREATE INDEX "SessionState_updatedAt_idx"
  ON "SessionState"("updatedAt");

-- Optional index for tag filtering
CREATE INDEX "UserClaim_contextTags_gin_idx"
  ON "UserClaim" USING GIN ("contextTags");
