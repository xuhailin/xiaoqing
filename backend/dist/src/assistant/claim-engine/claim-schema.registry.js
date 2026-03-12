"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimSchemaRegistry = exports.CLAIM_KEYS = exports.ClaimPraiseAvoidKind = exports.ClaimPraiseStyleKind = exports.ClaimReplyPaceTarget = exports.ClaimReplyLengthTarget = exports.ClaimValuePriority = exports.ClaimValueLevel = void 0;
const zod_1 = require("zod");
exports.ClaimValueLevel = zod_1.z.enum(['low', 'mid', 'high']);
exports.ClaimValuePriority = zod_1.z.enum(['low', 'mid', 'high']);
exports.ClaimReplyLengthTarget = zod_1.z.enum(['short', 'medium', 'long']);
exports.ClaimReplyPaceTarget = zod_1.z.enum(['slow', 'normal', 'fast']);
exports.ClaimPraiseStyleKind = zod_1.z.enum(['specific', 'warm', 'playful', 'cute']);
exports.ClaimPraiseAvoidKind = zod_1.z.enum(['generic', 'excessive', 'backhanded', 'appearance', 'money']);
const key = (k) => k;
exports.CLAIM_KEYS = {
    JP_AFTER_POSITIVE_ADD_NEGATIVE: key('jp.after_positive_add_negative'),
    JP_QUIT_WHEN_BLOCKED: key('jp.quit_when_blocked'),
    JP_NEED_CLEAR_GOAL: key('jp.need_clear_goal'),
    JP_OVER_OPTIMIZE_RISK: key('jp.over_optimize_risk'),
    JP_SEEKS_STRUCTURED_PLAN: key('jp.seeks_structured_plan'),
    JP_LOW_TOLERANCE_FRAGMENT_LEARNING: key('jp.low_tolerance_fragment_learning'),
    VP_MAINTAINABILITY_OVER_SPEED: key('vp.maintainability_over_speed'),
    VP_PERFORMANCE_SENSITIVE: key('vp.performance_sensitive'),
    VP_PRAGMATIC_COST_SENSITIVE: key('vp.pragmatic_cost_sensitive'),
    VP_CONSISTENCY_OVER_VARIETY: key('vp.consistency_over_variety'),
    VP_LONG_TERM_INVESTMENT: key('vp.long_term_investment'),
    RR_PREFER_GENTLE_DIRECT: key('rr.prefer_gentle_direct'),
    RR_PREFER_SHORT_REPLY: key('rr.prefer_short_reply'),
    RR_DISLIKE_TOO_PUSHY: key('rr.dislike_too_pushy'),
    RR_PREFER_COMPANION_MODE_WHEN_TIRED: key('rr.prefer_companion_mode_when_tired'),
    RR_ALLOW_PLAYFUL_TEASE_LOW: key('rr.allow_playful_tease_low'),
    IP_ANSWER_FIRST: key('ip.answer_first'),
    IP_USE_BULLETS: key('ip.use_bullets'),
    IP_ASK_FEWER_QUESTIONS: key('ip.ask_fewer_questions'),
    IP_PROVIDE_OPTIONS_COUNT: key('ip.provide_options_count'),
    IP_TONE_GENTLE: key('ip.tone.gentle'),
    IP_TONE_CUTE: key('ip.tone.cute'),
    IP_TONE_CALM: key('ip.tone.calm'),
    IP_TONE_NO_SARCASM: key('ip.tone.no_sarcasm'),
    IP_PRAISE_FREQUENCY: key('ip.praise.frequency'),
    IP_PRAISE_STYLE: key('ip.praise.style'),
    IP_PRAISE_AVOID: key('ip.praise.avoid'),
    IP_REPLY_LENGTH: key('ip.reply.length'),
    IP_REPLY_PACE: key('ip.reply.pace'),
    IP_REPLY_ENERGY_MATCH: key('ip.reply.energy_match'),
    ET_FRUSTRATION_QUIT_RISK: key('et.frustration_quit_risk'),
    ET_NEEDS_VALIDATION_WHEN_UNCERTAIN: key('et.needs_validation_when_uncertain'),
    ET_ANXIETY_ABOUT_JOB_SEARCH: key('et.anxiety_about_job_search'),
    ET_TIRED_AVOID_COMPLEXITY: key('et.tired_avoid_complexity'),
    ET_PREFERS_STABILITY: key('et.prefers_stability'),
    BN_NO_HURTFUL_SPEECH: key('bn.no_hurtful_speech'),
};
const LevelValue = zod_1.z.object({ level: exports.ClaimValueLevel });
const PriorityValue = zod_1.z.object({ priority: exports.ClaimValuePriority });
const EnabledValue = zod_1.z.object({ enabled: zod_1.z.boolean() });
exports.ClaimSchemaRegistry = {
    allowedPrefixes: ['jp.', 'vp.', 'rr.', 'ip.', 'et.', 'bn.', 'draft.jp.', 'draft.vp.', 'draft.rr.', 'draft.ip.', 'draft.et.'],
    canonicalKeys: Object.values(exports.CLAIM_KEYS),
    draftKeyMaxLen: 40,
    draftKeyRegex: /^draft\.(ip|jp|vp|rr|et)\.[a-z0-9_.-]+$/i,
    schemas: {
        [exports.CLAIM_KEYS.JP_AFTER_POSITIVE_ADD_NEGATIVE]: LevelValue,
        [exports.CLAIM_KEYS.JP_QUIT_WHEN_BLOCKED]: LevelValue,
        [exports.CLAIM_KEYS.JP_NEED_CLEAR_GOAL]: LevelValue,
        [exports.CLAIM_KEYS.JP_OVER_OPTIMIZE_RISK]: LevelValue,
        [exports.CLAIM_KEYS.JP_SEEKS_STRUCTURED_PLAN]: LevelValue,
        [exports.CLAIM_KEYS.JP_LOW_TOLERANCE_FRAGMENT_LEARNING]: LevelValue,
        [exports.CLAIM_KEYS.VP_MAINTAINABILITY_OVER_SPEED]: PriorityValue,
        [exports.CLAIM_KEYS.VP_PERFORMANCE_SENSITIVE]: PriorityValue,
        [exports.CLAIM_KEYS.VP_PRAGMATIC_COST_SENSITIVE]: PriorityValue,
        [exports.CLAIM_KEYS.VP_CONSISTENCY_OVER_VARIETY]: PriorityValue,
        [exports.CLAIM_KEYS.VP_LONG_TERM_INVESTMENT]: PriorityValue,
        [exports.CLAIM_KEYS.RR_PREFER_GENTLE_DIRECT]: LevelValue,
        [exports.CLAIM_KEYS.RR_PREFER_SHORT_REPLY]: LevelValue,
        [exports.CLAIM_KEYS.RR_DISLIKE_TOO_PUSHY]: LevelValue,
        [exports.CLAIM_KEYS.RR_PREFER_COMPANION_MODE_WHEN_TIRED]: LevelValue,
        [exports.CLAIM_KEYS.RR_ALLOW_PLAYFUL_TEASE_LOW]: LevelValue,
        [exports.CLAIM_KEYS.IP_ANSWER_FIRST]: EnabledValue,
        [exports.CLAIM_KEYS.IP_USE_BULLETS]: EnabledValue,
        [exports.CLAIM_KEYS.IP_ASK_FEWER_QUESTIONS]: EnabledValue,
        [exports.CLAIM_KEYS.IP_PROVIDE_OPTIONS_COUNT]: zod_1.z.object({ n: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(2), zod_1.z.literal(3)]) }),
        [exports.CLAIM_KEYS.IP_TONE_GENTLE]: LevelValue,
        [exports.CLAIM_KEYS.IP_TONE_CUTE]: LevelValue,
        [exports.CLAIM_KEYS.IP_TONE_CALM]: LevelValue,
        [exports.CLAIM_KEYS.IP_TONE_NO_SARCASM]: LevelValue,
        [exports.CLAIM_KEYS.IP_PRAISE_FREQUENCY]: zod_1.z.object({ level: exports.ClaimValueLevel }),
        [exports.CLAIM_KEYS.IP_PRAISE_STYLE]: zod_1.z.object({ kind: exports.ClaimPraiseStyleKind }),
        [exports.CLAIM_KEYS.IP_PRAISE_AVOID]: zod_1.z.object({ kind: exports.ClaimPraiseAvoidKind }),
        [exports.CLAIM_KEYS.IP_REPLY_LENGTH]: zod_1.z.object({ target: exports.ClaimReplyLengthTarget }),
        [exports.CLAIM_KEYS.IP_REPLY_PACE]: zod_1.z.object({ target: exports.ClaimReplyPaceTarget }),
        [exports.CLAIM_KEYS.IP_REPLY_ENERGY_MATCH]: EnabledValue,
        [exports.CLAIM_KEYS.ET_FRUSTRATION_QUIT_RISK]: LevelValue,
        [exports.CLAIM_KEYS.ET_NEEDS_VALIDATION_WHEN_UNCERTAIN]: LevelValue,
        [exports.CLAIM_KEYS.ET_ANXIETY_ABOUT_JOB_SEARCH]: LevelValue,
        [exports.CLAIM_KEYS.ET_TIRED_AVOID_COMPLEXITY]: LevelValue,
        [exports.CLAIM_KEYS.ET_PREFERS_STABILITY]: LevelValue,
        [exports.CLAIM_KEYS.BN_NO_HURTFUL_SPEECH]: LevelValue,
    },
    isCanonicalKey(input) {
        return this.canonicalKeys.includes(input);
    },
    schemaForKey(k) {
        return this.schemas[k];
    },
    draftValueSchema: zod_1.z.union([
        zod_1.z.object({ level: exports.ClaimValueLevel }),
        zod_1.z.object({ priority: exports.ClaimValuePriority }),
        zod_1.z.object({ enabled: zod_1.z.boolean() }),
        zod_1.z.object({ target: zod_1.z.enum(['short', 'medium', 'long', 'slow', 'normal', 'fast']) }),
        zod_1.z.object({ n: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(2), zod_1.z.literal(3)]) }),
        zod_1.z.object({ kind: zod_1.z.string().trim().min(1).max(24) }),
    ]),
    classifyKey(key) {
        const k = key.trim();
        if (this.isCanonicalKey(k))
            return 'canonical';
        if (k.length <= this.draftKeyMaxLen
            && this.draftKeyRegex.test(k)) {
            return 'draft';
        }
        return 'invalid';
    },
    validateCanonical(k, valueJson) {
        if (!this.isCanonicalKey(k)) {
            return { ok: false, reason: `key not in whitelist: ${k}` };
        }
        const key = k;
        const schema = this.schemaForKey(key);
        const parsed = schema.safeParse(valueJson);
        if (!parsed.success) {
            return { ok: false, reason: `valueJson schema mismatch for ${k}: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
        }
        return { ok: true, kind: 'canonical', key, valueJson: parsed.data };
    },
    validateDraft(k, valueJson) {
        const rawKey = k.trim();
        if (rawKey.length > this.draftKeyMaxLen) {
            return { ok: false, reason: `draft key too long: ${rawKey.length} > ${this.draftKeyMaxLen}` };
        }
        const key = rawKey.toLowerCase();
        if (!this.draftKeyRegex.test(key)) {
            return { ok: false, reason: `draft key must match ${String(this.draftKeyRegex)}: ${rawKey}` };
        }
        const parsed = this.draftValueSchema.safeParse(valueJson);
        if (!parsed.success) {
            return { ok: false, reason: `draft valueJson must match generic schema: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
        }
        return { ok: true, kind: 'draft', key: key, valueJson: parsed.data };
    },
    validateAny(k, valueJson) {
        const kind = this.classifyKey(k);
        if (kind === 'canonical')
            return this.validateCanonical(k, valueJson);
        if (kind === 'draft')
            return this.validateDraft(k, valueJson);
        return { ok: false, reason: `invalid key (must be canonical or draft.*): ${k}` };
    },
};
//# sourceMappingURL=claim-schema.registry.js.map