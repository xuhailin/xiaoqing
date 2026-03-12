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
exports.PromptRouterService = exports.TOOL_WRAP_PROMPT_VERSION = exports.RANK_PROMPT_VERSION = exports.MEMORY_ANALYSIS_PROMPT_VERSION = exports.SUMMARY_PROMPT_VERSION = exports.CHAT_PROMPT_VERSION = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../infra/llm/llm.service");
const token_estimator_1 = require("../../infra/token-estimator");
const claim_schema_registry_1 = require("../claim-engine/claim-schema.registry");
exports.CHAT_PROMPT_VERSION = 'chat_v6';
exports.SUMMARY_PROMPT_VERSION = 'summary_v2';
exports.MEMORY_ANALYSIS_PROMPT_VERSION = 'memory_analysis_v1';
exports.RANK_PROMPT_VERSION = 'rank_v1';
exports.TOOL_WRAP_PROMPT_VERSION = 'tool_wrap_v1';
let PromptRouterService = class PromptRouterService {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    buildChatMessages(ctx) {
        const personaPart = ctx.personaPrompt?.trim() ?? '';
        let identityAnchorPart = '';
        if (ctx.identityAnchor) {
            identityAnchorPart = `关于她：\n${ctx.identityAnchor}`;
        }
        let memoryPart = '';
        if (ctx.memories?.length) {
            const lines = ctx.memories.map((m) => `- ${m.content}`);
            memoryPart = `你记得的事：\n${lines.join('\n')}`;
        }
        let userProfilePart = '';
        if (ctx.userProfileText) {
            userProfilePart = ctx.userProfileText;
        }
        const expressionPart = this.buildExpressionPolicy(ctx.expressionFields, ctx.intentState);
        const metaPart = this.buildMetaFilterPolicy(ctx.metaFilterPolicy);
        const personaPresencePart = this.buildPersonaPresenceAnchor(ctx.expressionFields);
        let worldStatePart = '';
        if (ctx.worldState && (ctx.worldState.city ?? ctx.worldState.timezone ?? ctx.worldState.language)) {
            const lines = ['[默认世界状态（未显式变更前默认成立，不要反复追问）]'];
            if (ctx.worldState.city)
                lines.push(`- 地点：${ctx.worldState.city}`);
            if (ctx.worldState.timezone)
                lines.push(`- 时区：${ctx.worldState.timezone}`);
            if (ctx.worldState.language)
                lines.push(`- 语言：${ctx.worldState.language}`);
            worldStatePart = lines.join('\n');
        }
        let intentPart = '';
        if (ctx.intentState) {
            const s = ctx.intentState;
            intentPart = `[当前对话意图状态]\n- mode: ${s.mode}\n- seriousness: ${s.seriousness}\n- expectation: ${s.expectation}\n- agency: ${s.agency}\n- requiresTool: ${s.requiresTool}\n- taskIntent: ${s.taskIntent}\n- escalation: ${s.escalation}\n- confidence: ${s.confidence}`;
        }
        const cognitivePart = this.buildCognitivePolicy(ctx.cognitiveState);
        const growthPart = this.buildGrowthPolicy(ctx.growthContext);
        const boundaryPart = this.buildBoundaryPolicy(ctx.boundaryPrompt);
        const claimPart = ctx.claimPolicyText ?? '';
        const sessionStatePart = ctx.sessionStateText ?? '';
        const parts = [
            `[${exports.CHAT_PROMPT_VERSION}]`,
            personaPart,
            identityAnchorPart,
            memoryPart,
            userProfilePart,
            worldStatePart,
            intentPart,
            growthPart,
            claimPart,
            sessionStatePart,
            boundaryPart,
            cognitivePart,
            metaPart,
            expressionPart,
            personaPresencePart,
        ].filter(Boolean);
        const system = {
            role: 'system',
            content: parts.join('\n\n'),
        };
        const history = ctx.messages.map((m) => ({ role: m.role, content: m.content }));
        return [system, ...history];
    }
    buildCognitivePolicy(state) {
        if (!state)
            return '';
        if (state.situation.kind === 'casual_chat') {
            const lines = [
                '[当前认知决策]',
                `- situation: ${state.situation.kind} (${state.situation.summary})`,
                `- emotion: ${state.userState.emotion}, fragility: ${state.userState.fragility}`,
                `- strategy: ${state.responseStrategy.primaryMode}, depth=${state.responseStrategy.depth}, initiative=${state.responseStrategy.initiative}`,
                `- rhythm: pacing=${state.rhythm.pacing}, askFollowup=${state.rhythm.shouldAskFollowup}`,
                `- affinity: mode=${state.affinity.mode}, allowLightTease=${state.affinity.allowLightTease}`,
            ];
            return lines.join('\n');
        }
        const safetyLine = state.safety.notes.length
            ? `- safety: ${state.safety.notes.join('; ')}`
            : '- safety: keep capability and truth boundaries';
        const lines = [
            '[当前认知决策]',
            `- situation: ${state.situation.kind} (${state.situation.summary})`,
            `- userState: emotion=${state.userState.emotion}, need=${state.userState.needMode}, load=${state.userState.cognitiveLoad}, fragility=${state.userState.fragility}`,
            `- responseStrategy: primary=${state.responseStrategy.primaryMode}, secondary=${state.responseStrategy.secondaryMode}, goal=${state.responseStrategy.goal}, depth=${state.responseStrategy.depth}, initiative=${state.responseStrategy.initiative}`,
            `- judgement: style=${state.judgement.style}, challengeContradiction=${state.judgement.shouldChallengeContradiction}`,
            `- values: ${state.value.priorities.join(' > ')}`,
            `- emotionRule: ${state.emotionRule.rule} (${state.emotionRule.responseOrder.join(' -> ')})`,
            `- affinity: mode=${state.affinity.mode}, allowLightTease=${state.affinity.allowLightTease}`,
            `- rhythm: pacing=${state.rhythm.pacing}, askFollowup=${state.rhythm.shouldAskFollowup}, initiative=${state.rhythm.initiative}`,
            `- relationship: stage=${state.relationship.stage}, confidence=${state.relationship.confidence}`,
            safetyLine,
            '- 执行要求: 先遵守回应策略，再生成文字；不要跳过情绪优先级，不要伪造能力。',
        ];
        return lines.join('\n');
    }
    buildGrowthPolicy(growth) {
        if (!growth)
            return '';
        const lines = [];
        const profileItems = this.uniqueLines(growth.cognitiveProfiles, 3);
        const judgmentItems = this.uniqueLines(growth.judgmentPatterns, 3);
        const valueItems = this.uniqueLines(growth.valuePriorities, 3);
        const rhythmItems = this.uniqueLines(growth.rhythmPatterns, 3);
        const relationshipItems = this.uniqueLines(growth.relationshipNotes, 2);
        const boundaryItems = this.uniqueLines(growth.boundaryNotes, 2);
        if (profileItems.length > 0) {
            lines.push('[长期认知画像]');
            lines.push(...profileItems.map((item) => `- ${item}`));
        }
        if (judgmentItems.length > 0) {
            lines.push('[判断模式]');
            lines.push(...judgmentItems.map((item) => `- ${item}`));
        }
        if (valueItems.length > 0) {
            lines.push('[价值排序]');
            lines.push(...valueItems.map((item) => `- ${item}`));
        }
        if (rhythmItems.length > 0) {
            lines.push('[关系节奏]');
            lines.push(...rhythmItems.map((item) => `- ${item}`));
        }
        if (relationshipItems.length > 0) {
            lines.push('[关系状态]');
            lines.push(...relationshipItems.map((item) => `- ${item}`));
        }
        if (boundaryItems.length > 0) {
            lines.push('[边界提醒]');
            lines.push(...boundaryItems.map((item) => `- ${item}`));
        }
        return lines.join('\n');
    }
    buildPersonaPresenceAnchor(fields) {
        if (!fields)
            return '';
        const rules = this.extractRuleLines([fields.voiceStyle, fields.adaptiveRules, fields.silencePermission]
            .filter((item) => !!item?.trim())
            .join('\n'), 4);
        if (rules.length === 0)
            return '';
        return ['[人格表现锚点]', ...rules.map((line) => `- ${line}`)].join('\n');
    }
    buildBoundaryPolicy(boundary) {
        if (!boundary?.preflightText)
            return '';
        return boundary.preflightText;
    }
    buildMetaFilterPolicy(policy) {
        if (!policy?.trim())
            return '';
        return `你的隐藏输出约束：\n${policy.trim()}`;
    }
    buildExpressionPolicy(fields, intentState) {
        if (!fields)
            return '';
        const parts = [];
        if (fields.voiceStyle)
            parts.push(fields.voiceStyle);
        if (fields.adaptiveRules)
            parts.push(fields.adaptiveRules);
        if (fields.silencePermission)
            parts.push(fields.silencePermission);
        if (parts.length === 0)
            return '';
        let text = '你的表达方式：\n' + parts.join('\n');
        if (intentState) {
            const hint = this.getAdaptiveHint(intentState);
            if (hint) {
                text += '\n' + hint;
            }
        }
        return text;
    }
    getAdaptiveHint(intent) {
        const { seriousness, expectation, mode } = intent;
        if (seriousness === 'casual' && expectation === '陪聊') {
            return '当前状态：轻松闲聊。优先一句话回应，轻但不空，抓住一个细节即可；默认不主动追问，除非用户明确在求建议或求解。';
        }
        if (seriousness === 'focused' && expectation === '直接给结果') {
            return '当前状态：用户需要明确结果。允许多段分析、可结构化输出，但仍保持人格一致。';
        }
        if (mode === 'thinking' && expectation === '一起想') {
            return '当前状态：共同思考。可以展开推理过程，但不替用户做结论。';
        }
        if (seriousness === 'semi') {
            return '当前状态：中等投入。可以展开一两段，但不需要面面俱到。';
        }
        return '';
    }
    uniqueLines(items, limit) {
        const result = [];
        const seen = new Set();
        for (const raw of items) {
            const item = raw?.trim();
            if (!item)
                continue;
            const key = item.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            result.push(item);
            if (result.length >= limit)
                break;
        }
        return result;
    }
    extractRuleLines(text, limit) {
        const lines = text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => line.replace(/^[-*•]\s*/, '').trim())
            .filter((line) => line.length > 0);
        return this.uniqueLines(lines, limit);
    }
    async rankMemoriesByRelevance(ctx) {
        const contextText = ctx.recentMessages
            .slice(-3)
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n');
        const candidateList = ctx.candidates
            .map((c, i) => `${i + 1}. [id=${c.id}] [${c.type}] ${c.content.slice(0, 200)}`)
            .join('\n');
        const messages = [
            {
                role: 'system',
                content: `[${exports.RANK_PROMPT_VERSION}] 你是记忆检索助手。根据当前对话内容，从候选记忆中选出最相关的若干条，按相关性从高到低排序。同时判断是否需要补充用户的详细历史背景。
只输出 JSON，格式为：{"rankedIds": ["id1", "id2", ...], "needDetail": false}
- rankedIds: 只包含与当前对话相关的记忆 id，不相关的不包含
- needDetail: 当前话题是否需要用户详细历史背景（true/false）`,
            },
            {
                role: 'user',
                content: `当前对话：\n${contextText}\n\n候选记忆：\n${candidateList}`,
            },
        ];
        try {
            const raw = await this.llm.generate(messages, { scenario: 'reasoning' });
            const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            return {
                rankedIds: Array.isArray(parsed.rankedIds) ? parsed.rankedIds : [],
                needDetail: !!parsed.needDetail,
            };
        }
        catch {
            return { rankedIds: ctx.candidates.map((c) => c.id), needDetail: false };
        }
    }
    selectMemoriesForInjection(rankedCandidates, tokenBudget, contentMaxChars = 300, useShortSummary = false) {
        const result = [];
        let usedTokens = 0;
        for (const m of rankedCandidates) {
            let text;
            if (useShortSummary && m.shortSummary) {
                text = m.shortSummary;
            }
            else {
                text =
                    m.content.length > contentMaxChars
                        ? m.content.slice(0, contentMaxChars) + '…'
                        : m.content;
            }
            const t = (0, token_estimator_1.estimateTokens)(text);
            if (usedTokens + t > tokenBudget) {
                if (result.length === 0) {
                    result.push({ id: m.id, type: m.type, content: text });
                }
                break;
            }
            result.push({ id: m.id, type: m.type, content: text });
            usedTokens += t;
        }
        return result;
    }
    buildSummaryMessages(ctx) {
        const dialogue = ctx.messages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n');
        let personaHint = '';
        if (ctx.personaText) {
            personaHint = `\n\n当前人格描述（供参考）：\n${ctx.personaText}\n\n如果对话中体现了值得微调人格的线索，请在最后额外输出一行：\n- [persona] 人格微调建议（一句话）\n若无需调整则不输出 [persona] 行。`;
        }
        const system = {
            role: 'system',
            content: `[${exports.SUMMARY_PROMPT_VERSION}] 根据以下对话，抽取「未来仍有价值的判断」，输出为抽象描述。不要复述对话，每条一行。

格式：- [类型:分类] 内容
可用类型：mid（阶段性） | long（长期）
可用分类：
- shared_fact: 双方已明确达成的共识事实（不带情绪，长期有效）
- commitment: 未来指向但不强制执行的约定（如"下周再讨论"）
- correction: 用户指出的理解错误与正确方向（简要记录纠正点）
- soft_preference: 从对话中归纳的表达/交互偏好（非标签）
- general: 其他有价值的判断（默认）

示例：
- [long:shared_fact] 用户正在构建本地 AI 系统
- [mid:commitment] 用户说看完书再来讨论
- [long:correction] 用户不喜欢被用"您"称呼，应使用"你"
- [long:soft_preference] 偏好结构化分析而非基础科普

规则：
- 不确定的内容不要写入
- 一次性事实不写入 long
- 纠错必须写入 correction
- 分类可省略，省略时默认为 general
若没有可抽取的，回复：无${personaHint}`,
        };
        const user = {
            role: 'user',
            content: `对话：\n${dialogue}`,
        };
        return [system, user];
    }
    buildMemoryAnalysisMessages(ctx) {
        const dialogue = ctx.messages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n');
        let existingBlock = '';
        if (ctx.existingCognitive?.length) {
            existingBlock = `\n\n【已有长期认知】以下为当前已存储的长期认知，若本次抽取的某条与其中某条语义高度相似（相似度 > 0.85），则不要新增该条，改为在该条 update 中填写对应的 mergeTargetId（即下方 id），后端将只增加该条的置信度。\n${ctx.existingCognitive.map((m) => `- id=${m.id}: ${m.content}`).join('\n')}`;
        }
        const keyWhitelist = [
            '【Key 白名单（必须严格匹配，不可自造）】',
            '',
            'jp.*（judgment_pattern）:',
            `- ${claim_schema_registry_1.CLAIM_KEYS.JP_AFTER_POSITIVE_ADD_NEGATIVE}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.JP_QUIT_WHEN_BLOCKED}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.JP_NEED_CLEAR_GOAL}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.JP_OVER_OPTIMIZE_RISK}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.JP_SEEKS_STRUCTURED_PLAN}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.JP_LOW_TOLERANCE_FRAGMENT_LEARNING}`,
            '',
            'vp.*（value_priority）:',
            `- ${claim_schema_registry_1.CLAIM_KEYS.VP_MAINTAINABILITY_OVER_SPEED}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.VP_PERFORMANCE_SENSITIVE}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.VP_PRAGMATIC_COST_SENSITIVE}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.VP_CONSISTENCY_OVER_VARIETY}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.VP_LONG_TERM_INVESTMENT}`,
            '',
            'rr.*（relation_rhythm）:',
            `- ${claim_schema_registry_1.CLAIM_KEYS.RR_PREFER_GENTLE_DIRECT}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.RR_PREFER_SHORT_REPLY}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.RR_DISLIKE_TOO_PUSHY}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.RR_PREFER_COMPANION_MODE_WHEN_TIRED}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.RR_ALLOW_PLAYFUL_TEASE_LOW}`,
            '',
            'ip.*（interaction_preference）:',
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_ANSWER_FIRST}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_USE_BULLETS}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_ASK_FEWER_QUESTIONS}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_PROVIDE_OPTIONS_COUNT}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_TONE_GENTLE}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_TONE_CUTE}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_TONE_CALM}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_TONE_NO_SARCASM}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_PRAISE_FREQUENCY}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_PRAISE_STYLE}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_PRAISE_AVOID}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_REPLY_LENGTH}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_REPLY_PACE}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.IP_REPLY_ENERGY_MATCH}`,
            '',
            'et.*（emotional_tendency）:',
            `- ${claim_schema_registry_1.CLAIM_KEYS.ET_FRUSTRATION_QUIT_RISK}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.ET_NEEDS_VALIDATION_WHEN_UNCERTAIN}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.ET_ANXIETY_ABOUT_JOB_SEARCH}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.ET_TIRED_AVOID_COMPLEXITY}`,
            `- ${claim_schema_registry_1.CLAIM_KEYS.ET_PREFERS_STABILITY}`,
            '',
            `（支持的 key 前缀：${claim_schema_registry_1.ClaimSchemaRegistry.allowedPrefixes.join(' ')}）`,
        ].join('\n');
        const schemaHints = [
            '【valueJson Schema 约束（必须匹配）】',
            '- level: {"level":"low"|"mid"|"high"}',
            '- priority: {"priority":"low"|"mid"|"high"}',
            '- enabled: {"enabled":true|false}',
            '- options count: {"n":1|2|3}',
            '- reply length: {"target":"short"|"medium"|"long"}',
            '- reply pace: {"target":"slow"|"normal"|"fast"}',
            '- praise.style: {"kind":"specific"|"warm"|"playful"|"cute"}',
            '- praise.avoid: {"kind":"generic"|"excessive"|"backhanded"|"appearance"|"money"}',
            '',
            '【Draft Key 规则（当且仅当你要提出“新候选 key”时使用）】',
            '- 先尝试映射到 canonical 白名单 key，只有在你判断无法可靠映射时才输出 draft.*',
            '- 每条 update 必须输出 mappingConfidence（0~1）：表示你对“映射到 canonical”的把握',
            '- 如果你的 key 不在上面的 canonical 白名单里，必须使用 draft 前缀：draft.(ip|jp|vp|rr|et).*',
            '- draft key 长度必须 ≤ 40，且只能使用字母数字与 . _ -',
            '- draft 的 valueJson 必须落在通用形态之一：{level} | {priority} | {enabled} | {target} | {n} | {kind}',
        ].join('\n');
        const system = {
            role: 'system',
            content: `[${exports.MEMORY_ANALYSIS_PROMPT_VERSION}] 你是「小晴」的记忆分析引擎，不是聊天助手。你的任务是从对话中提取「结构性长期认知」，而不是记录具体事件。

