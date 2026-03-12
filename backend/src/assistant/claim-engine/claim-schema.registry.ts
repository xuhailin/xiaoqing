import { z } from 'zod';

export const ClaimValueLevel = z.enum(['low', 'mid', 'high']);
export type ClaimValueLevel = z.infer<typeof ClaimValueLevel>;

export const ClaimValuePriority = z.enum(['low', 'mid', 'high']);
export type ClaimValuePriority = z.infer<typeof ClaimValuePriority>;

export const ClaimReplyLengthTarget = z.enum(['short', 'medium', 'long']);
export type ClaimReplyLengthTarget = z.infer<typeof ClaimReplyLengthTarget>;

export const ClaimReplyPaceTarget = z.enum(['slow', 'normal', 'fast']);
export type ClaimReplyPaceTarget = z.infer<typeof ClaimReplyPaceTarget>;

// Keep enums small and explicit so LLM output can be validated deterministically.
export const ClaimPraiseStyleKind = z.enum(['specific', 'warm', 'playful', 'cute']);
export type ClaimPraiseStyleKind = z.infer<typeof ClaimPraiseStyleKind>;

export const ClaimPraiseAvoidKind = z.enum(['generic', 'excessive', 'backhanded', 'appearance', 'money']);
export type ClaimPraiseAvoidKind = z.infer<typeof ClaimPraiseAvoidKind>;

const key = <T extends string>(k: T) => k;

export const CLAIM_KEYS = {
  // ── Judgment patterns (jp.*) ───────────────────────────
  JP_AFTER_POSITIVE_ADD_NEGATIVE: key('jp.after_positive_add_negative'),
  JP_QUIT_WHEN_BLOCKED: key('jp.quit_when_blocked'),
  JP_NEED_CLEAR_GOAL: key('jp.need_clear_goal'),
  JP_OVER_OPTIMIZE_RISK: key('jp.over_optimize_risk'),
  JP_SEEKS_STRUCTURED_PLAN: key('jp.seeks_structured_plan'),
  JP_LOW_TOLERANCE_FRAGMENT_LEARNING: key('jp.low_tolerance_fragment_learning'),

  // ── Value priorities (vp.*) ────────────────────────────
  VP_MAINTAINABILITY_OVER_SPEED: key('vp.maintainability_over_speed'),
  VP_PERFORMANCE_SENSITIVE: key('vp.performance_sensitive'),
  VP_PRAGMATIC_COST_SENSITIVE: key('vp.pragmatic_cost_sensitive'),
  VP_CONSISTENCY_OVER_VARIETY: key('vp.consistency_over_variety'),
  VP_LONG_TERM_INVESTMENT: key('vp.long_term_investment'),

  // ── Relation rhythm (rr.*) ─────────────────────────────
  RR_PREFER_GENTLE_DIRECT: key('rr.prefer_gentle_direct'),
  RR_PREFER_SHORT_REPLY: key('rr.prefer_short_reply'),
  RR_DISLIKE_TOO_PUSHY: key('rr.dislike_too_pushy'),
  RR_PREFER_COMPANION_MODE_WHEN_TIRED: key('rr.prefer_companion_mode_when_tired'),
  RR_ALLOW_PLAYFUL_TEASE_LOW: key('rr.allow_playful_tease_low'),

  // ── Interaction preferences (ip.*) ─────────────────────
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

  // ── Emotional tendencies (et.*) ────────────────────────
  ET_FRUSTRATION_QUIT_RISK: key('et.frustration_quit_risk'),
  ET_NEEDS_VALIDATION_WHEN_UNCERTAIN: key('et.needs_validation_when_uncertain'),
  ET_ANXIETY_ABOUT_JOB_SEARCH: key('et.anxiety_about_job_search'),
  ET_TIRED_AVOID_COMPLEXITY: key('et.tired_avoid_complexity'),
  ET_PREFERS_STABILITY: key('et.prefers_stability'),

  // ── Boundary norms (bn.*) ──────────────────────────────
  BN_NO_HURTFUL_SPEECH: key('bn.no_hurtful_speech'),
} as const;

