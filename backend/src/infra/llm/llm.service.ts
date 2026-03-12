import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ModelConfigService } from './model-config.service';
import type { ModelScenario } from './model-config.types';

/**
 * LLM service: OpenAI-compatible API (ZhiPu GLM / OpenAI / Ollama).
 * Non-streaming. Prompt versioning is in PromptRouter.
 */
@Injectable()
export class LlmService {
  private client: OpenAI | null = null;
  private maxTokens: number;

  constructor(
    private config: ConfigService,
    private modelConfig: ModelConfigService,
  ) {
    const apiKey = this.config.get<string>('LLM_API_KEY');
    const baseURL =
      this.config.get<string>('LLM_BASE_URL') ??
      'https://open.bigmodel.cn/api/paas/v4/';
    this.maxTokens = parseInt(
      this.config.get<string>('LLM_MAX_TOKENS') ?? '4096',
      10,
    );
    if (apiKey) {
      this.client = new OpenAI({ apiKey, baseURL });
    }
  }

  async generate(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options?: { scenario?: ModelScenario },
  ): Promise<string> {
    const scenario = options?.scenario ?? 'chat';
    const resolved = this.modelConfig.resolveScenarioModel(scenario);
    if (!this.client) {
      return '[Mock] 你好，我是占位回复。请配置 LLM_API_KEY 后使用真实模型。';
    }
    const completion = await this.client.chat.completions.create({
      model: resolved.model.id,
      messages,
      max_tokens: this.maxTokens,
    });
    const content = completion.choices[0]?.message?.content;
    return content ?? '';
  }

  getModelInfo(options?: { scenario?: ModelScenario }) {
    const scenario = options?.scenario ?? 'chat';
    const resolved = this.modelConfig.resolveScenarioModel(scenario);

    return {
      provider: this.client ? 'openai-compatible' : 'mock',
      configuredProvider: resolved.model.provider,
      modelName: resolved.model.id,
      displayName: resolved.model.displayName,
      scenario: resolved.scenario,
      routingKey: resolved.routingKey,
      sourcePath: resolved.sourcePath,
      fallbackApplied: resolved.fallbackApplied,
      isMock: !this.client,
    };
  }
}
