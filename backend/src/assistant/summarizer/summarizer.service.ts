import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import { PromptRouterService } from '../prompt-router/prompt-router.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryWriteGuardService } from '../memory/memory-write-guard.service';
import { UserProfileService } from '../persona/user-profile.service';
import {
  IdentityAnchorService,
  AnchorDto,
} from '../identity-anchor/identity-anchor.service';
import {
  COGNITIVE_CATEGORIES,
  MemoryCategory,
  WriteDecision,
} from '../memory/memory-category';
import { ClaimEngineConfig } from '../claim-engine/claim-engine.config';
import { ClaimUpdateService } from '../claim-engine/claim-update.service';
import { SessionStateService } from '../claim-engine/session-state.service';
import { ClaimSchemaRegistry } from '../claim-engine/claim-schema.registry';
import { isFeatureEnabled } from '../../config/feature-flags';

const COGNITIVE_TYPE_SET = new Set<string>(COGNITIVE_CATEGORIES);

/** 记忆分析引擎 LLM 输出格式 */
interface MemoryAnalysisOutput {
  shouldUpdate?: boolean;
  updates?: Array<{
    type: string;
    key?: string;
    valueJson?: unknown;
    content?: string;
    confidence: number;
    mappingConfidence?: number;
    polarity?: 'SUPPORT' | 'CONTRA' | 'NEUTRAL';
    contextTags?: string[];
    evidence?: {
      messageId?: string;
      snippet?: string;
      polarity?: 'SUPPORT' | 'CONTRA' | 'NEUTRAL';
      weight?: number;
    };
    mergeTargetId?: string;
  }>;
  sessionState?: {
    mood?: string;
    energy?: string;
    focus?: string;
    taskIntent?: string;
    confidence?: number;
    ttlSeconds?: number;
  };
  doNotStore?: string[];
}

/** B1: 印象提取 LLM 输出格式 */
interface ImpressionExtractionOutput {
  shouldUpdate: boolean;
  core?: string;
  detail?: string;
}

/** B2: 身份锚定提取 LLM 输出格式 */
interface AnchorExtractionOutput {
  shouldUpdate: boolean;
  anchors?: Array<{
    label: string;
    content: string;
    action: 'create' | 'update';
    existingId?: string;
  }>;
  /** 用户希望被称呼的名字/昵称（仅当用户明确表达时提取） */
  preferredNickname?: string | null;
}

