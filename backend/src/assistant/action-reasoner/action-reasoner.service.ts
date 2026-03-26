import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import { IntentCapabilityMapper } from '../../action/intent-capability-mapper.service';
import { SystemSelfService } from '../../system-self/system-self.service';
import { TaskPlannerService } from '../planning/task-planner.service';
import type { DialogueIntentState } from '../intent/intent.types';
import type { ToolPolicyAction, ToolPolicyDecision } from '../conversation/orchestration.types';
import type { ActionDecision, ActionMode, ActionWorkItemPolicy } from './action-reasoner.types';

const VALID_ACTION_MODES: ActionMode[] = [
  'direct_reply',
  'run_capability',
  'handoff_dev',
  'suggest_reminder',
];

type ActionDecisionDraft = Omit<ActionDecision, 'toolPolicy'>;
type RoutedDecisionDraft = ActionDecisionDraft & {
  routeAction?: ToolPolicyAction;
};

interface DecisionBuildOptions {
  allowLlmActionHint: boolean;
}

@Injectable()
export class ActionReasonerService {
  private readonly logger = new Logger(ActionReasonerService.name);
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
  decide(
    intentState: DialogueIntentState | null,
    userInput?: string,
  ): ActionDecision {
    if (!intentState) {
      return this.finalizeDecision({
        action: 'direct_reply',
        reason: '无意图状态，默认聊天路径',
        confidence: 0,
        source: 'rule',
      });
    }

    const decision = this.buildDecision(intentState, userInput, {
      allowLlmActionHint: true,
    });

    if (intentState.actionHint?.action) {
      const shadowDecision = this.buildDecision(intentState, userInput, {
        allowLlmActionHint: false,
      });
      this.logShadowComparison(intentState, decision, shadowDecision);
    }

    return decision;
  }

  private buildDecision(
    intentState: DialogueIntentState,
    userInput: string | undefined,
    options: DecisionBuildOptions,
  ): ActionDecision {
    let decision: RoutedDecisionDraft;

    const semanticHint = {
      targetKind: intentState.targetKind,
      planIntent: intentState.planIntent,
    };

    const ruleDecision = this.applyRules(intentState, userInput);
    if (ruleDecision) {
      decision = ruleDecision;
    } else {
      const llmHint = options.allowLlmActionHint ? intentState.actionHint?.action : undefined;
      if (llmHint && VALID_ACTION_MODES.includes(llmHint as ActionMode)) {
        const mode = llmHint as ActionMode;
        const { capability, routeAction } = this.inferRouteFromAction(mode, intentState);
        decision = {
          action: mode,
          capability,
          routeAction,
          reason: this.buildLlmHintReason(mode, intentState),
          confidence: intentState.confidence,
          source: 'llm_hint',
          ...(semanticHint.targetKind ? { targetKind: semanticHint.targetKind } : {}),
          ...(semanticHint.planIntent ? { planIntent: semanticHint.planIntent } : {}),
          reminderHint: mode === 'suggest_reminder'
            ? this.buildReminderHint(intentState)
            : undefined,
        };
      } else {
        decision = {
          action: 'direct_reply',
          reason: options.allowLlmActionHint
            ? '规则与 LLM hint 均未命中，兜底聊天'
            : '规则未命中，忽略 LLM actionHint 后兜底聊天',
          confidence: intentState.confidence,
          source: 'rule',
        };
      }
    }

    // 多意图：提取非主意图作为 deferredIntents
    const deferred = this.extractDeferredIntents(intentState);
    if (deferred.length > 0) {
      decision.deferredIntents = deferred;
    }

    if (!decision.targetKind && semanticHint.targetKind) {
      decision.targetKind = semanticHint.targetKind;
    }
    if (!decision.planIntent && semanticHint.planIntent) {
      decision.planIntent = semanticHint.planIntent;
    }

    return this.finalizeDecision(decision);
  }

  /**
   * 从 taskIntents 中提取非主意图的延迟动作。
   * 主意图已由 decide() 处理，这里只保留其余意图。
   */
  private extractDeferredIntents(intentState: DialogueIntentState): import('../intent/intent.types').TaskIntentItem[] {
    const taskIntents = intentState.taskIntents;
    if (!taskIntents || taskIntents.length <= 1) return [];

    // 第一个意图视为主意图（与 taskIntent 一致），其余为延迟
    return taskIntents.slice(1).filter((item) => item.intent !== 'none');
  }

