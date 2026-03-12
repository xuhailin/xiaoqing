/**
 * 默认世界状态（World State / Default Context）：稳定事实型上下文。
 * 用于意图补全与推理前提，不写入长期记忆，不参与情感/人格推导。
 */
export interface WorldState {
  /** 城市/地区名（如 "东京" "北京"），供天气等技能解析为坐标 */
  city?: string;
  /** 时区（如 "JST" "Asia/Shanghai"），供「几点了」等推理 */
  timezone?: string;
  /** 用户偏好语言（如 "zh-CN" "ja"） */
  language?: string;
  /** 设备（如 "desktop" "mobile"），可选 */
  device?: string;
  /** 当前对话模式，可选 */
  conversationMode?: 'chat' | 'thinking' | 'decision' | 'task';
}

/**
 * 仅当用户明确声明变化时由意图模块输出；空字符串表示不更新该字段。
 */
export interface WorldStateUpdate {
  city?: string;
  timezone?: string;
  language?: string;
  device?: string;
  conversationMode?: string;
}

/** 从 DB 读出的 JSON 可能为 null 或部分字段 */
export type WorldStateRecord = WorldState | null;
