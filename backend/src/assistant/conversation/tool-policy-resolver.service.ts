import { Injectable } from '@nestjs/common';
import { CapabilityRegistry } from '../../action/capability-registry.service';
import type { DialogueIntentState } from '../intent/intent.types';
import { FeatureFlagConfig } from './feature-flag.config';
import type { ToolPolicyAction, ToolPolicyDecision, TurnContext } from './orchestration.types';

@Injectable()
export class ToolPolicyResolver {
  private static readonly CAPABILITY_TO_ACTION: Record<string, ToolPolicyAction> = {
    weather: 'run_local_weather',
    'book-download': 'run_local_book_download',
    'general-action': 'run_local_general_action',
    timesheet: 'run_local_timesheet',
  };

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly flags: FeatureFlagConfig,
  ) {}

  async resolve(
    _context: TurnContext,
    intentState: DialogueIntentState,
  ): Promise<ToolPolicyDecision> {
    if (!intentState.requiresTool) {
      return { action: 'chat', reason: '意图为非工具请求，走聊天路径' };
    }

    if (intentState.confidence < this.flags.openclawConfidenceThreshold) {
      return {
        action: 'chat',
        reason: `工具意图置信度 ${intentState.confidence} < 阈值 ${this.flags.openclawConfidenceThreshold}`,
      };
    }

    const allowTimesheetDefaultParams = intentState.taskIntent === 'timesheet'
      && intentState.missingParams.every((name) => name === 'timesheetDate' || name === 'timesheetMonth');
    if (intentState.missingParams.length > 0 && !allowTimesheetDefaultParams) {
      return {
        action: 'ask_missing',
        reason: `需要工具但缺少参数：${intentState.missingParams.join('、')}`,
      };
    }

    if (intentState.taskIntent !== 'none' && intentState.taskIntent !== 'dev_task') {
      const cap = this.capabilityRegistry.findByTaskIntent(intentState.taskIntent, 'chat');
      if (cap) {
        const action = ToolPolicyResolver.CAPABILITY_TO_ACTION[cap.name];
        if (action) {
          return { action, reason: `${intentState.taskIntent} 意图参数齐全，本地 ${cap.name} 可用` };
        }
      }
      if (this.flags.featureOpenClaw) {
        return {
          action: 'run_openclaw',
          reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置，回退 OpenClaw`,
        };
      }
      return {
        action: 'chat',
        reason: `${intentState.taskIntent} 意图已识别，但本地能力未配置且 OpenClaw 已关闭，回退聊天`,
      };
    }

    if (this.flags.featureOpenClaw) {
      return { action: 'run_openclaw', reason: '工具意图参数齐全，委派 OpenClaw 执行' };
    }

    return {
      action: 'chat',
      reason: '工具意图参数齐全，但未开启 OpenClaw，改用普通聊天',
    };
  }
}
