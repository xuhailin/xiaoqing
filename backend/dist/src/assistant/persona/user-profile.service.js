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
var UserProfileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../infra/prisma.service");
const token_estimator_1 = require("../../infra/token-estimator");
const claim_update_service_1 = require("../claim-engine/claim-update.service");
const claim_schema_registry_1 = require("../claim-engine/claim-schema.registry");
const USER_PROFILE_LIMITS = {
    preferredVoiceStyle: 3,
    praisePreference: 3,
    responseRhythm: 3,
};
const IMPRESSION_CORE_MAX_TOKENS = 150;
const IMPRESSION_DETAIL_MAX_TOKENS = 500;
const PROFILE_SYNC_USER_KEY = 'profile';
const CANONICAL_PREFERENCE_KEY_ORDER = [
    'ip.answer_first',
    'ip.use_bullets',
    'ip.ask_fewer_questions',
    'ip.provide_options_count',
    'ip.tone.gentle',
    'ip.tone.cute',
    'ip.tone.calm',
    'ip.tone.no_sarcasm',
    'ip.praise.frequency',
    'ip.praise.style',
    'ip.praise.avoid',
    'ip.reply.length',
    'ip.reply.pace',
    'ip.reply.energy_match',
    'rr.prefer_gentle_direct',
    'rr.prefer_short_reply',
    'rr.dislike_too_pushy',
    'rr.prefer_companion_mode_when_tired',
    'rr.allow_playful_tease_low',
];
let UserProfileService = UserProfileService_1 = class UserProfileService {
    prisma;
    claimUpdater;
    defaultUserKey;
    logger = new common_1.Logger(UserProfileService_1.name);
    constructor(prisma, claimUpdater, config) {
        this.prisma = prisma;
        this.claimUpdater = claimUpdater;
        this.defaultUserKey = config.get('DEFAULT_USER_KEY') || 'default-user';
    }
    async getOrCreate(userKey = this.defaultUserKey) {
        await this.ensureProfileRow(userKey);
        try {
            return await this.projectFromClaims(userKey);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Profile projection fallback (getOrCreate): ${msg}`);
            return this.getProfileRow(userKey);
        }
    }
    async update(data, userKey = this.defaultUserKey) {
        await this.ensureProfileRow(userKey);
        try {
            await this.upsertPreferenceClaimsFromProfileInput(data, userKey);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Claim upsert fallback (profile update): ${msg}`);
        }
        const nonPreferencePatch = {};
        if (Object.prototype.hasOwnProperty.call(data, 'impressionCore')) {
            nonPreferencePatch.impressionCore = data.impressionCore ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'impressionDetail')) {
            nonPreferencePatch.impressionDetail = data.impressionDetail ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'pendingImpressionCore')) {
            nonPreferencePatch.pendingImpressionCore = data.pendingImpressionCore ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'pendingImpressionDetail')) {
            nonPreferencePatch.pendingImpressionDetail = data.pendingImpressionDetail ?? null;
        }
        if (Object.keys(nonPreferencePatch).length > 0) {
            await this.prisma.userProfile.update({
                where: { userKey },
                data: nonPreferencePatch,
            });
        }
        try {
            return await this.projectFromClaims(userKey);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Profile projection fallback (update): ${msg}`);
            return this.getProfileRow(userKey);
        }
    }
    async mergeRules(updates, userKey = this.defaultUserKey) {
        await this.ensureProfileRow(userKey);
        const payload = {};
        for (const field of Object.keys(USER_PROFILE_LIMITS)) {
            const incoming = updates[field];
            if (!incoming?.length)
                continue;
            payload[field] = incoming
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, USER_PROFILE_LIMITS[field])
                .map((line) => `- ${line.replace(/^[\-\s]+/, '')}`)
                .join('\n');
        }
        return this.update(payload, userKey);
    }
    async updateImpression(delta, userKey = this.defaultUserKey) {
        const profile = await this.getOrCreate(userKey);
        const isPending = delta.confirmed !== true;
        const currentField = delta.target === 'core' ? 'impressionCore' : 'impressionDetail';
        const pendingField = delta.target === 'core' ? 'pendingImpressionCore' : 'pendingImpressionDetail';
        let newValue;
        if (delta.action === 'replace') {
            newValue = delta.content;
        }
        else {
            const base = profile[currentField];
            newValue = base ? `${base}\n${delta.content}` : delta.content;
        }
        const maxTokens = delta.target === 'core' ? IMPRESSION_CORE_MAX_TOKENS : IMPRESSION_DETAIL_MAX_TOKENS;
        const tokens = (0, token_estimator_1.estimateTokens)(newValue);
        if (tokens > maxTokens) {
            throw new Error(`impression${delta.target === 'core' ? 'Core' : 'Detail'} exceeds token budget: ${tokens}/${maxTokens}`);
        }
        const targetField = isPending ? pendingField : currentField;
        return this.update({ [targetField]: newValue }, userKey);
    }
    async confirmPendingImpression(target, userKey = this.defaultUserKey) {
        const profile = await this.getOrCreate(userKey);
        const pendingField = target === 'core' ? 'pendingImpressionCore' : 'pendingImpressionDetail';
        const formalField = target === 'core' ? 'impressionCore' : 'impressionDetail';
        const pendingValue = profile[pendingField];
        if (!pendingValue) {
            throw new Error(`No pending impression for ${target}`);
        }
        return this.update({
            [formalField]: pendingValue,
            [pendingField]: null,
        }, userKey);
    }
    async rejectPendingImpression(target, userKey = this.defaultUserKey) {
        const pendingField = target === 'core' ? 'pendingImpressionCore' : 'pendingImpressionDetail';
        return this.update({ [pendingField]: null }, userKey);
    }
    buildPrompt(dto) {
        if (!dto)
            return '';
        const lines = [];
        if (dto.impressionCore) {
            lines.push(`你对她的印象：\n${dto.impressionCore}`);
        }
        if (dto.impressionDetail) {
            lines.push(`补充背景：\n${dto.impressionDetail}`);
        }
        const preferenceLines = [];
        if (dto.preferredVoiceStyle) {
            dto.preferredVoiceStyle
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .forEach((line) => preferenceLines.push(`- ${line.replace(/^[\-\s]+/, '')}`));
        }
        if (dto.praisePreference) {
            preferenceLines.push('- 夸赞偏好：');
            dto.praisePreference
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .forEach((line) => preferenceLines.push(`  ${line.replace(/^[\-\s]+/, '- ')}`));
        }
        if (dto.responseRhythm) {
            preferenceLines.push('- 回应节奏：');
            dto.responseRhythm
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .forEach((line) => preferenceLines.push(`  ${line.replace(/^[\-\s]+/, '- ')}`));
        }
        if (preferenceLines.length > 0) {
            lines.push(['[用户回应偏好]', ...preferenceLines].join('\n'));
        }
        return lines.join('\n\n');
    }
    async ensureProfileRow(userKey) {
        await this.prisma.userProfile.upsert({
            where: { userKey },
            update: {},
            create: { userKey },
        });
    }
    async getProfileRow(userKey) {
        const profile = await this.prisma.userProfile.findUnique({ where: { userKey } });
        if (!profile) {
            return this.prisma.userProfile.create({ data: { userKey } });
        }
        return profile;
    }
    async upsertPreferenceClaimsFromProfileInput(data, userKey) {
        const fields = ['preferredVoiceStyle', 'praisePreference', 'responseRhythm'];
        for (const field of fields) {
            const raw = data[field];
            if (typeof raw !== 'string')
                continue;
            const rules = raw
                .split('\n')
                .map((line) => line.trim().replace(/^[\-\s]+/, ''))
                .filter(Boolean);
            for (const rule of rules) {
                const mapped = this.mapRuleToClaim(field, rule);
                try {
                    await this.claimUpdater.upsertFromDraft({
                        userKey,
                        type: mapped.type,
                        key: mapped.key,
                        value: mapped.valueJson,
                        confidence: mapped.confidence,
                        sourceModel: 'profile-manual',
                        contextTags: ['profile', field],
                        evidence: {
                            messageId: undefined,
                            sessionId: PROFILE_SYNC_USER_KEY,
                            snippet: rule.slice(0, 40),
                            polarity: 'SUPPORT',
                            weight: 1,
                        },
                    });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    this.logger.warn(`Skip invalid profile rule "${rule.slice(0, 20)}": ${msg}`);
                }
            }
        }
    }
    mapRuleToClaim(field, rule) {
        const text = rule.toLowerCase();
        if (field === 'preferredVoiceStyle') {
            if (/温柔|柔和|gentle/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.tone.gentle', valueJson: { level: 'high' }, confidence: 0.78 };
            }
            if (/可爱|cute/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.tone.cute', valueJson: { level: 'mid' }, confidence: 0.72 };
            }
            if (/平静|冷静|calm/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.tone.calm', valueJson: { level: 'high' }, confidence: 0.76 };
            }
            if (/反讽|sarcasm|挖苦/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.tone.no_sarcasm', valueJson: { level: 'high' }, confidence: 0.8 };
            }
        }
        if (field === 'praisePreference') {
            if (/少夸|少一点夸|less praise|别夸/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.praise.frequency', valueJson: { level: 'low' }, confidence: 0.8 };
            }
            if (/多夸|多一点夸|more praise/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.praise.frequency', valueJson: { level: 'high' }, confidence: 0.8 };
            }
        }
        if (field === 'responseRhythm') {
            if (/简短|短一点|brief|short/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.reply.length', valueJson: { target: 'short' }, confidence: 0.82 };
            }
            if (/慢一点|慢|slow/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.reply.pace', valueJson: { target: 'slow' }, confidence: 0.78 };
            }
            if (/少追问|不要追问|fewer questions/.test(text)) {
                return { type: 'INTERACTION_PREFERENCE', key: 'ip.ask_fewer_questions', valueJson: { enabled: true }, confidence: 0.82 };
            }
        }
        const fallbackPrefix = field === 'preferredVoiceStyle'
            ? 'draft.ip.profile_voice_'
            : field === 'praisePreference'
                ? 'draft.ip.profile_praise_'
                : 'draft.ip.profile_rhythm_';
        const suffix = rule
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 20);
        let key = `${fallbackPrefix}${suffix || 'rule'}`;
        key = key.slice(0, 40);
        if (claim_schema_registry_1.ClaimSchemaRegistry.classifyKey(key) !== 'draft') {
            key = 'draft.ip.profile_rule';
        }
        return {
            type: 'INTERACTION_PREFERENCE',
            key,
            valueJson: { kind: rule.slice(0, 24) },
            confidence: 0.55,
        };
    }
    async projectFromClaims(userKey) {
        const rows = await this.prisma.$queryRaw `
      SELECT "key", "valueJson", "confidence", "updatedAt"
      FROM "UserClaim"
      WHERE "userKey" = ${userKey}
        AND "status" IN ('STABLE', 'CORE')
        AND "key" NOT LIKE 'draft.%'
        AND "type" IN ('INTERACTION_PREFERENCE', 'RELATION_RHYTHM')
      ORDER BY "confidence" DESC, "updatedAt" DESC
      LIMIT 120
    `;
        const byKey = new Map();
        for (const key of CANONICAL_PREFERENCE_KEY_ORDER) {
            const row = rows.find((item) => item.key === key);
            if (row)
                byKey.set(key, { valueJson: row.valueJson, confidence: row.confidence, updatedAt: row.updatedAt });
        }
        for (const row of rows) {
            if (!byKey.has(row.key)) {
                byKey.set(row.key, { valueJson: row.valueJson, confidence: row.confidence, updatedAt: row.updatedAt });
            }
        }
        const voice = [];
        const praise = [];
        const rhythm = [];
        const pushUnique = (bucket, line) => {
            if (!line || bucket.includes(line))
                return;
            bucket.push(line);
        };
        const levelOf = (key) => {
            const payload = byKey.get(key)?.valueJson;
            return payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.level === 'string'
                ? String(payload.level)
                : undefined;
        };
        const enabledOf = (key) => {
            const payload = byKey.get(key)?.valueJson;
            return payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.enabled === 'boolean'
                ? Boolean(payload.enabled)
                : undefined;
        };
        const targetOf = (key) => {
            const payload = byKey.get(key)?.valueJson;
            return payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.target === 'string'
                ? String(payload.target)
                : undefined;
        };
        const kindOf = (key) => {
            const payload = byKey.get(key)?.valueJson;
            return payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.kind === 'string'
                ? String(payload.kind)
                : undefined;
        };
        const nOf = (key) => {
            const payload = byKey.get(key)?.valueJson;
            return payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.n === 'number'
                ? Number(payload.n)
                : undefined;
        };
        if ((levelOf('ip.tone.gentle') ?? 'low') !== 'low')
            pushUnique(voice, '语气更温柔');
        if ((levelOf('ip.tone.cute') ?? 'low') !== 'low')
            pushUnique(voice, '语气可爱一点');
        if ((levelOf('ip.tone.calm') ?? 'low') !== 'low')
            pushUnique(voice, '语气平静稳一点');
        if ((levelOf('ip.tone.no_sarcasm') ?? 'low') !== 'low')
            pushUnique(voice, '避免反讽语气');
        if (enabledOf('ip.answer_first') === true)
            pushUnique(voice, '先给结论，再补充细节');
        if (enabledOf('ip.use_bullets') === true)
            pushUnique(voice, '多用分点表达');
        if ((nOf('ip.provide_options_count') ?? 0) > 0) {
            pushUnique(voice, `给出 ${nOf('ip.provide_options_count')} 个可选方案`);
        }
        const praiseLevel = levelOf('ip.praise.frequency');
        if (praiseLevel === 'low')
            pushUnique(praise, '夸赞频率低一点');
        if (praiseLevel === 'mid')
            pushUnique(praise, '夸赞频率适中');
        if (praiseLevel === 'high')
            pushUnique(praise, '夸赞频率可以高一点');
        const praiseStyle = kindOf('ip.praise.style');
        if (praiseStyle)
            pushUnique(praise, `夸赞风格：${praiseStyle}`);
        const praiseAvoid = kindOf('ip.praise.avoid');
        if (praiseAvoid)
            pushUnique(praise, `避免夸赞类型：${praiseAvoid}`);
        const replyLength = targetOf('ip.reply.length');
        if (replyLength)
            pushUnique(rhythm, `回复长度：${replyLength}`);
        const replyPace = targetOf('ip.reply.pace');
        if (replyPace)
            pushUnique(rhythm, `回复节奏：${replyPace}`);
        if (enabledOf('ip.ask_fewer_questions') === true)
            pushUnique(rhythm, '少追问，必要时再问');
        if (enabledOf('ip.reply.energy_match') === true)
            pushUnique(rhythm, '尽量匹配用户当下能量');
        if ((levelOf('rr.prefer_short_reply') ?? 'low') !== 'low')
            pushUnique(rhythm, '关系节奏偏短回复');
        if ((levelOf('rr.dislike_too_pushy') ?? 'low') !== 'low')
            pushUnique(rhythm, '避免推进过猛');
        if ((levelOf('rr.prefer_companion_mode_when_tired') ?? 'low') !== 'low')
            pushUnique(rhythm, '疲惫时优先陪伴模式');
        await this.prisma.userProfile.update({
            where: { userKey },
            data: {
                preferredVoiceStyle: voice.slice(0, USER_PROFILE_LIMITS.preferredVoiceStyle).map((line) => `- ${line}`).join('\n'),
                praisePreference: praise.slice(0, USER_PROFILE_LIMITS.praisePreference).map((line) => `- ${line}`).join('\n'),
                responseRhythm: rhythm.slice(0, USER_PROFILE_LIMITS.responseRhythm).map((line) => `- ${line}`).join('\n'),
            },
        });
        const profile = await this.prisma.userProfile.findUnique({ where: { userKey } });
        if (!profile) {
            throw new Error(`UserProfile missing after projection: ${userKey}`);
        }
        return profile;
    }
};
exports.UserProfileService = UserProfileService;
exports.UserProfileService = UserProfileService = UserProfileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        claim_update_service_1.ClaimUpdateService,
        config_1.ConfigService])
], UserProfileService);
//# sourceMappingURL=user-profile.service.js.map