import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../../config/feature-flags';

@Injectable()
export class ClaimEngineConfig {
  constructor(private readonly config: ConfigService) {}

  // Phase 1 defaults: write is opt-in, read is off by default.
  get writeDualEnabled(): boolean {
    return isFeatureEnabled(this.config, 'claimWriteDual');
  }

  get readNewEnabled(): boolean {
    return isFeatureEnabled(this.config, 'claimReadNew');
  }

  get injectionEnabled(): boolean {
    return isFeatureEnabled(this.config, 'claimInjection');
  }

  get sessionStateInjectionEnabled(): boolean {
    return isFeatureEnabled(this.config, 'sessionStateInjection');
  }

  get writeInteractionEnabled(): boolean {
    return isFeatureEnabled(this.config, 'claimWriteInteraction');
  }

  get writeEmotionEnabled(): boolean {
    return isFeatureEnabled(this.config, 'claimWriteEmotion');
  }

  get interactionTuningLearningEnabled(): boolean {
    return isFeatureEnabled(this.config, 'interactionTuningLearning');
  }

  get draftEnabled(): boolean {
    return isFeatureEnabled(this.config, 'claimDraftEnabled');
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