  private applyRules(intentState: DialogueIntentState, userInput?: string): RoutedDecisionDraft | null {
    const threshold = this.openclawConfidenceThreshold;

    if (!intentState.requiresTool && intentState.taskIntent === 'none') {
      return {
        action: 'direct_reply',
        routeAction: 'chat',
        reason: '意图为非工具请求，走聊天路径',
        confidence: intentState.confidence,
        source: 'rule',
        targetKind: 'chat',
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
          routeAction: 'run_capability',
          reason: '提醒意图，执行 reminder 能力',
          confidence: intentState.confidence,
          source: 'rule',
        };
      }
    }

    if (intentState.taskIntent === 'device_screenshot') {
      return {
        action: 'direct_reply',
        routeAction: 'chat',
        reason: '设备截图请求需要用户设备侧执行，当前只能说明限制并引导用户截图或上传图片',
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    if (intentState.escalation === '应转任务') {
      const plan = this.taskPlanner.shouldPlan({
        userInput: userInput ?? '',
        intentState: {
          taskIntent: intentState.taskIntent,
          escalation: intentState.escalation,
          confidence: intentState.confidence,
        },
      });

      let hint = '用户表达了后续要跟进的事项，可自然建议设置提醒';
      if (plan.shouldPlan && plan.steps) {
        hint += `。建议步骤：${plan.steps.join(' → ')}`;
      }

      return {
        action: 'suggest_reminder',
        reason: hint,
        confidence: intentState.confidence,
        source: 'rule',
        reminderHint: hint,
        taskPlan: plan.shouldPlan ? plan : undefined,
      };
    }

    if (intentState.confidence < threshold) {
      return {
        action: 'direct_reply',
        routeAction: 'chat',
        reason: `工具意图置信度 ${intentState.confidence} < 阈值 ${threshold}`,
        confidence: intentState.confidence,
        source: 'rule',
        targetKind: 'chat',
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
        routeAction: 'ask_missing',
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
          routeAction: 'run_capability',
          reason: `${intentState.taskIntent} 意图参数齐全，本地 ${capName} 可用`,
          confidence: intentState.confidence,
          source: 'rule',
        };
      }
      if (this.featureOpenClaw) {
        return {
          action: 'run_capability',
          routeAction: 'run_openclaw',
          reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置，回退 OpenClaw`,
          confidence: intentState.confidence,
          source: 'rule',
        };
      }
      return {
        action: 'direct_reply',
        routeAction: 'chat',
        reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置且 OpenClaw 已关闭，回退聊天`,
        confidence: intentState.confidence,
        source: 'rule',
        targetKind: 'chat',
      };
    }

    if (intentState.requiresTool && this.featureOpenClaw) {
      return {
        action: 'run_capability',
        routeAction: 'run_openclaw',
        reason: '工具意图参数齐全，委派 OpenClaw 执行',
        confidence: intentState.confidence,
        source: 'rule',
      };
    }

    return null;
  }

  private finalizeDecision(decision: RoutedDecisionDraft): ActionDecision {
    const fallbackPolicy = this.buildFallbackPolicy(decision);
    const workItemPolicy = this.buildWorkItemPolicy(decision);

    return {
      ...decision,
      toolPolicy: this.buildToolPolicy(decision),
      ...(fallbackPolicy ? { fallbackPolicy } : {}),
      ...(workItemPolicy ? { workItemPolicy } : {}),
    };
  }

  private buildFallbackPolicy(
    decision: RoutedDecisionDraft,
  ): ActionDecision['fallbackPolicy'] | undefined {
    if (decision.action !== 'run_capability') {
      return undefined;
    }

    if (decision.capability === 'weather' || decision.capability === 'book-download') {
      return {
        condition: 'skill_fail',
        fallback: this.featureOpenClaw ? 'openclaw' : 'chat',
        reason: this.featureOpenClaw
          ? `本地 ${decision.capability} 执行失败时回退 OpenClaw`
          : 'OpenClaw 已关闭，执行失败时回退聊天',
      };
    }

    return undefined;
  }

  private buildWorkItemPolicy(
    decision: RoutedDecisionDraft,
  ): ActionWorkItemPolicy | undefined {
    if (decision.targetKind === 'idea') {
      return {
        shouldCapture: true,
        kind: 'idea',
      };
    }

    if (decision.targetKind === 'todo') {
      return {
        shouldCapture: true,
        kind: 'todo',
        createPlan: decision.planIntent?.type === 'notify',
      };
    }

    return undefined;
  }

  private buildToolPolicy(decision: RoutedDecisionDraft): ToolPolicyDecision {
    if (decision.routeAction) {
      return {
        action: decision.routeAction,
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
    if (decision.action === 'run_capability' && this.featureOpenClaw) {
      return { action: 'run_openclaw', reason: decision.reason };
    }
    return { action: 'chat', reason: decision.reason };
  }

  private logShadowComparison(
    intentState: DialogueIntentState,
    current: ActionDecision,
    hintless: ActionDecision,
  ): void {
    const currentSnapshot = this.pickShadowSnapshot(current);
    const hintlessSnapshot = this.pickShadowSnapshot(hintless);
    const diverged = JSON.stringify(currentSnapshot) !== JSON.stringify(hintlessSnapshot);

    if (!diverged) return;

    this.logger.log(
      `[Shadow actionHint] taskIntent=${intentState.taskIntent} current=${JSON.stringify(currentSnapshot)} hintless=${JSON.stringify(hintlessSnapshot)}`,
    );
  }

  private buildLlmHintReason(
    mode: ActionMode,
    intentState: DialogueIntentState,
  ): string {
    switch (mode) {
      case 'handoff_dev':
        return '采纳语义层建议：当前更适合移交开发代理处理';
      case 'suggest_reminder':
        return '采纳语义层建议：用户提到了后续事项，可自然建议设置提醒';
      case 'run_capability':
        return intentState.taskIntent !== 'none'
          ? `采纳语义层建议：${intentState.taskIntent} 更适合走执行链路`
          : '采纳语义层建议：当前更适合走执行链路';
      case 'direct_reply':
      default:
        return '采纳语义层建议：当前更适合直接回复';
    }
  }

  private buildReminderHint(intentState: DialogueIntentState): string {
    if (intentState.planIntent?.type === 'notify') {
      return '用户提到了后续需要提醒的事项，可自然建议我帮她记一下。';
    }
    if (intentState.targetKind === 'todo') {
      return '用户提到了后续待办事项，可自然建议设置提醒或记一下。';
    }
    return '用户提到了后续要跟进的事项，可自然建议设置提醒。';
  }

  private pickShadowSnapshot(decision: ActionDecision): Record<string, unknown> {
    return {
      action: decision.action,
      route: decision.toolPolicy.action,
      capability: decision.capability ?? null,
      targetKind: decision.targetKind ?? null,
      planIntent: decision.planIntent?.type ?? null,
      workItemKind: decision.workItemPolicy?.kind ?? null,
    };
  }

  private inferRouteFromAction(
    mode: ActionMode,
    intentState: DialogueIntentState,
  ): { routeAction?: ToolPolicyAction; capability?: string } {
    if (mode === 'direct_reply') return { routeAction: 'chat' };
    if (mode === 'handoff_dev' || mode === 'suggest_reminder') return {};
    if (mode === 'run_capability') {
      if (intentState.taskIntent !== 'none' && intentState.taskIntent !== 'dev_task') {
        const capName = this.findCapabilityByIntent(intentState.taskIntent, 'chat');
        if (capName) {
          return { routeAction: 'run_capability', capability: capName };
        }
      }
      if (this.featureOpenClaw) return { routeAction: 'run_openclaw' };
    }
    return { routeAction: 'chat' };
  }

  private findCapabilityByIntent(taskIntent: string, channel: 'chat' | 'dev'): string | null {
    const capNames = this.intentMapper.findCapabilities(taskIntent as any, channel);
    if (capNames.length === 0) return null;
    const cap = this.capabilityRegistry.get(capNames[0]);
    return cap?.isAvailable() ? cap.name : null;
  }
}