@Injectable()
export class SummarizerService {
  private readonly featureAutoImpression: boolean;
  private readonly featureAutoAnchor: boolean;
  private readonly featureImpressionRequireConfirm: boolean;
  private readonly logger = new Logger(SummarizerService.name);

  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
    private router: PromptRouterService,
    private memory: MemoryService,
    private writeGuard: MemoryWriteGuardService,
    private userProfile: UserProfileService,
    private anchor: IdentityAnchorService,
    private claimConfig: ClaimEngineConfig,
    private claimUpdater: ClaimUpdateService,
    private sessionState: SessionStateService,
    config: ConfigService,
  ) {
    this.featureAutoImpression = isFeatureEnabled(config, 'autoImpression');
    this.featureAutoAnchor = isFeatureEnabled(config, 'autoAnchor');
    this.featureImpressionRequireConfirm = isFeatureEnabled(config, 'impressionRequireConfirm');
  }

  async summarize(
    conversationId: string,
    messageIds?: string[],
  ): Promise<{
    created: number;
    memories: Array<{
      id: string;
      type: string;
      category: string;
      content: string;
    }>;
    merged: number;
    overwritten: number;
    skipped: number;
    personaSuggestion?: string;
    doNotStore?: string[];
    confidenceBumps?: Array<{ memoryId: string; newConfidence: number }>;
    claimWriteReport?: {
      attempted: number;
      written: number;
      rejected: number;
      rejectedSamples?: Array<{ type: string; key?: string; reason: string }>;
    };
    pendingCanonicalSuggestions?: Array<{
      type: string;
      key: string;
      confidence: number;
      evidenceCount: number;
      counterEvidenceCount: number;
      createdAt: Date;
      updatedAt: Date;
      lastSeenAt: Date;
    }>;
    claimResults?: Array<{ claimId: string; status: string; previousStatus?: string }>;
  }> {
    let messages: Array<{ id: string; role: string; content: string }>;
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
    } else {
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
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      messageIds: ids,
      existingCognitive,
    });
    const raw = await this.llm.generate(promptMessages, { scenario: 'summary' });

    const parsed = this.parseMemoryAnalysisJson(raw);
    const created: Array<{
      id: string;
      type: string;
      category: string;
      content: string;
    }> = [];
    const confidenceBumps: Array<{ memoryId: string; newConfidence: number }> = [];
    let merged = 0;
    let overwritten = 0;
    let skipped = 0;
    let claimAttempted = 0;
    let claimWritten = 0;
    const claimRejectedSamples: Array<{ type: string; key?: string; reason: string }> = [];
    const claimResults: Array<{ claimId: string; status: string; previousStatus?: string }> = [];

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

      // Phase4: Claim dual-write (gated by feature flags + schema registry)
      if (this.claimConfig.writeDualEnabled && claimType) {
        const isInteraction = claimType === 'INTERACTION_PREFERENCE';
        const isEmotion = claimType === 'EMOTIONAL_TENDENCY';
        const allowed =
          (!isInteraction || this.claimConfig.writeInteractionEnabled) &&
          (!isEmotion || this.claimConfig.writeEmotionEnabled);
        if (allowed) {
          claimAttempted++;
          const originalKey = typeof u.key === 'string' ? u.key.trim() : '';
          let validation = ClaimSchemaRegistry.validateAny(originalKey, u.valueJson);

          if (
            validation.ok
            && validation.kind === 'canonical'
            && mappingConfidence < this.claimConfig.canonicalMappingThreshold
          ) {
            const fallbackKey = this.buildDraftKey(type, originalKey, u.content);
            const fallback = ClaimSchemaRegistry.validateDraft(fallbackKey, u.valueJson);
            if (fallback.ok) {
              validation = fallback;
              this.logger.debug(
                `[claim-write] downgraded canonical to draft key=${originalKey} mappingConfidence=${mappingConfidence.toFixed(2)} threshold=${this.claimConfig.canonicalMappingThreshold.toFixed(2)} -> ${fallback.key}`,
              );
            }
          }

          if (!validation.ok && this.claimConfig.draftEnabled) {
            const fallbackKey = this.buildDraftKey(type, originalKey || type, u.content);
            const fallback = ClaimSchemaRegistry.validateDraft(fallbackKey, u.valueJson);
            if (fallback.ok) {
              validation = fallback;
              this.logger.debug(
                `[claim-write] coerced invalid key=${originalKey} to draft key=${fallback.key}`,
              );
            }
          }

          if (!validation.ok) {
            claimRejectedSamples.push({ type, key: u.key, reason: validation.reason });
            this.logger.debug(`[claim-write] rejected ${type} key=${u.key ?? ''}: ${validation.reason}`);
          } else {
            if (validation.kind === 'draft' && !this.claimConfig.draftEnabled) {
              const reason = 'draft claims are disabled by FEATURE_CLAIM_DRAFT_ENABLED';
              claimRejectedSamples.push({ type, key: validation.key, reason });
              this.logger.debug(`[claim-write] rejected ${type} key=${validation.key}: ${reason}`);
              continue;
            }

            // Prefix-type consistency guard (avoid wrong-bucket writes).
            const expect =
              claimType === 'JUDGEMENT_PATTERN'
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
              const claimResult = await this.writeClaimDraft(conversationId, ids, {
                type,
                key: validation.key,
                valueJson: validation.valueJson,
                confidence,
                polarity,
                contextTags: u.contextTags,
                evidence: u.evidence,
              });
              if (claimResult) {
                claimResults.push(claimResult);
              }
              claimWritten++;
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              claimRejectedSamples.push({ type, key: u.key, reason: msg });
              this.logger.debug(`[claim-write] failed ${type} key=${u.key ?? ''}: ${msg}`);
            }
          }
        }
      }

      // Memory write path: only cognitive categories are persisted in Memory table.
      if (!COGNITIVE_TYPE_SET.has(memoryType)) {
        // Non-memory update (e.g. interaction_preference / emotional_tendency) ends here.
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
        category: memoryType as MemoryCategory,
        content,
        sourceMessageIds: ids,
        confidence,
        isNegation: polarity === 'CONTRA',
        isOneOff: false,
      });

      switch (decision.decision) {
        case WriteDecision.WRITE: {
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
        case WriteDecision.MERGE: {
          if (decision.targetMemoryId && COGNITIVE_TYPE_SET.has(memoryType)) {
            const bumped = await this.memory.bumpConfidence(
              decision.targetMemoryId,
              0.1,
            );
            if (bumped) {
              confidenceBumps.push({
                memoryId: bumped.id,
                newConfidence: bumped.confidence,
              });
              merged++;
            }
          } else if (decision.targetMemoryId) {
            await this.memory.mergeInto(
              decision.targetMemoryId,
              content,
              ids,
            );
            merged++;
          }
          break;
        }
        case WriteDecision.OVERWRITE: {
          if (decision.targetMemoryId) {
            await this.memory.update(decision.targetMemoryId, {
              content,
              confidence,
            });
            overwritten++;
          }
          break;
        }
        case WriteDecision.WRITE_AND_LINK:
        case WriteDecision.SKIP:
        default:
          skipped++;
          break;
      }
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { summarizedAt: new Date() },
    });

    // ── B1: 总结后自动提取印象更新 ──────────────────────────
    if (this.featureAutoImpression && created.length > 0) {
      this.extractAndUpdateImpression(messages).catch((err: Error) =>
        this.logger.warn(`Auto-impression failed: ${err.message}`),
      );
    }

    // ── B2: 总结后自动提取身份锚定 ──────────────────────────
    // 不以 created.length 为门槛——身份锚点由 LLM 在 extractAndUpdateAnchor 内判断
    if (this.featureAutoAnchor) {
      this.extractAndUpdateAnchor(messages).catch((err: Error) =>
        this.logger.warn(`Auto-anchor failed: ${err.message}`),
      );
    }

    const pendingCanonicalSuggestions =
      this.claimConfig.writeDualEnabled && this.claimConfig.draftEnabled
        ? await this.prisma.$queryRaw<Array<{
            type: string;
            key: string;
            confidence: number;
            evidenceCount: number;
            counterEvidenceCount: number;
            createdAt: Date;
            updatedAt: Date;
            lastSeenAt: Date;
          }>>`
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
      confidenceBumps:
        confidenceBumps.length > 0 ? confidenceBumps : undefined,
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
      ...(claimResults.length > 0 ? { claimResults } : {}),
    };
  }

  /**
   * B1: 从对话中提取印象更新并写入 persona。
   * 通过 LLM 分析最近对话，生成 impressionCore（整体感觉）的增量描述。
   */
  private async extractAndUpdateImpression(
    messages: Array<{ id: string; role: string; content: string }>,
  ): Promise<void> {
    const profile = await this.userProfile.getOrCreate();
    const dialogue = messages
      .map((m) => `${m.role === 'user' ? '她' : '小晴'}: ${m.content}`)
      .join('\n');

    const prompt = [
      {
        role: 'system' as const,
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
      { role: 'user' as const, content: dialogue },
    ];

    const raw = await this.llm.generate(prompt, { scenario: 'summary' });
    const parsed = this.parseImpressionJson(raw);
    if (!parsed?.shouldUpdate || !parsed.core) return;

    try {
      await this.userProfile.updateImpression({
        action: 'append',
        target: 'core',
        content: parsed.core,
        confirmed: !this.featureImpressionRequireConfirm,
      });
      this.logger.log(`Impression updated: ${parsed.core}`);
    } catch (err: unknown) {
      // Token 超预算时静默跳过（印象过长了）
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('exceeds token budget')) {
        this.logger.warn(`Impression core at capacity, skipping: ${parsed.core}`);
      } else {
        throw err;
      }
    }
  }

  private parseImpressionJson(raw: string): ImpressionExtractionOutput | null {
    const trimmed = raw.trim();
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = codeBlock ? codeBlock[1].trim() : trimmed;
    if (!codeBlock) {
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);
    }
    try {
      return JSON.parse(jsonStr) as ImpressionExtractionOutput;
    } catch {
      return null;
    }
  }

  /**
   * B2: 从对话中提取身份锚定并写入 IdentityAnchor 表。
   * 只提取用户明确说出的身份事实，不猜测、不推断。
   */
  private async extractAndUpdateAnchor(
    messages: Array<{ id: string; role: string; content: string }>,
  ): Promise<void> {
    const activeAnchors = await this.anchor.getActiveAnchors();
    const existingText =
      activeAnchors.length > 0
        ? activeAnchors
            .map((a) => `- id=${a.id} [${a.label}] ${a.content}`)
            .join('\n')
        : '（空）';

    const dialogue = messages
      .map((m) => `${m.role === 'user' ? '她' : '小晴'}: ${m.content}`)
      .join('\n');

    const prompt = [
      {
        role: 'system' as const,
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

额外：如果用户明确说了希望被怎么称呼（如"叫我XX""我叫XX""称呼我XX"），在 preferredNickname 字段返回该称呼（≤10字）。仅当用户主动表达称呼偏好时才提取，不要从姓名推断昵称。

输出严格 JSON：
{
  "shouldUpdate": boolean,
  "anchors": [
    { "label": "location", "content": "住在上海浦东新区", "action": "create" },
    { "label": "basic", "content": "更新后的内容", "action": "update", "existingId": "xxx" }
  ],
  "preferredNickname": "string or null"
}`,
      },
      { role: 'user' as const, content: dialogue },
    ];

    const raw = await this.llm.generate(prompt, { scenario: 'summary' });
    const parsed = this.parseAnchorJson(raw);
    if (!parsed?.shouldUpdate || !parsed.anchors?.length) return;

    for (const item of parsed.anchors) {
      const label = (item.label || '').toLowerCase();
      const content = (item.content || '').trim().slice(0, 30);
      if (!content) continue;

      try {
        if (item.action === 'update' && item.existingId) {
          await this.anchor.update(item.existingId, { content, label });
          this.logger.log(`Anchor updated [${label}]: ${content}`);
        } else {
          await this.anchor.create({ label, content });
          this.logger.log(`Anchor created [${label}]: ${content}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('上限')) {
          this.logger.warn(`Anchor limit reached, skipping: [${label}] ${content}`);
        } else {
          this.logger.warn(`Anchor write failed: ${msg}`);
        }
      }
    }

    // 写入昵称偏好 Claim
    const nickname = (parsed.preferredNickname || '').trim().slice(0, 20);
    if (nickname) {
      try {
        await this.claimUpdater.upsertFromDraft({
          type: 'INTERACTION_PREFERENCE',
          key: 'ip.nickname.primary',
          value: { name: nickname, source: 'user_stated' },
          confidence: 0.9,
          sourceModel: this.llm.getModelInfo({ scenario: 'summary' }).modelName,
          contextTags: ['auto-anchor', 'nickname'],
          evidence: {
            messageId: messages[messages.length - 1]?.id,
            sessionId: 'auto-anchor',
            snippet: nickname,
            polarity: 'SUPPORT',
            weight: 1,
          },
        });
        this.logger.log(`Nickname claim written: ${nickname}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Nickname claim write failed: ${msg}`);
      }
    }
  }

  private parseAnchorJson(raw: string): AnchorExtractionOutput | null {
    const trimmed = raw.trim();
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = codeBlock ? codeBlock[1].trim() : trimmed;
    if (!codeBlock) {
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);
    }
    try {
      return JSON.parse(jsonStr) as AnchorExtractionOutput;
    } catch {
      return null;
    }
  }

  private parseMemoryAnalysisJson(raw: string): MemoryAnalysisOutput | null {
    const trimmed = raw.trim();
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = codeBlock ? codeBlock[1].trim() : trimmed;
    if (!codeBlock) {
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);
    }
    try {
      return JSON.parse(jsonStr) as MemoryAnalysisOutput;
    } catch {
      return null;
    }
  }

  private normalizePolarity(
    input?: string,
  ): 'SUPPORT' | 'CONTRA' | 'NEUTRAL' {
    const value = (input || '').toUpperCase();
    if (value === 'CONTRA') return 'CONTRA';
    if (value === 'NEUTRAL') return 'NEUTRAL';
    return 'SUPPORT';
  }

  private mapLegacyTypeToClaimType(
    type: string,
  ):
    | 'JUDGEMENT_PATTERN'
    | 'VALUE'
    | 'RELATION_RHYTHM'
    | 'INTERACTION_PREFERENCE'
    | 'EMOTIONAL_TENDENCY'
    | null {
    if (type === 'judgment_pattern') return 'JUDGEMENT_PATTERN';
    if (type === 'value_priority') return 'VALUE';
    if (type === 'rhythm_pattern') return 'RELATION_RHYTHM';
    if (type === 'relation_rhythm') return 'RELATION_RHYTHM';
    if (type === 'interaction_preference') return 'INTERACTION_PREFERENCE';
    if (type === 'emotional_tendency') return 'EMOTIONAL_TENDENCY';
    return null;
  }

  private async writeClaimDraft(
    conversationId: string,
    messageIds: string[],
    input: {
      type: string;
      key: string;
      valueJson: unknown;
      confidence: number;
      polarity: 'SUPPORT' | 'CONTRA' | 'NEUTRAL';
      contextTags?: string[];
      evidence?: { messageId?: string; snippet?: string; weight?: number };
    },
  ): Promise<{ claimId: string; status: string; previousStatus?: string } | null> {
    const claimType = this.mapLegacyTypeToClaimType(input.type);
    if (!claimType) return null;

    const messageId = input.evidence?.messageId || messageIds[messageIds.length - 1];
    const snippet = (input.evidence?.snippet || input.key).trim().slice(0, 40);
    const weight = Number.isFinite(Number(input.evidence?.weight))
      ? Math.max(0, Math.min(1, Number(input.evidence?.weight)))
      : 1;

    return this.claimUpdater.upsertFromDraft({
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

  private async writeSessionStateIfPresent(
    conversationId: string,
    parsed: MemoryAnalysisOutput | null,
  ): Promise<void> {
    if (!parsed?.sessionState) return;
    const state = parsed.sessionState;
    const confidence = Math.max(0, Math.min(1, Number(state.confidence) || 0.6));
    const ttlSeconds = Math.max(600, Math.min(86400, Number(state.ttlSeconds) || 21600));
    const payload: Record<string, unknown> = {};
    if (state.mood) payload.mood = state.mood;
    if (state.energy) payload.energy = state.energy;
    if (state.focus) payload.focus = state.focus;
    if (state.taskIntent) payload.taskIntent = state.taskIntent;
    if (Object.keys(payload).length === 0) return;

    await this.sessionState.upsertState({
      sessionId: conversationId,
      state: payload,
      confidence,
      ttlSeconds,
      sourceModel: this.llm.getModelInfo({ scenario: 'summary' }).modelName,
    });
  }

  private buildDraftKey(type: string, rawKey?: string, content?: string): string {
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

  private getDraftPrefix(type: string): string {
    if (type === 'judgment_pattern') return 'draft.jp.';
    if (type === 'value_priority') return 'draft.vp.';
    if (type === 'relation_rhythm' || type === 'rhythm_pattern') return 'draft.rr.';
    if (type === 'interaction_preference') return 'draft.ip.';
    return 'draft.et.';
  }
}
