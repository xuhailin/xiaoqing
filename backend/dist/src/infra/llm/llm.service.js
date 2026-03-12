"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
const model_config_service_1 = require("./model-config.service");
let LlmService = class LlmService {
    config;
    modelConfig;
    client = null;
    maxTokens;
    constructor(config, modelConfig) {
        this.config = config;
        this.modelConfig = modelConfig;
        const apiKey = this.config.get('LLM_API_KEY');
        const baseURL = this.config.get('LLM_BASE_URL') ??
            'https://open.bigmodel.cn/api/paas/v4/';
        this.maxTokens = parseInt(this.config.get('LLM_MAX_TOKENS') ?? '4096', 10);
        if (apiKey) {
            this.client = new openai_1.default({ apiKey, baseURL });
        }
    }
    async generate(messages, options) {
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
    getModelInfo(options) {
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
};
exports.LlmService = LlmService;
exports.LlmService = LlmService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        model_config_service_1.ModelConfigService])
], LlmService);
//# sourceMappingURL=llm.service.js.map