import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class EmbeddingService {
  private readonly enabled: boolean;

  constructor(
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    void this.llm;
    this.enabled = config.get<string>('FEATURE_EMBEDDINGS') === 'true';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isReady(): boolean {
    // 占位阶段：即使开了 flag，也还没有真正接 embedding 模型与 schema。
    return false;
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.enabled) return null;
    void text;
    throw new Error('Embeddings not yet configured');
  }
}
