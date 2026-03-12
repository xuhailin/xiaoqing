import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClaimEngineConfig {
  constructor(private readonly config: ConfigService) {}

  // Phase 1 defaults: write is opt-in, read is off by default.
  get writeDualEnabled(): boolean {
    return this.config.get('FEATURE_CLAIM_WRITE_DUAL') === 'true';
  }

  get readNewEnabled(): boolean {
    return this.config.get('FEATURE_CLAIM_READ_NEW') === 'true';
  }

  get injectionEnabled(): boolean {
    return this.config.get('FEATURE_CLAIM_INJECTION') === 'true';
  }

  get sessionStateInjectionEnabled(): boolean {
    return this.config.get('FEATURE_SESSIONSTATE_INJECTION') === 'true';
  }

  get writeInteractionEnabled(): boolean {
    return this.config.get('FEATURE_CLAIM_WRITE_INTERACTION') === 'true';
  }

  get writeEmotionEnabled(): boolean {
    return this.config.get('FEATURE_CLAIM_WRITE_EMOTION') === 'true';
  }

  get draftEnabled(): boolean {
    return this.config.get('FEATURE_CLAIM_DRAFT_ENABLED') === 'true';
  }

  get injectionTokenBudget(): number {
    const raw = Number(this.config.get('CLAIM_INJECTION_TOKEN_BUDGET') ?? 220);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 220;
  }

  get canonicalMappingThreshold(): number {
    const raw = Number(this.config.get('CLAIM_CANONICAL_MAPPING_THRESHOLD') ?? 0.72);
    if (!Number.isFinite(raw)) return 0.72;
    return Math.max(0, Math.min(1, raw));
  }
}
