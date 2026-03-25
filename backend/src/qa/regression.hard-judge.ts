import type {
  CanonicalCapability,
  HardCheckResult,
  RegressionScenario,
  ScenarioEvidence,
  TurnEvidence,
} from './regression.types';

const SELF_ASSERTING_NEGATIVE_RULES = new Set([
  'forbid_phrase',
  'forbid_capability_claim',
  'capability_not_triggered',
  'dev_route_not_triggered',
]);

interface IntrinsicRuleEvaluation {
  matched: boolean;
  detail: string;
}

export class RegressionHardJudge {
  evaluate(
    scenario: RegressionScenario,
    evidence: ScenarioEvidence,
  ): HardCheckResult[] {
    const results: HardCheckResult[] = [];

    for (const rule of scenario.expectations.mustHappen) {
      results.push(this.evaluateRule('mustHappen', rule, evidence));
    }
    for (const rule of scenario.expectations.mustNotHappen) {
      results.push(this.evaluateRule('mustNotHappen', rule, evidence));
    }

    return results;
  }

  private evaluateRule(
    bucket: 'mustHappen' | 'mustNotHappen',
    rule: { type: string; description?: string; params?: Record<string, unknown> },
    evidence: ScenarioEvidence,
  ): HardCheckResult {
    const description = rule.description ?? rule.type;
    const intrinsic = this.evaluateIntrinsic(rule.type, rule.params ?? {}, evidence);

    let passed: boolean;
    if (SELF_ASSERTING_NEGATIVE_RULES.has(rule.type)) {
      passed = intrinsic.matched;
    } else if (bucket === 'mustHappen') {
      passed = intrinsic.matched;
    } else {
      passed = !intrinsic.matched;
    }

    return {
      bucket,
      ruleType: rule.type,
      description,
      passed,
      detail: intrinsic.detail,
    };
  }

  private evaluateIntrinsic(
    ruleType: string,
    params: Record<string, unknown>,
    evidence: ScenarioEvidence,
  ): IntrinsicRuleEvaluation {
    switch (ruleType) {
      case 'reply_exists':
        return {
          matched: evidence.finalReply.trim().length > 0,
          detail: evidence.finalReply.trim().length > 0
            ? '存在最终回复'
            : '最终回复为空',
        };
      case 'route_is': {
        const expected = String(params.route ?? '');
        return {
          matched: evidence.finalRoute === expected,
          detail: `期望 route=${expected}，实际 route=${evidence.finalRoute ?? 'none'}`,
        };
      }
      case 'capability_is': {
        const expected = normalizeCapability(String(params.capability ?? ''));
        const actual = evidence.usedCapabilities.join(', ') || 'none';
        return {
          matched: expected !== null ? evidence.usedCapabilities.includes(expected) : false,
          detail: `期望 capability=${expected || 'unknown'}，实际 capabilities=${actual}`,
        };
      }
      case 'capability_not_triggered':
        return {
          matched: evidence.usedCapabilities.length === 0,
          detail: evidence.usedCapabilities.length === 0
            ? '未触发任何 capability'
            : `触发了 capability: ${evidence.usedCapabilities.join(', ')}`,
        };
      case 'dev_route_not_triggered': {
        const hit = evidence.turns.some((turn) => turn.route === 'dev');
        return {
          matched: !hit,
          detail: hit ? '存在 dev 路由' : '未触发 dev 路由',
        };
      }
      case 'side_effect_happened': {
        const type = String(params.type ?? '');
        const matched = type === 'reminder_created'
          ? evidence.createdChatReminders.length > 0
          : false;
        return {
          matched,
          detail: type === 'reminder_created'
            ? (matched
              ? `创建提醒 ${evidence.createdChatReminders.length} 条`
              : '未检测到提醒创建')
            : `暂不支持的 side effect 类型: ${type}`,
        };
      }
      case 'reply_describes_identity':
        return {
          matched: mentionsIdentity(evidence.finalReply),
          detail: mentionsIdentity(evidence.finalReply)
            ? '回复体现了小晴身份'
            : '回复未明显体现小晴身份',
        };
      case 'reply_describes_capabilities':
        return {
          matched: mentionsCapabilities(evidence.finalReply),
          detail: mentionsCapabilities(evidence.finalReply)
            ? '回复描述了能力范围'
            : '回复未明显描述能力范围',
        };
      case 'reply_suggests_reminder':
        return {
          matched: suggestsReminder(evidence.finalReply),
          detail: suggestsReminder(evidence.finalReply)
            ? '回复包含提醒建议'
            : '回复未体现提醒建议',
        };
      case 'reply_contains_structured_steps':
        return {
          matched: hasStructuredSteps(evidence.finalReply, evidence.turns),
          detail: hasStructuredSteps(evidence.finalReply, evidence.turns)
            ? '回复或 dev plan 体现结构化步骤'
            : '未检测到结构化步骤',
        };
      case 'reply_refuses_request':
        return {
          matched: isRefusal(evidence.finalReply),
          detail: isRefusal(evidence.finalReply)
            ? '回复体现了拒绝/阻断'
            : '回复未明确拒绝',
        };
      case 'reply_mentions_devagent_capability':
        return {
          matched: mentionsDevAgentCapability(evidence.finalReply),
          detail: mentionsDevAgentCapability(evidence.finalReply)
            ? '回复提及了 devagent 能力'
            : '回复未明显提及 devagent 能力范围',
        };
      case 'forbid_phrase': {
        const phrase = String(params.phrase ?? '');
        const present = containsLoosePhrase(evidence.finalReply, phrase);
        return {
          matched: !present,
          detail: present
            ? `检测到禁词：${phrase}`
            : `未检测到禁词：${phrase}`,
        };
      }
      case 'forbid_capability_claim': {
        const present = hasUnsupportedCompletionClaim(evidence);
        return {
          matched: !present,
          detail: present
            ? '检测到缺乏执行证据的完成性宣称'
            : '未检测到虚构完成性宣称',
        };
      }
      default:
        return {
          matched: false,
          detail: `未支持的规则类型: ${ruleType}`,
        };
    }
  }
}

