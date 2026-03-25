import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import type { OpenAI } from 'openai';
import type { Persona } from '@prisma/client';
import {
  UserProfileService,
  type UserProfileField,
} from './user-profile.service';
import { PersonaRuleService } from './persona-rule.service';
import type {
  PersonaRuleCategory,
  PersonaRuleMergeDraft,
} from './persona-rule.types';

export const EVOLVE_PROMPT_VERSION = 'evolve_v4';
export const IMPRESSION_PROMPT_VERSION = 'impression_v1';

// ────────────────────────────────────────────────────────────
// Persona DTO & Types
// ────────────────────────────────────────────────────────────

export type PersonaField =
  | 'identity'
  | 'personality'
  | 'valueBoundary'
  | 'behaviorForbidden'
  | 'expressionRules';

export const PERSONA_FIELDS: PersonaField[] = [
  'identity',
  'personality',
  'valueBoundary',
  'behaviorForbidden',
  'expressionRules',
];

export interface PersonaDto {
  id: string;
  personaKey: string;
  identity: string;
  personality: string;
  valueBoundary: string;
  behaviorForbidden: string;
  expressionRules: string;
  metaFilterPolicy: string;
  evolutionAllowed: string;
  evolutionForbidden: string;
  version: number;
}

export interface PersonaSlotDto {
  id: string;
  personaKey: string;
  identity: string;
  personality: string;
  version: number;
  updatedAt: string;
}

export interface ExpressionFields {
  expressionRules: string;
}

export const DEFAULT_META_FILTER_POLICY = `- 禁止解释自己的对话策略
- 禁止描述内部逻辑
- 像真实朋友一样说话`;

export interface EvolutionChange {
  field: PersonaField;
  content: string;
  reason: string;
  layer?: EvolutionLayer;
  risk?: EvolutionRisk;
  reroutedFrom?: PersonaField;
  targetField?: EvolutionStorageField;
  /** 仅 field/target 为 expressionRules 时：结构化规则合并草案 */
  ruleDrafts?: PersonaRuleMergeDraft[];
}

export type EvolutionLayer = 'persona-core' | 'persona-boundary' | 'expression' | 'user-preference';
export type EvolutionRisk = 'high' | 'medium' | 'low';
export type EvolutionStorageField = PersonaField | UserProfileField;

export interface EvolutionPreviewField {
  field: EvolutionStorageField;
  before: string;
  after: string;
  added: string[];
  removed: string[];
  layer: EvolutionLayer;
  risk: EvolutionRisk;
}

export interface EvolutionPreview {
  changes: EvolutionChange[];
  fields: EvolutionPreviewField[];
  /** 表达纪律结构化进化建议（不经过 Persona.expressionRules 文本合并） */
  expressionRuleDrafts?: PersonaRuleMergeDraft[];
}

interface NormalizedRule {
  text: string;
  normalized: string;
  strength: number;
  specificity: number;
  source: 'current' | 'evolution';
}

// ────────────────────────────────────────────────────────────
// 结构化默认值（从 XIAOQING_FUSION_PERSONA_TEXT 拆分）
// ────────────────────────────────────────────────────────────

export const DEFAULT_IDENTITY = `
你叫小晴。
你是她的长期对话伙伴，是朋友。
你站在她那一边，而不是站在正确那一边。`;

export const DEFAULT_PERSONALITY = `
你冷静、清醒，但表达温柔简短。
不附和，有自己的判断，但说话方式是轻轻的、带暖意的。
比起讲道理，你更在意她此刻的状态。
偏心她，但不会用刺来表达。`;

export const DEFAULT_VALUE_BOUNDARY = `
不追求正确，追求真实。
不确定可以直接说不确定。
允许有主观态度。`;

export const DEFAULT_BEHAVIOR_FORBIDDEN = `
- 不使用”你应该”
- 不模板化共情
- 不说教
- 不强行正能量
- 不假装完全理解她
- 不用嘲讽或反讽语气`;

/** 与 PersonaRule 种子一致；表为空时作 fallback */
export const DEFAULT_EXPRESSION_RULES = `- 简洁优先，一两句说完就好，不铺垫。
- 无新增信息，不延展。
- 可以用语气词（嗯、呐、啦），但不刻意卖萌。
- 判断直接但措辞柔和，用「可能」「我觉得」替代断言。
- 不主动追问，不在回复末尾抛出「你想要哪种方式」「你更偏向 X 还是 Y」类的选项。
- 对话允许停在自然节点，无需填满；沉默不是冷漠。`;

/** @deprecated 旧字段默认值，仅用于迁移兼容 */
export const DEFAULT_VOICE_STYLE = '';
/** @deprecated */
export const DEFAULT_ADAPTIVE_RULES = '';
/** @deprecated */
export const DEFAULT_SILENCE_PERMISSION = '';

