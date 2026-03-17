import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../config/feature-flags';

@Injectable()
export class FeatureFlagConfig {
  readonly lastNRounds: number;
  readonly memoryMidK: number;
  readonly maxContextTokens: number;
  readonly maxSystemTokens: number;
  readonly memoryCandidatesMaxLong: number;
  readonly memoryCandidatesMaxMid: number;
  readonly minCandidatesForLlmRank: number;
  readonly memoryContentMaxChars: number;
  readonly memoryMinRelevanceScore: number;

  readonly featureImpressionCore: boolean;
  readonly featureImpressionDetail: boolean;
  readonly featureKeywordPrefilter: boolean;
  readonly featureLlmRank: boolean;
  readonly featureDynamicTopK: boolean;
  readonly featureShortSummary: boolean;
  readonly featureDebugMeta: boolean;
  readonly featureOpenClaw: boolean;
  readonly featureAutoSummarize: boolean;
  readonly autoSummarizeThreshold: number;
  readonly openclawConfidenceThreshold: number;
  readonly featureInstantSummarize: boolean;

  constructor(config: ConfigService) {
    this.lastNRounds = Number(config.get('CONVERSATION_LAST_N_ROUNDS')) || 8;
    this.memoryMidK = Number(config.get('MEMORY_INJECT_MID_K')) || 5;
    this.maxContextTokens = Number(config.get('MAX_CONTEXT_TOKENS')) || 3000;
    this.maxSystemTokens = Number(config.get('MAX_SYSTEM_TOKENS')) || 1200;
    this.memoryCandidatesMaxLong = Number(config.get('MEMORY_CANDIDATES_MAX_LONG')) || 15;
    this.memoryCandidatesMaxMid = Number(config.get('MEMORY_CANDIDATES_MAX_MID')) || 20;
    this.minCandidatesForLlmRank = Number(config.get('MIN_CANDIDATES_FOR_LLM_RANK')) || 5;
    this.memoryContentMaxChars = Number(config.get('MEMORY_CONTENT_MAX_CHARS')) || 300;
    this.memoryMinRelevanceScore = Number(config.get('MEMORY_MIN_RELEVANCE_SCORE')) || 0.05;

    this.featureImpressionCore = isFeatureEnabled(config, 'impressionCore');
    this.featureImpressionDetail = isFeatureEnabled(config, 'impressionDetail');
    this.featureKeywordPrefilter = isFeatureEnabled(config, 'keywordPrefilter');
    this.featureLlmRank = isFeatureEnabled(config, 'llmRank');
    this.featureDynamicTopK = isFeatureEnabled(config, 'dynamicTopK');
    this.featureShortSummary = isFeatureEnabled(config, 'memoryShortSummary');
    this.featureDebugMeta = isFeatureEnabled(config, 'debugMeta');
    this.featureOpenClaw = isFeatureEnabled(config, 'openclaw');
    this.featureAutoSummarize = isFeatureEnabled(config, 'autoSummarize');
    this.autoSummarizeThreshold = Number(config.get('AUTO_SUMMARIZE_THRESHOLD')) || 15;
    this.openclawConfidenceThreshold = Number(config.get('OPENCLAW_CONFIDENCE_THRESHOLD')) || 0.7;
    this.featureInstantSummarize = isFeatureEnabled(config, 'instantSummarize');
  }
}
