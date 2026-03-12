"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ModelConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelConfigService = void 0;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const SCENARIOS = ['chat', 'dev', 'python', 'reasoning', 'summary'];
const ROUTING_KEYS = ['chatModel', 'devModel', 'pythonModel', 'reasoningModel', 'summaryModel'];
let ModelConfigService = ModelConfigService_1 = class ModelConfigService {
    logger = new common_1.Logger(ModelConfigService_1.name);
    cachedPath = null;
    cachedMtimeMs = null;
    cachedConfig = null;
    resolveScenarioModel(scenario) {
        const { config, sourcePath } = this.loadConfig();
        const routingKey = config.scenarioRouting[scenario] ?? 'chatModel';
        const routedModelId = config.routing[routingKey];
        const direct = this.findEnabledModel(config.models, routedModelId);
        if (direct) {
            return {
                scenario,
                routingKey,
                model: direct,
                sourcePath,
                fallbackApplied: false,
            };
        }
        const fallback = this.findEnabledModel(config.models, config.routing.chatModel)
            ?? config.models.find((m) => m.enabled)
            ?? this.createFallbackModel(routedModelId || process.env.LLM_MODEL || 'gpt-5.2');
        this.logger.warn(`Scenario ${scenario} routed to unavailable model \"${routedModelId}\", fallback to \"${fallback.id}\"`);
        return {
            scenario,
            routingKey,
            model: fallback,
            sourcePath,
            fallbackApplied: true,
        };
    }
    getReadView() {
        const { config, sourcePath } = this.loadConfig();
        const scenarios = SCENARIOS.reduce((acc, scenario) => {
            const resolved = this.resolveScenarioModel(scenario);
            acc[scenario] = {
                routingKey: resolved.routingKey,
                modelId: resolved.model.id,
                displayName: resolved.model.displayName,
                provider: resolved.model.provider,
                type: resolved.model.type,
                tags: resolved.model.tags,
                enabled: resolved.model.enabled,
                fallbackApplied: resolved.fallbackApplied,
            };
            return acc;
        }, {});
        return {
            readonly: true,
            source: {
                kind: 'file',
                path: sourcePath,
            },
            notice: '当前为只读展示。请直接编辑 backend/config/model-routing.json 修改配置。',
            models: config.models,
            routing: config.routing,
            scenarioRouting: config.scenarioRouting,
            scenarios,
            flowMapping: this.buildFlowMapping(config),
        };
    }
    buildFlowMapping(config) {
        const routingFor = (scenario) => config.scenarioRouting[scenario] ?? 'chatModel';
        return [
            {
                flow: '聊天主链路回复（含工具结果包装/缺参追问）',
                scenario: 'chat',
                routingKey: routingFor('chat'),
                entrypoints: [
                    'ConversationService.handleChatReply',
                    'ConversationService.handleToolResponseWithPersona',
                    'ConversationService.askForMissingParams',
                ],
            },
            {
                flow: 'Dev 任务规划与最终汇报',
                scenario: 'dev',
                routingKey: routingFor('dev'),
                entrypoints: [
                    'DevTaskPlanner.planTask',
                    'DevFinalReportGenerator.generateReport',
                ],
            },
            {
                flow: 'Reasoning / 规划判断（意图、路由、精排、进度评估）',
                scenario: 'reasoning',
                routingKey: routingFor('reasoning'),
                entrypoints: [
                    'MessageRouterService.classifyIntent',
                    'IntentService.recognize',
                    'PromptRouterService.rankMemoriesByRelevance',
                    'DevProgressEvaluator.evaluateTaskProgress',
                    'PersonaService.suggestEvolution/validateAgainstPool',
                ],
            },
            {
                flow: '总结与归纳（记忆分析/日记生成）',
                scenario: 'summary',
                routingKey: routingFor('summary'),
                entrypoints: [
                    'SummarizerService.summarize/extractAndUpdateImpression/extractAndUpdateAnchors',
                    'DailyMomentGenerator.generateWithLlm',
                ],
            },
            {
                flow: 'Python 场景（预留）',
                scenario: 'python',
                routingKey: routingFor('python'),
                entrypoints: ['当前无独立 Python 链路，先归属 Dev 链路语义'],
                note: 'pythonModel 已可配置并可展示；执行流程暂由 Dev 通道承载。',
            },
        ];
    }
    loadConfig() {
        const sourcePath = this.findConfigPath();
        const mtimeMs = this.safeMtimeMs(sourcePath);
        if (this.cachedConfig
            && this.cachedPath === sourcePath
            && this.cachedMtimeMs !== null
            && mtimeMs !== null
            && this.cachedMtimeMs === mtimeMs) {
            return { config: this.cachedConfig, sourcePath };
        }
        const parsed = this.readConfigFile(sourcePath);
        const normalized = this.normalizeConfig(parsed);
        this.cachedPath = sourcePath;
        this.cachedMtimeMs = mtimeMs;
        this.cachedConfig = normalized;
        return { config: normalized, sourcePath };
    }
    findConfigPath() {
        const cwdPath = (0, node_path_1.resolve)(process.cwd(), 'config/model-routing.json');
        if ((0, node_fs_1.existsSync)(cwdPath))
            return cwdPath;
        const compiledPath = (0, node_path_1.resolve)(__dirname, '../../config/model-routing.json');
        if ((0, node_fs_1.existsSync)(compiledPath))
            return compiledPath;
        const srcPath = (0, node_path_1.resolve)(__dirname, '../../../config/model-routing.json');
        if ((0, node_fs_1.existsSync)(srcPath))
            return srcPath;
        return cwdPath;
    }
    safeMtimeMs(path) {
        try {
            return (0, node_fs_1.statSync)(path).mtimeMs;
        }
        catch {
            return null;
        }
    }
    readConfigFile(path) {
        try {
            const raw = (0, node_fs_1.readFileSync)(path, 'utf8');
            return JSON.parse(raw);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Failed to read model config file (${path}): ${message}. Using fallback config.`);
            return null;
        }
    }
    normalizeConfig(input) {
        const source = this.asRecord(input);
        const envModel = process.env.LLM_MODEL || 'gpt-5.2';
        const models = this.normalizeModels(source.models, envModel);
        const routing = this.normalizeRouting(source.routing, envModel, models);
        const scenarioRouting = this.normalizeScenarioRouting(source.scenarioRouting);
        return {
            models,
            routing,
            scenarioRouting,
        };
    }
    normalizeModels(input, envModel) {
        if (!Array.isArray(input)) {
            return [
                {
                    id: envModel,
                    displayName: envModel,
                    provider: 'other',
                    type: 'chat',
                    tags: ['chat', 'dev', 'reasoning', 'summary'],
                    enabled: true,
                },
            ];
        }
        const normalized = input
            .map((item) => this.normalizeSingleModel(item))
            .filter((item) => item !== null);
        if (normalized.length > 0)
            return normalized;
        return [
            {
                id: envModel,
                displayName: envModel,
                provider: 'other',
                type: 'chat',
                tags: ['chat', 'dev', 'reasoning', 'summary'],
                enabled: true,
            },
        ];
    }
    normalizeSingleModel(input) {
        const row = this.asRecord(input);
        const id = String(row.id ?? '').trim();
        if (!id)
            return null;
        const tags = Array.isArray(row.tags)
            ? row.tags
                .filter((v) => typeof v === 'string')
                .map((v) => v.trim())
                .filter((v) => v.length > 0)
            : [];
        return {
            id,
            displayName: String(row.displayName ?? id).trim() || id,
            provider: String(row.provider ?? 'other').trim() || 'other',
            type: String(row.type ?? 'chat').trim() || 'chat',
            tags,
            enabled: row.enabled !== false,
        };
    }
    normalizeRouting(input, envModel, models) {
        const row = this.asRecord(input);
        const firstEnabled = models.find((m) => m.enabled)?.id ?? models[0]?.id ?? envModel;
        const pick = (key, fallback) => {
            const value = String(row[key] ?? '').trim();
            return value || fallback;
        };
        const chatModel = pick('chatModel', firstEnabled);
        const devModel = pick('devModel', chatModel);
        const pythonModel = pick('pythonModel', devModel);
        const reasoningModel = pick('reasoningModel', chatModel);
        const summaryModel = pick('summaryModel', chatModel);
        return {
            chatModel,
            devModel,
            pythonModel,
            reasoningModel,
            summaryModel,
        };
    }
    normalizeScenarioRouting(input) {
        const row = this.asRecord(input);
        const pick = (scenario, fallback) => {
            const value = String(row[scenario] ?? '').trim();
            if (ROUTING_KEYS.includes(value)) {
                return value;
            }
            return fallback;
        };
        return {
            chat: pick('chat', 'chatModel'),
            dev: pick('dev', 'devModel'),
            python: pick('python', 'pythonModel'),
            reasoning: pick('reasoning', 'reasoningModel'),
            summary: pick('summary', 'summaryModel'),
        };
    }
    findEnabledModel(models, modelId) {
        return models.find((model) => model.id === modelId && model.enabled) ?? null;
    }
    createFallbackModel(modelId) {
        return {
            id: modelId,
            displayName: modelId,
            provider: 'other',
            type: 'chat',
            tags: ['fallback'],
            enabled: true,
        };
    }
    asRecord(input) {
        if (input && typeof input === 'object' && !Array.isArray(input)) {
            return input;
        }
        return {};
    }
};
exports.ModelConfigService = ModelConfigService;
exports.ModelConfigService = ModelConfigService = ModelConfigService_1 = __decorate([
    (0, common_1.Injectable)()
], ModelConfigService);
//# sourceMappingURL=model-config.service.js.map