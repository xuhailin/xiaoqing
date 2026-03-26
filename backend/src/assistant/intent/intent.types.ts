import type { UserEmotion } from '../cognitive-pipeline/cognitive-pipeline.types';

export type DialogueMode = 'chat' | 'thinking' | 'decision' | 'task';
export type DialogueSeriousness = 'casual' | 'semi' | 'focused';
export type DialogueExpectation = '陪聊' | '一起想' | '直接给结果';
export type DialogueAgency = '朋友' | '并肩思考者' | '顾问' | '执行器';
export type DialogueEscalation = '不推进' | '可记录' | '应转任务';
export type DialogueTaskIntent = 'none' | 'weather_query' | 'book_download' | 'general_tool' | 'timesheet' | 'dev_task' | 'set_reminder' | 'checkin' | 'device_screenshot' | 'page_screenshot';
/** LLM 给出的建议工具；最终是否调用由策略层决定 */
export type DialogueSuggestedTool = 'weather' | 'book_download' | 'timesheet' | 'reminder';
export type DialogueTargetKind = 'chat' | 'idea' | 'todo' | 'task';
export type DialoguePlanIntentType = 'none' | 'notify' | 'action';

/**
 * 多意图识别项：当用户一句话包含多个动作时，LLM 输出 taskIntents 数组。
 * 例："打卡并明天提醒我开会" → [{ intent: 'checkin', immediate: true }, { intent: 'set_reminder', slots: {...}, immediate: false }]
 */
export interface TaskIntentItem {
  intent: DialogueTaskIntent;
  slots?: DialogueIntentSlots;
  /** true=立即执行，false=延迟执行（创建 Plan） */
  immediate?: boolean;
}

export interface DialogueIntentSlots {
  city?: string;
  district?: string;
  dateLabel?: string;
  location?: string;
  /** 电子书下载：规范书名 */
  bookName?: string;
  /** 电子书下载：用户选择的候选序号（上轮返回多条匹配时） */
  bookChoiceIndex?: number;
  /** 工时上报：操作类型 */
  timesheetAction?: 'preview' | 'confirm' | 'submit' | 'query_missing';
  /** 工时上报：目标日期 YYYY-MM-DD */
  timesheetDate?: string;
  /** 工时上报：目标月份 YYYY-MM（query_missing 时使用） */
  timesheetMonth?: string;
  /** 工时上报：确认时的原始修改文本，如 "住院医生 松江现场支持 8" */
  timesheetRawOverride?: string;
  /** 提醒：操作类型 */
  reminderAction?: 'create' | 'list' | 'cancel';
  /** 提醒：原因/内容（如 "吃晚饭"） */
  reminderReason?: string;
  /** 提醒：频率 */
  reminderSchedule?: 'once' | 'daily' | 'weekday' | 'weekly';
  /** 提醒：一次性触发时间，ISO 8601 */
  reminderRunAt?: string;
  /** 提醒：周期触发时间，HH:MM */
  reminderTime?: string;
  /** 提醒：每周几，0=周日，1=周一，...，6=周六 */
  reminderWeekday?: number;
  /** 提醒：取消时的提醒 ID 或关键词 */
  reminderTarget?: string;
  /** 网页截图：目标 URL */
  screenshotUrl?: string;
  /** 网页截图：CSS selector（可选，不传则全页截图） */
  screenshotSelector?: string;
  [key: string]: unknown;
}

/** 长期稳定信息：常住地、默认语言、默认时区等（identity 锚定，intent_v8+） */
export interface IdentityUpdateFromIntent {
  city?: string;
  timezone?: string;
  language?: string;
  conversationMode?: string;
}

/** 当前环境信息：当前所在城市、当前时区、当前设备等（intent_v8 仅保留短期状态） */
export interface WorldStateUpdateFromIntent {
  city?: string;
  timezone?: string;
  language?: string;
  device?: string;
  conversationMode?: string;
}

/** LLM 给出的行动决策建议（intent_v13+），最终是否采纳由 ActionReasoner 决定 */
export interface PlanIntentFromIntent {
  type: DialoguePlanIntentType;
  reason?: string;
}

export interface ActionHintFromIntent {
  action: string;
  reason?: string;
}

export interface DialogueIntentState {
  mode: DialogueMode;
  seriousness: DialogueSeriousness;
  expectation: DialogueExpectation;
  agency: DialogueAgency;
  /** 是否需要进入工具执行链（由 LLM 识别） */
  requiresTool: boolean;
  /** 任务意图类型（主意图，执行通道不在这里表达） */
  taskIntent: DialogueTaskIntent;
  /** 多意图列表（当用户一句话包含多个动作时）。为空或 undefined 时等价于只有 taskIntent 单意图 */
  taskIntents?: TaskIntentItem[];
  /** 结构化槽位，供策略层和执行层使用 */
  slots: DialogueIntentSlots;
  escalation: DialogueEscalation;
  confidence: number;
  /** 若推断出工具任务但缺少必要参数（如查天气缺城市），列出缺失参数名 */
  missingParams: string[];
  suggestedTool?: DialogueSuggestedTool | null;
  /** 本轮内容最适合落到哪里，由语义层产出，供决策层直接消费 */
  targetKind?: DialogueTargetKind;
  /** 是否需要进入 Plan（提醒/执行），由语义层产出，供决策层直接消费 */
  planIntent?: PlanIntentFromIntent;
  /** 长期稳定信息（常住地、默认语言、默认时区），intent_v8+ */
  identityUpdate?: IdentityUpdateFromIntent;
  /** 当前环境信息（当前所在城市、当前时区、当前设备），intent_v8 仅短期状态 */
  worldStateUpdate?: WorldStateUpdateFromIntent;
  /** LLM 推断的用户当前情绪（intent_v9+），用于替代 regex 匹配 */
  detectedEmotion?: UserEmotion;
  /** LLM 给出的行动建议（可选参考，不再承载语义字段主入口） */
  actionHint?: ActionHintFromIntent;
}

export const DEFAULT_INTENT_STATE: DialogueIntentState = {
  mode: 'chat',
  seriousness: 'casual',
  expectation: '陪聊',
  agency: '朋友',
  requiresTool: false,
  taskIntent: 'none',
  slots: {},
  escalation: '不推进',
  confidence: 0,
  missingParams: [],
};