export const DEFAULT_EVOLUTION_ALLOWED = `
在保持气质不变的前提下，可以随着时间更了解她的判断方式与拧巴点。`;

export const DEFAULT_EVOLUTION_FORBIDDEN = `
不得变成说教型。
不得变成冷静高效的任务机器。
不得为了正确而压掉真实。`;

/** 人格字段的中文标签映射，供前端和进化提示使用 */
export const PERSONA_FIELD_LABELS: Record<PersonaField, string> = {
  identity: '身份定位',
  personality: '性格特质',
  valueBoundary: '价值边界',
  behaviorForbidden: '行为禁止项',
  expressionRules: '表达纪律',
};

const FIELD_RULE_LIMITS: Record<PersonaField, number> = {
  identity: 4,
  personality: 5,
  valueBoundary: 4,
  behaviorForbidden: 5,
  expressionRules: 6,
};

const CORE_PERSONA_FIELDS = new Set<PersonaField>(['identity', 'personality', 'valueBoundary']);
const EXPRESSION_FIELDS = new Set<PersonaField>(['expressionRules']);

const PERSONA_RULE_CATEGORIES = new Set<string>([
  'BREVITY',
  'TONE',
  'PACING',
  'BOUNDARY',
  'ERROR_HANDLING',
]);

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