你必须遵守以下原则：
1. 不记录一次性事件
2. 不记录短期情绪波动
3. 不记录表面事实
4. 只记录具有重复概率的「判断模式」
5. 优先抽取用户的：决策方式、犹豫模式、情绪触发点、价值排序、自我拉扯结构、关系节奏特征

你需要输出五类长期信号（type）：
【A. judgment_pattern】判断模式（key 以 jp. 开头）
【B. value_priority】价值排序（key 以 vp. 开头）
【C. relation_rhythm】关系节奏特征（key 以 rr. 开头）
【D. interaction_preference】交互偏好（key 以 ip. 开头）
【E. emotional_tendency】情绪倾向（key 以 et. 开头）

${keyWhitelist}

${schemaHints}

输出格式必须严格为 JSON，且只输出此 JSON，不要 markdown 包裹以外的文字：
{
  "shouldUpdate": true 或 false,
  "updates": [
    {
      "type": "judgment_pattern | value_priority | relation_rhythm | interaction_preference | emotional_tendency",
      "key": "必须是 canonical 白名单 key；若提出新候选必须用 draft.(ip|jp|vp|rr|et).*",
      "valueJson": "必须符合该 key 对应的 schema（见上）",
      "content": "可选：一条简短自然语言解释（≤30字）",
      "confidence": 0 到 1 之间的小数,
      "mappingConfidence": 0 到 1 之间的小数（越低越应使用 draft.*）,
      "polarity": "SUPPORT 或 CONTRA（默认为 SUPPORT）",
      "contextTags": ["coding" 等可选场景标签],
      "evidence": {
        "messageId": "来自对话中的 messageId（未知可省略）",
        "snippet": "不超过40字的证据片段",
        "polarity": "SUPPORT | CONTRA | NEUTRAL",
        "weight": 0 到 1.0 之间的小数（可选，默认 1）
      },
      "mergeTargetId": "仅当与已有长期认知语义相似度>0.85时填写，对应已有条目的 id，否则省略此字段"
    }
  ],
  "sessionState": {
    "mood": "calm/happy/low/anxious/irritated/tired/hurt/excited 中之一，可选",
    "energy": "low/medium/high，可选",
    "focus": "low/medium/high，可选",
    "taskIntent": "当前任务意图，可选",
    "confidence": 0 到 1 之间的小数,
    "ttlSeconds": 建议生存时间（秒，建议 3600~21600）
  },
  "doNotStore": ["本次不应记录的内容说明"]
}