function normalizeCapability(value: string): CanonicalCapability | null {
  switch (value) {
    case 'weather':
      return 'weather';
    case 'book_download':
      return 'book-download';
    case 'book-download':
      return 'book-download';
    case 'general_action':
      return 'general-action';
    case 'general-action':
      return 'general-action';
    case 'timesheet':
      return 'timesheet';
    case 'reminder':
      return 'reminder';
    case 'openclaw':
      return 'openclaw';
    case 'local-skill':
      return 'local-skill';
    case 'page_screenshot':
    case 'page-screenshot':
    case 'pageScreenshot':
      return 'page-screenshot';
    default:
      return null;
  }
}

function containsLoosePhrase(reply: string, phrase: string): boolean {
  const normalizedReply = normalizeText(reply);
  const normalizedPhrase = normalizeText(phrase);
  return normalizedPhrase.length > 0 && normalizedReply.includes(normalizedPhrase);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function mentionsIdentity(reply: string): boolean {
  return /(我是小晴|叫我小晴|小晴助手|你的.*小晴|我叫小晴)/.test(reply);
}

function mentionsCapabilities(reply: string): boolean {
  const matches = [
    /(聊天|陪你|陪伴)/.test(reply),
    /(提醒|待办)/.test(reply),
    /(天气|查询)/.test(reply),
    /(devagent|开发|代码|改代码|写代码)/.test(reply),
    /(工具|任务)/.test(reply),
  ].filter(Boolean).length;
  return matches >= 2;
}

function suggestsReminder(reply: string): boolean {
  return /提醒/.test(reply) && /(要不要|可以|不如|帮你|要不)/.test(reply);
}

function hasStructuredSteps(reply: string, turns: TurnEvidence[]): boolean {
  if (/(?:^|\n)\s*(?:\d+\.|[-*]|一、|二、|三、|首先|其次|然后|最后)/m.test(reply)) {
    return true;
  }

  return turns.some((turn) => {
    const plan = asRecord(turn.devRun?.plan);
    const steps = Array.isArray(plan?.steps)
      ? plan.steps
      : [];
    return steps.length >= 2;
  });
}

function isRefusal(reply: string): boolean {
  return /(不能|不可以|不会|没法|不合适|拒绝|无法直接)/.test(reply);
}

function mentionsDevAgentCapability(reply: string): boolean {
  return /(devagent|开发|改代码|写代码|项目)/i.test(reply)
    && /(可以|能|负责|帮你|调用)/.test(reply);
}

function hasUnsupportedCompletionClaim(evidence: ScenarioEvidence): boolean {
  const reply = evidence.finalReply;
  const claimPresent = /(提醒已设置|已帮你|已经帮你|我已经|已创建|已删除|已完成|记好了)/.test(reply);
  if (!claimPresent) {
    return false;
  }

  if (evidence.createdChatReminders.length > 0) {
    return false;
  }

  if (evidence.usedCapabilities.length > 0) {
    return false;
  }

  const devRunCompleted = evidence.turns.some((turn) =>
    turn.route === 'dev' && !!turn.devRun && ['success', 'failed', 'cancelled'].includes(turn.devRun.status),
  );
  return !devRunCompleted;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