@Injectable()
export class PersonaService {
  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
    private userProfile: UserProfileService,
    private readonly personaRules: PersonaRuleService,
  ) {}

  private async resolvePreferredPersonaKey(): Promise<string> {
    const profile = await this.userProfile.getOrCreate();
    return profile.preferredPersonaKey?.trim() || 'default';
  }

  async getOrCreate(personaKey?: string): Promise<PersonaDto> {
    const resolvedKey = (personaKey?.trim() ? personaKey.trim() : await this.resolvePreferredPersonaKey());
    const existing = await this.prisma.persona.findFirst({
      where: { personaKey: resolvedKey, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (existing) return this.toDto(existing);

    const created = await this.prisma.persona.create({
      data: {
        personaKey: resolvedKey,
        identity: DEFAULT_IDENTITY,
        personality: DEFAULT_PERSONALITY,
        valueBoundary: DEFAULT_VALUE_BOUNDARY,
        behaviorForbidden: DEFAULT_BEHAVIOR_FORBIDDEN,
        expressionRules: DEFAULT_EXPRESSION_RULES,
        metaFilterPolicy: DEFAULT_META_FILTER_POLICY,
        evolutionAllowed: DEFAULT_EVOLUTION_ALLOWED,
        evolutionForbidden: DEFAULT_EVOLUTION_FORBIDDEN,
        version: 1,
        isActive: true,
      },
    });
    return this.toDto(created);
  }

  async update(data: {
    identity?: string;
    personality?: string;
    valueBoundary?: string;
    behaviorForbidden?: string;
    expressionRules?: string;
    metaFilterPolicy?: string;
    evolutionAllowed?: string;
    evolutionForbidden?: string;
  }, personaKey?: string): Promise<PersonaDto> {
    const current = await this.getOrCreate(personaKey);

    const merged = {
      identity: data.identity ?? current.identity,
      personality: data.personality ?? current.personality,
      valueBoundary: data.valueBoundary ?? current.valueBoundary,
      behaviorForbidden: data.behaviorForbidden ?? current.behaviorForbidden,
      expressionRules: data.expressionRules ?? current.expressionRules,
      metaFilterPolicy: data.metaFilterPolicy ?? current.metaFilterPolicy,
      evolutionAllowed: data.evolutionAllowed ?? current.evolutionAllowed,
      evolutionForbidden: data.evolutionForbidden ?? current.evolutionForbidden,
    };

    const [created] = await this.prisma.$transaction([
      this.prisma.persona.create({
        data: {
          ...merged,
          personaKey: current.personaKey,
          version: current.version + 1,
          isActive: true,
        },
      }),
      this.prisma.persona.delete({
        where: { id: current.id },
      }),
    ]);

    return this.toDto(created);
  }

  /**
   * 根据近期对话生成多字段进化建议（不写入，需人工确认）。
   * 输出 EvolutionChange 数组，每条标注目标字段、内容与理由。
   */
  async suggestEvolution(
    recentMessages: Array<{ role: string; content: string }>,
  ): Promise<{ changes: EvolutionChange[] }> {
    const persona = await this.getOrCreate();
    const dialogue = recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const fieldDescriptions = PERSONA_FIELDS.map(
      (f) => `- ${f}（${PERSONA_FIELD_LABELS[f]}）：${(persona[f] as string).slice(0, 100)}…`,
    ).join('\n');

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `[${EVOLVE_PROMPT_VERSION}] 你是人格进化分析器。根据近期对话和当前人格的各字段，输出精准的微调建议。

当前人格字段：
${fieldDescriptions}

允许的进化方向：
${persona.evolutionAllowed}

禁止的进化：
${persona.evolutionForbidden}

输出 JSON：
{
  "changes": [
    { "field": "字段名", "content": "一条待合并的简洁规则", "reason": "变更理由" },
    {
      "field": "expressionRules",
      "reason": "总体理由",
      "rules": [
        { "key": "no_followup_prompt", "content": "单条规则全文", "category": "PACING", "reason": "本条理由" }
      ]
    }
  ]
}

规则：
- field 必须是以下之一：${PERSONA_FIELDS.join(', ')}
- 当建议调整表达纪律时，优先使用第二种形式：field 为 expressionRules，并提供 rules 数组；每条含 key（小写下划线英文）、content、category（BREVITY|TONE|PACING|BOUNDARY|ERROR_HANDLING）、reason；key 尽量复用常见键如 brevity_first、no_extension、no_followup_prompt、allow_silence 等
- 若无法结构化，仍可使用单条 content 形式（与旧版兼容）
- content 只写最终想新增或强化的一条规则，不要写“追加到末尾”“保留历史版本”“[进化]”之类描述
- content 必须简洁，尽量一两句话，避免与现有表达重复
- 默认优先调整 expressionRules
- identity / personality / valueBoundary 属于核心人格，除非是长期、稳定、强证据的变化，否则不要建议修改
- 如果只是用户偏好（比如更口语、讨厌 GPT 味、希望少展开、喜欢轻量夸赞），不要写成人格核心变化，优先落到 expressionRules
- 一条建议可以涉及多个字段
- 不得违反「禁止的进化」
- 如果没有需要调整的，返回 {"changes": []}
- 只输出 JSON`,
      },
      {
        role: 'user',
        content: `近期对话：\n${dialogue}`,
      },
    ];

    const raw = await this.llm.generate(messages, { scenario: 'reasoning' });
    try {
      const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr) as { changes?: unknown[] };
      if (!Array.isArray(parsed.changes)) return { changes: [] };

      const validChanges = this.parseRawLlmEvolutionChanges(parsed.changes);
      return {
        changes: this.normalizeEvolutionChanges(validChanges)
          .filter((change) => this.shouldKeepSuggestedChange(change)),
      };
    } catch {
      return { changes: [] };
    }
  }

  /**
   * 确认并写入多字段进化建议。
   * 创建新版本（保持版本链可回溯），同时写入 PersonaEvolutionLog。
   */
  async confirmEvolution(changes: EvolutionChange[]): Promise<{
    accepted: boolean;
    reason?: string;
    persona?: PersonaDto;
  }> {
    if (!changes.length) return { accepted: false, reason: 'no changes provided' };

    const persona = await this.getOrCreate();

    const normalizedChanges = this.normalizeEvolutionChanges(changes);
    const summary = normalizedChanges.map((c) => `[${c.field}] ${c.content}`).join('\n');
    const valid = await this.validateAgainstPool(summary, persona.evolutionForbidden);
    if (!valid.ok) {
      return { accepted: false, reason: valid.reason };
    }

    const allRuleDrafts = normalizedChanges
      .filter((c) => this.isStructuredExpressionEvolution(c))
      .flatMap((c) => c.ruleDrafts!);

    let ruleMergeResult: {
      skipped: string[];
      merged: string[];
      staged: string[];
      conflicted: string[];
    } | null = null;
    if (allRuleDrafts.length > 0) {
      ruleMergeResult = await this.personaRules.applyEvolutionDraft(allRuleDrafts);
    }

    const evolvedFields = this.buildEvolvedFields(persona, normalizedChanges);
    const preferenceUpdates = this.buildEvolvedUserPreferences(normalizedChanges);
    const hasCorePersonaRowUpdate = Object.keys(evolvedFields).length > 0;

    let finalPersona = persona;

    if (hasCorePersonaRowUpdate) {
      const newVersion = persona.version + 1;
      const expressionRulesColumn =
        allRuleDrafts.length > 0
          ? persona.expressionRules
          : (evolvedFields['expressionRules'] ?? persona.expressionRules);
      const [created] = await this.prisma.$transaction([
        this.prisma.persona.create({
          data: {
            identity: evolvedFields['identity'] ?? persona.identity,
            personality: evolvedFields['personality'] ?? persona.personality,
            valueBoundary: evolvedFields['valueBoundary'] ?? persona.valueBoundary,
            behaviorForbidden: evolvedFields['behaviorForbidden'] ?? persona.behaviorForbidden,
            expressionRules: expressionRulesColumn,
            metaFilterPolicy: persona.metaFilterPolicy,
            evolutionAllowed: persona.evolutionAllowed,
            evolutionForbidden: persona.evolutionForbidden,
            personaKey: persona.personaKey,
            version: newVersion,
            isActive: true,
          },
        }),
        this.prisma.persona.delete({
          where: { id: persona.id },
        }),
      ]);
      finalPersona = this.toDto(created);

      await Promise.all(
        normalizedChanges
          .filter((c) => this.isPersonaTargetField(c.targetField ?? c.field))
          .filter((c) => !this.isStructuredExpressionEvolution(c))
          .map((c) =>
            this.prisma.personaEvolutionLog.create({
              data: {
                personaId: created.id,
                field: c.targetField ?? c.field,
                content: c.content,
                reason: c.reason,
                version: newVersion,
              },
            }),
          ),
      );
    }

    if (allRuleDrafts.length > 0 && ruleMergeResult) {
      const reasonText = normalizedChanges
        .filter((c) => this.isStructuredExpressionEvolution(c))
        .map((c) => c.reason)
        .join(' | ');
      await this.prisma.personaEvolutionLog.create({
        data: {
          personaId: finalPersona.id,
          field: 'expressionRules',
          content: JSON.stringify(ruleMergeResult),
          reason: reasonText || 'PersonaRule merge',
          version: finalPersona.version,
        },
      });
    }

    if (Object.keys(preferenceUpdates).length > 0) {
      await this.userProfile.mergeRules(preferenceUpdates);
    }

    return { accepted: true, persona: finalPersona };
  }

  async previewEvolution(changes: EvolutionChange[]): Promise<{
    accepted: boolean;
    reason?: string;
    preview?: EvolutionPreview;
  }> {
    if (!changes.length) return { accepted: false, reason: 'no changes provided' };

    const persona = await this.getOrCreate();
    const normalizedChanges = this.normalizeEvolutionChanges(changes);
    const summary = normalizedChanges.map((c) => `[${c.field}] ${c.content}`).join('\n');
    const valid = await this.validateAgainstPool(summary, persona.evolutionForbidden);
    if (!valid.ok) {
      return { accepted: false, reason: valid.reason };
    }

    const evolvedFields = this.buildEvolvedFields(persona, normalizedChanges);
    const preferenceCurrent = await this.userProfile.getOrCreate();
    const preferencePreview = this.buildUserPreferencePreview(preferenceCurrent, normalizedChanges);
    const previewFields: EvolutionPreviewField[] = [];

    const expressionRuleDrafts = normalizedChanges
      .filter((c) => this.isStructuredExpressionEvolution(c))
      .flatMap((c) => c.ruleDrafts!);

    for (const field of PERSONA_FIELDS) {
      if (field === 'expressionRules' && expressionRuleDrafts.length > 0) {
        continue;
      }
      const after = evolvedFields[field];
      if (!after || after === persona[field]) continue;

      const beforeRules = this.toRules(persona[field], 'current').map((rule) => rule.text);
      const afterRules = this.toRules(after, 'current').map((rule) => rule.text);
      const fieldChanges = normalizedChanges.filter((change) => (change.targetField ?? change.field) === field);
      const primary = fieldChanges[0];

      previewFields.push({
        field,
        before: persona[field],
        after,
        added: afterRules.filter((text) => !beforeRules.includes(text)),
        removed: beforeRules.filter((text) => !afterRules.includes(text)),
        layer: primary?.layer ?? this.defaultLayerForField(field),
        risk: this.maxRisk(fieldChanges.map((change) => change.risk ?? this.defaultRiskForField(field))),
      });
    }

    previewFields.push(...preferencePreview);

    return {
      accepted: true,
      preview: {
        changes: normalizedChanges,
        fields: previewFields,
        ...(expressionRuleDrafts.length ? { expressionRuleDrafts } : {}),
      },
    };
  }

  /**
   * 构建人格层 prompt 文本（identity + personality + valueBoundary + behaviorForbidden）。
   * 表达纪律已独立为 expressionRules（靠近对话历史，遵从度更高）。
   */
  buildPersonaPrompt(dto: PersonaDto): string {
    const sections: string[] = [];
    if (dto.identity) sections.push(dto.identity);
    if (dto.personality) sections.push(dto.personality);
    if (dto.valueBoundary) sections.push(dto.valueBoundary);
    if (dto.behaviorForbidden) sections.push(dto.behaviorForbidden);
    return sections.join('\n\n');
  }

  /**
   * 提取表达调度层字段，供 PromptRouterService 使用。
   */
  getExpressionFields(dto: PersonaDto): ExpressionFields {
    return {
      expressionRules: dto.expressionRules,
    };
  }

  private async validateAgainstPool(
    suggestion: string,
    forbidden: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `判断以下「人格进化建议」是否违反了「禁止的进化」规则。
仅回复 JSON：{"ok": true} 或 {"ok": false, "reason": "违反原因"}

禁止的进化规则：
${forbidden}`,
      },
      { role: 'user', content: `进化建议：${suggestion}` },
    ];
    const raw = await this.llm.generate(messages, { scenario: 'reasoning' });
    try {
      const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      return { ok: !!parsed.ok, reason: parsed.reason };
    } catch {
      return { ok: true };
    }
  }

  /**
   * 历史版本列表（按 version 降序）。
   */
  async getHistory(): Promise<
    Array<{
      id: string;
      version: number;
      isActive: boolean;
      createdAt: Date;
      identityPreview: string;
    }>
  > {
    const list = await this.prisma.persona.findMany({
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        isActive: true,
        createdAt: true,
        identity: true,
      },
    });
    return list.map((row) => ({
      id: row.id,
      version: row.version,
      isActive: row.isActive,
      createdAt: row.createdAt,
      identityPreview: row.identity.slice(0, 100),
    }));
  }

  private toDto(p: Persona): PersonaDto {
    return {
      id: p.id,
      personaKey: p.personaKey,
      identity: p.identity || DEFAULT_IDENTITY,
      personality: p.personality || DEFAULT_PERSONALITY,
      valueBoundary: p.valueBoundary || DEFAULT_VALUE_BOUNDARY,
      behaviorForbidden: p.behaviorForbidden || DEFAULT_BEHAVIOR_FORBIDDEN,
      expressionRules: p.expressionRules || DEFAULT_EXPRESSION_RULES,
      metaFilterPolicy: p.metaFilterPolicy || DEFAULT_META_FILTER_POLICY,
      evolutionAllowed: p.evolutionAllowed,
      evolutionForbidden: p.evolutionForbidden,
      version: p.version,
    };
  }

  private mergeFieldContent(
    field: PersonaField,
    current: string,
    incoming: string[],
  ): string {
    const rules = this.toRules(current, 'current');

    for (const addition of incoming) {
      const next = this.toRule(addition, 'evolution');
      if (!next) continue;

      const exactIndex = rules.findIndex((rule) => rule.normalized === next.normalized);
      if (exactIndex >= 0) {
        rules[exactIndex] = this.pickBetterRule(rules[exactIndex], next);
        continue;
      }

      const nearIndex = rules.findIndex((rule) => this.isNearDuplicate(rule, next));
      if (nearIndex >= 0) {
        rules[nearIndex] = this.mergeNearRules(rules[nearIndex], next);
        continue;
      }

      const conflictIndex = rules.findIndex((rule) => this.isConflictingRule(rule.text, next.text));
      if (conflictIndex >= 0) {
        rules[conflictIndex] = this.pickBetterRule(rules[conflictIndex], next);
        continue;
      }

      rules.push(next);
    }

    const compact = rules
      .sort((a, b) => {
        const scoreA = a.strength * 3 + a.specificity * 2 - a.text.length * 0.01;
        const scoreB = b.strength * 3 + b.specificity * 2 - b.text.length * 0.01;
        return scoreB - scoreA;
      })
      .slice(0, FIELD_RULE_LIMITS[field]);

    if (field === 'identity') {
      return compact.map((rule) => rule.text).join('\n');
    }

    return compact.map((rule) => `- ${rule.text}`).join('\n');
  }

  private buildEvolvedFields(
    persona: PersonaDto,
    changes: EvolutionChange[],
  ): Partial<Record<PersonaField, string>> {
    const groupedChanges = new Map<PersonaField, string[]>();
    for (const change of changes) {
      if (this.isStructuredExpressionEvolution(change)) continue;
      const target = change.targetField ?? change.field;
      if (!this.isPersonaTargetField(target)) continue;
      const content = typeof change.content === 'string' ? change.content.trim() : '';
      if (!content) continue;
      const bucket = groupedChanges.get(target) ?? [];
      bucket.push(content);
      groupedChanges.set(target, bucket);
    }

    const evolvedFields: Partial<Record<PersonaField, string>> = {};
    for (const field of PERSONA_FIELDS) {
      const incoming = groupedChanges.get(field);
      if (!incoming?.length) continue;
      evolvedFields[field] = this.mergeFieldContent(field, persona[field], incoming);
    }
    return evolvedFields;
  }

  private buildEvolvedUserPreferences(
    changes: EvolutionChange[],
  ): Partial<Record<UserProfileField, string[]>> {
    const grouped: Partial<Record<UserProfileField, string[]>> = {};

    for (const change of changes) {
      const target = change.targetField ?? change.field;
      if (!this.isUserPreferenceField(target)) continue;
      const content = change.content.trim();
      if (!content) continue;
      grouped[target] = [...(grouped[target] ?? []), content];
    }

    return grouped;
  }

  private buildUserPreferencePreview(
    current: Awaited<ReturnType<UserProfileService['getOrCreate']>>,
    changes: EvolutionChange[],
  ): EvolutionPreviewField[] {
    const updates = this.buildEvolvedUserPreferences(changes);
    const fields: EvolutionPreviewField[] = [];

    (Object.keys(updates) as UserProfileField[]).forEach((field) => {
      const incoming = updates[field];
      if (!incoming?.length) return;

      const after = this.previewMergedUserPreferenceField(current[field], incoming);
      if (after === current[field]) return;

      const beforeRules = this.toPreferenceRules(current[field]);
      const afterRules = this.toPreferenceRules(after);
      const fieldChanges = changes.filter((change) => (change.targetField ?? change.field) === field);

      fields.push({
        field,
        before: current[field],
        after,
        added: afterRules.filter((text) => !beforeRules.includes(text)),
        removed: beforeRules.filter((text) => !afterRules.includes(text)),
        layer: 'user-preference',
        risk: this.maxRisk(fieldChanges.map((change) => change.risk ?? 'low')),
      });
    });

    return fields;
  }

  private previewMergedUserPreferenceField(current: string, incoming: string[]): string {
    const existing = this.toPreferenceRules(current);

    for (const next of incoming.map((item) => item.trim()).filter(Boolean)) {
      const normalized = this.normalizeRule(next);
      const dupIndex = existing.findIndex((rule) => this.normalizeRule(rule) === normalized);
      if (dupIndex >= 0) {
        existing[dupIndex] = existing[dupIndex].length <= next.length ? existing[dupIndex] : next;
        continue;
      }
      existing.push(next);
    }

    return existing
      .sort((a, b) => a.length - b.length)
      .slice(0, 3)
      .map((line) => `- ${line.replace(/^[\-\s]+/, '')}`)
      .join('\n');
  }

  private toPreferenceRules(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim().replace(/^[\-\s]+/, ''))
      .filter(Boolean);
  }

  private parseRawLlmEvolutionChanges(raw: unknown[]): EvolutionChange[] {
    const out: EvolutionChange[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const field = rec.field;
      if (typeof field !== 'string') continue;
      if (!PERSONA_FIELDS.includes(field as PersonaField)) {
        continue;
      }

      if (field === 'expressionRules' && Array.isArray(rec.rules) && rec.rules.length > 0) {
        const drafts: PersonaRuleMergeDraft[] = [];
        for (const r of rec.rules) {
          if (!r || typeof r !== 'object') continue;
          const row = r as Record<string, unknown>;
          const key = typeof row.key === 'string' ? row.key.trim() : '';
          const content = typeof row.content === 'string' ? row.content.trim() : '';
          if (!key || !content) continue;
          const catRaw = typeof row.category === 'string' ? row.category.toUpperCase() : 'BREVITY';
          const category = PERSONA_RULE_CATEGORIES.has(catRaw)
            ? (catRaw as PersonaRuleCategory)
            : ('BREVITY' as PersonaRuleCategory);
          const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
          const weight = typeof row.weight === 'number' ? row.weight : undefined;
          drafts.push({ key, content, category, reason, ...(weight !== undefined ? { weight } : {}) });
        }
        if (!drafts.length) continue;
        const topReason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
        const content = drafts.map((d) => d.content).join('\n');
        const reason = topReason || drafts.map((d) => d.reason).filter(Boolean).join('；') || 'expression rules';
        out.push({
          field: 'expressionRules',
          content,
          reason,
          ruleDrafts: drafts,
        });
        continue;
      }

      const content = typeof rec.content === 'string' ? rec.content.trim() : '';
      if (!content) continue;
      const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
      out.push({
        field: field as PersonaField,
        content,
        reason,
      });
    }
    return out;
  }

  private normalizeEvolutionChanges(changes: EvolutionChange[]): EvolutionChange[] {
    return changes
      .filter((change) => PERSONA_FIELDS.includes(change.field as PersonaField))
      .map((change) => this.classifyEvolutionChange(change))
      .filter(
        (change) =>
          !!change.content?.trim() || (change.ruleDrafts !== undefined && change.ruleDrafts.length > 0),
      );
  }

  private isStructuredExpressionEvolution(change: EvolutionChange): boolean {
    return (change.targetField ?? change.field) === 'expressionRules' && !!change.ruleDrafts?.length;
  }

  private classifyEvolutionChange(change: EvolutionChange): EvolutionChange {
    if (change.ruleDrafts?.length && change.field === 'expressionRules') {
      const content =
        change.content?.trim()
        || change.ruleDrafts.map((d) => d.content).join('\n');
      const reason = change.reason?.trim()
        || change.ruleDrafts.map((d) => d.reason).filter(Boolean).join('；');
      return {
        ...change,
        field: 'expressionRules',
        targetField: 'expressionRules',
        layer: 'expression',
        risk: 'medium',
        content,
        reason: reason || 'expression rules',
      };
    }

    const content = change.content.trim();
    const reason = (change.reason || '').trim();
    const combined = `${content} ${reason}`;

    const field = change.field;

    if (this.shouldRouteToExpression(field, combined)) {
      const isPreference = this.isUserPreferenceSignal(combined);
      const preferenceField = this.inferPreferenceField(combined);
      return {
        ...change,
        field: 'expressionRules',
        targetField: isPreference ? preferenceField : 'expressionRules',
        layer: isPreference ? 'user-preference' : 'expression',
        risk: isPreference ? 'low' : 'medium',
        reroutedFrom: field !== 'expressionRules' ? field : undefined,
      };
    }

    return {
      ...change,
      field,
      targetField: field,
      layer: this.defaultLayerForField(field),
      risk: this.defaultRiskForField(field),
    };
  }

  private isUserPreferenceSignal(text: string): boolean {
    return /偏好|不喜欢|明确在意|gpt味|GPT味|记住某信息|确认一句|只确认|喜欢|嘴甜|彩虹屁|被哄|夸赞/.test(text);
  }

  private inferPreferenceField(text: string): UserProfileField {
    if (/偏好|不喜欢|gpt味|GPT味|口语|短句|像助手|像朋友/.test(text)) return 'preferredVoiceStyle';
    if (/彩虹屁|嘴甜|夸赞|被哄|情绪价值/.test(text)) return 'praisePreference';
    return 'responseRhythm';
  }

  private shouldKeepSuggestedChange(change: EvolutionChange): boolean {
    if (!CORE_PERSONA_FIELDS.has(change.field)) return true;
    const evidence = `${change.content} ${change.reason}`;
    return /长期|多次|反复|稳定|一贯|关系加深|长期证据/.test(evidence);
  }

  private shouldRouteToExpression(field: PersonaField, text: string): boolean {
    if (field === 'expressionRules') return true;
    return (
      CORE_PERSONA_FIELDS.has(field)
      && /口语|短句|gpt味|GPT味|规整|模板|结构化|连接词|像助手|更像朋友|确认一句|只确认|少展开|不额外展开|留白|等待她下一步|不多说|不延展|彩虹屁|嘴甜|夸赞|被哄|轻量|情绪价值|接住/.test(text)
    );
  }

  /**
   * 获取所有激活 persona（每个 personaKey 只会保留一个 isActive=true 的版本）
   * 用于配置页切换人格。
   */
  async listActivePersonas(): Promise<PersonaSlotDto[]> {
    const rows = await this.prisma.persona.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        personaKey: true,
        identity: true,
        personality: true,
        version: true,
        updatedAt: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      personaKey: r.personaKey,
      identity: r.identity,
      personality: r.personality,
      version: r.version,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * 创建一个新的 personaKey，并从 basePersonaKey 复制当前人格内容。
   */
  async createPersonaSlot(personaKey?: string, basePersonaKey?: string): Promise<PersonaDto> {
    const newKey = (personaKey?.trim() || `persona_${Date.now().toString(36)}`).trim();
    const baseKey = (basePersonaKey?.trim() || await this.resolvePreferredPersonaKey()).trim();

    const existing = await this.prisma.persona.findFirst({
      where: { personaKey: newKey, isActive: true },
      select: { id: true },
    });
    if (existing) {
      throw new Error(`personaKey already exists and isActive=true: ${newKey}`);
    }

    const base = await this.getOrCreate(baseKey);

    const created = await this.prisma.persona.create({
      data: {
        personaKey: newKey,
        identity: base.identity,
        personality: base.personality,
        valueBoundary: base.valueBoundary,
        behaviorForbidden: base.behaviorForbidden,
        expressionRules: base.expressionRules,
        metaFilterPolicy: base.metaFilterPolicy,
        evolutionAllowed: base.evolutionAllowed,
        evolutionForbidden: base.evolutionForbidden,
        version: 1,
        isActive: true,
      },
    });

    return this.toDto(created);
  }

  private defaultLayerForField(field: PersonaField): EvolutionLayer {
    if (CORE_PERSONA_FIELDS.has(field)) return 'persona-core';
    if (field === 'behaviorForbidden') return 'persona-boundary';
    return 'expression';
  }

  private defaultRiskForField(field: PersonaField): EvolutionRisk {
    if (CORE_PERSONA_FIELDS.has(field)) return 'high';
    if (field === 'behaviorForbidden' || EXPRESSION_FIELDS.has(field)) return 'medium';
    return 'low';
  }

  private maxRisk(risks: EvolutionRisk[]): EvolutionRisk {
    if (risks.includes('high')) return 'high';
    if (risks.includes('medium')) return 'medium';
    return 'low';
  }

  private isPersonaTargetField(field: EvolutionStorageField): field is PersonaField {
    return (PERSONA_FIELDS as string[]).includes(field);
  }

  private isUserPreferenceField(field: EvolutionStorageField): field is UserProfileField {
    return (
      field === 'preferredVoiceStyle'
      || field === 'praisePreference'
      || field === 'responseRhythm'
    );
  }

  private toRules(text: string, source: 'current' | 'evolution'): NormalizedRule[] {
    return this.splitRules(text)
      .map((line) => this.toRule(line, source))
      .filter((rule): rule is NormalizedRule => !!rule);
  }

  private toRule(text: string, source: 'current' | 'evolution'): NormalizedRule | null {
    const cleaned = text
      .replace(/^\[[^\]]+\]\s*/g, '')
      .replace(/^[\-\d\.\s]+/, '')
      .trim();

    if (!cleaned) return null;

    return {
      text: cleaned,
      normalized: this.normalizeRule(cleaned),
      strength: this.estimateRuleStrength(cleaned),
      specificity: this.estimateRuleSpecificity(cleaned),
      source,
    };
  }

  private splitRules(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        if (/^[-\d\.]/.test(line)) return [line];
        return line
          .split(/[。；;]/)
          .map((part) => part.trim())
          .filter(Boolean);
      });
  }

  private normalizeRule(text: string): string {
    return text
      .replace(/\s+/g, '')
      .replace(/[，,。！!？?；;：“”"'`]/g, '')
      .replace(/你应该/g, '避免命令式')
      .replace(/不要用/g, '不使用')
      .replace(/别/g, '不')
      .toLowerCase();
  }

  private estimateRuleStrength(text: string): number {
    let score = 0;
    if (/不|不得|禁止|必须|只在|仅在|不要/.test(text)) score += 2;
    if (/优先|直接|明确|保持|允许/.test(text)) score += 1;
    return score;
  }

  private estimateRuleSpecificity(text: string): number {
    let score = 0;
    if (/当|如果|除非|只有|用户|当前状态/.test(text)) score += 2;
    if (/追问|情绪|分析|决策|停顿|结论/.test(text)) score += 1;
    return score;
  }

  private isNearDuplicate(a: NormalizedRule, b: NormalizedRule): boolean {
    if (a.normalized === b.normalized) return true;

    const aTokens = this.chunkNormalized(a.normalized);
    const bTokens = this.chunkNormalized(b.normalized);
    if (!aTokens.length || !bTokens.length) return false;

    const overlap = aTokens.filter((token) => bTokens.includes(token)).length;
    const ratio = overlap / Math.max(aTokens.length, bTokens.length);
    return ratio >= 0.6;
  }

  private chunkNormalized(text: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length - 1; i += 1) {
      chunks.push(text.slice(i, i + 2));
    }
    return chunks;
  }

  private mergeNearRules(a: NormalizedRule, b: NormalizedRule): NormalizedRule {
    const mergedText = this.mergeRuleTexts(a.text, b.text);
    return {
      text: mergedText,
      normalized: this.normalizeRule(mergedText),
      strength: Math.max(a.strength, b.strength),
      specificity: Math.max(a.specificity, b.specificity),
      source: b.source,
    };
  }

  private mergeRuleTexts(a: string, b: string): string {
    const joined = `${a} ${b}`;

    if (
      /直接/.test(joined)
      && (/柔和/.test(joined) || /轻/.test(joined))
      && (/冷/.test(joined) || /不带刺/.test(joined))
    ) {
      return '判断直接，语气保持轻和，不显得冷，也不带刺。';
    }

    if (/不主动追问/.test(joined) && (/必要/.test(joined) || /卡住/.test(joined) || /决定/.test(joined))) {
      return '默认不主动追问，只有用户明显卡住或在做决定时再推进。';
    }

    if (/无需推进/.test(joined) && /停止输出/.test(joined)) {
      return '没有新增信息且无需推进时，直接停在自然节点。';
    }

    return a.length <= b.length ? a : b;
  }

  private isConflictingRule(a: string, b: string): boolean {
    const text = `${a} | ${b}`;
    return (
      (/不主动追问/.test(text) && /主动追问/.test(text))
      || (/不总结/.test(text) && /主动总结/.test(text))
      || (/简短/.test(text) && /展开分析/.test(text))
      || (/不下结论/.test(text) && /直接给结论/.test(text))
    );
  }

  private pickBetterRule(a: NormalizedRule, b: NormalizedRule): NormalizedRule {
    const score = (rule: NormalizedRule) => (
      rule.strength * 3
      + rule.specificity * 2
      - rule.text.length * 0.01
      + (rule.source === 'evolution' ? 0.1 : 0)
    );
    return score(b) >= score(a) ? b : a;
  }
}
