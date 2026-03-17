/** 消息通道：决定消息进入哪条处理链 */
export type MessageChannel = 'chat' | 'dev';

export interface SendMessageMetadata {
  /** DevAgent 可选工作区路径（允许绝对/相对路径，后端会归一化） */
  workspaceRoot?: string;
  /** 可选项目展示名，不传则后端从目录名推导 */
  projectScope?: string;
  /** DevAgent 执行模式：agent 直接委派 Claude Code，orchestrated 走编排（默认 orchestrated） */
  devRunMode?: 'orchestrated' | 'agent';
  /** 是否强制创建新的 session，而不是复用当前会话线程 */
  forceNewSession?: boolean;
}

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
  /** 可选附加上下文（当前仅 dev workspace 使用） */
  metadata?: SendMessageMetadata;
}
