import type { ConfigService } from '@nestjs/config';

interface FeatureFlagDefinition {
  key: string;
  defaultEnabled: boolean;
}

/**
 * Central feature flag catalog.
 * Keep rollout / expensive / environment-bound gates here so default semantics
 * stay consistent across runtime, docs, and debug surfaces.
 */
export const FEATURE_FLAGS = {
  autoAnchor: { key: 'FEATURE_AUTO_ANCHOR', defaultEnabled: true },
  autoImpression: { key: 'FEATURE_AUTO_IMPRESSION', defaultEnabled: true },
  autoSummarize: { key: 'FEATURE_AUTO_SUMMARIZE', defaultEnabled: true },
  claimDraftEnabled: { key: 'FEATURE_CLAIM_DRAFT_ENABLED', defaultEnabled: false },
  claimInjection: { key: 'FEATURE_CLAIM_INJECTION', defaultEnabled: false },
  claimReadNew: { key: 'FEATURE_CLAIM_READ_NEW', defaultEnabled: false },
  claimWriteDual: { key: 'FEATURE_CLAIM_WRITE_DUAL', defaultEnabled: false },
  claimWriteEmotion: { key: 'FEATURE_CLAIM_WRITE_EMOTION', defaultEnabled: false },
  claimWriteInteraction: { key: 'FEATURE_CLAIM_WRITE_INTERACTION', defaultEnabled: false },
  claudeCode: { key: 'FEATURE_CLAUDE_CODE', defaultEnabled: false },
  debugMeta: { key: 'FEATURE_DEBUG_META', defaultEnabled: false },
  dynamicTopK: { key: 'FEATURE_DYNAMIC_TOPK', defaultEnabled: true },
  evolutionScheduler: { key: 'FEATURE_EVOLUTION_SCHEDULER', defaultEnabled: true },
  impressionCore: { key: 'FEATURE_IMPRESSION_CORE', defaultEnabled: true },
  impressionDetail: { key: 'FEATURE_IMPRESSION_DETAIL', defaultEnabled: false },
  impressionRequireConfirm: { key: 'FEATURE_IMPRESSION_REQUIRE_CONFIRM', defaultEnabled: false },
  instantSummarize: { key: 'FEATURE_INSTANT_SUMMARIZE', defaultEnabled: true },
  keywordPrefilter: { key: 'FEATURE_KEYWORD_PREFILTER', defaultEnabled: true },
  llmRank: { key: 'FEATURE_LLM_RANK', defaultEnabled: false },
  localGeneralAction: { key: 'FEATURE_LOCAL_GENERAL_ACTION', defaultEnabled: false },
  memoryScheduler: { key: 'FEATURE_MEMORY_SCHEDULER', defaultEnabled: true },
  memoryShortSummary: { key: 'FEATURE_MEMORY_SHORT_SUMMARY', defaultEnabled: false },
  openclaw: { key: 'FEATURE_OPENCLAW', defaultEnabled: false },
  planScheduler: { key: 'FEATURE_PLAN_SCHEDULER', defaultEnabled: true },
  sessionStateInjection: { key: 'FEATURE_SESSIONSTATE_INJECTION', defaultEnabled: false },
  timesheet: { key: 'FEATURE_TIMESHEET', defaultEnabled: false },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(
  config: Pick<ConfigService, 'get'>,
  name: FeatureFlagName,
): boolean {
  const definition = FEATURE_FLAGS[name];
  const raw = config.get<string | undefined>(definition.key);
  if (raw == null || raw === '') {
    return definition.defaultEnabled;
  }
  return raw === 'true';
}

export function getFeatureFlagKey(name: FeatureFlagName): string {
  return FEATURE_FLAGS[name].key;
}
