import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OpenAI } from 'openai';
import { LlmService } from '../../infra/llm/llm.service';
import { INTENT_PROMPT_VERSION, INTENT_SYSTEM_PROMPT } from '../prompts/intent';
import {
  DEFAULT_INTENT_STATE,
  type DialogueAgency,
  type DialogueEscalation,
  type DialogueExpectation,
  type DialogueIntentState,
  type DialogueMode,
  type DialogueSeriousness,
  type DialogueSuggestedTool,
  type DialogueTaskIntent,
  type IdentityUpdateFromIntent,
  type WorldStateUpdateFromIntent,
} from './intent.types';
import type { WorldState } from '../../infra/world-state/world-state.types';

@Injectable()
export class IntentService {
  private readonly contextRounds: number;
  private readonly perMessageMaxChars: number;

  constructor(
    private llm: LlmService,
    config: ConfigService,
  ) {
    this.contextRounds = Number(config.get('INTENT_CONTEXT_ROUNDS')) || 5;
    this.perMessageMaxChars = Number(config.get('INTENT_MESSAGE_MAX_CHARS')) || 500;
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

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `[${INTENT_PROMPT_VERSION}]\n${INTENT_SYSTEM_PROMPT}${capabilitySuffix}`,
      },
      {
        role: 'user',
        content: `${worldStateText}\n\n最近对话：\n${contextText}\n\n本轮用户输入：\n${currentUserInput}`,
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

    const missingParams = Array.isArray(input.missingParams)
      ? input.missingParams.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [];

    const suggestedToolAllowed: DialogueSuggestedTool[] = ['weather', 'book_download', 'timesheet'];
    const suggestedToolRaw =
      this.pickOne<DialogueSuggestedTool>(input.suggestedTool, suggestedToolAllowed) ??
      this.pickOne<DialogueSuggestedTool>(rawInput.preferredSkill, suggestedToolAllowed);
    const suggestedTool = suggestedToolRaw ??
      (taskIntent === 'weather_query' ? 'weather' : taskIntent === 'book_download' ? 'book_download' : taskIntent === 'timesheet' ? 'timesheet' : undefined);
    const normalizedTaskIntent =
      taskIntent === 'general_tool' && suggestedTool === 'weather'
        ? 'weather_query'
        : taskIntent === 'general_tool' && suggestedTool === 'book_download'
          ? 'book_download'
          : taskIntent === 'general_tool' && suggestedTool === 'timesheet'
            ? 'timesheet'
            : taskIntent;

    const slots = this.normalizeSlots(input.slots as unknown);

    const identityUpdate = this.normalizeIdentityUpdate(rawInput.identityUpdate);
    const worldStateUpdate = this.normalizeWorldStateUpdate(rawInput.worldStateUpdate);

    const detectedEmotion = this.pickOne(
      rawInput.detectedEmotion,
      ['calm', 'happy', 'low', 'anxious', 'irritated', 'tired', 'hurt', 'excited'] as const,
    );

    return {
      mode,
      seriousness,
      expectation,
      agency,
      requiresTool,
      taskIntent: normalizedTaskIntent,
      slots,
      escalation,
      confidence,
      missingParams,
      ...(suggestedTool !== undefined ? { suggestedTool } : {}),
      identityUpdate: identityUpdate ?? {},
      worldStateUpdate: worldStateUpdate ?? {},
      ...(detectedEmotion ? { detectedEmotion } : {}),
    };
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
}
