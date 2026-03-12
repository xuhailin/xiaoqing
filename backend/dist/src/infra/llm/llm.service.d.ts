import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ModelConfigService } from './model-config.service';
import type { ModelScenario } from './model-config.types';
export declare class LlmService {
    private config;
    private modelConfig;
    private client;
    private maxTokens;
    constructor(config: ConfigService, modelConfig: ModelConfigService);
    generate(messages: OpenAI.Chat.ChatCompletionMessageParam[], options?: {
        scenario?: ModelScenario;
    }): Promise<string>;
    getModelInfo(options?: {
        scenario?: ModelScenario;
    }): {
        provider: string;
        configuredProvider: string;
        modelName: string;
        displayName: string;
        scenario: ModelScenario;
        routingKey: import("./model-config.types").ModelRoutingKey;
        sourcePath: string;
        fallbackApplied: boolean;
        isMock: boolean;
    };
}
