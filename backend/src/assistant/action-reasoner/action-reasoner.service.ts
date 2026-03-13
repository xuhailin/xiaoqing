import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { IntentCapabilityMapper } from '../../action/intent-capability-mapper.service';
import { SystemSelfService } from '../../system-self/system-self.service';
import { TaskPlannerService } from '../planning/task-planner.service';
import type { DialogueIntentState } from '../intent/intent.types';
import type { ToolPolicyAction, ToolPolicyDecision } from '../conversation/orchestration.types';
import type { ActionDecision, ActionMode } from './action-reasoner.types';

const VALID_ACTION_MODES: ActionMode[] = [
  'direct_reply',
  'run_capability',
  'handoff_dev',
  'suggest_reminder',
];

@Injectable()
export class ActionReasonerService {
  private readonly openclawConfidenceThreshold: number;
  private readonly featureOpenClaw: boolean;

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly intentMapper: IntentCapabilityMapper,
    private readonly systemSelf: SystemSelfService,
    private readonly taskPlanner: TaskPlannerService,
    config: ConfigService,
  ) {
    this.openclawConfidenceThreshold = Number(config.get('OPENCLAW_CONFIDENCE_THRESHOLD')) || 0.7;
    this.featureOpenClaw = this.systemSelf.getFeatures().openclaw;
  }

  /**
   * 规则优先，LLM hint 补充。无 intentState 时返回默认 direct_reply。
   */
  decide(intentState: DialogueIntentState | null): ActionDecision {
    if (!intentState) {
      return {
        action: 'direct_reply',
        reason: '无意图状态，默认聊天路径',
        confidence: 0,
        source: 'rule',
      };
    }

    const ruleDecision = this.applyRules(intentState);
    if (ruleDecision) return ruleDecision;

    const llmHint = intentState.actionHint?.action;
    if (llmHint && VALID_ACTION_MODES.includes(llmHint as ActionMode)) {
      const mode = llmHint as ActionMode;
      const { toolPolicyAction, capability } = this.inferToolPolicyFromAction(mode, intentState);
      return {
        action: mode,
        capability,
        toolPolicyAction,
        reason: intentState.actionHint?.reason ?? `采纳 LLM 建议：${mode}`,
        confidence: intentState.confidence,
        source: 'llm_hint',
        reminderHint: mode === 'suggest_reminder' ? intentState.actionHint?.reason : undefined,
      };
    }

    return {
      action: 'direct_reply',
      reason: '规则与 LLM hint 均未命中，兜底聊天',
      confidence: intentState.confidence,
      source: 'rule',
    };
  }

  /**
   * 将 ActionDecision 映射为下游使用的 ToolPolicyDecision。
   * handoff_dev / suggest_reminder 在 v1 映射为 chat，由 prompt 注入 hint。
   */
  toToolPolicy(decision: ActionDecision): ToolPolicyDecision {
    if (decision.toolPolicyAction) {
      return {
        action: decision.toolPolicyAction,
        reason: decision.reason,
        ...(decision.capability ? { capability: decision.capability } : {}),
      };
    }
    if (decision.action === 'handoff_dev' || decision.action === 'suggest_reminder') {
      return { action: 'chat', reason: decision.reason };
    }
    if (decision.action === 'direct_reply') {
      return { action: 'chat', reason: decision.reason };
    }
    if (decision.action === 'run_capability' && decision.capability) {
      return { action: 'run_capability', capability: decision.capability, reason: decision.reason };
    }
    return { action: 'chat', reason: decision.reason };
  }

  private applyRules(intentState: DialogueIntentState): ActionDecision | null {
    const threshold = this.openclawConfidenceThreshold;

    if (!intentState.requiresTool && intentState.taskIntent === 'none') {
      return {
        action: 'direct_reply',
        toolPolicyAction: 'chat',
        reason: '意图为非工具请求，走聊天路径',
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    if (intentState.taskIntent === 'dev_task') {
      return {
        action: 'handoff_dev',
        reason: '开发任务意图，建议移交开发代理',
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    if (intentState.taskIntent === 'set_reminder') {
      const capName = this.findCapabilityByIntent('set_reminder', 'chat');
      if (capName) {
        return {
          action: 'run_capability',
          capability: capName,
          toolPolicyAction: 'run_capability',
          reason: '提醒意图，执行 reminder 能力',
          confidence: intentState.confidence,
          source: 'rule',
        };
      }
    }

    if (intentState.escalation === '应转任务') {
      const plan = this.taskPlanner.shouldPlan({
        userInput: '',
        intentState: {
          taskIntent: intentState.taskIntent,
          escalation: intentState.escalation,
          confidence: intentState.confidence,
        },
      });

      let hint = intentState.actionHint?.reason ?? '用户表达可转任务，建议设置提醒';
      if (plan.shouldPlan && plan.steps) {
        hint += `。建议步骤：${plan.steps.join(' → ')}`;
      }

      return {
        action: 'suggest_reminder',
        reason: hint,
        confidence: intentState.confidence,
        source: 'rule',
        reminderHint: hint,
      };
    }

    if (intentState.confidence < threshold) {
      return {
        action: 'direct_reply',
        toolPolicyAction: 'chat',
        reason: `工具意图置信度 ${intentState.confidence} < 阈值 ${threshold}`,
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    const allowTimesheetDefaultParams =
      intentState.taskIntent === 'timesheet' &&
      intentState.missingParams.every(
        (name) => name === 'timesheetDate' || name === 'timesheetMonth',
      );
    if (intentState.missingParams.length > 0 && !allowTimesheetDefaultParams) {
      return {
        action: 'run_capability',
        toolPolicyAction: 'ask_missing',
        reason: `需要工具但缺少参数：${intentState.missingParams.join('、')}`,
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    if (intentState.taskIntent !== 'none') {
      const capName = this.findCapabilityByIntent(intentState.taskIntent, 'chat');
      if (capName) {
        return {
          action: 'run_capability',
          capability: capName,
          toolPolicyAction: 'run_capability',
          reason: `${intentState.taskIntent} 意图参数齐全，本地 ${capName} 可用`,
          confidence: intentState.confidence,
          source: 'rule',
        };
      }
      if (this.featureOpenClaw) {
        return {
          action: 'run_capability',
          toolPolicyAction: 'run_openclaw',
          reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置，回退 OpenClaw`,
          confidence: intentState.confidence,
          source: 'rule',
        };
      }
      return {
        action: 'direct_reply',
        toolPolicyAction: 'chat',
        reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置且 OpenClaw 已关闭，回退聊天`,
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    if (intentState.requiresTool && this.featureOpenClaw) {
      return {
        action: 'run_capability',
        toolPolicyAction: 'run_openclaw',
        reason: '工具意图参数齐全，委派 OpenClaw 执行',
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    return null;
  }

  private inferToolPolicyFromAction(
    mode: ActionMode,
    intentState: DialogueIntentState,
  ): { toolPolicyAction?: ToolPolicyAction; capability?: string } {
    if (mode === 'direct_reply') return { toolPolicyAction: 'chat' };
    if (mode === 'handoff_dev' || mode === 'suggest_reminder') return {};
    if (mode === 'run_capability') {
      if (intentState.taskIntent !== 'none' && intentState.taskIntent !== 'dev_task') {
        const capName = this.findCapabilityByIntent(intentState.taskIntent, 'chat');
        if (capName) {
          return { toolPolicyAction: 'run_capability', capability: capName };
        }
      }
      if (this.featureOpenClaw) return { toolPolicyAction: 'run_openclaw' };
    }
    return { toolPolicyAction: 'chat' };
  }

  private findCapabilityByIntent(taskIntent: string, channel: 'chat' | 'dev'): string | null {
    const capNames = this.intentMapper.findCapabilities(taskIntent as any, channel);
    if (capNames.length === 0) return null;
    const cap = this.capabilityRegistry.get(capNames[0]);
    return cap?.isAvailable() ? cap.name : null;
  }
}
