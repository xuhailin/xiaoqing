/** 消息通道：决定消息进入哪条处理链 */
export type MessageChannel = 'chat' | 'dev';

/** 路由判定结果 */
export interface RouteDecision {
  channel: MessageChannel;
  /** 路由后实际传给处理链的内容（可能去掉了前缀） */
  content: string;
  /** 路由判定依据 */
  reason: string;
}

/** 统一入口请求体 */
export interface SendMessageBody {
  content: string;
  /** 显式指定消息通道，缺省为 chat */
  mode?: MessageChannel;
}
