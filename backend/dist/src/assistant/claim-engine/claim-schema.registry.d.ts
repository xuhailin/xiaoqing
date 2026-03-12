import { z } from 'zod';
export declare const ClaimValueLevel: z.ZodEnum<["low", "mid", "high"]>;
export type ClaimValueLevel = z.infer<typeof ClaimValueLevel>;
export declare const ClaimValuePriority: z.ZodEnum<["low", "mid", "high"]>;
export type ClaimValuePriority = z.infer<typeof ClaimValuePriority>;
export declare const ClaimReplyLengthTarget: z.ZodEnum<["short", "medium", "long"]>;
export type ClaimReplyLengthTarget = z.infer<typeof ClaimReplyLengthTarget>;
export declare const ClaimReplyPaceTarget: z.ZodEnum<["slow", "normal", "fast"]>;
export type ClaimReplyPaceTarget = z.infer<typeof ClaimReplyPaceTarget>;
export declare const ClaimPraiseStyleKind: z.ZodEnum<["specific", "warm", "playful", "cute"]>;
export type ClaimPraiseStyleKind = z.infer<typeof ClaimPraiseStyleKind>;
export declare const ClaimPraiseAvoidKind: z.ZodEnum<["generic", "excessive", "backhanded", "appearance", "money"]>;
export type ClaimPraiseAvoidKind = z.infer<typeof ClaimPraiseAvoidKind>;
export declare const CLAIM_KEYS: {
    readonly JP_AFTER_POSITIVE_ADD_NEGATIVE: "jp.after_positive_add_negative";
    readonly JP_QUIT_WHEN_BLOCKED: "jp.quit_when_blocked";
    readonly JP_NEED_CLEAR_GOAL: "jp.need_clear_goal";
    readonly JP_OVER_OPTIMIZE_RISK: "jp.over_optimize_risk";
    readonly JP_SEEKS_STRUCTURED_PLAN: "jp.seeks_structured_plan";
    readonly JP_LOW_TOLERANCE_FRAGMENT_LEARNING: "jp.low_tolerance_fragment_learning";
    readonly VP_MAINTAINABILITY_OVER_SPEED: "vp.maintainability_over_speed";
    readonly VP_PERFORMANCE_SENSITIVE: "vp.performance_sensitive";
    readonly VP_PRAGMATIC_COST_SENSITIVE: "vp.pragmatic_cost_sensitive";
    readonly VP_CONSISTENCY_OVER_VARIETY: "vp.consistency_over_variety";
    readonly VP_LONG_TERM_INVESTMENT: "vp.long_term_investment";
    readonly RR_PREFER_GENTLE_DIRECT: "rr.prefer_gentle_direct";
    readonly RR_PREFER_SHORT_REPLY: "rr.prefer_short_reply";
    readonly RR_DISLIKE_TOO_PUSHY: "rr.dislike_too_pushy";
    readonly RR_PREFER_COMPANION_MODE_WHEN_TIRED: "rr.prefer_companion_mode_when_tired";
    readonly RR_ALLOW_PLAYFUL_TEASE_LOW: "rr.allow_playful_tease_low";
    readonly IP_ANSWER_FIRST: "ip.answer_first";
    readonly IP_USE_BULLETS: "ip.use_bullets";
    readonly IP_ASK_FEWER_QUESTIONS: "ip.ask_fewer_questions";
    readonly IP_PROVIDE_OPTIONS_COUNT: "ip.provide_options_count";
    readonly IP_TONE_GENTLE: "ip.tone.gentle";
    readonly IP_TONE_CUTE: "ip.tone.cute";
    readonly IP_TONE_CALM: "ip.tone.calm";
    readonly IP_TONE_NO_SARCASM: "ip.tone.no_sarcasm";
    readonly IP_PRAISE_FREQUENCY: "ip.praise.frequency";
    readonly IP_PRAISE_STYLE: "ip.praise.style";
    readonly IP_PRAISE_AVOID: "ip.praise.avoid";
    readonly IP_REPLY_LENGTH: "ip.reply.length";
    readonly IP_REPLY_PACE: "ip.reply.pace";
    readonly IP_REPLY_ENERGY_MATCH: "ip.reply.energy_match";
    readonly ET_FRUSTRATION_QUIT_RISK: "et.frustration_quit_risk";
    readonly ET_NEEDS_VALIDATION_WHEN_UNCERTAIN: "et.needs_validation_when_uncertain";
    readonly ET_ANXIETY_ABOUT_JOB_SEARCH: "et.anxiety_about_job_search";
    readonly ET_TIRED_AVOID_COMPLEXITY: "et.tired_avoid_complexity";
    readonly ET_PREFERS_STABILITY: "et.prefers_stability";
    readonly BN_NO_HURTFUL_SPEECH: "bn.no_hurtful_speech";
};
export type ClaimKey = (typeof CLAIM_KEYS)[keyof typeof CLAIM_KEYS];
export type CanonicalClaimKey = ClaimKey;
export type DraftClaimKey = `draft.${'ip' | 'jp' | 'vp' | 'rr' | 'et'}.${string}`;
export declare const ClaimSchemaRegistry: {
    readonly allowedPrefixes: readonly ["jp.", "vp.", "rr.", "ip.", "et.", "bn.", "draft.jp.", "draft.vp.", "draft.rr.", "draft.ip.", "draft.et."];
    readonly canonicalKeys: ("jp.after_positive_add_negative" | "jp.quit_when_blocked" | "jp.need_clear_goal" | "jp.over_optimize_risk" | "jp.seeks_structured_plan" | "jp.low_tolerance_fragment_learning" | "vp.maintainability_over_speed" | "vp.performance_sensitive" | "vp.pragmatic_cost_sensitive" | "vp.consistency_over_variety" | "vp.long_term_investment" | "rr.prefer_gentle_direct" | "rr.prefer_short_reply" | "rr.dislike_too_pushy" | "rr.prefer_companion_mode_when_tired" | "rr.allow_playful_tease_low" | "ip.answer_first" | "ip.use_bullets" | "ip.ask_fewer_questions" | "ip.provide_options_count" | "ip.tone.gentle" | "ip.tone.cute" | "ip.tone.calm" | "ip.tone.no_sarcasm" | "ip.praise.frequency" | "ip.praise.style" | "ip.praise.avoid" | "ip.reply.length" | "ip.reply.pace" | "ip.reply.energy_match" | "et.frustration_quit_risk" | "et.needs_validation_when_uncertain" | "et.anxiety_about_job_search" | "et.tired_avoid_complexity" | "et.prefers_stability" | "bn.no_hurtful_speech")[];
    readonly draftKeyMaxLen: 40;
    readonly draftKeyRegex: RegExp;
    readonly schemas: {
        readonly "jp.after_positive_add_negative": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "jp.quit_when_blocked": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "jp.need_clear_goal": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "jp.over_optimize_risk": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "jp.seeks_structured_plan": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "jp.low_tolerance_fragment_learning": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "vp.maintainability_over_speed": z.ZodObject<{
            priority: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            priority: "low" | "mid" | "high";
        }, {
            priority: "low" | "mid" | "high";
        }>;
        readonly "vp.performance_sensitive": z.ZodObject<{
            priority: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            priority: "low" | "mid" | "high";
        }, {
            priority: "low" | "mid" | "high";
        }>;
        readonly "vp.pragmatic_cost_sensitive": z.ZodObject<{
            priority: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            priority: "low" | "mid" | "high";
        }, {
            priority: "low" | "mid" | "high";
        }>;
        readonly "vp.consistency_over_variety": z.ZodObject<{
            priority: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            priority: "low" | "mid" | "high";
        }, {
            priority: "low" | "mid" | "high";
        }>;
        readonly "vp.long_term_investment": z.ZodObject<{
            priority: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            priority: "low" | "mid" | "high";
        }, {
            priority: "low" | "mid" | "high";
        }>;
        readonly "rr.prefer_gentle_direct": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "rr.prefer_short_reply": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "rr.dislike_too_pushy": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "rr.prefer_companion_mode_when_tired": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "rr.allow_playful_tease_low": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "ip.answer_first": z.ZodObject<{
            enabled: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
        }, {
            enabled: boolean;
        }>;
        readonly "ip.use_bullets": z.ZodObject<{
            enabled: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
        }, {
            enabled: boolean;
        }>;
        readonly "ip.ask_fewer_questions": z.ZodObject<{
            enabled: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
        }, {
            enabled: boolean;
        }>;
        readonly "ip.provide_options_count": z.ZodObject<{
            n: z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>]>;
        }, "strip", z.ZodTypeAny, {
            n: 1 | 2 | 3;
        }, {
            n: 1 | 2 | 3;
        }>;
        readonly "ip.tone.gentle": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "ip.tone.cute": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "ip.tone.calm": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "ip.tone.no_sarcasm": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "ip.praise.frequency": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "ip.praise.style": z.ZodObject<{
            kind: z.ZodEnum<["specific", "warm", "playful", "cute"]>;
        }, "strip", z.ZodTypeAny, {
            kind: "specific" | "warm" | "playful" | "cute";
        }, {
            kind: "specific" | "warm" | "playful" | "cute";
        }>;
        readonly "ip.praise.avoid": z.ZodObject<{
            kind: z.ZodEnum<["generic", "excessive", "backhanded", "appearance", "money"]>;
        }, "strip", z.ZodTypeAny, {
            kind: "generic" | "excessive" | "backhanded" | "appearance" | "money";
        }, {
            kind: "generic" | "excessive" | "backhanded" | "appearance" | "money";
        }>;
        readonly "ip.reply.length": z.ZodObject<{
            target: z.ZodEnum<["short", "medium", "long"]>;
        }, "strip", z.ZodTypeAny, {
            target: "short" | "medium" | "long";
        }, {
            target: "short" | "medium" | "long";
        }>;
        readonly "ip.reply.pace": z.ZodObject<{
            target: z.ZodEnum<["slow", "normal", "fast"]>;
        }, "strip", z.ZodTypeAny, {
            target: "slow" | "normal" | "fast";
        }, {
            target: "slow" | "normal" | "fast";
        }>;
        readonly "ip.reply.energy_match": z.ZodObject<{
            enabled: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
        }, {
            enabled: boolean;
        }>;
        readonly "et.frustration_quit_risk": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "et.needs_validation_when_uncertain": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "et.anxiety_about_job_search": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "et.tired_avoid_complexity": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "et.prefers_stability": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
        readonly "bn.no_hurtful_speech": z.ZodObject<{
            level: z.ZodEnum<["low", "mid", "high"]>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "mid" | "high";
        }, {
            level: "low" | "mid" | "high";
        }>;
    };
    readonly isCanonicalKey: (input: string) => input is CanonicalClaimKey;
    readonly schemaForKey: (k: ClaimKey) => z.ZodTypeAny;
    readonly draftValueSchema: z.ZodUnion<[z.ZodObject<{
        level: z.ZodEnum<["low", "mid", "high"]>;
    }, "strip", z.ZodTypeAny, {
        level: "low" | "mid" | "high";
    }, {
        level: "low" | "mid" | "high";
    }>, z.ZodObject<{
        priority: z.ZodEnum<["low", "mid", "high"]>;
    }, "strip", z.ZodTypeAny, {
        priority: "low" | "mid" | "high";
    }, {
        priority: "low" | "mid" | "high";
    }>, z.ZodObject<{
        enabled: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
    }, {
        enabled: boolean;
    }>, z.ZodObject<{
        target: z.ZodEnum<["short", "medium", "long", "slow", "normal", "fast"]>;
    }, "strip", z.ZodTypeAny, {
        target: "short" | "medium" | "long" | "slow" | "normal" | "fast";
    }, {
        target: "short" | "medium" | "long" | "slow" | "normal" | "fast";
    }>, z.ZodObject<{
        n: z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>]>;
    }, "strip", z.ZodTypeAny, {
        n: 1 | 2 | 3;
    }, {
        n: 1 | 2 | 3;
    }>, z.ZodObject<{
        kind: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        kind: string;
    }, {
        kind: string;
    }>]>;
    readonly classifyKey: (key: string) => "canonical" | "draft" | "invalid";
    readonly validateCanonical: (k: string, valueJson: unknown) => {
        ok: true;
        kind: "canonical";
        key: CanonicalClaimKey;
        valueJson: unknown;
    } | {
        ok: false;
        reason: string;
    };
    readonly validateDraft: (k: string, valueJson: unknown) => {
        ok: true;
        kind: "draft";
        key: DraftClaimKey;
        valueJson: unknown;
    } | {
        ok: false;
        reason: string;
    };
    readonly validateAny: (k: string, valueJson: unknown) => {
        ok: true;
        kind: "canonical";
        key: CanonicalClaimKey;
        valueJson: unknown;
    } | {
        ok: true;
        kind: "draft";
        key: DraftClaimKey;
        valueJson: unknown;
    } | {
        ok: false;
        reason: string;
    };
};
