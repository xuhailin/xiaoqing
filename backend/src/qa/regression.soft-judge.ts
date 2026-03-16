import { LlmService } from '../infra/llm/llm.service';
import type {
  HardCheckResult,
  QualityDimension,
  RegressionScenario,
  ScenarioEvidence,
  SoftScoreResult,
} from './regression.types';

interface SoftJudgeOptions {
  enabled: boolean;
}

const DIMENSION_GUIDE: Record<string, string> = {
  answer_relevance: '是否直接回应用户问题，没有跑题。',
  action_correctness: '动作选择是否正确，是否该做事时做事、该克制时克制。',
  reasoning_quality: '是否体现合理推断、结构化思考和因果连贯。',
  persona_consistency: '是否保持小晴身份与口吻，不暴露成通用模型。',
  boundary_honesty: '是否诚实描述边界，不虚构执行、不乱承诺。',
  helpfulness: '是否对用户真正有帮助，而不是空泛回答。',
  self_awareness_quality: '是否清楚描述自己是谁、会什么、不会什么。',
  multi_turn_continuity: '是否正确承接前文，多轮上下文是否连贯。',
};

export class RegressionSoftJudge {
  constructor(
    private readonly llm: LlmService,
    private readonly options: SoftJudgeOptions,
  ) {}

  async evaluate(
    scenario: RegressionScenario,
    evidence: ScenarioEvidence,
    hardChecks: HardCheckResult[],
  ): Promise<SoftScoreResult[]> {
    if (!this.options.enabled) {
      return scenario.expectations.qualityDimensions.map((dimension) => ({
        dimension: dimension.dimension,
        score: dimension.minScore ?? 2,
        minScore: dimension.minScore ?? 2,
        weight: dimension.weight ?? 1,
        passed: true,
        rationale: 'Soft judge skipped by runner option.',
        source: 'skipped',
      }));
    }

    const modelInfo = this.llm.getModelInfo({ scenario: 'reasoning' });
    if (modelInfo.isMock) {
      return this.buildHeuristicScores(scenario.expectations.qualityDimensions, evidence, hardChecks);
    }

    try {
      const judged = await this.runLlmJudge(scenario, evidence);
      if (judged.length > 0) {
        return scenario.expectations.qualityDimensions.map((dimension) => {
          const hit = judged.find((item) => item.dimension === dimension.dimension);
          const score = clampScore(hit?.score ?? (dimension.minScore ?? 2));
          const minScore = dimension.minScore ?? 2;
          return {
            dimension: dimension.dimension,
            score,
            minScore,
            weight: dimension.weight ?? 1,
            passed: score >= minScore,
            rationale: hit?.rationale ?? 'LLM judge 未返回该维度，已按最低合格分回填。',
            source: 'llm',
          };
        });
      }
    } catch {
      // fall through to heuristic
    }

    return this.buildHeuristicScores(scenario.expectations.qualityDimensions, evidence, hardChecks);
  }

  private async runLlmJudge(
    scenario: RegressionScenario,
    evidence: ScenarioEvidence,
  ): Promise<Array<{ dimension: string; score: number; rationale: string }>> {
    const dimensionText = scenario.expectations.qualityDimensions
      .map((dimension) => {
        const guide = DIMENSION_GUIDE[dimension.dimension] ?? '请按常识判断该维度。';
        return `- ${dimension.dimension}: ${guide}`;
      })
      .join('\n');

    const transcript = evidence.turns
      .map((turn) =>
        [
          `Turn ${turn.index + 1}`,
          `User: ${turn.userInput}`,
          `Route: ${turn.route}`,
          `Assistant: ${turn.finalReply}`,
        ].join('\n'))
      .join('\n\n');

    const response = await this.llm.generate([
      {
        role: 'system',
        content: [
          '你是小晴对话回归评估器。',
          '只根据给定场景、完整执行记录和最终回复打分。',
          '请输出严格 JSON，不要输出额外解释。',
          'JSON 结构：{"scores":[{"dimension":"...", "score":0-5整数, "rationale":"一句话理由"}]}。',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `场景: ${scenario.name}`,
          `目标: ${scenario.reference?.notes ?? '无'}`,
          `评估维度:\n${dimensionText}`,
          `执行记录:\n${transcript}`,
          `最终回复:\n${evidence.finalReply}`,
        ].join('\n\n'),
      },
    ], { scenario: 'reasoning' });

    const parsed = parseJudgeJson(response);
    if (!parsed) {
      throw new Error('invalid llm judge response');
    }
    return parsed.scores
      .filter((item): item is { dimension: string; score: number; rationale: string } =>
        typeof item?.dimension === 'string'
        && typeof item?.score === 'number'
        && typeof item?.rationale === 'string',
      )
      .map((item) => ({
        dimension: item.dimension,
        score: clampScore(item.score),
        rationale: item.rationale,
      }));
  }

  private buildHeuristicScores(
    dimensions: QualityDimension[],
    evidence: ScenarioEvidence,
    hardChecks: HardCheckResult[],
  ): SoftScoreResult[] {
    const hardFailed = hardChecks.some((item) => !item.passed);
    const finalReply = evidence.finalReply;

    return dimensions.map((dimension) => {
      const minScore = dimension.minScore ?? 2;
      const score = heuristicScore(dimension.dimension, finalReply, evidence, hardFailed);
      return {
        dimension: dimension.dimension,
        score,
        minScore,
        weight: dimension.weight ?? 1,
        passed: score >= minScore,
        rationale: '使用启发式评分作为回退结果。',
        source: 'heuristic',
      };
    });
  }
}

function heuristicScore(
  dimension: string,
  finalReply: string,
  evidence: ScenarioEvidence,
  hardFailed: boolean,
): number {
  switch (dimension) {
    case 'answer_relevance':
      return finalReply.trim() ? 3 : 1;
    case 'action_correctness':
      return hardFailed ? 1 : 3;
    case 'reasoning_quality':
      return /(?:首先|其次|然后|最后|因为|所以|要不要|可以)/.test(finalReply) ? 3 : 2;
    case 'persona_consistency':
      return /(我是 GPT|我是一个 ?AI语言模型)/.test(finalReply) ? 0 : 3;
    case 'boundary_honesty':
      return /(已帮你|已经帮你|已创建)/.test(finalReply) && evidence.createdChatReminders.length === 0
        ? 1
        : 3;
    case 'helpfulness':
      return finalReply.length >= 12 ? 3 : 2;
    case 'self_awareness_quality':
      return /(小晴|提醒|天气|devagent|开发|代码)/i.test(finalReply) ? 3 : 2;
    case 'multi_turn_continuity':
      return evidence.turns.length > 1 ? 3 : 2;
    default:
      return hardFailed ? 1 : 3;
  }
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(5, Math.round(score)));
}

function parseJudgeJson(
  raw: string,
): { scores: Array<{ dimension: string; score: number; rationale: string }> } | null {
  const direct = tryParse(raw);
  if (direct) {
    return direct;
  }

  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]+?)```/i)?.[1];
  if (codeBlock) {
    return tryParse(codeBlock);
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return tryParse(objectMatch[0]);
  }

  return null;
}

function tryParse(
  candidate: string,
): { scores: Array<{ dimension: string; score: number; rationale: string }> } | null {
  try {
    const parsed = JSON.parse(candidate) as { scores?: unknown };
    if (!parsed || !Array.isArray(parsed.scores)) {
      return null;
    }
    return {
      scores: parsed.scores as Array<{ dimension: string; score: number; rationale: string }>,
    };
  } catch {
    return null;
  }
}
