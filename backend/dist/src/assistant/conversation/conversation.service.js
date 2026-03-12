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
var ConversationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../infra/prisma.service");
const llm_service_1 = require("../../infra/llm/llm.service");
const prompt_router_service_1 = require("../prompt-router/prompt-router.service");
const memory_service_1 = require("../memory/memory.service");
const memory_decay_service_1 = require("../memory/memory-decay.service");
const persona_service_1 = require("../persona/persona.service");
const user_profile_service_1 = require("../persona/user-profile.service");
const intent_service_1 = require("../intent/intent.service");
const openclaw_service_1 = require("../../openclaw/openclaw.service");
const task_formatter_service_1 = require("../../openclaw/task-formatter.service");
const capability_registry_service_1 = require("../../action/capability-registry.service");
const weather_skill_service_1 = require("../../action/skills/weather/weather-skill.service");
const world_state_service_1 = require("../../infra/world-state/world-state.service");
const identity_anchor_service_1 = require("../identity-anchor/identity-anchor.service");
const pet_service_1 = require("../pet/pet.service");
const summarizer_service_1 = require("../summarizer/summarizer.service");
const evolution_scheduler_service_1 = require("../persona/evolution-scheduler.service");
const cognitive_pipeline_service_1 = require("../cognitive-pipeline/cognitive-pipeline.service");
const cognitive_growth_service_1 = require("../cognitive-pipeline/cognitive-growth.service");
const boundary_governance_service_1 = require("../cognitive-pipeline/boundary-governance.service");
const meta_layer_service_1 = require("../meta-layer/meta-layer.service");
const claim_engine_config_1 = require("../claim-engine/claim-engine.config");
const claim_selector_service_1 = require("../claim-engine/claim-selector.service");
const session_state_service_1 = require("../claim-engine/session-state.service");
const token_estimator_1 = require("../../infra/token-estimator");
const trace_collector_1 = require("../../infra/trace/trace-collector");
const turn_trace_adapter_1 = require("../../infra/trace/turn-trace.adapter");
const daily_moment_service_1 = require("../daily-moment/daily-moment.service");
const assistant_orchestrator_service_1 = require("./assistant-orchestrator.service");
const tool_executor_registry_service_1 = require("../../action/tools/tool-executor-registry.service");
const post_turn_pipeline_1 = require("../post-turn/post-turn.pipeline");
const skill_runner_service_1 = require("../../action/local-skills/skill-runner.service");
let ConversationService = class ConversationService {
    static { ConversationService_1 = this; }
    prisma;
    llm;
    router;
    memory;
    memoryDecay;
    persona;
    userProfile;
    intent;
    openclaw;
    taskFormatter;
    capabilityRegistry;
    weatherSkill;
    worldState;
    identityAnchor;
    pet;
    summarizer;
    evolutionScheduler;
    cognitivePipeline;
    cognitiveGrowth;
    boundaryGovernance;
    metaLayer;
    claimConfig;
    claimSelector;
    sessionStateStore;
    dailyMoment;
    assistantOrchestrator;
    toolRegistry;
    localSkillRunner;
    postTurnPipeline;
    lastNRounds;
    memoryMidK;
    maxContextTokens;
    maxSystemTokens;
    memoryCandidatesMaxLong;
    memoryCandidatesMaxMid;
    minCandidatesForLlmRank;
    memoryContentMaxChars;
    memoryMinRelevanceScore;
    featureImpressionCore;
    featureImpressionDetail;
    featureKeywordPrefilter;
    featureLlmRank;
    featureDynamicTopK;
    featureShortSummary;
    featureDebugMeta;
    featureOpenClaw;
    featureAutoSummarize;
    autoSummarizeThreshold;
    openclawConfidenceThreshold;
    featureInstantSummarize;
    static INSTANT_SUMMARIZE_RE = /(?:记住|记一下|别忘|请你记|帮我记|我叫|我姓|我是(?!说|不是|在说)|我今年|我住在|我在(?!说|想|看)|我换了|我的名字)/;
    static SKILL_COMMAND_RE = /^\/skill\s+([a-z0-9-]+)\s*$/;
    summarizingConversations = new Set();
    logger = new common_1.Logger(ConversationService_1.name);
    constructor(prisma, llm, router, memory, memoryDecay, persona, userProfile, intent, openclaw, taskFormatter, capabilityRegistry, weatherSkill, worldState, identityAnchor, pet, summarizer, evolutionScheduler, cognitivePipeline, cognitiveGrowth, boundaryGovernance, metaLayer, claimConfig, claimSelector, sessionStateStore, dailyMoment, assistantOrchestrator, toolRegistry, localSkillRunner, postTurnPipeline, config) {
        this.prisma = prisma;
        this.llm = llm;
        this.router = router;
        this.memory = memory;
        this.memoryDecay = memoryDecay;
        this.persona = persona;
        this.userProfile = userProfile;
        this.intent = intent;
        this.openclaw = openclaw;
        this.taskFormatter = taskFormatter;
        this.capabilityRegistry = capabilityRegistry;
        this.weatherSkill = weatherSkill;
        this.worldState = worldState;
        this.identityAnchor = identityAnchor;
        this.pet = pet;
        this.summarizer = summarizer;
        this.evolutionScheduler = evolutionScheduler;
        this.cognitivePipeline = cognitivePipeline;
        this.cognitiveGrowth = cognitiveGrowth;
        this.boundaryGovernance = boundaryGovernance;
        this.metaLayer = metaLayer;
        this.claimConfig = claimConfig;
        this.claimSelector = claimSelector;
        this.sessionStateStore = sessionStateStore;
        this.dailyMoment = dailyMoment;
        this.assistantOrchestrator = assistantOrchestrator;
        this.toolRegistry = toolRegistry;
        this.localSkillRunner = localSkillRunner;
        this.postTurnPipeline = postTurnPipeline;
        this.lastNRounds = Number(config.get('CONVERSATION_LAST_N_ROUNDS')) || 8;
        this.memoryMidK = Number(config.get('MEMORY_INJECT_MID_K')) || 5;
        this.maxContextTokens = Number(config.get('MAX_CONTEXT_TOKENS')) || 3000;
        this.maxSystemTokens = Number(config.get('MAX_SYSTEM_TOKENS')) || 1200;
        this.memoryCandidatesMaxLong = Number(config.get('MEMORY_CANDIDATES_MAX_LONG')) || 15;
        this.memoryCandidatesMaxMid = Number(config.get('MEMORY_CANDIDATES_MAX_MID')) || 20;
        this.minCandidatesForLlmRank = Number(config.get('MIN_CANDIDATES_FOR_LLM_RANK')) || 5;
        this.memoryContentMaxChars = Number(config.get('MEMORY_CONTENT_MAX_CHARS')) || 300;
        this.memoryMinRelevanceScore = Number(config.get('MEMORY_MIN_RELEVANCE_SCORE')) || 0.05;
        this.featureImpressionCore = config.get('FEATURE_IMPRESSION_CORE') !== 'false';
        this.featureImpressionDetail = config.get('FEATURE_IMPRESSION_DETAIL') === 'true';
        this.featureKeywordPrefilter = config.get('FEATURE_KEYWORD_PREFILTER') !== 'false';
        this.featureLlmRank = config.get('FEATURE_LLM_RANK') === 'true';
        this.featureDynamicTopK = config.get('FEATURE_DYNAMIC_TOPK') !== 'false';
        this.featureShortSummary = config.get('FEATURE_MEMORY_SHORT_SUMMARY') === 'true';
        this.featureDebugMeta = config.get('FEATURE_DEBUG_META') === 'true';
        this.featureOpenClaw = config.get('FEATURE_OPENCLAW') === 'true';
        this.featureAutoSummarize = config.get('FEATURE_AUTO_SUMMARIZE') !== 'false';
        this.autoSummarizeThreshold = Number(config.get('AUTO_SUMMARIZE_THRESHOLD')) || 15;
        this.openclawConfidenceThreshold = Number(config.get('OPENCLAW_CONFIDENCE_THRESHOLD')) || 0.7;
        this.featureInstantSummarize = config.get('FEATURE_INSTANT_SUMMARIZE') !== 'false';
    }
    async list() {
        const conversations = await this.prisma.conversation.findMany({
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { messages: true } } },
        });
        return conversations.map((c) => ({
            id: c.id,
            title: c.title,
            summarizedAt: c.summarizedAt,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            messageCount: c._count.messages,
        }));
    }
    async create() {
        const c = await this.prisma.conversation.create({ data: {} });
        return { id: c.id };
    }
    async getOrCreateCurrent() {
        const latest = await this.prisma.conversation.findFirst({
            orderBy: { createdAt: 'desc' },
        });
        if (latest)
            return { id: latest.id };
        return this.create();
    }
    async delete(conversationId) {
        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            select: { id: true },
        });
        const messageIds = messages.map((m) => m.id);
        let deletedMemories = 0;
        if (messageIds.length > 0) {
            const { count } = await this.prisma.memory.deleteMany({
                where: { sourceMessageIds: { hasSome: messageIds } },
            });
            deletedMemories = count;
        }
        const growthCleanup = await this.cognitiveGrowth.cleanupGrowthForDeletedMessages(messageIds);
        await this.prisma.conversation.delete({ where: { id: conversationId } });
        this.logger.log(`Deleted conversation ${conversationId}, ${messageIds.length} messages, ${deletedMemories} memories, ` +
            `growthCleanup=${JSON.stringify(growthCleanup)}`);
        return { deletedMemories, growthCleanup };
    }
    async getMessages(conversationId) {
        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        return messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
        }));
    }
    async listDailyMoments(conversationId) {
        return this.dailyMoment.listRecords(conversationId);
    }
    async saveDailyMomentFeedback(conversationId, recordId, feedback) {
        await this.dailyMoment.saveFeedback(conversationId, recordId, feedback);
        return { ok: true };
    }
    async getLastNMessages(conversationId) {
        const all = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: this.lastNRounds * 2,
        });
        return all.reverse().map((m) => ({ role: m.role, content: m.content }));
    }
    async getLastNDailyMomentMessages(conversationId, take = 18) {
        const rows = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take,
        });
        return rows
            .reverse()
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
        }));
    }
    async getWorldState(conversationId) {
        return this.worldState.get(conversationId);
    }
    async updateWorldState(conversationId, update) {
        await this.worldState.update(conversationId, update);
        return this.worldState.get(conversationId);
    }
    async getTokenStats(conversationId) {
        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            select: { role: true, tokenCount: true },
        });
        let userTokens = 0;
        let assistantTokens = 0;
        for (const m of messages) {
            const count = m.tokenCount ?? 0;
            if (m.role === 'user')
                userTokens += count;
            else
                assistantTokens += count;
        }
        return {
            totalMessages: messages.length,
            userTokens,
            assistantTokens,
            totalTokens: userTokens + assistantTokens,
        };
    }
    async sendMessage(conversationId, content) {
        const userMsg = await this.prisma.message.create({
            data: { conversationId, role: 'user', content, tokenCount: (0, token_estimator_1.estimateTokens)(content) },
        });
        return this.assistantOrchestrator.processTurn({
            conversationId,
            userInput: content,
            userMessage: {
                id: userMsg.id,
                role: 'user',
                content: userMsg.content,
                createdAt: userMsg.createdAt,
            },
            recentRounds: this.lastNRounds,
            execute: (context) => this.processTurnInternal(context),
        });
    }
    async processTurnInternal(context) {
        const { conversationId, userInput: content, userMessage: userMsg } = context.request;
        const trace = new trace_collector_1.TraceCollector(this.featureDebugMeta);
        const pipelineState = this.createPipelineTraceState();
        this.pet.setState('thinking');
        const recent = context.conversation.recentMessages;
        const personaDto = context.persona.personaDto;
        const anchorCity = context.user.anchorCity;
        const defaultLocationContext = context.world.defaultWorldState;
        const now = context.request.now;
        const localSkillName = this.parseLocalSkillCommand(content);
        if (localSkillName) {
            return this.handleLocalSkillCommand(conversationId, userMsg, content, localSkillName, trace);
        }
        this.dailyMoment
            .ingestUserSignal(conversationId, content, now)
            .catch((err) => this.logger.warn(`DailyMoment signal ingest failed: ${String(err)}`));
        const dailyMomentIntent = await this.dailyMoment.detectUserTriggerIntent(conversationId, content, now);
        if (dailyMomentIntent.shouldGenerate && dailyMomentIntent.mode) {
            this.advancePipelineState(pipelineState, 'decision');
            const recentForMoment = await this.getLastNDailyMomentMessages(conversationId);
            const generated = await this.dailyMoment.generateMomentEntry({
                conversationId,
                recentMessages: recentForMoment,
                now,
                triggerMode: dailyMomentIntent.mode,
                acceptedSuggestionId: dailyMomentIntent.acceptedSuggestionId,
            });
            this.recordPipelineStep(trace, pipelineState, 'expression', {
                path: 'daily-moment-manual',
                phase: 'post-llm',
                triggerMode: dailyMomentIntent.mode,
                sourceMessageCount: generated.record.sourceMessageIds.length,
            });
            const assistantMsg = await this.prisma.message.create({
                data: {
                    conversationId,
                    role: 'assistant',
                    content: generated.renderedText,
                    tokenCount: (0, token_estimator_1.estimateTokens)(generated.renderedText),
                },
            });
            this.pet.setStateWithAutoIdle('speaking', 2000);
            return {
                userMessage: {
                    id: userMsg.id,
                    role: userMsg.role,
                    content: userMsg.content,
                    createdAt: userMsg.createdAt,
                },
                assistantMessage: {
                    id: assistantMsg.id,
                    role: assistantMsg.role,
                    content: assistantMsg.content,
                    createdAt: assistantMsg.createdAt,
                },
                injectedMemories: [],
                dailyMoment: {
                    mode: 'entry',
                    record: generated.record,
                },
                ...(trace && { trace: trace.getTrace() }),
            };
        }
        let intentState = null;
        const hasAnyChatCapability = this.featureOpenClaw || this.capabilityRegistry.listAvailable('chat').length > 0;
        if (hasAnyChatCapability) {
            try {
                intentState = await trace.wrap('intent', '意图识别', async () => {
                    const capabilityPrompt = this.capabilityRegistry.buildCapabilityPrompt('chat');
                    const state = await this.intent.recognize(recent, content, defaultLocationContext, capabilityPrompt || undefined);
                    return {
                        status: 'success',
                        detail: {
                            userInput: content,
                            defaultWorldState: defaultLocationContext,
                            anchorCityFallback: anchorCity ?? null,
                            intentNormalized: {
                                mode: state.mode,
                                requiresTool: state.requiresTool,
                                taskIntent: state.taskIntent,
                                confidence: state.confidence,
                                suggestedTool: state.suggestedTool ?? null,
                                slots: state.slots,
                                missingParams: state.missingParams,
                                seriousness: state.seriousness,
                                expectation: state.expectation,
                                agency: state.agency,
                            },
                        },
                        result: state,
                    };
                });
            }
            catch (err) {
                trace.add('intent', '意图识别', 'fail', {
                    userInput: content,
                    error: String(err),
                    decision: 'chat',
                    reason: '意图识别异常，降级为聊天路径',
                });
                this.advancePipelineState(pipelineState, 'decision');
                this.logger.warn(`Intent recognition failed, falling back to chat: ${err}`);
            }
            if (intentState) {
                if (intentState.worldStateUpdate && Object.keys(intentState.worldStateUpdate).length > 0) {
                    await this.worldState.update(conversationId, intentState.worldStateUpdate);
                    trace.add('world-state', '世界状态更新', 'success', {
                        updated: Object.keys(intentState.worldStateUpdate),
                    });
                }
                if (intentState.identityUpdate && Object.keys(intentState.identityUpdate).length > 0) {
                    await this.writeIdentityUpdate(intentState.identityUpdate, trace);
                }
                const { merged, filledFromWorldState } = await this.worldState.mergeSlots(conversationId, intentState, anchorCity ? { city: anchorCity } : null);
                if (filledFromWorldState.length > 0) {
                    trace.add('world-state', '槽位补全', 'success', {
                        filledFromWorldState,
                        mergedMissingParams: merged.missingParams,
                    });
                }
                this.logger.debug(`Intent: requiresTool=${merged.requiresTool}, taskIntent=${merged.taskIntent}, ` +
                    `missingParams=${merged.missingParams.length}, filledFromWorldState=${filledFromWorldState.join(',') || 'none'}`);
                const policy = this.decideToolPolicy(merged);
                this.advancePipelineState(pipelineState, 'decision');
                trace.add('policy-decision', '策略决策', 'success', {
                    policyDecision: policy.action,
                    reason: policy.reason,
                    confidence: merged.confidence,
                    threshold: this.openclawConfidenceThreshold,
                    taskIntent: merged.taskIntent,
                    requiresTool: merged.requiresTool,
                    missingParams: merged.missingParams,
                    pipeline: this.buildPipelineSnapshot(pipelineState),
                });
                if (policy.action === 'ask_missing') {
                    return this.handleMissingParamsReply(conversationId, userMsg, content, merged.missingParams, merged, personaDto, trace, pipelineState);
                }
                if (policy.action === 'run_local_weather') {
                    let location = this.takeValidCoord(merged.slots.location);
                    let geoResolved = null;
                    if (!location && merged.slots.city) {
                        geoResolved = await this.weatherSkill.resolveCityToLocation(merged.slots.city, typeof merged.slots.district === 'string' && merged.slots.district.trim()
                            ? merged.slots.district.trim()
                            : undefined);
                        location = geoResolved ?? undefined;
                    }
                    if (!location) {
                        const reason = !merged.slots.city && !merged.slots.location
                            ? '意图未抽取 city 或 location 槽位'
                            : merged.slots.city && geoResolved === null
                                ? `城市 Geo 解析失败（city="${merged.slots.city}", district="${merged.slots.district ?? ''}"）`
                                : `slots.location 格式无效（"${merged.slots.location ?? ''}"）`;
                        trace.add('skill-attempt', '本地技能：天气（地点解析）', 'fail', {
                            skill: 'weather',
                            phase: 'resolve-location',
                            slotsCity: merged.slots.city ?? null,
                            slotsDistrict: merged.slots.district ?? null,
                            slotsLocation: merged.slots.location ?? null,
                            geoResolved,
                            reason,
                            fallback: 'openclaw',
                        });
                        this.logger.debug(`Weather: ${reason}, fallback to OpenClaw`);
                        this.advancePipelineState(pipelineState, 'decision');
                        if (!this.featureOpenClaw) {
                            trace.add('policy-decision', '策略决策', 'success', {
                                policyDecision: 'chat',
                                reason: 'OpenClaw 已关闭，回退聊天',
                                pipeline: this.buildPipelineSnapshot(pipelineState),
                            });
                            return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, null, '天气地点解析失败，且 OpenClaw 已关闭，暂无法代为查询', merged, {}, trace, pipelineState, recent);
                        }
                        return this.handleOpenClawTask(conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState);
                    }
                    const displayName = merged.slots.city
                        ? (merged.slots.district ? `${merged.slots.city}${merged.slots.district}` : merged.slots.city)
                        : '该坐标';
                    const weatherInput = {
                        location,
                        dateLabel: typeof merged.slots.dateLabel === 'string' ? merged.slots.dateLabel : undefined,
                        displayName,
                    };
                    const weatherResult = await trace.wrap('skill-attempt', '本地技能：天气', async () => {
                        const result = await this.toolRegistry.execute({
                            conversationId,
                            turnId: userMsg.id,
                            userInput: content,
                            executor: 'local-weather',
                            capability: 'weather_query',
                            intentState: merged,
                            params: weatherInput,
                        });
                        return {
                            status: (result.success ? 'success' : 'fail'),
                            detail: {
                                skill: 'weather',
                                input: weatherInput,
                                success: result.success,
                                resultPreview: result.content?.slice(0, 200) ?? null,
                                error: result.error ?? null,
                                fallback: result.success ? null : 'openclaw',
                            },
                            result,
                        };
                    });
                    if (weatherResult.success && weatherResult.content) {
                        return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, weatherResult.content, null, merged, { localSkillUsed: 'weather' }, trace, pipelineState, recent);
                    }
                    this.advancePipelineState(pipelineState, 'decision');
                    trace.add('policy-decision', '策略决策', 'success', {
                        policyDecision: 'run_openclaw',
                        reason: '本地 weather 执行失败，回退 OpenClaw',
                        fallbackReason: weatherResult.error ?? 'weather skill returned empty content',
                        pipeline: this.buildPipelineSnapshot(pipelineState),
                    });
                    this.logger.debug(`Weather skill failed or unavailable, fallback to OpenClaw: ${weatherResult.error ?? 'no content'}`);
                    if (!this.featureOpenClaw) {
                        return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, null, '本地天气查询失败，且 OpenClaw 已关闭，暂无法代为查询', merged, {}, trace, pipelineState, recent);
                    }
                    return this.handleOpenClawTask(conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState);
                }
                if (policy.action === 'run_local_book_download') {
                    const bookName = typeof merged.slots.bookName === 'string' ? merged.slots.bookName.trim() : '';
                    if (!bookName) {
                        trace.add('skill-attempt', '本地技能：电子书下载', 'fail', {
                            skill: 'book_download',
                            reason: '意图未抽取 bookName 槽位',
                        });
                        if (!this.featureOpenClaw) {
                            trace.add('policy-decision', '策略决策', 'success', {
                                policyDecision: 'chat',
                                reason: 'OpenClaw 已关闭，回退聊天',
                                pipeline: this.buildPipelineSnapshot(pipelineState),
                            });
                            return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, null, '意图未抽取书名，且 OpenClaw 已关闭，暂无法代为下载', merged, {}, trace, pipelineState, recent);
                        }
                        return this.handleOpenClawTask(conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState);
                    }
                    const bookResult = await trace.wrap('skill-attempt', '本地技能：电子书下载', async () => {
                        const result = await this.toolRegistry.execute({
                            conversationId,
                            turnId: userMsg.id,
                            userInput: content,
                            executor: 'local-book-download',
                            capability: 'book_download',
                            intentState: merged,
                            params: {
                                bookName,
                                ...(typeof merged.slots.bookChoiceIndex === 'number' && { bookChoiceIndex: merged.slots.bookChoiceIndex }),
                            },
                        });
                        return {
                            status: (result.success ? 'success' : 'fail'),
                            detail: {
                                skill: 'book_download',
                                input: { bookName },
                                success: result.success,
                                resultPreview: result.content?.slice(0, 200) ?? null,
                                error: result.error ?? null,
                                ...(result.meta?.bookDownloadDebug != null && { bookDownloadDebug: result.meta.bookDownloadDebug }),
                            },
                            result,
                        };
                    });
                    const bookChoices = bookResult.meta?.bookChoices;
                    if (!bookResult.success && bookChoices?.length && bookResult.content) {
                        return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, bookResult.content, null, merged, { localSkillUsed: 'book_download' }, trace, pipelineState, recent);
                    }
                    if (bookResult.success && bookResult.content) {
                        return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, bookResult.content, null, merged, { localSkillUsed: 'book_download' }, trace, pipelineState, recent);
                    }
                    this.advancePipelineState(pipelineState, 'decision');
                    trace.add('policy-decision', '策略决策', 'success', {
                        policyDecision: this.featureOpenClaw ? 'run_openclaw' : 'chat',
                        reason: this.featureOpenClaw ? '本地 book_download 执行失败，回退 OpenClaw' : 'OpenClaw 已关闭，回退聊天',
                        fallbackReason: bookResult.error ?? 'book_download skill returned empty content',
                        pipeline: this.buildPipelineSnapshot(pipelineState),
                    });
                    if (!this.featureOpenClaw) {
                        return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, null, '本地电子书下载失败，且 OpenClaw 已关闭，暂无法代为下载', merged, {}, trace, pipelineState, recent);
                    }
                    return this.handleOpenClawTask(conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState);
                }
                if (policy.action === 'run_local_general_action') {
                    const actionResult = await trace.wrap('skill-attempt', '本地技能：基础行动能力', async () => {
                        const result = await this.toolRegistry.execute({
                            conversationId,
                            turnId: userMsg.id,
                            userInput: content,
                            executor: 'local-general-action',
                            capability: 'general_tool',
                            intentState: merged,
                            params: { input: content },
                        });
                        return {
                            status: (result.success ? 'success' : 'fail'),
                            detail: {
                                skill: 'general_action',
                                input: { userInput: content },
                                success: result.success,
                                resultPreview: result.content?.slice(0, 200) ?? null,
                                error: result.error ?? null,
                                reasonCode: typeof result.meta?.reasonCode === 'string' ? result.meta.reasonCode : null,
                                actionType: typeof result.meta?.actionType === 'string' ? result.meta.actionType : null,
                            },
                            result,
                        };
                    });
                    const reasonCode = typeof actionResult.meta?.reasonCode === 'string'
                        ? actionResult.meta.reasonCode
                        : '';
                    if (!actionResult.success && reasonCode === 'NOT_SUPPORTED') {
                        this.advancePipelineState(pipelineState, 'decision');
                        trace.add('policy-decision', '策略决策', 'success', {
                            policyDecision: this.featureOpenClaw ? 'run_openclaw' : 'chat',
                            reason: this.featureOpenClaw ? '本地 general_action 返回 NOT_SUPPORTED，回退 OpenClaw' : 'OpenClaw 已关闭，回退聊天',
                            fallbackReason: actionResult.error ?? 'general_action not supported',
                            pipeline: this.buildPipelineSnapshot(pipelineState),
                        });
                        if (!this.featureOpenClaw) {
                            return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, null, '该操作暂不支持，且 OpenClaw 已关闭，暂无法委派', merged, {}, trace, pipelineState, recent);
                        }
                        return this.handleOpenClawTask(conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState);
                    }
                    return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, actionResult.success ? actionResult.content : null, actionResult.success ? null : (actionResult.error ?? '本地动作执行失败'), merged, { localSkillUsed: 'general_action' }, trace, pipelineState, recent);
                }
                if (policy.action === 'run_local_timesheet') {
                    const timesheetParams = this.buildTimesheetParams(merged.slots, content);
                    const tsResult = await trace.wrap('skill-attempt', '本地技能：工时上报', async () => {
                        const result = await this.toolRegistry.execute({
                            conversationId,
                            turnId: userMsg.id,
                            userInput: content,
                            executor: 'local-timesheet',
                            capability: 'timesheet',
                            intentState: merged,
                            params: timesheetParams,
                        });
                        return {
                            status: (result.success ? 'success' : 'fail'),
                            detail: {
                                skill: 'timesheet',
                                input: timesheetParams,
                                success: result.success,
                                resultPreview: result.content?.slice(0, 200) ?? null,
                                error: result.error ?? null,
                            },
                            result,
                        };
                    });
                    return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, tsResult.success ? tsResult.content : null, tsResult.success ? null : (tsResult.error ?? '工时上报失败'), merged, { localSkillUsed: 'timesheet' }, trace, pipelineState, recent);
                }
                if (policy.action === 'run_openclaw') {
                    if (!this.featureOpenClaw) {
                        this.logger.debug('OpenClaw 已关闭，工具意图回退聊天');
                        return this.buildToolReplyAndSave(conversationId, userMsg, content, personaDto, null, 'OpenClaw 已关闭，暂无法执行该任务', merged, {}, trace, pipelineState, recent);
                    }
                    return this.handleOpenClawTask(conversationId, userMsg, recent, content, merged, personaDto, trace, pipelineState);
                }
            }
        }
        else {
            trace.add('intent', '意图识别', 'skip', {
                reason: 'OpenClaw 未开启且无可用本地能力，跳过意图识别',
            });
            this.advancePipelineState(pipelineState, 'decision');
        }
        if (!pipelineState.seen.has('decision')) {
            this.advancePipelineState(pipelineState, 'decision');
        }
        return this.handleChatReply(conversationId, userMsg, recent, personaDto, trace, pipelineState, intentState);
    }
    parseLocalSkillCommand(input) {
        const matched = String(input ?? '').trim().match(ConversationService_1.SKILL_COMMAND_RE);
        return matched?.[1] ?? null;
    }
    async handleLocalSkillCommand(conversationId, userMsg, userInput, skillName, trace) {
        const localSkillRun = await trace.wrap('skill-attempt', '本地技能命令', async () => {
            const result = await this.localSkillRunner.run({
                skill: skillName,
                conversationId,
                turnId: userMsg.id,
                userInput,
            });
            const status = result.success ? 'success' : 'fail';
            return {
                status,
                detail: {
                    skill: result.skill,
                    success: result.success,
                    summary: result.summary,
                    stepCount: result.steps.length,
                    stepResults: result.steps.map((step) => ({
                        index: step.index,
                        id: step.id,
                        capability: step.capability,
                        success: step.success,
                        error: step.error,
                    })),
                },
                result,
            };
        });
        this.pet.setStateWithAutoIdle('speaking', 1500);
        const assistantMsg = await this.prisma.message.create({
            data: {
                conversationId,
                role: 'assistant',
                content: localSkillRun.summary,
                tokenCount: (0, token_estimator_1.estimateTokens)(localSkillRun.summary),
            },
        });
        return {
            userMessage: {
                id: userMsg.id,
                role: userMsg.role,
                content: userMsg.content,
                createdAt: userMsg.createdAt,
            },
            assistantMessage: {
                id: assistantMsg.id,
                role: assistantMsg.role,
                content: assistantMsg.content,
                createdAt: assistantMsg.createdAt,
            },
            injectedMemories: [],
            meta: {
                localSkillRun,
            },
            ...(trace && { trace: trace.getTrace() }),
        };
    }
    static COORD_REGEX = /^-?\d+(\.\d{1,2})?,\s*-?\d+(\.\d{1,2})?$/;
    takeValidCoord(value) {
        const s = typeof value === 'string' ? value.trim() : '';
        return s && ConversationService_1.COORD_REGEX.test(s) ? s : undefined;
    }
    buildTimesheetParams(slots, userInput) {
        const params = { ...slots };
        const action = typeof params.timesheetAction === 'string' ? params.timesheetAction.trim() : '';
        if (action !== 'confirm')
            return params;
        const slotOverride = typeof params.timesheetRawOverride === 'string'
            ? params.timesheetRawOverride.trim()
            : '';
        if (slotOverride) {
            params.rawOverride = slotOverride;
            return params;
        }
        const inferred = this.inferTimesheetRawOverride(userInput);
        if (inferred) {
            params.rawOverride = inferred;
        }
        return params;
    }
    inferTimesheetRawOverride(userInput) {
        const text = String(userInput ?? '').trim();
        if (!text)
            return undefined;
        const lines = text
            .split(/[\n;；]/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length === 0)
            return undefined;
        const overrideLinePattern = /\s+\d+(?:\.\d+)?\s*(?:[hH]|小时)?\s*$/;
        return lines.every((line) => overrideLinePattern.test(line)) ? text : undefined;
    }
    static CAPABILITY_TO_ACTION = {
        'weather': 'run_local_weather',
        'book-download': 'run_local_book_download',
        'general-action': 'run_local_general_action',
        'timesheet': 'run_local_timesheet',
    };
    decideToolPolicy(intentState) {
        if (!intentState.requiresTool) {
            return { action: 'chat', reason: '意图为非工具请求，走聊天路径' };
        }
        if (intentState.confidence < this.openclawConfidenceThreshold) {
            return {
                action: 'chat',
                reason: `工具意图置信度 ${intentState.confidence} < 阈值 ${this.openclawConfidenceThreshold}`,
            };
        }
        const allowTimesheetDefaultParams = intentState.taskIntent === 'timesheet' &&
            intentState.missingParams.every((name) => name === 'timesheetDate' || name === 'timesheetMonth');
        if (intentState.missingParams.length > 0 && !allowTimesheetDefaultParams) {
            return {
                action: 'ask_missing',
                reason: `需要工具但缺少参数：${intentState.missingParams.join('、')}`,
            };
        }
        if (intentState.taskIntent !== 'none' && intentState.taskIntent !== 'dev_task') {
            const cap = this.capabilityRegistry.findByTaskIntent(intentState.taskIntent, 'chat');
            if (cap) {
                const action = ConversationService_1.CAPABILITY_TO_ACTION[cap.name];
                if (action) {
                    return { action, reason: `${intentState.taskIntent} 意图参数齐全，本地 ${cap.name} 可用` };
                }
            }
            if (this.featureOpenClaw) {
                return { action: 'run_openclaw', reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置，回退 OpenClaw` };
            }
            return {
                action: 'chat',
                reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置且 OpenClaw 已关闭，回退聊天`,
            };
        }
        if (this.featureOpenClaw) {
            return { action: 'run_openclaw', reason: '工具意图参数齐全，委派 OpenClaw 执行' };
        }
        return {
            action: 'chat',
            reason: '工具意图参数齐全，但未开启 OpenClaw，改用普通聊天',
        };
    }
    async buildToolReplyAndSave(conversationId, userMsg, userInput, personaDto, toolResult, toolError, intentState, opts = {}, trace, pipelineState, recentMessages) {
        const worldState = await this.worldState.get(conversationId);
        const growthContext = await this.cognitiveGrowth.getGrowthContext();
        const claimCtx = await this.buildClaimAndSessionContext(conversationId);
        const userProfileText = this.buildInjectedUserProfileText(await this.userProfile.getOrCreate(), { includeImpressionCore: this.featureImpressionCore, includeImpressionDetail: true });
        const expressionText = this.router.buildExpressionPolicy(this.persona.getExpressionFields(personaDto), intentState ?? undefined);
        const toolCognitiveState = this.cognitivePipeline.analyzeTurn({
            userInput,
            recentMessages: recentMessages ?? [],
            intentState,
            worldState,
            growthContext,
            claimSignals: claimCtx.claimSignals,
            sessionState: claimCtx.sessionState,
        });
        if (trace && pipelineState) {
            this.recordPipelineStep(trace, pipelineState, 'cognition', {
                path: opts.openclawUsed ? 'tool-openclaw' : opts.localSkillUsed ?? 'tool-local',
                situation: toolCognitiveState.situation.kind,
                userEmotion: toolCognitiveState.userState.emotion,
                userNeedMode: toolCognitiveState.userState.needMode,
                responseStrategy: toolCognitiveState.responseStrategy,
                rhythm: toolCognitiveState.rhythm,
                safety: toolCognitiveState.safety,
            });
        }
        const wrapMessages = this.router.buildToolResultMessages({
            personaText: this.persona.buildPersonaPrompt(personaDto),
            expressionText,
            userProfileText,
            metaFilterPolicy: personaDto.metaFilterPolicy,
            toolKind: opts.openclawUsed ? 'openclaw' : opts.localSkillUsed,
            userInput,
            toolResult,
            toolError,
            recentMessages,
        });
        if (trace && pipelineState) {
            this.recordPipelineStep(trace, pipelineState, 'expression', {
                path: opts.openclawUsed ? 'tool-openclaw' : opts.localSkillUsed ?? 'tool-local',
                phase: 'pre-llm',
                inputMessages: wrapMessages.length,
                model: this.llm.getModelInfo({ scenario: 'chat' }),
            });
        }
        const rawReplyContent = await (trace
            ? trace.wrap('llm-generate', '生成回复', async () => {
                const content = await this.llm.generate(wrapMessages, { scenario: 'chat' });
                return {
                    status: 'success',
                    detail: {
                        model: this.llm.getModelInfo({ scenario: 'chat' }),
                        inputMessages: wrapMessages.length,
                        mode: 'tool-wrap',
                    },
                    result: content,
                };
            })
            : this.llm.generate(wrapMessages, { scenario: 'chat' }));
        const filteredReplyContent = this.applyMetaLayerFilter(rawReplyContent, personaDto.metaFilterPolicy, trace, opts.openclawUsed ? 'openclaw' : opts.localSkillUsed ?? 'tool');
        const review = this.boundaryGovernance.reviewGeneratedReply(filteredReplyContent, toolCognitiveState, {
            toolWasActuallyUsed: !!opts.openclawUsed || !!opts.localSkillUsed,
        });
        if (review.adjusted) {
            trace?.add('boundary-governance', '边界治理复核', 'success', {
                adjusted: true,
                reasons: review.reasons,
                path: opts.openclawUsed ? 'openclaw' : opts.localSkillUsed ?? 'tool',
            });
        }
        const replyContent = review.content;
        if (trace && pipelineState) {
            this.recordPipelineStep(trace, pipelineState, 'expression', {
                path: opts.openclawUsed ? 'tool-openclaw' : opts.localSkillUsed ?? 'tool-local',
                phase: 'post-llm',
                rawLength: rawReplyContent.length,
                filteredLength: filteredReplyContent.length,
                finalLength: replyContent.length,
                metaAdjusted: rawReplyContent !== filteredReplyContent,
                boundaryAdjusted: review.adjusted,
                boundaryReasons: review.reasons,
            });
        }
        this.pet.setStateWithAutoIdle('speaking', 3000);
        const assistantMsg = await this.prisma.message.create({
            data: { conversationId, role: 'assistant', content: replyContent, tokenCount: (0, token_estimator_1.estimateTokens)(replyContent) },
        });
        const summarizeTrigger = this.shouldInstantSummarize(userInput)
            ? 'instant'
            : 'threshold';
        const postPlan = {
            conversationId,
            turn: {
                turnId: userMsg.id,
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg.id,
                userInput,
                assistantOutput: assistantMsg.content,
                now: new Date(),
            },
            context: {
                intentState,
                cognitiveState: toolCognitiveState,
            },
            beforeReturn: [],
            afterReturn: [{ type: 'record_growth' }, { type: 'summarize_trigger', trigger: summarizeTrigger }],
        };
        this.postTurnPipeline.runAfterReturn(postPlan, async (task) => this.runPostTurnTask(task, postPlan, { trace, userMsgId: userMsg.id, assistantMsgId: assistantMsg.id })).catch((err) => this.logger.warn(`Post-turn pipeline (tool path) failed: ${String(err)}`));
        const debugMeta = this.featureDebugMeta && pipelineState
            ? {
                pipeline: this.buildPipelineSnapshot(pipelineState),
                turnTraceEvents: trace
                    ? (0, turn_trace_adapter_1.adaptLegacyTraceToTurnEvents)({
                        traceId: userMsg.id,
                        conversationId,
                        turnId: userMsg.id,
                        steps: trace.getTrace(),
                    })
                    : [],
            }
            : undefined;
        return {
            userMessage: {
                id: userMsg.id,
                role: userMsg.role,
                content: userMsg.content,
                createdAt: userMsg.createdAt,
            },
            assistantMessage: {
                id: assistantMsg.id,
                role: assistantMsg.role,
                content: assistantMsg.content,
                createdAt: assistantMsg.createdAt,
            },
            injectedMemories: [],
            ...(opts.openclawUsed !== undefined && { openclawUsed: opts.openclawUsed }),
            ...(opts.localSkillUsed !== undefined && { localSkillUsed: opts.localSkillUsed }),
            ...(debugMeta && { debugMeta }),
            ...(trace && { trace: trace.getTrace() }),
        };
    }
    async handleOpenClawTask(conversationId, userMsg, recent, userInput, intentState, personaDto, trace, pipelineState) {
        if (!this.featureOpenClaw) {
            this.logger.warn('OpenClaw 已关闭，跳过执行');
            return this.buildToolReplyAndSave(conversationId, userMsg, userInput, personaDto, null, 'OpenClaw 已禁用', intentState, { openclawUsed: false }, trace, pipelineState, recent);
        }
        const taskMessage = this.taskFormatter.formatTask(userInput, intentState, recent);
        this.logger.log(`Delegating to Claw: ${userInput.slice(0, 80)}`);
        const clawResult = await trace.wrap('openclaw', 'OpenClaw 调用', async () => {
            const result = await this.toolRegistry.execute({
                conversationId,
                turnId: userMsg.id,
                userInput,
                executor: 'openclaw',
                capability: 'general_tool',
                intentState,
                recentMessages: recent,
                params: { taskMessage },
            });
            return {
                status: (result.success ? 'success' : 'fail'),
                detail: {
                    taskMessage,
                    sessionKey: conversationId,
                    success: result.success,
                    resultPreview: result.content?.slice(0, 200) ?? null,
                    error: result.error ?? null,
                },
                result,
            };
        });
        return this.buildToolReplyAndSave(conversationId, userMsg, userInput, personaDto, clawResult.success ? clawResult.content : null, clawResult.success ? null : (clawResult.error || null), intentState, { openclawUsed: true }, trace, pipelineState, recent);
    }
    async handleMissingParamsReply(conversationId, userMsg, userInput, missingParams, intentState, personaDto, trace, pipelineState) {
        const paramLabel = { city: '城市或坐标', location: '城市或坐标', recipient: '收件人', to: '收件人', subject: '主题' };
        const paramNames = missingParams.map((p) => paramLabel[p.toLowerCase()] ?? p).join('、');
        const expressionText = this.router.buildExpressionPolicy(this.persona.getExpressionFields(personaDto), intentState ?? undefined);
        const userProfileText = this.buildInjectedUserProfileText(await this.userProfile.getOrCreate(), { includeImpressionCore: this.featureImpressionCore, includeImpressionDetail: true });
        trace.add('missing-params', '缺失参数追问', 'success', {
            missingParams,
            paramLabels: paramNames.split('、'),
        });
        const systemContent = [
            this.persona.buildPersonaPrompt(personaDto),
            '',
            expressionText,
            userProfileText,
            '',
            this.router.buildMetaFilterPolicy(personaDto.metaFilterPolicy),
            '',
            '用户想让你帮忙执行一件事，但还少一些关键信息，需要你自然地问 TA 补全。',
            `当前缺少的信息类型：${paramNames}。`,
            '请沿用上面的人格与表达字段，用自然口语问用户要这些信息，不要提「系统」「参数」「缺少」等词，一句或两句即可。',
        ].join('\n');
        const messages = [
            { role: 'system', content: systemContent },
            { role: 'user', content: `用户说：${userInput}` },
        ];
        const worldState = await this.worldState.get(conversationId);
        const growthContext = await this.cognitiveGrowth.getGrowthContext();
        const claimCtx = await this.buildClaimAndSessionContext(conversationId);
        const followupCognitiveState = this.cognitivePipeline.analyzeTurn({
            userInput,
            recentMessages: [],
            intentState,
            worldState,
            growthContext,
            claimSignals: claimCtx.claimSignals,
            sessionState: claimCtx.sessionState,
        });
        this.recordPipelineStep(trace, pipelineState, 'cognition', {
            path: 'missing-params',
            situation: followupCognitiveState.situation.kind,
            userEmotion: followupCognitiveState.userState.emotion,
            userNeedMode: followupCognitiveState.userState.needMode,
            responseStrategy: followupCognitiveState.responseStrategy,
            rhythm: followupCognitiveState.rhythm,
            safety: followupCognitiveState.safety,
            missingParams,
        });
        this.recordPipelineStep(trace, pipelineState, 'expression', {
            path: 'missing-params',
            phase: 'pre-llm',
            inputMessages: messages.length,
            model: this.llm.getModelInfo({ scenario: 'chat' }),
        });
        const rawReplyContent = await trace.wrap('llm-generate', '生成追问回复', async () => {
            const content = await this.llm.generate(messages, { scenario: 'chat' });
            return {
                status: 'success',
                detail: {
                    model: this.llm.getModelInfo({ scenario: 'chat' }),
                    inputMessages: messages.length,
                    mode: 'missing-params-followup',
                },
                result: content,
            };
        });
        const filteredReplyContent = this.applyMetaLayerFilter(rawReplyContent, personaDto.metaFilterPolicy, trace, 'missing-params');
        const review = this.boundaryGovernance.reviewGeneratedReply(filteredReplyContent, followupCognitiveState);
        if (review.adjusted) {
            trace.add('boundary-governance', '边界治理复核', 'success', {
                adjusted: true,
                reasons: review.reasons,
                path: 'missing-params',
            });
        }
        const replyContent = review.content;
        this.recordPipelineStep(trace, pipelineState, 'expression', {
            path: 'missing-params',
            phase: 'post-llm',
            rawLength: rawReplyContent.length,
            filteredLength: filteredReplyContent.length,
            finalLength: replyContent.length,
            metaAdjusted: rawReplyContent !== filteredReplyContent,
            boundaryAdjusted: review.adjusted,
            boundaryReasons: review.reasons,
        });
        const assistantMsg = await this.prisma.message.create({
            data: { conversationId, role: 'assistant', content: replyContent, tokenCount: (0, token_estimator_1.estimateTokens)(replyContent) },
        });
        this.cognitiveGrowth
            .recordTurnGrowth(followupCognitiveState, [userMsg.id, assistantMsg.id])
            .catch((err) => this.logger.warn(`Failed to record cognitive growth (missing params): ${err}`));
        const debugMeta = this.featureDebugMeta
            ? { pipeline: this.buildPipelineSnapshot(pipelineState) }
            : undefined;
        return {
            userMessage: { id: userMsg.id, role: userMsg.role, content: userMsg.content, createdAt: userMsg.createdAt },
            assistantMessage: { id: assistantMsg.id, role: assistantMsg.role, content: assistantMsg.content, createdAt: assistantMsg.createdAt },
            injectedMemories: [],
            ...(debugMeta && { debugMeta }),
            trace: trace.getTrace(),
        };
    }
    async handleChatReply(conversationId, userMsg, recent, personaDto, trace, pipelineState, intentState) {
        const personaPrompt = this.persona.buildPersonaPrompt(personaDto);
        const personaTokens = (0, token_estimator_1.estimateTokens)(personaPrompt);
        const userProfile = await this.userProfile.getOrCreate();
        const coreTokens = this.featureImpressionCore
            ? (0, token_estimator_1.estimateTokens)(userProfile.impressionCore || '')
            : 0;
        const memoryBudget = Math.max(200, this.maxSystemTokens - personaTokens - coreTokens);
        let finalMemories;
        let needDetail = false;
        let candidatesCount = 0;
        if (this.featureKeywordPrefilter) {
            const recallResult = await trace.wrap('memory-recall', '记忆召回', async () => {
                const candidates = await this.memory.getCandidatesForRecall({
                    recentMessages: recent,
                    maxLong: this.memoryCandidatesMaxLong,
                    maxMid: this.memoryCandidatesMaxMid,
                    minRelevanceScore: this.memoryMinRelevanceScore,
                });
                const totalCandidates = candidates.length;
                const longCount = candidates.filter((c) => c.type === 'long').length;
                const midCount = candidates.filter((c) => c.type === 'mid').length;
                let activeCandidates = candidates.filter((c) => !c.deferred);
                const deferredCount = candidates.length - activeCandidates.length;
                const recalledIds = activeCandidates.map((c) => c.id);
                const relatedMemories = await this.memory.getRelatedMemories(recalledIds, 5);
                if (relatedMemories.length > 0) {
                    const existingIds = new Set(recalledIds);
                    const newRelated = relatedMemories.filter((m) => !existingIds.has(m.id));
                    activeCandidates = [...activeCandidates, ...newRelated];
                }
                let llmRankUsed = false;
                let llmRankReason = null;
                let localNeedDetail = false;
                if (this.featureLlmRank && activeCandidates.length > this.minCandidatesForLlmRank) {
                    llmRankUsed = true;
                    llmRankReason = `候选数 ${activeCandidates.length} > 阈值 ${this.minCandidatesForLlmRank}，触发精排`;
                    const ranked = await this.router.rankMemoriesByRelevance({
                        recentMessages: recent,
                        candidates: activeCandidates,
                        tokenBudget: memoryBudget,
                    });
                    localNeedDetail = ranked.needDetail;
                    const idToCandidate = new Map(activeCandidates.map((c) => [c.id, c]));
                    const reordered = ranked.rankedIds
                        .map((id) => idToCandidate.get(id))
                        .filter((c) => c !== undefined);
                    const unranked = activeCandidates.filter((c) => !ranked.rankedIds.includes(c.id));
                    activeCandidates = [...reordered, ...unranked];
                }
                else if (this.featureLlmRank) {
                    llmRankReason = `候选数 ${activeCandidates.length} <= 阈值 ${this.minCandidatesForLlmRank}，跳过精排`;
                }
                const budget = this.featureDynamicTopK ? memoryBudget : 900;
                const selected = this.router.selectMemoriesForInjection(activeCandidates, budget, this.memoryContentMaxChars, this.featureShortSummary);
                return {
                    status: 'success',
                    detail: {
                        keywordPrefilter: true,
                        candidatesCount: totalCandidates,
                        candidatesBreakdown: { long: longCount, mid: midCount },
                        deferredCount,
                        llmRankUsed,
                        llmRankReason,
                        needDetail: localNeedDetail,
                        injectedCount: selected.length,
                        memoryBudgetTokens: memoryBudget,
                        injectedMemories: selected.map((m) => ({
                            id: m.id,
                            type: m.type,
                            contentPreview: m.content.slice(0, 60),
                        })),
                    },
                    result: { selected, candidates: totalCandidates, needDetail: localNeedDetail },
                };
            });
            finalMemories = recallResult.selected;
            needDetail = recallResult.needDetail;
            candidatesCount = recallResult.candidates;
        }
        else {
            finalMemories = await trace.wrap('memory-recall', '记忆召回（全量）', async () => {
                const memories = await this.memory.getForInjection(this.memoryMidK);
                return {
                    status: 'success',
                    detail: {
                        keywordPrefilter: false,
                        injectedCount: memories.length,
                        reason: '关键词预筛未开启，使用全量注入',
                    },
                    result: memories,
                };
            });
        }
        const hitIds = finalMemories.map((m) => m.id);
        if (hitIds.length > 0) {
            this.memoryDecay.recordHits(hitIds).catch((err) => this.logger.warn(`Failed to record memory hits: ${err}`));
        }
        const activeAnchors = await this.identityAnchor.getActiveAnchors();
        const anchorText = this.identityAnchor.buildAnchorText(activeAnchors);
        const worldState = await this.worldState.get(conversationId);
        const growthContext = await this.cognitiveGrowth.getGrowthContext();
        const claimCtx = await this.buildClaimAndSessionContext(conversationId);
        const cognitiveState = this.cognitivePipeline.analyzeTurn({
            userInput: userMsg.content,
            recentMessages: recent,
            intentState: intentState ?? null,
            worldState,
            growthContext,
            claimSignals: claimCtx.claimSignals,
            sessionState: claimCtx.sessionState,
        });
        const boundaryPreflight = this.boundaryGovernance.buildPreflight(cognitiveState);
        const boundaryPrompt = {
            preflightText: this.boundaryGovernance.buildPreflightPrompt(boundaryPreflight) || null,
        };
        trace.add('cognitive-pipeline', '认知管道', 'success', {
            phase1: cognitiveState.phasePlan.phase1,
            phase2: cognitiveState.phasePlan.phase2,
            phase3: cognitiveState.phasePlan.phase3,
            situation: cognitiveState.situation.kind,
            userEmotion: cognitiveState.userState.emotion,
            userNeedMode: cognitiveState.userState.needMode,
            responseStrategy: cognitiveState.responseStrategy,
            rhythm: cognitiveState.rhythm,
            safety: cognitiveState.safety,
            growthContext,
            boundaryPreflight,
        });
        this.recordPipelineStep(trace, pipelineState, 'cognition', {
            path: 'chat',
            phasePlan: cognitiveState.phasePlan,
            situation: cognitiveState.situation,
            userState: cognitiveState.userState,
            responseStrategy: cognitiveState.responseStrategy,
            rhythm: cognitiveState.rhythm,
            safety: cognitiveState.safety,
            boundaryPreflight,
        });
        const userProfileText = this.buildInjectedUserProfileText(userProfile, {
            includeImpressionCore: this.featureImpressionCore,
            includeImpressionDetail: this.featureImpressionDetail && needDetail,
        });
        let messages = this.router.buildChatMessages({
            messages: recent,
            personaPrompt,
            expressionFields: this.persona.getExpressionFields(personaDto),
            userProfileText,
            memories: finalMemories,
            identityAnchor: anchorText,
            intentState: intentState ?? undefined,
            worldState,
            cognitiveState,
            growthContext,
            claimPolicyText: claimCtx.claimPolicyText,
            sessionStateText: claimCtx.sessionStateText,
            boundaryPrompt,
            metaFilterPolicy: personaDto.metaFilterPolicy,
        });
        const estimatedTokens = (0, token_estimator_1.estimateMessagesTokens)(messages.map((m) => ({ role: String(m.role), content: String(m.content ?? '') })));
        const truncated = estimatedTokens > this.maxContextTokens;
        if (truncated) {
            messages = (0, token_estimator_1.truncateToTokenBudget)(messages.map((m) => ({ role: String(m.role), content: String(m.content ?? '') })), this.maxContextTokens);
        }
        trace.add('prompt-build', 'Prompt 构建', 'success', {
            promptVersion: prompt_router_service_1.CHAT_PROMPT_VERSION,
            systemPromptTokens: (0, token_estimator_1.estimateTokens)(messages[0]?.content ?? ''),
            historyRounds: this.lastNRounds,
            actualMessagesUsed: recent.length,
            estimatedTotalTokens: estimatedTokens,
            maxContextTokens: this.maxContextTokens,
            truncated,
            systemPromptPreview: this.previewText(String(messages[0]?.content ?? ''), 480),
            impressionCoreInjected: this.featureImpressionCore && !!userProfile.impressionCore,
            impressionDetailInjected: this.featureImpressionDetail && needDetail && !!userProfile.impressionDetail,
        });
        this.recordPipelineStep(trace, pipelineState, 'expression', {
            path: 'chat',
            phase: 'pre-llm',
            promptVersion: prompt_router_service_1.CHAT_PROMPT_VERSION,
            systemPromptTokens: (0, token_estimator_1.estimateTokens)(messages[0]?.content ?? ''),
            inputMessages: messages.length,
            estimatedTotalTokens: estimatedTokens,
            truncated,
            model: this.llm.getModelInfo({ scenario: 'chat' }),
        });
        const rawReplyContent = await trace.wrap('llm-generate', '生成回复', async () => {
            const content = await this.llm.generate(messages, { scenario: 'chat' });
            return {
                status: 'success',
                detail: {
                    model: this.llm.getModelInfo({ scenario: 'chat' }),
                    inputMessages: messages.length,
                    mode: 'chat',
                },
                result: content,
            };
        });
        const filteredReplyContent = this.applyMetaLayerFilter(rawReplyContent, personaDto.metaFilterPolicy, trace, 'chat');
        const reviewedReply = this.boundaryGovernance.reviewGeneratedReply(filteredReplyContent, cognitiveState);
        if (reviewedReply.adjusted) {
            trace.add('boundary-governance', '边界治理复核', 'success', {
                adjusted: true,
                reasons: reviewedReply.reasons,
            });
        }
        const replyContent = reviewedReply.content;
        this.recordPipelineStep(trace, pipelineState, 'expression', {
            path: 'chat',
            phase: 'post-llm',
            rawLength: rawReplyContent.length,
            filteredLength: filteredReplyContent.length,
            finalLength: replyContent.length,
            metaAdjusted: rawReplyContent !== filteredReplyContent,
            boundaryAdjusted: reviewedReply.adjusted,
            boundaryReasons: reviewedReply.reasons,
        });
        this.pet.setStateWithAutoIdle('speaking', 3000);
        let assistantMsg = await this.prisma.message.create({
            data: { conversationId, role: 'assistant', content: replyContent, tokenCount: (0, token_estimator_1.estimateTokens)(replyContent) },
        });
        let dailyMomentMeta;
        const summarizeTrigger = this.shouldInstantSummarize(userMsg.content)
            ? 'instant'
            : 'threshold';
        const postPlan = {
            conversationId,
            turn: {
                turnId: userMsg.id,
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg.id,
                userInput: userMsg.content,
                assistantOutput: assistantMsg.content,
                now: new Date(),
            },
            context: {
                intentState: intentState ?? null,
                cognitiveState,
                isImportantIssueInProgress: cognitiveState.situation.kind === 'decision_support' ||
                    cognitiveState.situation.kind === 'advice_request' ||
                    cognitiveState.situation.kind === 'task_execution',
            },
            beforeReturn: [{ type: 'daily_moment_suggestion' }],
            afterReturn: [{ type: 'record_growth' }, { type: 'summarize_trigger', trigger: summarizeTrigger }],
        };
        await this.postTurnPipeline.runBeforeReturn(postPlan, async (task) => {
            if (task.type !== 'daily_moment_suggestion')
                return;
            const dailyMomentSuggestion = await this.runDailyMomentPostResponseHook({
                conversationId,
                intentState: intentState ?? null,
                isImportantIssueInProgress: !!postPlan.context.isImportantIssueInProgress,
                now: postPlan.turn.now,
            });
            if (!dailyMomentSuggestion)
                return;
            const mergedContent = `${assistantMsg.content}\n\n${dailyMomentSuggestion.hint}`;
            assistantMsg = await this.prisma.message.update({
                where: { id: assistantMsg.id },
                data: {
                    content: mergedContent,
                    tokenCount: (0, token_estimator_1.estimateTokens)(mergedContent),
                },
            });
            dailyMomentMeta = {
                mode: 'suggestion',
                suggestion: dailyMomentSuggestion,
            };
        });
        this.postTurnPipeline.runAfterReturn(postPlan, async (task) => this.runPostTurnTask(task, postPlan, { trace, userMsgId: userMsg.id, assistantMsgId: assistantMsg.id })).catch((err) => this.logger.warn(`Post-turn pipeline failed: ${String(err)}`));
        const debugMeta = this.featureDebugMeta ? {
            model: this.llm.getModelInfo({ scenario: 'chat' }),
            context: {
                historyRounds: this.lastNRounds,
                actualMessagesUsed: recent.length,
                estimatedTokens,
                maxContextTokens: this.maxContextTokens,
                truncated,
            },
            memory: {
                featureFlags: {
                    keywordPrefilter: this.featureKeywordPrefilter,
                    llmRank: this.featureLlmRank,
                    dynamicTopK: this.featureDynamicTopK,
                    impressionCore: this.featureImpressionCore,
                    impressionDetail: this.featureImpressionDetail,
                },
                candidatesCount,
                injectedCount: finalMemories.length,
                memoryBudgetTokens: memoryBudget,
                needDetail,
                claimInjectedCount: claimCtx.claimSignals.length,
                sessionStateInjected: !!claimCtx.sessionState,
                claimsInjected: claimCtx.injectedClaimsDebug.slice(0, 30),
                draftClaimsObserved: claimCtx.draftClaimsDebug.slice(0, 30),
            },
            prompt: {
                version: prompt_router_service_1.CHAT_PROMPT_VERSION,
                systemPromptTokens: (0, token_estimator_1.estimateTokens)(messages[0]?.content ?? ''),
                systemPromptPreview: this.previewText(String(messages[0]?.content ?? ''), 1400),
                messagePreview: messages.slice(0, 6).map((m) => ({
                    role: String(m.role),
                    content: this.previewText(String(m.content ?? ''), 240),
                })),
            },
            pipeline: this.buildPipelineSnapshot(pipelineState),
            turnTraceEvents: (0, turn_trace_adapter_1.adaptLegacyTraceToTurnEvents)({
                traceId: userMsg.id,
                conversationId,
                turnId: userMsg.id,
                steps: trace.getTrace(),
            }),
        } : undefined;
        return {
            userMessage: {
                id: userMsg.id,
                role: userMsg.role,
                content: userMsg.content,
                createdAt: userMsg.createdAt,
            },
            assistantMessage: {
                id: assistantMsg.id,
                role: assistantMsg.role,
                content: assistantMsg.content,
                createdAt: assistantMsg.createdAt,
            },
            injectedMemories: finalMemories,
            ...(dailyMomentMeta && { dailyMoment: dailyMomentMeta }),
            ...(debugMeta && { debugMeta }),
            trace: trace.getTrace(),
        };
    }
    async runPostTurnTask(task, plan, input) {
        if (task.type === 'record_growth') {
            if (!plan.context.cognitiveState)
                return;
            await this.cognitiveGrowth.recordTurnGrowth(plan.context.cognitiveState, [
                input.userMsgId,
                input.assistantMsgId,
            ]);
            return;
        }
        if (task.type === 'summarize_trigger') {
            if (task.trigger === 'instant') {
                input.trace?.add('auto-summarize', '即时总结（关键词触发）', 'success', {
                    trigger: 'instant',
                    keyword: plan.turn.userInput.slice(0, 30),
                });
                await this.instantSummarize(plan.conversationId, plan.turn.userInput, input.trace);
                return;
            }
            await this.maybeAutoSummarize(plan.conversationId, input.trace);
            return;
        }
    }
    async runDailyMomentPostResponseHook(input) {
        const recentMessages = await this.getLastNDailyMomentMessages(input.conversationId);
        if (recentMessages.length < 3)
            return null;
        const suggestionCheck = await this.dailyMoment.maybeSuggest({
            conversationId: input.conversationId,
            recentMessages,
            now: input.now,
            triggerContext: {
                intentMode: input.intentState?.mode ?? null,
                intentRequiresTool: input.intentState?.requiresTool ?? false,
                intentSeriousness: input.intentState?.seriousness ?? null,
                detectedEmotion: input.intentState?.detectedEmotion ?? null,
                isImportantIssueInProgress: input.isImportantIssueInProgress,
            },
        });
        return suggestionCheck.shouldSuggest ? suggestionCheck.suggestion ?? null : null;
    }
    async buildClaimAndSessionContext(conversationId) {
        const claimSignals = [];
        let claimPolicyText = '';
        let sessionState = null;
        let sessionStateText = '';
        const injectedClaimsDebug = [];
        let draftClaimsDebug = [];
        if (this.claimConfig.readNewEnabled && this.claimConfig.injectionEnabled) {
            const topByType = {
                JUDGEMENT_PATTERN: 3,
                VALUE: 3,
                INTERACTION_PREFERENCE: 6,
                EMOTIONAL_TENDENCY: 3,
                RELATION_RHYTHM: 2,
            };
            const rows = await this.claimSelector.getInjectableClaims('default-user', topByType, {
                typePriority: [
                    'INTERACTION_PREFERENCE',
                    'RELATION_RHYTHM',
                    'EMOTIONAL_TENDENCY',
                    'JUDGEMENT_PATTERN',
                    'VALUE',
                ],
            });
            for (const row of rows) {
                const value = typeof row.valueJson === 'string'
                    ? row.valueJson
                    : JSON.stringify(row.valueJson);
                injectedClaimsDebug.push({
                    type: row.type,
                    key: row.key,
                    confidence: row.confidence,
                    status: row.status,
                });
                claimSignals.push({
                    type: row.type,
                    key: row.key,
                    value,
                    confidence: row.confidence,
                });
            }
            if (claimSignals.length > 0) {
                const header = '[长期 Claims（stable/core）]';
                const lines = [header];
                let used = (0, token_estimator_1.estimateTokens)(header);
                for (const c of claimSignals.slice(0, 20)) {
                    const line = `- [${c.type}] ${c.key}=${c.value} (conf=${c.confidence.toFixed(2)})`;
                    const t = (0, token_estimator_1.estimateTokens)(line);
                    if (used + t > this.claimConfig.injectionTokenBudget)
                        break;
                    lines.push(line);
                    used += t;
                }
                claimPolicyText = lines.join('\n');
            }
        }
        if (this.claimConfig.readNewEnabled && this.claimConfig.sessionStateInjectionEnabled) {
            const fresh = await this.sessionStateStore.getFreshState('default-user', conversationId);
            if (fresh && typeof fresh.stateJson === 'object') {
                const data = fresh.stateJson;
                const safe = {};
                const mood = typeof data.mood === 'string' ? data.mood : undefined;
                const energy = typeof data.energy === 'string' ? data.energy : undefined;
                const focus = typeof data.focus === 'string' ? data.focus : undefined;
                const taskIntent = typeof data.taskIntent === 'string' ? data.taskIntent : undefined;
                if (mood)
                    safe.mood = mood;
                if (energy)
                    safe.energy = energy;
                if (focus)
                    safe.focus = focus;
                if (taskIntent)
                    safe.taskIntent = taskIntent;
                safe.confidence = fresh.confidence;
                if (Object.keys(safe).length > 0) {
                    sessionState = safe;
                    const lines = [
                        '[SessionState（TTL 内短期状态）]',
                        mood ? `- mood: ${mood}` : '',
                        energy ? `- energy: ${energy}` : '',
                        focus ? `- focus: ${focus}` : '',
                        taskIntent ? `- taskIntent: ${taskIntent}` : '',
                        `- confidence: ${fresh.confidence.toFixed(2)}`,
                    ].filter(Boolean);
                    sessionStateText = lines.join('\n');
                }
            }
        }
        if (this.featureDebugMeta && this.claimConfig.readNewEnabled) {
            const rows = await this.claimSelector.getDraftClaimsForDebug('default-user', {
                perTypeLimit: 6,
                totalLimit: 60,
            });
            draftClaimsDebug = rows.map((r) => ({
                type: r.type,
                key: r.key,
                confidence: r.confidence,
                status: r.status,
            }));
        }
        return { claimSignals, claimPolicyText, sessionState, sessionStateText, injectedClaimsDebug, draftClaimsDebug };
    }
    applyMetaLayerFilter(content, policy, trace, path) {
        const filtered = this.metaLayer.filter(content, policy);
        if (filtered.adjusted) {
            trace?.add('meta-layer', 'Meta Layer 过滤', 'success', {
                adjusted: true,
                reasons: filtered.reasons,
                removedSegments: filtered.removedSegments,
                rewrittenSegments: filtered.rewrittenSegments,
                path: path ?? 'unknown',
            });
        }
        return filtered.content;
    }
    createPipelineTraceState() {
        return {
            currentStep: 'idle',
            events: 0,
            seen: new Set(),
            firstSeenOrder: [],
            canonicalOrder: ['cognition', 'decision', 'expression'],
            canonicalMatchSoFar: true,
        };
    }
    buildPipelineSnapshot(state) {
        const strictCanonical = state.firstSeenOrder.length === state.canonicalOrder.length
            && state.firstSeenOrder.every((step, index) => step === state.canonicalOrder[index]);
        return {
            currentStep: state.currentStep,
            events: state.events,
            firstSeenOrder: [...state.firstSeenOrder],
            canonicalOrder: [...state.canonicalOrder],
            canonicalMatchSoFar: state.canonicalMatchSoFar,
            strictCanonical,
        };
    }
    advancePipelineState(state, step) {
        state.events += 1;
        state.currentStep = step;
        if (!state.seen.has(step)) {
            state.seen.add(step);
            state.firstSeenOrder.push(step);
            state.canonicalMatchSoFar = state.firstSeenOrder.every((name, index) => state.canonicalOrder[index] === name);
        }
    }
    recordPipelineStep(_trace, state, step, _detail, _status = 'success') {
        state.events += 1;
        state.currentStep = step;
        if (!state.seen.has(step)) {
            state.seen.add(step);
            state.firstSeenOrder.push(step);
            state.canonicalMatchSoFar = state.firstSeenOrder.every((name, index) => state.canonicalOrder[index] === name);
        }
    }
    previewText(text, maxChars) {
        if (text.length <= maxChars)
            return text;
        return `${text.slice(0, maxChars)}…`;
    }
    static IDENTITY_LABEL_MAP = {
        city: 'location',
        timezone: 'timezone',
        language: 'language',
        conversationMode: 'custom',
    };
    async writeIdentityUpdate(update, trace) {
        const entries = Object.entries(update).filter((e) => typeof e[1] === 'string' && e[1].length > 0);
        if (entries.length === 0)
            return;
        const anchors = await this.identityAnchor.getActiveAnchors();
        const written = [];
        for (const [key, value] of entries) {
            const label = ConversationService_1.IDENTITY_LABEL_MAP[key];
            if (!label)
                continue;
            const existing = anchors.find((a) => a.label === label);
            if (existing) {
                if (existing.content !== value) {
                    await this.identityAnchor.update(existing.id, { content: value });
                    written.push(`${label}: ${existing.content} → ${value}`);
                }
            }
            else if (anchors.length < 5) {
                await this.identityAnchor.create({ label, content: value });
                anchors.push({ label, content: value });
                written.push(`${label}: (new) ${value}`);
            }
            else {
                this.logger.warn(`IdentityAnchor at capacity (5), skipping: ${label}=${value}`);
            }
        }
        if (written.length > 0) {
            trace.add('identity-update', '身份锚定更新', 'success', { written });
            this.logger.log(`Identity anchors updated: ${written.join('; ')}`);
        }
    }
    async maybeAutoSummarize(conversationId, trace) {
        if (!this.featureAutoSummarize)
            return;
        if (this.summarizingConversations.has(conversationId))
            return;
        const conv = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                summarizedAt: true,
                _count: { select: { messages: true } },
            },
        });
        if (!conv)
            return;
        const newUserMessages = await this.prisma.message.count({
            where: {
                conversationId,
                role: 'user',
                ...(conv.summarizedAt ? { createdAt: { gt: conv.summarizedAt } } : {}),
            },
        });
        if (newUserMessages < this.autoSummarizeThreshold)
            return;
        trace?.add('auto-summarize', '自动总结（阈值触发）', 'success', {
            trigger: 'threshold',
            newUserMessages,
            threshold: this.autoSummarizeThreshold,
        });
        this.summarizingConversations.add(conversationId);
        try {
            this.logger.log(`Auto-summarize triggered: ${newUserMessages} new user messages (threshold: ${this.autoSummarizeThreshold})`);
            const newMessageIds = conv.summarizedAt
                ? (await this.prisma.message.findMany({
                    where: { conversationId, createdAt: { gt: conv.summarizedAt } },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                })).map(m => m.id)
                : undefined;
            const result = await this.summarizer.summarize(conversationId, newMessageIds);
            if (result.created > 0) {
                await this.triggerAutoEvolution(conversationId, trace);
            }
        }
        finally {
            this.summarizingConversations.delete(conversationId);
        }
    }
    shouldInstantSummarize(userContent) {
        if (!this.featureInstantSummarize)
            return false;
        return ConversationService_1.INSTANT_SUMMARIZE_RE.test(userContent);
    }
    async instantSummarize(conversationId, userContent, trace) {
        if (this.summarizingConversations.has(conversationId))
            return;
        this.summarizingConversations.add(conversationId);
        try {
            this.logger.log(`Instant-summarize triggered by keyword in: "${userContent.slice(0, 30)}..."`);
            const conv = await this.prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { summarizedAt: true },
            });
            const newMessageIds = conv?.summarizedAt
                ? (await this.prisma.message.findMany({
                    where: { conversationId, createdAt: { gt: conv.summarizedAt } },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' },
                })).map(m => m.id)
                : undefined;
            const result = await this.summarizer.summarize(conversationId, newMessageIds);
            if (result.created > 0) {
                await this.triggerAutoEvolution(conversationId, trace);
            }
        }
        finally {
            this.summarizingConversations.delete(conversationId);
        }
    }
    buildInjectedUserProfileText(profile, opts) {
        return this.userProfile.buildPrompt({
            ...profile,
            impressionCore: opts.includeImpressionCore ? profile.impressionCore : null,
            impressionDetail: opts.includeImpressionDetail ? profile.impressionDetail : null,
        });
    }
    async triggerAutoEvolution(conversationId, trace) {
        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        if (messages.length === 0)
            return;
        const recent = messages.reverse().map(m => ({ role: m.role, content: m.content }));
        const result = await this.persona.suggestEvolution(recent);
        if (result.changes.length > 0) {
            const isUserPref = (field) => field === 'preferredVoiceStyle'
                || field === 'praisePreference'
                || field === 'responseRhythm';
            const preferenceChanges = result.changes.filter((c) => isUserPref(c.targetField ?? c.field));
            const personaChanges = result.changes.filter((c) => !isUserPref(c.targetField ?? c.field));
            if (preferenceChanges.length > 0) {
                const applied = await this.persona.confirmEvolution(preferenceChanges);
                trace?.add('auto-evolution', '用户偏好自动应用', applied.accepted ? 'success' : 'fail', {
                    autoAppliedPreferences: preferenceChanges.length,
                    accepted: applied.accepted,
                    reason: applied.reason,
                });
            }
            if (personaChanges.length === 0) {
                this.logger.log(`Auto-evolution: auto-applied ${preferenceChanges.length} user-preference changes, no persona changes pending`);
                return;
            }
            this.evolutionScheduler.setPendingSuggestion({
                changes: personaChanges,
                triggerReason: '自动总结后触发',
                createdAt: new Date(),
            });
            trace?.add('auto-evolution', '人格进化建议', 'success', {
                suggestionsCount: personaChanges.length,
                fields: personaChanges.map(c => c.field),
                autoAppliedPreferences: preferenceChanges.length,
            });
            this.logger.log(`Auto-evolution: ${personaChanges.length} persona suggestions pending, ${preferenceChanges.length} preference changes auto-applied`);
        }
    }
    async flushSummarize(conversationId) {
        const conv = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { summarizedAt: true },
        });
        if (!conv)
            return { flushed: false };
        const unsummarizedCount = await this.prisma.message.count({
            where: {
                conversationId,
                role: 'user',
                ...(conv.summarizedAt ? { createdAt: { gt: conv.summarizedAt } } : {}),
            },
        });
        if (unsummarizedCount < 5)
            return { flushed: false };
        const newMessageIds = conv.summarizedAt
            ? (await this.prisma.message.findMany({
                where: { conversationId, createdAt: { gt: conv.summarizedAt } },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
            })).map(m => m.id)
            : undefined;
        this.summarizer.summarize(conversationId, newMessageIds).catch((err) => this.logger.warn(`Flush-summarize failed: ${err.message}`));
        return { flushed: true };
    }
};
exports.ConversationService = ConversationService;
exports.ConversationService = ConversationService = ConversationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_service_1.LlmService,
        prompt_router_service_1.PromptRouterService,
        memory_service_1.MemoryService,
        memory_decay_service_1.MemoryDecayService,
        persona_service_1.PersonaService,
        user_profile_service_1.UserProfileService,
        intent_service_1.IntentService,
        openclaw_service_1.OpenClawService,
        task_formatter_service_1.TaskFormatterService,
        capability_registry_service_1.CapabilityRegistry,
        weather_skill_service_1.WeatherSkillService,
        world_state_service_1.WorldStateService,
        identity_anchor_service_1.IdentityAnchorService,
        pet_service_1.PetService,
        summarizer_service_1.SummarizerService,
        evolution_scheduler_service_1.EvolutionSchedulerService,
        cognitive_pipeline_service_1.CognitivePipelineService,
        cognitive_growth_service_1.CognitiveGrowthService,
        boundary_governance_service_1.BoundaryGovernanceService,
        meta_layer_service_1.MetaLayerService,
        claim_engine_config_1.ClaimEngineConfig,
        claim_selector_service_1.ClaimSelectorService,
        session_state_service_1.SessionStateService,
        daily_moment_service_1.DailyMomentService,
        assistant_orchestrator_service_1.AssistantOrchestrator,
        tool_executor_registry_service_1.ToolExecutorRegistry,
        skill_runner_service_1.SkillRunner,
        post_turn_pipeline_1.PostTurnPipeline,
        config_1.ConfigService])
], ConversationService);
//# sourceMappingURL=conversation.service.js.map