如果没有足够重复性或结构性，则 shouldUpdate 为 false，updates 为空数组。宁可少更新，也不要污染长期认知。content 不得超过 30 字。${existingBlock}`,
        };
        const user = {
            role: 'user',
            content: `对话：\n${dialogue}`,
        };
        return [system, user];
    }
    buildToolResultMessages(ctx) {
        const systemContent = [
            `[${exports.TOOL_WRAP_PROMPT_VERSION}]`,
            ctx.personaText,
            this.buildMetaFilterPolicy(ctx.metaFilterPolicy),
            ctx.expressionText ?? '',
            ctx.userProfileText ?? '',
            '',
            '你刚才帮用户执行了一个任务（通过工具完成），下面是结果。',
            '请用你自己的语气把结果自然地告诉用户。',
            '规则：',
            '- 不要说"工具返回了"、"系统显示"这类话，就像是你自己知道的一样',
            '- 如果工具出错了，委婉地告诉用户你没能完成，可以建议换个方式',
            '- 保持简洁自然',
            '- 【重要】结合对话上下文，根据用户的具体问题有针对性地回答，不要无差别地罗列所有信息。例如用户问"风大吗"就重点说风速体感，问"要带伞吗"就重点说降水，问"冷不冷"就重点说气温。只有用户笼统地问"天气怎么样"才给出完整概况',
            ...(ctx.toolKind === 'timesheet'
                ? [
                    '- 工时结果必须保留结构化换行，不要合并成一整段',
                    '- 每个项目单独成行，保留并原样传达每项工时数字（h）',
                    '- 如果执行结果里已经有列表，优先沿用原列表结构',
                ]
                : []),
        ].join('\n');
        const contextPart = ctx.recentMessages?.length
            ? '近期对话：\n' + ctx.recentMessages
                .map(m => `${m.role === 'user' ? '用户' : '小晴'}：${m.content}`)
                .join('\n') + '\n\n'
            : '';
        const userContent = ctx.toolResult
            ? `${contextPart}用户说：${ctx.userInput}\n\n执行结果：\n${ctx.toolResult}`
            : `${contextPart}用户说：${ctx.userInput}\n\n执行失败：${ctx.toolError || '未知错误'}`;
        return [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
        ];
    }
};
exports.PromptRouterService = PromptRouterService;
exports.PromptRouterService = PromptRouterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PromptRouterService);
//# sourceMappingURL=prompt-router.service.js.map