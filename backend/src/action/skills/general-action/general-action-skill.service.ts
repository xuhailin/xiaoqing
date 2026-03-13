import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import { executeGeneralAction } from '../../tools/general-action/executor';
import type { GeneralActionSkillExecuteParams, GeneralActionSkillResult } from './general-action-skill.types';

@Injectable()
export class GeneralActionSkillService implements ICapability {
  private readonly logger = new Logger(GeneralActionSkillService.name);
  private readonly enabled: boolean;

  // ── ICapability 元数据 ──────────────────────────────────
  readonly name = 'general-action';
  readonly taskIntent = 'general_tool';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '其他工具型请求（搜索、邮件、日历、外部查询等）';
  readonly surface = 'assistant' as const;
  readonly scope = 'public' as const;
  readonly portability = 'portable' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = false;
  readonly visibility = 'optional' as const;

  constructor(config: ConfigService) {
    this.enabled = config.get('FEATURE_LOCAL_GENERAL_ACTION') === 'true';
  }

  /** 本地基础行动能力开关（默认关闭） */
  isAvailable(): boolean {
    return this.enabled;
  }

  // ── ICapability.execute — 统一入口 ─────────────────────
  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const adapted = this.parseParams(request.params);
    if (!adapted) {
      return { success: false, content: null, error: 'general_action params invalid' };
    }
    const result = await this.executeGeneralAction(adapted);
    return {
      success: result.success,
      content: result.content || null,
      error: result.error ?? null,
      meta: {
        ...(result.meta ?? {}),
        reasonCode: result.code ?? null,
        actionType: typeof result.meta?.actionType === 'string' ? result.meta.actionType : null,
      },
    };
  }

  async executeGeneralAction(params: GeneralActionSkillExecuteParams): Promise<GeneralActionSkillResult> {
    const input = params?.input?.trim();
    if (!input) {
      return { success: false, content: '', error: '输入为空', code: 'VALIDATION_ERROR' };
    }
    if (!this.enabled) {
      return { success: false, content: '', error: '本地基础行动能力未开启', code: 'NOT_SUPPORTED' };
    }

    try {
      const result = await executeGeneralAction(input);
      return {
        success: result.ok,
        content: result.message ?? '',
        error: result.ok ? undefined : result.message,
        code: result.code,
        meta: result.meta,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`General action skill error: ${msg}`);
      return { success: false, content: '', error: msg, code: 'EXECUTION_ERROR' };
    }
  }

  private parseParams(params: Record<string, unknown>): GeneralActionSkillExecuteParams | null {
    const input = typeof params.input === 'string' ? params.input.trim() : '';
    if (!input) return null;
    return { input };
  }
}
