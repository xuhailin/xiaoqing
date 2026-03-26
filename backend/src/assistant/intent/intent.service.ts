import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OpenAI } from 'openai';
import { LlmService } from '../../infra/llm/llm.service';
import { INTENT_PROMPT_VERSION, INTENT_SYSTEM_PROMPT } from '../prompts/intent';
import {
  type ActionHintFromIntent,
  DEFAULT_INTENT_STATE,
  type DialogueAgency,
  type DialogueEscalation,
  type DialogueExpectation,
  type DialogueIntentState,
  type DialogueMode,
  type DialoguePlanIntentType,
  type DialogueSeriousness,
  type DialogueSuggestedTool,
  type DialogueTaskIntent,
  type DialogueTargetKind,
  type IdentityUpdateFromIntent,
  type PlanIntentFromIntent,
  type TaskIntentItem,
  type WorldStateUpdateFromIntent,
} from './intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';

@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);
  private readonly contextRounds: number;
  private readonly perMessageMaxChars: number;

  constructor(
    private llm: LlmService,
    config: ConfigService,
  ) {
    this.contextRounds = Number(config.get('INTENT_CONTEXT_ROUNDS')) || 5;
    this.perMessageMaxChars = Number(config.get('INTENT_MESSAGE_MAX_CHARS')) || 500;
  }

  fromHint(input: {
    toolHint: DialogueTaskIntent;
    currentUserInput: string;
    worldState?: WorldState | null;
    now?: Date;
  }): DialogueIntentState {
    const now = input.now ?? new Date();
    const slots = this.buildHintSlots(
      input.toolHint,
      input.currentUserInput,
      input.worldState,
      now,
    );

    const suggestedToolMap: Partial<Record<DialogueTaskIntent, DialogueSuggestedTool>> = {
      weather_query: 'weather',
      book_download: 'book_download',
      timesheet: 'timesheet',
      set_reminder: 'reminder',
    };

    const partial: Partial<DialogueIntentState> = {
      mode: input.toolHint === 'dev_task' ? 'decision' : 'task',
      seriousness: input.toolHint === 'general_tool' ? 'semi' : 'focused',
      expectation: '直接给结果',
      agency: input.toolHint === 'dev_task' ? '顾问' : '执行器',
      requiresTool: input.toolHint !== 'none',
      taskIntent: input.toolHint,
      slots,
      escalation: input.toolHint === 'dev_task' ? '应转任务' : '不推进',
      confidence: 0.96,
      missingParams: this.inferMissingParamsFromHint(input.toolHint, slots, input.worldState),
      suggestedTool: suggestedToolMap[input.toolHint] ?? null,
    };

    return this.normalize(partial);
  }

  async recognize(
    recentMessages: Array<{ role: string; content: string }>,
    currentUserInput: string,
    worldState?: WorldState | null,
    /** 动态注入的可用能力描述（由 CapabilityRegistry.buildCapabilityPrompt 生成） */
    capabilityPrompt?: string,
  ): Promise<DialogueIntentState> {
    const recent = recentMessages
      .slice(-(this.contextRounds * 2))
      .map((m) => ({
        role: String(m.role),
        content:
          String(m.content ?? '').length > this.perMessageMaxChars
            ? String(m.content ?? '').slice(0, this.perMessageMaxChars) + '…'
            : String(m.content ?? ''),
      }));

    const contextText = recent.map((m) => `${m.role}: ${m.content}`).join('\n');

    const worldStateText =
      worldState && (worldState.city ?? worldState.timezone ?? worldState.language)
        ? [
            '当前默认世界状态（若本轮未显式变更，可作为默认前提参与判断与槽位补全）：',
            ...(worldState.city ? [`- city: ${worldState.city}`] : []),
            ...(worldState.timezone ? [`- timezone: ${worldState.timezone}`] : []),
            ...(worldState.language ? [`- language: ${worldState.language}`] : []),
          ].join('\n')
        : '当前默认世界状态：无';

    // 动态能力注入：将当前可用能力追加到 intent prompt 末尾
    const capabilitySuffix = capabilityPrompt
      ? `\n\n【当前可用的本地能力】\n以下能力当前已配置并可用，taskIntent 应优先匹配这些值：\n${capabilityPrompt}\n- general_tool：其他工具型请求（未匹配到上述能力时使用）`
      : '';

    const nowISO = new Date().toISOString();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `[${INTENT_PROMPT_VERSION}]\n${INTENT_SYSTEM_PROMPT}${capabilitySuffix}`,
      },
      {
        role: 'user',
        content: `当前时间：${nowISO}\n${worldStateText}\n\n最近对话：\n${contextText}\n\n本轮用户输入：\n${currentUserInput}`,
      },
    ];

    try {
      const raw = await this.llm.generate(messages, { scenario: 'reasoning' });
      return this.parseIntentState(raw);
    } catch {
      return DEFAULT_INTENT_STATE;
    }
  }

  private parseIntentState(raw: string): DialogueIntentState {
    const cleaned = String(raw ?? '')
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim();

    const jsonStr = this.extractJsonObject(cleaned);
    if (!jsonStr) return DEFAULT_INTENT_STATE;

    try {
      const parsed = JSON.parse(jsonStr) as Partial<DialogueIntentState>;
      return this.normalize(parsed);
    } catch {
      return DEFAULT_INTENT_STATE;
    }
  }

  private extractJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  }

  private normalize(input: Partial<DialogueIntentState>): DialogueIntentState {
    const rawInput = input as Record<string, unknown>;
    const mode = this.pickOne<DialogueMode>(input.mode, [
      'chat',
      'thinking',
      'decision',
      'task',
    ]) ?? DEFAULT_INTENT_STATE.mode;

    const seriousness =
      this.pickOne<DialogueSeriousness>(input.seriousness, [
        'casual',
        'semi',
        'focused',
      ]) ?? DEFAULT_INTENT_STATE.seriousness;

    const expectation =
      this.pickOne<DialogueExpectation>(input.expectation, [
        '陪聊',
        '一起想',
        '直接给结果',
      ]) ?? DEFAULT_INTENT_STATE.expectation;

    const agency =
      this.pickOne<DialogueAgency>(input.agency, [
        '朋友',
        '并肩思考者',
        '顾问',
        '执行器',
      ]) ?? DEFAULT_INTENT_STATE.agency;

    const parsedTaskIntent =
      this.pickOne<DialogueTaskIntent>(input.taskIntent, [
        'none',
        'weather_query',
        'book_download',
        'general_tool',
        'timesheet',
        'dev_task',
        'set_reminder',
        'checkin',
        'device_screenshot',
        'page_screenshot',
      ]);

    // 兼容旧字段 toolNeed，避免模型短期内输出旧结构导致行为跳变。
    const legacyToolNeed = this.pickOne<string>(rawInput.toolNeed, [
      'none',
      'memory',
      'openclaw',
      'task-system',
    ]);

    const taskIntent = parsedTaskIntent ??
      (legacyToolNeed === 'openclaw' ? 'general_tool' : DEFAULT_INTENT_STATE.taskIntent);

    const requiresTool =
      typeof input.requiresTool === 'boolean'
        ? input.requiresTool
        : legacyToolNeed === 'openclaw' || taskIntent !== 'none';

    const escalation =
      this.pickOne<DialogueEscalation>(input.escalation, [
        '不推进',
        '可记录',
        '应转任务',
      ]) ?? DEFAULT_INTENT_STATE.escalation;

    const confidenceRaw =
      typeof input.confidence === 'number' && Number.isFinite(input.confidence)
        ? input.confidence
        : DEFAULT_INTENT_STATE.confidence;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));

    const baseMissingParams = Array.isArray(input.missingParams)
      ? input.missingParams.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [];

    const suggestedToolAllowed: DialogueSuggestedTool[] = ['weather', 'book_download', 'timesheet', 'reminder'];
    const suggestedToolRaw =
      this.pickOne<DialogueSuggestedTool>(input.suggestedTool, suggestedToolAllowed) ??
      this.pickOne<DialogueSuggestedTool>(rawInput.preferredSkill, suggestedToolAllowed);
    const suggestedTool = suggestedToolRaw ??
      (taskIntent === 'weather_query' ? 'weather' : taskIntent === 'book_download' ? 'book_download' : taskIntent === 'timesheet' ? 'timesheet' : taskIntent === 'set_reminder' ? 'reminder' : undefined);
    const normalizedTaskIntent =
      taskIntent === 'general_tool' && suggestedTool === 'weather'
        ? 'weather_query'
        : taskIntent === 'general_tool' && suggestedTool === 'book_download'
          ? 'book_download'
          : taskIntent === 'general_tool' && suggestedTool === 'timesheet'
            ? 'timesheet'
            : taskIntent === 'general_tool' && suggestedTool === 'reminder'
              ? 'set_reminder'
              : taskIntent;

    const slots = this.normalizeSlots(input.slots as unknown);
    const missingParams = this.normalizeMissingParams(baseMissingParams, normalizedTaskIntent, slots);

    const identityUpdate = this.normalizeIdentityUpdate(rawInput.identityUpdate);
    const worldStateUpdate = this.normalizeWorldStateUpdate(rawInput.worldStateUpdate);

    const detectedEmotion = this.pickOne(
      rawInput.detectedEmotion,
      ['calm', 'happy', 'low', 'anxious', 'irritated', 'tired', 'hurt', 'excited'] as const,
    );

    const actionHint = this.normalizeActionHint(rawInput.actionDecision);
    const legacySemanticCompat = this.extractLegacySemanticCompat(rawInput.actionDecision);
    const taskIntents = this.normalizeTaskIntents(rawInput.taskIntents);
    const topLevelTargetKind = this.pickOne<DialogueTargetKind>(rawInput.targetKind, [
      'chat',
      'idea',
      'todo',
      'task',
    ]) ?? undefined;
    const topLevelPlanIntent = this.normalizePlanIntent(rawInput.planIntent);
    this.logLegacyActionDecisionCompatibility({
      topLevelTargetKind,
      topLevelPlanIntent,
      legacyTargetKind: legacySemanticCompat.targetKind,
      legacyPlanIntent: legacySemanticCompat.planIntent,
    });
    const semanticHint = this.inferSemanticHint(
      topLevelTargetKind ?? legacySemanticCompat.targetKind,
      topLevelPlanIntent ?? legacySemanticCompat.planIntent,
      normalizedTaskIntent,
      escalation,
      requiresTool,
    );
    const resolvedTargetKind = topLevelTargetKind ?? legacySemanticCompat.targetKind ?? semanticHint?.targetKind;
    const resolvedPlanIntent = topLevelPlanIntent ?? legacySemanticCompat.planIntent ?? semanticHint?.planIntent;

    return {
      mode,
      seriousness,
      expectation,
      agency,
      requiresTool,
      taskIntent: normalizedTaskIntent,
      ...(taskIntents.length > 0 ? { taskIntents } : {}),
      slots,
      escalation,
      confidence,
      missingParams,
      ...(suggestedTool !== undefined ? { suggestedTool } : {}),
      ...(resolvedTargetKind ? { targetKind: resolvedTargetKind } : {}),
      ...(resolvedPlanIntent ? { planIntent: resolvedPlanIntent } : {}),
      identityUpdate: identityUpdate ?? {},
      worldStateUpdate: worldStateUpdate ?? {},
      ...(detectedEmotion ? { detectedEmotion } : {}),
      ...(actionHint
        ? {
            actionHint: {
              action: actionHint.action,
              ...(actionHint.reason ? { reason: actionHint.reason } : {}),
            },
          }
        : {}),
    };
  }

  private logLegacyActionDecisionCompatibility(input: {
    topLevelTargetKind?: DialogueTargetKind;
    topLevelPlanIntent?: PlanIntentFromIntent;
    legacyTargetKind?: DialogueTargetKind;
    legacyPlanIntent?: PlanIntentFromIntent;
  }): void {
    const usedLegacyTargetKind = !input.topLevelTargetKind && !!input.legacyTargetKind;
    const usedLegacyPlanIntent = !input.topLevelPlanIntent && !!input.legacyPlanIntent;

    if (!usedLegacyTargetKind && !usedLegacyPlanIntent) return;

    this.logger.log(
      `[Intent compat] legacy actionDecision fields used: targetKind=${usedLegacyTargetKind}, planIntent=${usedLegacyPlanIntent}`,
    );
  }

  private normalizeTaskIntents(raw: unknown): TaskIntentItem[] {
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const validIntents: DialogueTaskIntent[] = [
      'none', 'weather_query', 'book_download', 'general_tool',
      'timesheet', 'dev_task', 'set_reminder', 'checkin', 'device_screenshot', 'page_screenshot',
    ];

    return raw
      .filter((item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && !Array.isArray(item),
      )
      .filter((item) => typeof item.intent === 'string' && validIntents.includes(item.intent as DialogueTaskIntent))
      .map((item) => ({
        intent: item.intent as DialogueTaskIntent,
        slots: this.normalizeSlots(item.slots),
        immediate: typeof item.immediate === 'boolean' ? item.immediate : true,
      }));
  }

  private normalizeActionHint(raw: unknown): ActionHintFromIntent | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const action = typeof o.action === 'string' ? o.action.trim() : '';
    if (!action) return undefined;
    const reason = typeof o.reason === 'string' ? o.reason.trim() : undefined;
    return {
      action,
      ...(reason ? { reason } : {}),
    };
  }

  private extractLegacySemanticCompat(raw: unknown): {
    targetKind?: DialogueTargetKind;
    planIntent?: PlanIntentFromIntent;
  } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const o = raw as Record<string, unknown>;
    const targetKind = this.pickOne<DialogueTargetKind>(o.targetKind, [
      'chat',
      'idea',
      'todo',
      'task',
    ]) ?? undefined;
    const planIntent = this.normalizePlanIntent(o.planIntent);
    return {
      ...(targetKind ? { targetKind } : {}),
      ...(planIntent ? { planIntent } : {}),
    };
  }

  private normalizePlanIntent(raw: unknown): PlanIntentFromIntent | undefined {
    if (typeof raw === 'string') {
      const type = this.pickOne<DialoguePlanIntentType>(raw, ['none', 'notify', 'action']);
      return type ? { type } : undefined;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const type = this.pickOne<DialoguePlanIntentType>(o.type, ['none', 'notify', 'action']);
    if (!type) return undefined;
    const reason = typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim() : undefined;
    return {
      type,
      ...(reason ? { reason } : {}),
    };
  }

  private inferSemanticHint(
    targetKind: DialogueTargetKind | undefined,
    planIntent: PlanIntentFromIntent | undefined,
    taskIntent: DialogueTaskIntent,
    escalation: DialogueEscalation,
    requiresTool: boolean,
  ): { targetKind?: DialogueTargetKind; planIntent?: PlanIntentFromIntent } | undefined {
    const inferredTargetKind = targetKind ?? this.inferTargetKind(taskIntent, escalation, requiresTool);
    const inferredPlanIntent = planIntent ?? this.inferPlanIntent(taskIntent);
    if (!inferredTargetKind && !inferredPlanIntent) return undefined;
    return {
      ...(inferredTargetKind ? { targetKind: inferredTargetKind } : {}),
      ...(inferredPlanIntent ? { planIntent: inferredPlanIntent } : {}),
    };
  }

  private inferTargetKind(
    taskIntent: DialogueTaskIntent,
    escalation: DialogueEscalation,
    requiresTool: boolean,
  ): DialogueTargetKind {
    if (taskIntent === 'set_reminder') return 'todo';
    if (taskIntent !== 'none' || requiresTool) return 'task';
    if (escalation === '可记录') return 'idea';
    if (escalation === '应转任务') return 'todo';
    return 'chat';
  }

  private inferPlanIntent(taskIntent: DialogueTaskIntent): PlanIntentFromIntent | undefined {
    if (taskIntent === 'set_reminder') {
      return { type: 'notify' };
    }
    return undefined;
  }

  private normalizeIdentityUpdate(raw: unknown): IdentityUpdateFromIntent | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const out: IdentityUpdateFromIntent = {};
    if (typeof o.city === 'string' && o.city.trim()) out.city = o.city.trim();
    if (typeof o.timezone === 'string' && o.timezone.trim()) out.timezone = o.timezone.trim();
    if (typeof o.language === 'string' && o.language.trim()) out.language = o.language.trim();
    if (typeof o.conversationMode === 'string' && o.conversationMode.trim()) {
      out.conversationMode = o.conversationMode.trim();
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private normalizeWorldStateUpdate(raw: unknown): WorldStateUpdateFromIntent | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const out: WorldStateUpdateFromIntent = {};
    if (typeof o.city === 'string' && o.city.trim()) out.city = o.city.trim();
    if (typeof o.timezone === 'string' && o.timezone.trim()) out.timezone = o.timezone.trim();
    if (typeof o.language === 'string' && o.language.trim()) out.language = o.language.trim();
    if (typeof o.device === 'string' && o.device.trim()) out.device = o.device.trim();
    if (typeof o.conversationMode === 'string' && o.conversationMode.trim()) {
      out.conversationMode = o.conversationMode.trim();
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private pickOne<T extends string>(value: unknown, allowed: readonly T[]): T | null {
    if (typeof value !== 'string') return null;
    return (allowed as readonly string[]).includes(value) ? (value as T) : null;
  }

  /** 坐标格式：经度,纬度，十进制，最多两位小数（和风 API 约定） */
  private static readonly COORD_REGEX = /^-?\d+(\.\d{1,2})?,\s*-?\d+(\.\d{1,2})?$/;

  private buildHintSlots(
    toolHint: DialogueTaskIntent,
    userInput: string,
    worldState: WorldState | null | undefined,
    now: Date,
  ): DialogueIntentState['slots'] {
    const text = userInput.trim();
    const slots: DialogueIntentState['slots'] = {};

    if (!text) {
      return slots;
    }

    if (toolHint === 'weather_query') {
      const coord = text.match(IntentService.COORD_REGEX);
      if (coord?.[0]) {
        slots.location = coord[0].replace(/\s+/g, '');
      }

      const dateLabel = text.match(/今天|明天|后天|现在|当前/);
      if (dateLabel?.[0]) {
        slots.dateLabel = dateLabel[0] === '现在' ? '当前' : dateLabel[0];
      }

      const cityMatch = text.match(/([一-龥]{2,12})(?:的)?(?:天气|气温|温度|下雨|带伞|冷不冷|热不热)/);
      if (cityMatch?.[1]) {
        slots.city = cityMatch[1].trim();
      } else if (worldState?.city?.trim()) {
        slots.city = worldState.city.trim();
      }
      return slots;
    }

    if (toolHint === 'set_reminder') {
      if (/取消|删除|关掉/.test(text)) {
        slots.reminderAction = 'cancel';
      } else if (/列表|哪些提醒|看看提醒|提醒有哪些|全部提醒/.test(text)) {
        slots.reminderAction = 'list';
      } else {
        slots.reminderAction = 'create';
      }

      if (slots.reminderAction === 'cancel') {
        const target = text.match(/(?:取消|删除|关掉)(?:一下)?(?:提醒)?(.+)/);
        if (target?.[1]?.trim()) {
          slots.reminderTarget = target[1].trim();
        }
        return slots;
      }

      if (slots.reminderAction === 'list') {
        return slots;
      }

      if (/工作日/.test(text)) {
        slots.reminderSchedule = 'weekday';
      } else if (/每天/.test(text)) {
        slots.reminderSchedule = 'daily';
      } else {
        const weekly = text.match(/每周([一二三四五六日天])/);
        if (weekly?.[1]) {
          slots.reminderSchedule = 'weekly';
          slots.reminderWeekday = this.mapChineseWeekday(weekly[1]);
        } else {
          slots.reminderSchedule = 'once';
        }
      }

      const relativeRunAt = this.extractRelativeRunAt(text, now);
      const clockTime = this.extractClockTime(text);
      if (relativeRunAt) {
        slots.reminderRunAt = relativeRunAt;
      } else if (slots.reminderSchedule === 'once') {
        const absoluteRunAt = this.extractAbsoluteRunAt(text, now, clockTime);
        if (absoluteRunAt) {
          slots.reminderRunAt = absoluteRunAt;
        }
      }

      if (!slots.reminderRunAt && clockTime) {
        slots.reminderTime = this.formatHHMM(clockTime.hour, clockTime.minute);
      }

      const reason = text.match(/提醒我(.+)/)?.[1]
        ?? text.match(/提醒(.+)/)?.[1]
        ?? text.match(/记得(.+)/)?.[1]
        ?? '';
      const normalizedReason = reason
        .replace(/^(在|于|到)?(今天|明天|后天|每天|工作日|每周[一二三四五六日天])?/g, '')
        .replace(/(\d{1,2})([:：点时]\d{0,2})?.*$/g, '')
        .replace(/^(早上|上午|中午|下午|晚上|夜里|晚间)/, '')
        .trim();
      if (normalizedReason) {
        slots.reminderReason = normalizedReason;
      }

      return slots;
    }

    if (toolHint === 'book_download') {
      const choiceIndex = text.match(/^\s*(\d{1,2})\s*$/);
      if (choiceIndex?.[1]) {
        slots.bookChoiceIndex = Number(choiceIndex[1]);
      }
      const bookName = text.match(/(?:下载|找|下)(?:一下|一本|一部|个)?\s*(.+?)(?:这本书|这本|书|epub|mobi|pdf)?$/i)?.[1]?.trim();
      if (bookName) {
        slots.bookName = bookName;
      }
      return slots;
    }

    if (toolHint === 'timesheet') {
      if (/提交/.test(text)) {
        slots.timesheetAction = 'submit';
      } else if (/确认/.test(text)) {
        slots.timesheetAction = 'confirm';
      } else if (/查询|本月|缺勤|出勤/.test(text)) {
        slots.timesheetAction = 'query_missing';
      } else {
        slots.timesheetAction = 'preview';
      }
      const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const month = text.match(/\b(\d{4}-\d{2})\b/);
      if (date?.[1]) {
        slots.timesheetDate = date[1];
      } else if (month?.[1]) {
        slots.timesheetMonth = month[1];
      }
      return slots;
    }

    if (toolHint === 'page_screenshot') {
      const url = text.match(/https?:\/\/[^\s]+/i)?.[0];
      if (url) {
        slots.screenshotUrl = url;
      }
      const selector = text.match(/selector[:：]\s*([^\s]+)$/i)?.[1];
      if (selector) {
        slots.screenshotSelector = selector;
      }
    }

    return slots;
  }

  private inferMissingParamsFromHint(
    toolHint: DialogueTaskIntent,
    slots: DialogueIntentState['slots'],
    worldState?: WorldState | null,
  ): string[] {
    const missing = new Set<string>();

    if (toolHint === 'weather_query' && !slots.city && !slots.location && !worldState?.city) {
      missing.add('city');
    }

    if (toolHint === 'book_download' && !slots.bookName && slots.bookChoiceIndex === undefined) {
      missing.add('bookName');
    }

    if (toolHint === 'set_reminder') {
      if ((slots.reminderAction ?? 'create') === 'create') {
        if (!slots.reminderReason) {
          missing.add('reminderReason');
        }
        if (!slots.reminderRunAt && !slots.reminderTime) {
          missing.add('reminderTime');
        }
        if (slots.reminderSchedule === 'weekly' && slots.reminderWeekday === undefined) {
          missing.add('reminderWeekday');
        }
      }
    }

    if (toolHint === 'page_screenshot' && !slots.screenshotUrl) {
      missing.add('screenshotUrl');
    }

    return [...missing];
  }

  private extractRelativeRunAt(text: string, now: Date): string | null {
    if (/半小时后/.test(text)) {
      return this.toLocalIso(new Date(now.getTime() + 30 * 60 * 1000));
    }

    const minutesLater = text.match(/(\d+)\s*分钟后/);
    if (minutesLater?.[1]) {
      return this.toLocalIso(new Date(now.getTime() + Number(minutesLater[1]) * 60 * 1000));
    }

    const hoursLater = text.match(/(\d+)\s*小时后/);
    if (hoursLater?.[1]) {
      return this.toLocalIso(new Date(now.getTime() + Number(hoursLater[1]) * 60 * 60 * 1000));
    }

    return null;
  }

  private extractAbsoluteRunAt(
    text: string,
    now: Date,
    clockTime: { hour: number; minute: number } | null,
  ): string | null {
    if (!clockTime) {
      return null;
    }

    let dayOffset = 0;
    if (/后天/.test(text)) {
      dayOffset = 2;
    } else if (/明天/.test(text)) {
      dayOffset = 1;
    }

    const runAt = new Date(now);
    runAt.setSeconds(0, 0);
    runAt.setHours(clockTime.hour, clockTime.minute, 0, 0);
    if (dayOffset > 0) {
      runAt.setDate(runAt.getDate() + dayOffset);
    } else if (!/今天/.test(text) && runAt.getTime() <= now.getTime()) {
      runAt.setDate(runAt.getDate() + 1);
    }

    return this.toLocalIso(runAt);
  }

  private extractClockTime(text: string): { hour: number; minute: number } | null {
    const match = text.match(/(早上|上午|中午|下午|晚上|夜里|晚间)?\s*(\d{1,2})(?:[:：点时](\d{1,2}))?/);
    if (!match) {
      return null;
    }

    let hour = Number(match[2]);
    const minute = match[3] ? Number(match[3]) : 0;
    const period = match[1] ?? '';

    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
      return null;
    }

    if ((period === '下午' || period === '晚上' || period === '晚间') && hour < 12) {
      hour += 12;
    } else if (period === '中午' && hour < 11) {
      hour += 12;
    } else if ((period === '夜里' || period === '凌晨') && hour === 12) {
      hour = 0;
    }

    return { hour, minute };
  }

  private formatHHMM(hour: number, minute: number): string {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private mapChineseWeekday(value: string): number | undefined {
    const table: Record<string, number> = {
      日: 0,
      天: 0,
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
    };
    return table[value];
  }

  private toLocalIso(value: Date): string {
    const pad = (num: number) => String(Math.trunc(Math.abs(num))).padStart(2, '0');
    const year = value.getFullYear();
    const month = pad(value.getMonth() + 1);
    const day = pad(value.getDate());
    const hour = pad(value.getHours());
    const minute = pad(value.getMinutes());
    const second = pad(value.getSeconds());
    const offsetMinutes = -value.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const offsetHour = pad(offsetMinutes / 60);
    const offsetMinute = pad(offsetMinutes % 60);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;
  }

  private normalizeSlots(raw: unknown): DialogueIntentState['slots'] {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const input = raw as Record<string, unknown>;
    const slots: DialogueIntentState['slots'] = {};
    if (typeof input.city === 'string' && input.city.trim()) {
      slots.city = input.city.trim();
    }
    if (typeof input.district === 'string' && input.district.trim()) {
      slots.district = input.district.trim();
    }
    if (typeof input.dateLabel === 'string' && input.dateLabel.trim()) {
      slots.dateLabel = input.dateLabel.trim();
    }
    if (typeof input.bookName === 'string' && input.bookName.trim()) {
      slots.bookName = input.bookName.trim();
    }
    if (typeof input.bookChoiceIndex === 'number' && Number.isInteger(input.bookChoiceIndex) && input.bookChoiceIndex >= 0) {
      slots.bookChoiceIndex = input.bookChoiceIndex;
    }
    // 工时上报槽位
    const timesheetActionAllowed = ['preview', 'confirm', 'submit', 'query_missing'] as const;
    const tsAction = this.pickOne(input.timesheetAction, timesheetActionAllowed);
    if (tsAction) slots.timesheetAction = tsAction;
    if (typeof input.timesheetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.timesheetDate.trim())) {
      slots.timesheetDate = input.timesheetDate.trim();
    }
    if (typeof input.timesheetMonth === 'string' && /^\d{4}-\d{2}$/.test(input.timesheetMonth.trim())) {
      slots.timesheetMonth = input.timesheetMonth.trim();
    }
    if (typeof input.timesheetRawOverride === 'string' && input.timesheetRawOverride.trim()) {
      slots.timesheetRawOverride = input.timesheetRawOverride.trim();
    }
    // 提醒槽位
    const reminderActionAllowed = ['create', 'list', 'cancel'] as const;
    const rmAction = this.pickOne(input.reminderAction, reminderActionAllowed);
    if (rmAction) slots.reminderAction = rmAction;
    if (typeof input.reminderReason === 'string' && input.reminderReason.trim()) {
      slots.reminderReason = input.reminderReason.trim();
    }
    const reminderScheduleAllowed = ['once', 'daily', 'weekday', 'weekly'] as const;
    const rmSchedule = this.pickOne(input.reminderSchedule, reminderScheduleAllowed);
    if (rmSchedule) slots.reminderSchedule = rmSchedule;
    if (typeof input.reminderRunAt === 'string' && input.reminderRunAt.trim()) {
      const runAt = input.reminderRunAt.trim();
      if (!Number.isNaN(new Date(runAt).getTime())) {
        slots.reminderRunAt = runAt;
      }
    }
    if (typeof input.reminderTime === 'string' && input.reminderTime.trim()) {
      slots.reminderTime = input.reminderTime.trim();
    }
    if (typeof input.reminderWeekday === 'number' && Number.isInteger(input.reminderWeekday) && input.reminderWeekday >= 0 && input.reminderWeekday <= 6) {
      slots.reminderWeekday = input.reminderWeekday;
    }
    if (typeof input.reminderWeekday === 'string' && /^\d$/.test(input.reminderWeekday.trim())) {
      const weekday = Number(input.reminderWeekday.trim());
      if (weekday >= 0 && weekday <= 6) {
        slots.reminderWeekday = weekday;
      }
    }
    if (typeof input.reminderTarget === 'string' && input.reminderTarget.trim()) {
      slots.reminderTarget = input.reminderTarget.trim();
    }
    // 网页截图槽位
    if (typeof input.screenshotUrl === 'string' && input.screenshotUrl.trim()) {
      slots.screenshotUrl = input.screenshotUrl.trim();
    }
    if (typeof input.screenshotSelector === 'string' && input.screenshotSelector.trim()) {
      slots.screenshotSelector = input.screenshotSelector.trim();
    }
    // location 仅存坐标串，不把城市名写入
    const locRaw = typeof input.location === 'string' ? input.location.trim() : '';
    if (locRaw && IntentService.COORD_REGEX.test(locRaw)) {
      slots.location = locRaw;
    }
    const lat = typeof input.latitude === 'string' ? input.latitude.trim() : (typeof input.lat === 'string' ? input.lat.trim() : '');
    const lon = typeof input.longitude === 'string' ? input.longitude.trim() : (typeof input.lon === 'string' ? input.lon.trim() : '');
    if (lat && lon && IntentService.COORD_REGEX.test(`${lon},${lat}`)) {
      slots.location = `${lon},${lat}`;
    }
    return slots;
  }

  private normalizeMissingParams(
    missingParams: string[],
    taskIntent: DialogueTaskIntent,
    slots: DialogueIntentState['slots'],
  ): string[] {
    const set = new Set(missingParams.map((item) => item.trim()).filter(Boolean));

    if (taskIntent === 'page_screenshot') {
      if (!slots.screenshotUrl) {
        set.add('screenshotUrl');
      }
    }

    if (taskIntent === 'set_reminder') {
      const action = slots.reminderAction ?? 'create';
      if (action === 'create') {
        if (!slots.reminderReason) {
          set.add('reminderReason');
        }

        const hasTriggerTime = Boolean(slots.reminderRunAt || slots.reminderTime);
        if (!hasTriggerTime) {
          set.add('reminderTime');
        }

        if (slots.reminderSchedule === 'weekly' && slots.reminderWeekday === undefined) {
          set.add('reminderWeekday');
        }
      }
    }

    return [...set];
  }
}
