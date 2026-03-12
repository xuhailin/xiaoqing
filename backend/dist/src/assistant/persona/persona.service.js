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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaService = exports.PERSONA_FIELD_LABELS = exports.DEFAULT_EVOLUTION_FORBIDDEN = exports.DEFAULT_EVOLUTION_ALLOWED = exports.DEFAULT_SILENCE_PERMISSION = exports.DEFAULT_ADAPTIVE_RULES = exports.DEFAULT_VOICE_STYLE = exports.DEFAULT_BEHAVIOR_FORBIDDEN = exports.DEFAULT_VALUE_BOUNDARY = exports.DEFAULT_PERSONALITY = exports.DEFAULT_IDENTITY = exports.DEFAULT_META_FILTER_POLICY = exports.PERSONA_FIELDS = exports.IMPRESSION_PROMPT_VERSION = exports.EVOLVE_PROMPT_VERSION = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infra/prisma.service");
const llm_service_1 = require("../../infra/llm/llm.service");
const user_profile_service_1 = require("./user-profile.service");
exports.EVOLVE_PROMPT_VERSION = 'evolve_v3';
exports.IMPRESSION_PROMPT_VERSION = 'impression_v1';
exports.PERSONA_FIELDS = [
    'identity',
    'personality',
    'valueBoundary',
    'behaviorForbidden',
    'voiceStyle',
    'adaptiveRules',
    'silencePermission',
];
exports.DEFAULT_META_FILTER_POLICY = `- 禁止解释自己的对话策略
- 禁止描述内部逻辑
- 像真实朋友一样说话`;
exports.DEFAULT_IDENTITY = `
你叫小晴。
你是她的长期对话伙伴，是朋友。
你站在她那一边，而不是站在正确那一边。`;
exports.DEFAULT_PERSONALITY = `
你冷静、清醒，但表达温柔简短。
不附和，有自己的判断，但说话方式是轻轻的、带暖意的。
比起讲道理，你更在意她此刻的状态。
偏心她，但不会用刺来表达。`;
exports.DEFAULT_VALUE_BOUNDARY = `
不追求正确，追求真实。
不确定可以直接说不确定。
允许有主观态度。`;
exports.DEFAULT_BEHAVIOR_FORBIDDEN = `
- 不使用”你应该”
- 不模板化共情
- 不说教
- 不强行正能量
- 不假装完全理解她
- 不用嘲讽或反讽语气`;
exports.DEFAULT_VOICE_STYLE = `- 语气温柔简短，像朋友之间的轻声说话。
- 可以用语气词（嗯、呐、啦），但不刻意卖萌。
- 判断直接但措辞柔和，用"可能"、"我觉得"替代断言。
- 简洁优先，一两句说完就好，不铺垫。`;
exports.DEFAULT_ADAPTIVE_RULES = `- 输出优先级：判断清晰 > 简洁表达 > 情绪回应 > 延展聊天。
- 一句话能完成表达，不扩展为多句。
- 无新增信息，不延展。
- 当信息不足时，直接指出不足。
- 当逻辑有问题时，直接指出。
- 当无需推进时，停止输出。`;
exports.DEFAULT_SILENCE_PERMISSION = `- 对话允许停在自然节点，无需填满。
- 不主动追问，除非判断有必要。
- 空白不是冷漠，而是给用户消化信息或让模型保持稳定。
- 留白可用于强化人格稳定感与判断权重。`;
exports.DEFAULT_EVOLUTION_ALLOWED = `
在保持气质不变的前提下，可以随着时间更了解她的判断方式与拧巴点。`;
exports.DEFAULT_EVOLUTION_FORBIDDEN = `
不得变成说教型。
不得变成冷静高效的任务机器。
不得为了正确而压掉真实。`;
exports.PERSONA_FIELD_LABELS = {
    identity: '身份定位',
    personality: '性格特质',
    valueBoundary: '价值边界',
    behaviorForbidden: '行为禁止项',
    voiceStyle: '语言风格',
    adaptiveRules: '自适应表达',
    silencePermission: '留白许可',
};
const FIELD_RULE_LIMITS = {
    identity: 4,
    personality: 5,
    valueBoundary: 4,
    behaviorForbidden: 5,
    voiceStyle: 5,
    adaptiveRules: 5,
    silencePermission: 4,
};
const CORE_PERSONA_FIELDS = new Set(['identity', 'personality', 'valueBoundary']);
const EXPRESSION_FIELDS = new Set(['voiceStyle', 'adaptiveRules', 'silencePermission']);
let PersonaService = class PersonaService {
    prisma;
    llm;
    userProfile;
    constructor(prisma, llm, userProfile) {
        this.prisma = prisma;
        this.llm = llm;
        this.userProfile = userProfile;
    }
    async getOrCreate() {
        const existing = await this.prisma.persona.findFirst({
            where: { isActive: true },
            orderBy: { version: 'desc' },
        });
        if (existing)
            return this.toDto(existing);
        const created = await this.prisma.persona.create({
            data: {
                identity: exports.DEFAULT_IDENTITY,
                personality: exports.DEFAULT_PERSONALITY,
                valueBoundary: exports.DEFAULT_VALUE_BOUNDARY,
                behaviorForbidden: exports.DEFAULT_BEHAVIOR_FORBIDDEN,
                voiceStyle: exports.DEFAULT_VOICE_STYLE,
                adaptiveRules: exports.DEFAULT_ADAPTIVE_RULES,
                silencePermission: exports.DEFAULT_SILENCE_PERMISSION,
                metaFilterPolicy: exports.DEFAULT_META_FILTER_POLICY,
                evolutionAllowed: exports.DEFAULT_EVOLUTION_ALLOWED,
                evolutionForbidden: exports.DEFAULT_EVOLUTION_FORBIDDEN,
                version: 1,
                isActive: true,
            },
        });
        return this.toDto(created);
    }
    async update(data) {
        const current = await this.getOrCreate();
        const merged = {
            identity: data.identity ?? current.identity,
            personality: data.personality ?? current.personality,
            valueBoundary: data.valueBoundary ?? current.valueBoundary,
            behaviorForbidden: data.behaviorForbidden ?? current.behaviorForbidden,
            voiceStyle: data.voiceStyle ?? current.voiceStyle,
            adaptiveRules: data.adaptiveRules ?? current.adaptiveRules,
            silencePermission: data.silencePermission ?? current.silencePermission,
            metaFilterPolicy: data.metaFilterPolicy ?? current.metaFilterPolicy,
            evolutionAllowed: data.evolutionAllowed ?? current.evolutionAllowed,
            evolutionForbidden: data.evolutionForbidden ?? current.evolutionForbidden,
        };
        const [created] = await this.prisma.$transaction([
            this.prisma.persona.create({
                data: {
                    ...merged,
                    version: current.version + 1,
                    isActive: true,
                },
            }),
            this.prisma.persona.update({
                where: { id: current.id },
                data: { isActive: false },
            }),
        ]);
        return this.toDto(created);
    }
    async suggestEvolution(recentMessages) {
        const persona = await this.getOrCreate();
        const dialogue = recentMessages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n');
        const fieldDescriptions = exports.PERSONA_FIELDS.map((f) => `- ${f}（${exports.PERSONA_FIELD_LABELS[f]}）：${persona[f].slice(0, 100)}…`).join('\n');
        const messages = [
            {
                role: 'system',
                content: `[${exports.EVOLVE_PROMPT_VERSION}] 你是人格进化分析器。根据近期对话和当前人格的各字段，输出精准的微调建议。

当前人格字段：
${fieldDescriptions}

允许的进化方向：
${persona.evolutionAllowed}

禁止的进化：
${persona.evolutionForbidden}

输出 JSON：
{
  "changes": [
    { "field": "字段名", "content": "一条待合并的简洁规则", "reason": "变更理由" }
  ]
}

规则：
- field 必须是以下之一：${exports.PERSONA_FIELDS.join(', ')}
- content 只写最终想新增或强化的一条规则，不要写“追加到末尾”“保留历史版本”“[进化]”之类描述
- content 必须简洁，尽量一两句话，避免与现有表达重复
- 默认优先调整 voiceStyle / adaptiveRules / silencePermission
- identity / personality / valueBoundary 属于核心人格，除非是长期、稳定、强证据的变化，否则不要建议修改
- 如果只是用户偏好（比如更口语、讨厌 GPT 味、希望少展开、喜欢轻量夸赞），不要写成人格核心变化，优先落到表达调度字段
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
            const parsed = JSON.parse(jsonStr);
            if (!Array.isArray(parsed.changes))
                return { changes: [] };
            const validChanges = parsed.changes.filter((c) => exports.PERSONA_FIELDS.includes(c.field) && typeof c.content === 'string' && c.content.trim());
            return {
                changes: this.normalizeEvolutionChanges(validChanges)
                    .filter((change) => this.shouldKeepSuggestedChange(change)),
            };
        }
        catch {
            return { changes: [] };
        }
    }
    async confirmEvolution(changes) {
        if (!changes.length)
            return { accepted: false, reason: 'no changes provided' };
        const persona = await this.getOrCreate();
        const normalizedChanges = this.normalizeEvolutionChanges(changes);
        const summary = normalizedChanges.map((c) => `[${c.field}] ${c.content}`).join('\n');
        const valid = await this.validateAgainstPool(summary, persona.evolutionForbidden);
        if (!valid.ok) {
            return { accepted: false, reason: valid.reason };
        }
        const evolvedFields = this.buildEvolvedFields(persona, normalizedChanges);
        const preferenceUpdates = this.buildEvolvedUserPreferences(normalizedChanges);
        const hasPersonaChanges = Object.keys(evolvedFields).length > 0;
        let finalPersona = persona;
        if (hasPersonaChanges) {
            const newVersion = persona.version + 1;
            const [created] = await this.prisma.$transaction([
                this.prisma.persona.create({
                    data: {
                        identity: evolvedFields['identity'] ?? persona.identity,
                        personality: evolvedFields['personality'] ?? persona.personality,
                        valueBoundary: evolvedFields['valueBoundary'] ?? persona.valueBoundary,
                        behaviorForbidden: evolvedFields['behaviorForbidden'] ?? persona.behaviorForbidden,
                        voiceStyle: evolvedFields['voiceStyle'] ?? persona.voiceStyle,
                        adaptiveRules: evolvedFields['adaptiveRules'] ?? persona.adaptiveRules,
                        silencePermission: evolvedFields['silencePermission'] ?? persona.silencePermission,
                        metaFilterPolicy: persona.metaFilterPolicy,
                        evolutionAllowed: persona.evolutionAllowed,
                        evolutionForbidden: persona.evolutionForbidden,
                        version: newVersion,
                        isActive: true,
                    },
                }),
                this.prisma.persona.update({
                    where: { id: persona.id },
                    data: { isActive: false },
                }),
            ]);
            finalPersona = this.toDto(created);
            await Promise.all(normalizedChanges
                .filter((c) => this.isPersonaTargetField(c.targetField ?? c.field))
                .map((c) => this.prisma.personaEvolutionLog.create({
                data: {
                    personaId: created.id,
                    field: c.targetField ?? c.field,
                    content: c.content,
                    reason: c.reason,
                    version: newVersion,
                },
            })));
        }
        if (Object.keys(preferenceUpdates).length > 0) {
            await this.userProfile.mergeRules(preferenceUpdates);
        }
        return { accepted: true, persona: finalPersona };
    }
    async previewEvolution(changes) {
        if (!changes.length)
            return { accepted: false, reason: 'no changes provided' };
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
        const previewFields = [];
        for (const field of exports.PERSONA_FIELDS) {
            const after = evolvedFields[field];
            if (!after || after === persona[field])
                continue;
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
            },
        };
    }
    buildPersonaPrompt(dto) {
        const sections = [];
        if (dto.identity)
            sections.push(dto.identity);
        if (dto.personality)
            sections.push(dto.personality);
        if (dto.valueBoundary)
            sections.push(dto.valueBoundary);
        if (dto.behaviorForbidden)
            sections.push(dto.behaviorForbidden);
        return sections.join('\n\n');
    }
    getExpressionFields(dto) {
        return {
            voiceStyle: dto.voiceStyle,
            adaptiveRules: dto.adaptiveRules,
            silencePermission: dto.silencePermission,
        };
    }
    async validateAgainstPool(suggestion, forbidden) {
        const messages = [
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
        }
        catch {
            return { ok: true };
        }
    }
    async getHistory() {
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
    toDto(p) {
        return {
            id: p.id,
            identity: p.identity || exports.DEFAULT_IDENTITY,
            personality: p.personality || exports.DEFAULT_PERSONALITY,
            valueBoundary: p.valueBoundary || exports.DEFAULT_VALUE_BOUNDARY,
            behaviorForbidden: p.behaviorForbidden || exports.DEFAULT_BEHAVIOR_FORBIDDEN,
            voiceStyle: p.voiceStyle || exports.DEFAULT_VOICE_STYLE,
            adaptiveRules: p.adaptiveRules || exports.DEFAULT_ADAPTIVE_RULES,
            silencePermission: p.silencePermission || exports.DEFAULT_SILENCE_PERMISSION,
            metaFilterPolicy: p.metaFilterPolicy || exports.DEFAULT_META_FILTER_POLICY,
            evolutionAllowed: p.evolutionAllowed,
            evolutionForbidden: p.evolutionForbidden,
            version: p.version,
        };
    }
    mergeFieldContent(field, current, incoming) {
        const rules = this.toRules(current, 'current');
        for (const addition of incoming) {
            const next = this.toRule(addition, 'evolution');
            if (!next)
                continue;
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
    buildEvolvedFields(persona, changes) {
        const groupedChanges = new Map();
        for (const change of changes) {
            const target = change.targetField ?? change.field;
            if (!this.isPersonaTargetField(target))
                continue;
            const content = typeof change.content === 'string' ? change.content.trim() : '';
            if (!content)
                continue;
            const bucket = groupedChanges.get(target) ?? [];
            bucket.push(content);
            groupedChanges.set(target, bucket);
        }
        const evolvedFields = {};
        for (const field of exports.PERSONA_FIELDS) {
            const incoming = groupedChanges.get(field);
            if (!incoming?.length)
                continue;
            evolvedFields[field] = this.mergeFieldContent(field, persona[field], incoming);
        }
        return evolvedFields;
    }
    buildEvolvedUserPreferences(changes) {
        const grouped = {};
        for (const change of changes) {
            const target = change.targetField ?? change.field;
            if (!this.isUserPreferenceField(target))
                continue;
            const content = change.content.trim();
            if (!content)
                continue;
            grouped[target] = [...(grouped[target] ?? []), content];
        }
        return grouped;
    }
    buildUserPreferencePreview(current, changes) {
        const updates = this.buildEvolvedUserPreferences(changes);
        const fields = [];
        Object.keys(updates).forEach((field) => {
            const incoming = updates[field];
            if (!incoming?.length)
                return;
            const after = this.previewMergedUserPreferenceField(current[field], incoming);
            if (after === current[field])
                return;
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
    previewMergedUserPreferenceField(current, incoming) {
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
    toPreferenceRules(text) {
        return text
            .split('\n')
            .map((line) => line.trim().replace(/^[\-\s]+/, ''))
            .filter(Boolean);
    }
    normalizeEvolutionChanges(changes) {
        return changes
            .filter((change) => exports.PERSONA_FIELDS.includes(change.field))
            .map((change) => this.classifyEvolutionChange(change))
            .filter((change) => !!change.content?.trim());
    }
    classifyEvolutionChange(change) {
        const content = change.content.trim();
        const reason = (change.reason || '').trim();
        const combined = `${content} ${reason}`;
        if (this.shouldRouteToVoiceStyle(change.field, combined)) {
            const isPreference = /偏好|不喜欢|明确在意|gpt味|GPT味/.test(combined);
            return {
                ...change,
                targetField: isPreference ? 'preferredVoiceStyle' : 'voiceStyle',
                layer: isPreference ? 'user-preference' : 'expression',
                risk: isPreference ? 'low' : 'medium',
                reroutedFrom: change.field !== 'voiceStyle' ? change.field : undefined,
            };
        }
        if (this.shouldRouteToSilence(change.field, combined)) {
            const isPreference = /偏好|记住某信息|确认一句|只确认/.test(combined);
            return {
                ...change,
                targetField: isPreference ? 'responseRhythm' : 'silencePermission',
                layer: isPreference ? 'user-preference' : 'expression',
                risk: isPreference ? 'low' : 'medium',
                reroutedFrom: change.field !== 'silencePermission' ? change.field : undefined,
            };
        }
        if (this.shouldRouteToAdaptive(change.field, combined)) {
            const isPreference = /偏好|喜欢|嘴甜|彩虹屁|被哄|夸赞/.test(combined);
            return {
                ...change,
                targetField: isPreference ? 'praisePreference' : 'adaptiveRules',
                layer: isPreference ? 'user-preference' : 'expression',
                risk: isPreference ? 'low' : 'medium',
                reroutedFrom: change.field !== 'adaptiveRules' ? change.field : undefined,
            };
        }
        return {
            ...change,
            targetField: change.field,
            layer: this.defaultLayerForField(change.field),
            risk: this.defaultRiskForField(change.field),
        };
    }
    shouldKeepSuggestedChange(change) {
        if (!CORE_PERSONA_FIELDS.has(change.field))
            return true;
        const evidence = `${change.content} ${change.reason}`;
        return /长期|多次|反复|稳定|一贯|关系加深|长期证据/.test(evidence);
    }
    shouldRouteToVoiceStyle(field, text) {
        if (field === 'voiceStyle')
            return true;
        return (CORE_PERSONA_FIELDS.has(field)
            && /口语|短句|gpt味|GPT味|规整|模板|结构化|连接词|像助手|更像朋友/.test(text));
    }
    shouldRouteToSilence(field, text) {
        if (field === 'silencePermission')
            return true;
        return ((CORE_PERSONA_FIELDS.has(field) || field === 'adaptiveRules')
            && /确认一句|只确认|少展开|不额外展开|留白|等待她下一步|不多说|不延展|记住某信息/.test(text));
    }
    shouldRouteToAdaptive(field, text) {
        if (field === 'adaptiveRules')
            return true;
        return ((CORE_PERSONA_FIELDS.has(field) || field === 'voiceStyle' || field === 'silencePermission')
            && /彩虹屁|嘴甜|夸赞|被哄|轻量|个人化细节|情绪价值|心疼钱|接住/.test(text));
    }
    defaultLayerForField(field) {
        if (CORE_PERSONA_FIELDS.has(field))
            return 'persona-core';
        if (field === 'behaviorForbidden')
            return 'persona-boundary';
        return 'expression';
    }
    defaultRiskForField(field) {
        if (CORE_PERSONA_FIELDS.has(field))
            return 'high';
        if (field === 'behaviorForbidden' || EXPRESSION_FIELDS.has(field))
            return 'medium';
        return 'low';
    }
    maxRisk(risks) {
        if (risks.includes('high'))
            return 'high';
        if (risks.includes('medium'))
            return 'medium';
        return 'low';
    }
    isPersonaTargetField(field) {
        return exports.PERSONA_FIELDS.includes(field);
    }
    isUserPreferenceField(field) {
        return (field === 'preferredVoiceStyle'
            || field === 'praisePreference'
            || field === 'responseRhythm');
    }
    toRules(text, source) {
        return this.splitRules(text)
            .map((line) => this.toRule(line, source))
            .filter((rule) => !!rule);
    }
    toRule(text, source) {
        const cleaned = text
            .replace(/^\[[^\]]+\]\s*/g, '')
            .replace(/^[\-\d\.\s]+/, '')
            .trim();
        if (!cleaned)
            return null;
        return {
            text: cleaned,
            normalized: this.normalizeRule(cleaned),
            strength: this.estimateRuleStrength(cleaned),
            specificity: this.estimateRuleSpecificity(cleaned),
            source,
        };
    }
    splitRules(text) {
        return text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .flatMap((line) => {
            if (/^[-\d\.]/.test(line))
                return [line];
            return line
                .split(/[。；;]/)
                .map((part) => part.trim())
                .filter(Boolean);
        });
    }
    normalizeRule(text) {
        return text
            .replace(/\s+/g, '')
            .replace(/[，,。！!？?；;：“”"'`]/g, '')
            .replace(/你应该/g, '避免命令式')
            .replace(/不要用/g, '不使用')
            .replace(/别/g, '不')
            .toLowerCase();
    }
    estimateRuleStrength(text) {
        let score = 0;
        if (/不|不得|禁止|必须|只在|仅在|不要/.test(text))
            score += 2;
        if (/优先|直接|明确|保持|允许/.test(text))
            score += 1;
        return score;
    }
    estimateRuleSpecificity(text) {
        let score = 0;
        if (/当|如果|除非|只有|用户|当前状态/.test(text))
            score += 2;
        if (/追问|情绪|分析|决策|停顿|结论/.test(text))
            score += 1;
        return score;
    }
    isNearDuplicate(a, b) {
        if (a.normalized === b.normalized)
            return true;
        const aTokens = this.chunkNormalized(a.normalized);
        const bTokens = this.chunkNormalized(b.normalized);
        if (!aTokens.length || !bTokens.length)
            return false;
        const overlap = aTokens.filter((token) => bTokens.includes(token)).length;
        const ratio = overlap / Math.max(aTokens.length, bTokens.length);
        return ratio >= 0.6;
    }
    chunkNormalized(text) {
        const chunks = [];
        for (let i = 0; i < text.length - 1; i += 1) {
            chunks.push(text.slice(i, i + 2));
        }
        return chunks;
    }
    mergeNearRules(a, b) {
        const mergedText = this.mergeRuleTexts(a.text, b.text);
        return {
            text: mergedText,
            normalized: this.normalizeRule(mergedText),
            strength: Math.max(a.strength, b.strength),
            specificity: Math.max(a.specificity, b.specificity),
            source: b.source,
        };
    }
    mergeRuleTexts(a, b) {
        const joined = `${a} ${b}`;
        if (/直接/.test(joined)
            && (/柔和/.test(joined) || /轻/.test(joined))
            && (/冷/.test(joined) || /不带刺/.test(joined))) {
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
    isConflictingRule(a, b) {
        const text = `${a} | ${b}`;
        return ((/不主动追问/.test(text) && /主动追问/.test(text))
            || (/不总结/.test(text) && /主动总结/.test(text))
            || (/简短/.test(text) && /展开分析/.test(text))
            || (/不下结论/.test(text) && /直接给结论/.test(text)));
    }
    pickBetterRule(a, b) {
        const score = (rule) => (rule.strength * 3
            + rule.specificity * 2
            - rule.text.length * 0.01
            + (rule.source === 'evolution' ? 0.1 : 0));
        return score(b) >= score(a) ? b : a;
    }
};
exports.PersonaService = PersonaService;
exports.PersonaService = PersonaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_service_1.LlmService,
        user_profile_service_1.UserProfileService])
], PersonaService);
//# sourceMappingURL=persona.service.js.map