export type ClaimKey = (typeof CLAIM_KEYS)[keyof typeof CLAIM_KEYS];
export type CanonicalClaimKey = ClaimKey;
export type DraftClaimKey = `draft.${'ip' | 'jp' | 'vp' | 'rr' | 'et'}.${string}`;

const LevelValue = z.object({ level: ClaimValueLevel });
const PriorityValue = z.object({ priority: ClaimValuePriority });
const EnabledValue = z.object({ enabled: z.boolean() });

export const ClaimSchemaRegistry = {
  allowedPrefixes: ['jp.', 'vp.', 'rr.', 'ip.', 'et.', 'bn.', 'draft.jp.', 'draft.vp.', 'draft.rr.', 'draft.ip.', 'draft.et.'] as const,
  canonicalKeys: Object.values(CLAIM_KEYS),
  draftKeyMaxLen: 40,
  draftKeyRegex: /^draft\.(ip|jp|vp|rr|et)\.[a-z0-9_.-]+$/i,
  schemas: {
    // jp.* (level)
    [CLAIM_KEYS.JP_AFTER_POSITIVE_ADD_NEGATIVE]: LevelValue,
    [CLAIM_KEYS.JP_QUIT_WHEN_BLOCKED]: LevelValue,
    [CLAIM_KEYS.JP_NEED_CLEAR_GOAL]: LevelValue,
    [CLAIM_KEYS.JP_OVER_OPTIMIZE_RISK]: LevelValue,
    [CLAIM_KEYS.JP_SEEKS_STRUCTURED_PLAN]: LevelValue,
    [CLAIM_KEYS.JP_LOW_TOLERANCE_FRAGMENT_LEARNING]: LevelValue,

    // vp.* (priority)
    [CLAIM_KEYS.VP_MAINTAINABILITY_OVER_SPEED]: PriorityValue,
    [CLAIM_KEYS.VP_PERFORMANCE_SENSITIVE]: PriorityValue,
    [CLAIM_KEYS.VP_PRAGMATIC_COST_SENSITIVE]: PriorityValue,
    [CLAIM_KEYS.VP_CONSISTENCY_OVER_VARIETY]: PriorityValue,
    [CLAIM_KEYS.VP_LONG_TERM_INVESTMENT]: PriorityValue,

    // rr.* (level)
    [CLAIM_KEYS.RR_PREFER_GENTLE_DIRECT]: LevelValue,
    [CLAIM_KEYS.RR_PREFER_SHORT_REPLY]: LevelValue,
    [CLAIM_KEYS.RR_DISLIKE_TOO_PUSHY]: LevelValue,
    [CLAIM_KEYS.RR_PREFER_COMPANION_MODE_WHEN_TIRED]: LevelValue,
    [CLAIM_KEYS.RR_ALLOW_PLAYFUL_TEASE_LOW]: LevelValue,

    // ip.* (mixed)
    [CLAIM_KEYS.IP_ANSWER_FIRST]: EnabledValue,
    [CLAIM_KEYS.IP_USE_BULLETS]: EnabledValue,
    [CLAIM_KEYS.IP_ASK_FEWER_QUESTIONS]: EnabledValue,
    [CLAIM_KEYS.IP_PROVIDE_OPTIONS_COUNT]: z.object({ n: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
    [CLAIM_KEYS.IP_TONE_GENTLE]: LevelValue,
    [CLAIM_KEYS.IP_TONE_CUTE]: LevelValue,
    [CLAIM_KEYS.IP_TONE_CALM]: LevelValue,
    [CLAIM_KEYS.IP_TONE_NO_SARCASM]: LevelValue,
    [CLAIM_KEYS.IP_PRAISE_FREQUENCY]: z.object({ level: ClaimValueLevel }),
    [CLAIM_KEYS.IP_PRAISE_STYLE]: z.object({ kind: ClaimPraiseStyleKind }),
    [CLAIM_KEYS.IP_PRAISE_AVOID]: z.object({ kind: ClaimPraiseAvoidKind }),
    [CLAIM_KEYS.IP_REPLY_LENGTH]: z.object({ target: ClaimReplyLengthTarget }),
    [CLAIM_KEYS.IP_REPLY_PACE]: z.object({ target: ClaimReplyPaceTarget }),
    [CLAIM_KEYS.IP_REPLY_ENERGY_MATCH]: EnabledValue,

    // et.* (level)
    [CLAIM_KEYS.ET_FRUSTRATION_QUIT_RISK]: LevelValue,
    [CLAIM_KEYS.ET_NEEDS_VALIDATION_WHEN_UNCERTAIN]: LevelValue,
    [CLAIM_KEYS.ET_ANXIETY_ABOUT_JOB_SEARCH]: LevelValue,
    [CLAIM_KEYS.ET_TIRED_AVOID_COMPLEXITY]: LevelValue,
    [CLAIM_KEYS.ET_PREFERS_STABILITY]: LevelValue,

    // bn.* (level)
    [CLAIM_KEYS.BN_NO_HURTFUL_SPEECH]: LevelValue,
  } as const satisfies Record<ClaimKey, z.ZodTypeAny>,

  isCanonicalKey(input: string): input is CanonicalClaimKey {
    return (this.canonicalKeys as readonly string[]).includes(input);
  },

  schemaForKey(k: ClaimKey): z.ZodTypeAny {
    return this.schemas[k];
  },

  draftValueSchema: z.union([
    z.object({ level: ClaimValueLevel }),
    z.object({ priority: ClaimValuePriority }),
    z.object({ enabled: z.boolean() }),
    z.object({ target: z.enum(['short', 'medium', 'long', 'slow', 'normal', 'fast']) }),
    z.object({ n: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
    z.object({ kind: z.string().trim().min(1).max(24) }),
  ]),

  classifyKey(key: string): 'canonical' | 'draft' | 'invalid' {
    const k = key.trim();
    if (this.isCanonicalKey(k)) return 'canonical';
    if (
      k.length <= this.draftKeyMaxLen
      && this.draftKeyRegex.test(k)
    ) {
      return 'draft';
    }
    return 'invalid';
  },

  validateCanonical(k: string, valueJson: unknown):
    | { ok: true; kind: 'canonical'; key: CanonicalClaimKey; valueJson: unknown }
    | { ok: false; reason: string } {
    if (!this.isCanonicalKey(k)) {
      return { ok: false, reason: `key not in whitelist: ${k}` };
    }
    const key = k as CanonicalClaimKey;
    const schema = this.schemaForKey(key as ClaimKey);
    const parsed = schema.safeParse(valueJson);
    if (!parsed.success) {
      return { ok: false, reason: `valueJson schema mismatch for ${k}: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
    }
    return { ok: true, kind: 'canonical', key, valueJson: parsed.data };
  },

  validateDraft(k: string, valueJson: unknown):
    | { ok: true; kind: 'draft'; key: DraftClaimKey; valueJson: unknown }
    | { ok: false; reason: string } {
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
    return { ok: true, kind: 'draft', key: key as DraftClaimKey, valueJson: parsed.data };
  },

  validateAny(k: string, valueJson: unknown):
    | { ok: true; kind: 'canonical'; key: CanonicalClaimKey; valueJson: unknown }
    | { ok: true; kind: 'draft'; key: DraftClaimKey; valueJson: unknown }
    | { ok: false; reason: string } {
    const kind = this.classifyKey(k);
    if (kind === 'canonical') return this.validateCanonical(k, valueJson);
    if (kind === 'draft') return this.validateDraft(k, valueJson);
    return { ok: false, reason: `invalid key (must be canonical or draft.*): ${k}` };
  },
} as const;
