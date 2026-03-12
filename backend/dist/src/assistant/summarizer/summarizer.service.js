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
var SummarizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummarizerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../infra/prisma.service");
const llm_service_1 = require("../../infra/llm/llm.service");
const prompt_router_service_1 = require("../prompt-router/prompt-router.service");
const memory_service_1 = require("../memory/memory.service");
const memory_write_guard_service_1 = require("../memory/memory-write-guard.service");
const user_profile_service_1 = require("../persona/user-profile.service");
const identity_anchor_service_1 = require("../identity-anchor/identity-anchor.service");
const memory_category_1 = require("../memory/memory-category");
const claim_engine_config_1 = require("../claim-engine/claim-engine.config");
const claim_update_service_1 = require("../claim-engine/claim-update.service");
const session_state_service_1 = require("../claim-engine/session-state.service");
const claim_schema_registry_1 = require("../claim-engine/claim-schema.registry");
const COGNITIVE_TYPE_SET = new Set(memory_category_1.COGNITIVE_CATEGORIES);
let SummarizerService = SummarizerService_1 = class SummarizerService {
    prisma;
    llm;
    router;
    memory;
    writeGuard;
    userProfile;
    anchor;
    claimConfig;
    claimUpdater;
    sessionState;
    featureAutoImpression;
    featureAutoAnchor;
    featureImpressionRequireConfirm;
    logger = new common_1.Logger(SummarizerService_1.name);
    constructor(prisma, llm, router, memory, writeGuard, userProfile, anchor, claimConfig, claimUpdater, sessionState, config) {
        this.prisma = prisma;
        this.llm = llm;
        this.router = router;
        this.memory = memory;
        this.writeGuard = writeGuard;
        this.userProfile = userProfile;
        this.anchor = anchor;
        this.claimConfig = claimConfig;
        this.claimUpdater = claimUpdater;
        this.sessionState = sessionState;
        this.featureAutoImpression = config.get('FEATURE_AUTO_IMPRESSION') !== 'false';
        this.featureAutoAnchor = config.get('FEATURE_AUTO_ANCHOR') !== 'false';
        this.featureImpressionRequireConfirm = config.get('FEATURE_IMPRESSION_REQUIRE_CONFIRM') === 'true';
    }
    async summarize(conversationId, messageIds) {
        let messages;
        if (messageIds?.length) {
            const list = await this.prisma.message.findMany({
                where: { id: { in: messageIds }, conversationId },
                orderBy: { createdAt: 'asc' },
            });
            messages = list.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
            }));
        }
        else {
            const list = await this.prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'desc' },
                take: 20,
            });
            messages = list
                .reverse()
                .map((m) => ({ id: m.id, role: m.role, content: m.content }));
        }
        const ids = messages.map((m) => m.id);
        const existingCognitive = await this.memory.getExistingCognitiveMemories();
        const promptMessages = this.router.buildMemoryAnalysisMessages({
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            messageIds: ids,
            existingCognitive,
        });
        const raw = await this.llm.generate(promptMessages, { scenario: 'summary' });
        const parsed = this.parseMemoryAnalysisJson(raw);
        const created = [];
        const confidenceBumps = [];
        let merged = 0;
        let overwritten = 0;
        let skipped = 0;
        let claimAttempted = 0;
        let claimWritten = 0;
        const claimRejectedSamples = [];
        if (this.claimConfig.writeDualEnabled) {
            await this.writeSessionStateIfPresent(conversationId, parsed);
        }
        if (!parsed || !parsed.shouldUpdate || !parsed.updates?.length) {
            await this.prisma.conversation.update({
                where: { id: conversationId },
                data: { summarizedAt: new Date() },
            });
            return {
                created: 0,
                memories: [],
                merged: 0,
                overwritten: 0,
                skipped: 0,
                doNotStore: parsed?.doNotStore,
            };
        }
        for (const u of parsed.updates) {
            const type = (u.type || '').toLowerCase();
            const memoryType = type === 'relation_rhythm' ? 'rhythm_pattern' : type;
            const claimType = this.mapLegacyTypeToClaimType(type);
            const confidence = Math.max(0, Math.min(1, Number(u.confidence) || 0.5));
            const mappingConfidence = Math.max(0, Math.min(1, Number(u.mappingConfidence) || 0.7));
            const polarity = this.normalizePolarity(u.polarity ?? u.evidence?.polarity);
            if (this.claimConfig.writeDualEnabled && claimType) {
                const isInteraction = claimType === 'INTERACTION_PREFERENCE';
                const isEmotion = claimType === 'EMOTIONAL_TENDENCY';
                const allowed = (!isInteraction || this.claimConfig.writeInteractionEnabled) &&
                    (!isEmotion || this.claimConfig.writeEmotionEnabled);
                if (allowed) {
                    claimAttempted++;
                    const originalKey = typeof u.key === 'string' ? u.key.trim() : '';
                    let validation = claim_schema_registry_1.ClaimSchemaRegistry.validateAny(originalKey, u.valueJson);
                    if (validation.ok
                        && validation.kind === 'canonical'
                        && mappingConfidence < this.claimConfig.canonicalMappingThreshold) {
                        const fallbackKey = this.buildDraftKey(type, originalKey, u.content);
                        const fallback = claim_schema_registry_1.ClaimSchemaRegistry.validateDraft(fallbackKey, u.valueJson);
                        if (fallback.ok) {
                            validation = fallback;
                            this.logger.debug(`[claim-write] downgraded canonical to draft key=${originalKey} mappingConfidence=${mappingConfidence.toFixed(2)} threshold=${this.claimConfig.canonicalMappingThreshold.toFixed(2)} -> ${fallback.key}`);
                        }
                    }
                    if (!validation.ok && this.claimConfig.draftEnabled) {
                        const fallbackKey = this.buildDraftKey(type, originalKey || type, u.content);
                        const fallback = claim_schema_registry_1.ClaimSchemaRegistry.validateDraft(fallbackKey, u.valueJson);
                        if (fallback.ok) {
                            validation = fallback;
                            this.logger.debug(`[claim-write] coerced invalid key=${originalKey} to draft key=${fallback.key}`);
                        }
                    }
                    if (!validation.ok) {
                        claimRejectedSamples.push({ type, key: u.key, reason: validation.reason });
                        this.logger.debug(`[claim-write] rejected ${type} key=${u.key ?? ''}: ${validation.reason}`);
                    }
                    else {
                        if (validation.kind === 'draft' && !this.claimConfig.draftEnabled) {
                            const reason = 'draft claims are disabled by FEATURE_CLAIM_DRAFT_ENABLED';
                            claimRejectedSamples.push({ type, key: validation.key, reason });
                            this.logger.debug(`[claim-write] rejected ${type} key=${validation.key}: ${reason}`);
                            continue;
                        }
                        const expect = claimType === 'JUDGEMENT_PATTERN'
                            ? ['jp.', 'draft.jp.']
                            : claimType === 'VALUE'
                                ? ['vp.', 'draft.vp.']
                                : claimType === 'RELATION_RHYTHM'
                                    ? ['rr.', 'draft.rr.']
                                    : claimType === 'INTERACTION_PREFERENCE'
                                        ? ['ip.', 'draft.ip.']
                                        : ['et.', 'draft.et.'];
                        const okPrefix = expect.some((p) => validation.key.startsWith(p));
                        if (!okPrefix) {
                            const reason = `key prefix does not match claimType=${claimType}`;
                            claimRejectedSamples.push({ type, key: validation.key, reason });
                            this.logger.debug(`[claim-write] rejected ${type} key=${validation.key}: ${reason}`);
                            continue;
                        }
                        try {
                            await this.writeClaimDraft(conversationId, ids, {
                                type,
                                key: validation.key,
                                valueJson: validation.valueJson,
                                confidence,
                                polarity,
                                contextTags: u.contextTags,
                                evidence: u.evidence,
                            });
                            claimWritten++;
                        }
                        catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            claimRejectedSamples.push({ type, key: u.key, reason: msg });
                            this.logger.debug(`[claim-write] failed ${type} key=${u.key ?? ''}: ${msg}`);
                        }
                    }
                }
            }
            if (!COGNITIVE_TYPE_SET.has(memoryType)) {
                continue;
            }
            const content = (u.content || u.key || '').trim().slice(0, 30);
            if (!content) {
                skipped++;
                continue;
            }
            if (u.mergeTargetId) {
                const bumped = await this.memory.bumpConfidence(u.mergeTargetId, 0.1);
                if (bumped) {
                    confidenceBumps.push({
                        memoryId: bumped.id,
                        newConfidence: bumped.confidence,
                    });
                }
                continue;
            }
            const decision = await this.writeGuard.evaluate({
                type: 'long',
                category: memoryType,
                content,
                sourceMessageIds: ids,
                confidence,
                isNegation: polarity === 'CONTRA',
                isOneOff: false,
            });
            switch (decision.decision) {
                case memory_category_1.WriteDecision.WRITE: {
                    const mem = await this.memory.create({
                        type: 'long',
                        content,
                        sourceMessageIds: ids,
                        category: memoryType,
                        confidence,
                    });
                    created.push({
                        id: mem.id,
                        type: mem.type,
                        category: mem.category,
                        content: mem.content,
                    });
                    break;
                }
                case memory_category_1.WriteDecision.MERGE: {
                    if (decision.targetMemoryId && COGNITIVE_TYPE_SET.has(memoryType)) {
                        const bumped = await this.memory.bumpConfidence(decision.targetMemoryId, 0.1);
                        if (bumped) {
                            confidenceBumps.push({
                                memoryId: bumped.id,
                                newConfidence: bumped.confidence,
                            });
                            merged++;
                        }
                    }
                    else if (decision.targetMemoryId) {
                        await this.memory.mergeInto(decision.targetMemoryId, content, ids);
                        merged++;
                    }
                    break;
                }
                case memory_category_1.WriteDecision.OVERWRITE: {
                    if (decision.targetMemoryId) {
                        await this.memory.update(decision.targetMemoryId, {
                            content,
                            confidence,
                        });
                        overwritten++;
                    }
                    break;
                }
                case memory_category_1.WriteDecision.WRITE_AND_LINK:
                case memory_category_1.WriteDecision.SKIP:
                default:
                    skipped++;
                    break;
            }
        }
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { summarizedAt: new Date() },
        });
        if (this.featureAutoImpression && created.length > 0) {
            this.extractAndUpdateImpression(messages).catch((err) => this.logger.warn(`Auto-impression failed: ${err.message}`));
        }
        if (this.featureAutoAnchor && created.length > 0) {
            this.extractAndUpdateAnchor(messages).catch((err) => this.logger.warn(`Auto-anchor failed: ${err.message}`));
        }
        const pendingCanonicalSuggestions = this.claimConfig.writeDualEnabled && this.claimConfig.draftEnabled
            ? await this.prisma.$queryRaw `
            SELECT
              "type"::TEXT AS "type",
              "key",
              "confidence",
              "evidenceCount",
              "counterEvidenceCount",
              "createdAt",
              "updatedAt",
              "lastSeenAt"
            FROM "UserClaim"
            WHERE "userKey" = 'default-user'
              AND "key" LIKE 'draft.%'
              AND "status" IN ('CANDIDATE', 'WEAK')
              AND "evidenceCount" >= 3
              AND "counterEvidenceCount" <= 1
              AND "createdAt" <= (CURRENT_TIMESTAMP - INTERVAL '7 days')
            ORDER BY "confidence" DESC, "evidenceCount" DESC, "updatedAt" DESC
            LIMIT 12
          `
            : undefined;
        return {
            created: created.length,
            memories: created,
            merged,
            overwritten,
            skipped,
            doNotStore: parsed.doNotStore,
            confidenceBumps: confidenceBumps.length > 0 ? confidenceBumps : undefined,
            ...(this.claimConfig.writeDualEnabled
                ? {
                    claimWriteReport: {
                        attempted: claimAttempted,
                        written: claimWritten,
                        rejected: Math.max(0, claimAttempted - claimWritten),
                        ...(claimRejectedSamples.length > 0
                            ? { rejectedSamples: claimRejectedSamples.slice(0, 8) }
                            : {}),
                    },
                }
                : {}),
            ...(pendingCanonicalSuggestions && pendingCanonicalSuggestions.length > 0
                ? { pendingCanonicalSuggestions }
                : {}),
        };
    }
    async extractAndUpdateImpression(messages) {
        const profile = await this.userProfile.getOrCreate();
        const dialogue = messages
            .map((m) => `${m.role === 'user' ? '她' : '小晴'}: ${m.content}`)
            .join('\n');
        const prompt = [
            {
                role: 'system',
                content: `你是印象分析器。根据以下对话，判断是否需要更新"你对她的印象"。
当前印象核心：${profile.impressionCore || '（空）'}

规则：
- 只提取稳定的、跨多次对话仍成立的印象变化
- 不记录一次性情绪（"今天有点累"不算，"经常因为工作压力失眠"算）
- core: 一句话概括整体感觉变化（≤50字），追加到现有印象后
- 如果没有值得更新的，返回 shouldUpdate: false

输出严格 JSON：
{ "shouldUpdate": boolean, "core": "string or null" }`,
            },
            { role: 'user', content: dialogue },
        ];
        const raw = await this.llm.generate(prompt, { scenario: 'summary' });
        const parsed = this.parseImpressionJson(raw);
        if (!parsed?.shouldUpdate || !parsed.core)
            return;
        try {
            await this.userProfile.updateImpression({
                action: 'append',
                target: 'core',
                content: parsed.core,
                confirmed: !this.featureImpressionRequireConfirm,
            });
            this.logger.log(`Impression updated: ${parsed.core}`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('exceeds token budget')) {
                this.logger.warn(`Impression core at capacity, skipping: ${parsed.core}`);
            }
            else {
                throw err;
            }
        }
    }
    parseImpressionJson(raw) {
        const trimmed = raw.trim();
        const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
        let jsonStr = codeBlock ? codeBlock[1].trim() : trimmed;
        if (!codeBlock) {
            const start = jsonStr.indexOf('{');
            const end = jsonStr.lastIndexOf('}');
            if (start !== -1 && end > start)
                jsonStr = jsonStr.slice(start, end + 1);
        }
        try {
            return JSON.parse(jsonStr);
        }
        catch {
            return null;
        }
    }
    async extractAndUpdateAnchor(messages) {
        const activeAnchors = await this.anchor.getActiveAnchors();
        const existingText = activeAnchors.length > 0
            ? activeAnchors
                .map((a) => `- id=${a.id} [${a.label}] ${a.content}`)
                .join('\n')
            : '（空）';
        const dialogue = messages
            .map((m) => `${m.role === 'user' ? '她' : '小晴'}: ${m.content}`)
            .join('\n');
        const prompt = [
            {
                role: 'system',
                content: `你是身份锚定提取器。根据对话，判断是否需要创建或更新她的身份锚点。

当前身份锚点：
${existingText}

label 类型：
- basic: 姓名、昵称、年龄等基本身份
- location: 居住地、常驻城市
- occupation: 工作、职位、行业、公司
- interest: 爱好、专长、兴趣领域
- custom: 其他重要身份特征

规则：
- 只提取用户本人明确说出的身份事实
- 不猜测、不推断、不从语气或话题推导
- 如果用户更正了之前的信息（如搬家、换工作），使用 update 并指定 existingId
- 如果是全新维度的信息，使用 create
- 每条 content ≤ 30字，简洁概括
- 如果没有值得提取的身份信息，返回 shouldUpdate: false

输出严格 JSON：
{
  "shouldUpdate": boolean,
  "anchors": [
    { "label": "location", "content": "住在上海浦东新区", "action": "create" },
    { "label": "basic", "content": "更新后的内容", "action": "update", "existingId": "xxx" }
  ]
}`,
            },
            { role: 'user', content: dialogue },
        ];
        const raw = await this.llm.generate(prompt, { scenario: 'summary' });
        const parsed = this.parseAnchorJson(raw);
        if (!parsed?.shouldUpdate || !parsed.anchors?.length)
            return;
        for (const item of parsed.anchors) {
            const label = (item.label || '').toLowerCase();
            const content = (item.content || '').trim().slice(0, 30);
            if (!content)
                continue;
            try {
                if (item.action === 'update' && item.existingId) {
                    await this.anchor.update(item.existingId, { content, label });
                    this.logger.log(`Anchor updated [${label}]: ${content}`);
                }
                else {
                    await this.anchor.create({ label, content });
                    this.logger.log(`Anchor created [${label}]: ${content}`);
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('上限')) {
                    this.logger.warn(`Anchor limit reached, skipping: [${label}] ${content}`);
                }
                else {
                    this.logger.warn(`Anchor write failed: ${msg}`);
                }
            }
        }
    }
    parseAnchorJson(raw) {
        const trimmed = raw.trim();
        const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
        let jsonStr = codeBlock ? codeBlock[1].trim() : trimmed;
        if (!codeBlock) {
            const start = jsonStr.indexOf('{');
            const end = jsonStr.lastIndexOf('}');
            if (start !== -1 && end > start)
                jsonStr = jsonStr.slice(start, end + 1);
        }
        try {
            return JSON.parse(jsonStr);
        }
        catch {
            return null;
        }
    }
    parseMemoryAnalysisJson(raw) {
        const trimmed = raw.trim();
        const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
        let jsonStr = codeBlock ? codeBlock[1].trim() : trimmed;
        if (!codeBlock) {
            const start = jsonStr.indexOf('{');
            const end = jsonStr.lastIndexOf('}');
            if (start !== -1 && end > start)
                jsonStr = jsonStr.slice(start, end + 1);
        }
        try {
            return JSON.parse(jsonStr);
        }
        catch {
            return null;
        }
    }
    normalizePolarity(input) {
        const value = (input || '').toUpperCase();
        if (value === 'CONTRA')
            return 'CONTRA';
        if (value === 'NEUTRAL')
            return 'NEUTRAL';
        return 'SUPPORT';
    }
    mapLegacyTypeToClaimType(type) {
        if (type === 'judgment_pattern')
            return 'JUDGEMENT_PATTERN';
        if (type === 'value_priority')
            return 'VALUE';
        if (type === 'rhythm_pattern')
            return 'RELATION_RHYTHM';
        if (type === 'relation_rhythm')
            return 'RELATION_RHYTHM';
        if (type === 'interaction_preference')
            return 'INTERACTION_PREFERENCE';
        if (type === 'emotional_tendency')
            return 'EMOTIONAL_TENDENCY';
        return null;
    }
    async writeClaimDraft(conversationId, messageIds, input) {
        const claimType = this.mapLegacyTypeToClaimType(input.type);
        if (!claimType)
            return;
        const messageId = input.evidence?.messageId || messageIds[messageIds.length - 1];
        const snippet = (input.evidence?.snippet || input.key).trim().slice(0, 40);
        const weight = Number.isFinite(Number(input.evidence?.weight))
            ? Math.max(0, Math.min(1, Number(input.evidence?.weight)))
            : 1;
        await this.claimUpdater.upsertFromDraft({
            type: claimType,
            key: input.key,
            value: input.valueJson,
            confidence: input.confidence,
            sourceModel: this.llm.getModelInfo({ scenario: 'summary' }).modelName,
            contextTags: input.contextTags ?? [],
            evidence: {
                messageId,
                sessionId: conversationId,
                snippet,
                polarity: input.polarity,
                weight,
            },
        });
    }
    async writeSessionStateIfPresent(conversationId, parsed) {
        if (!parsed?.sessionState)
            return;
        const state = parsed.sessionState;
        const confidence = Math.max(0, Math.min(1, Number(state.confidence) || 0.6));
        const ttlSeconds = Math.max(600, Math.min(86400, Number(state.ttlSeconds) || 21600));
        const payload = {};
        if (state.mood)
            payload.mood = state.mood;
        if (state.energy)
            payload.energy = state.energy;
        if (state.focus)
            payload.focus = state.focus;
        if (state.taskIntent)
            payload.taskIntent = state.taskIntent;
        if (Object.keys(payload).length === 0)
            return;
        await this.sessionState.upsertState({
            sessionId: conversationId,
            state: payload,
            confidence,
            ttlSeconds,
            sourceModel: this.llm.getModelInfo({ scenario: 'summary' }).modelName,
        });
    }
    buildDraftKey(type, rawKey, content) {
        const prefix = this.getDraftPrefix(type);
        const seed = (rawKey && rawKey.trim().length > 0 ? rawKey : content || 'candidate').toLowerCase();
        const suffix = seed
            .replace(/^(draft\.)?(ip|jp|vp|rr|et)\./, '')
            .replace(/[^a-z0-9._-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^\.+|\.+$/g, '')
            .slice(0, 40);
        const key = `${prefix}${suffix || 'candidate'}`;
        return key.slice(0, 40);
    }
    getDraftPrefix(type) {
        if (type === 'judgment_pattern')
            return 'draft.jp.';
        if (type === 'value_priority')
            return 'draft.vp.';
        if (type === 'relation_rhythm' || type === 'rhythm_pattern')
            return 'draft.rr.';
        if (type === 'interaction_preference')
            return 'draft.ip.';
        return 'draft.et.';
    }
};
exports.SummarizerService = SummarizerService;
exports.SummarizerService = SummarizerService = SummarizerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_service_1.LlmService,
        prompt_router_service_1.PromptRouterService,
        memory_service_1.MemoryService,
        memory_write_guard_service_1.MemoryWriteGuardService,
        user_profile_service_1.UserProfileService,
        identity_anchor_service_1.IdentityAnchorService,
        claim_engine_config_1.ClaimEngineConfig,
        claim_update_service_1.ClaimUpdateService,
        session_state_service_1.SessionStateService,
        config_1.ConfigService])
], SummarizerService);
//# sourceMappingURL=summarizer.service.js.map