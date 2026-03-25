export type DesignPageType = 'chat' | 'workbench' | 'memory';
export type DesignPreset = 'warm-tech' | 'serious-workbench' | 'quiet-personal';

/** 前端页面注册表条目（project-pages.yaml） */
export interface ProjectPage {
  name: string;
  route: string;
  pageType: DesignPageType;
  preset: DesignPreset;
  componentPath: string;
  aliases: string[];
}
export type DesignAuditStatus = 'pass' | 'needs_refine' | 'needs_structure_change' | 'blocked';
export type DesignFindingSeverity = 'high' | 'medium' | 'low';

/** 审查模式：code=只审代码, visual=只看截图, full=两者合并 */
export type DesignAuditMode = 'code' | 'visual' | 'full';

/** 设计对话消息角色 */
export type DesignMessageRole = 'user' | 'assistant' | 'system';

/** 设计对话状态 */
export type DesignConversationStatus = 'active' | 'completed' | 'archived';

const PAGE_TYPE_PRESET_MAP: Record<DesignPageType, DesignPreset> = {
  chat: 'warm-tech',
  workbench: 'serious-workbench',
  memory: 'quiet-personal',
};

export function defaultPresetForPageType(pageType: DesignPageType): DesignPreset {
  return PAGE_TYPE_PRESET_MAP[pageType];
}

export interface DesignAuditRequest {
  /** 页面名称，e.g. "memory-hub" */
  pageName: string;
  /** 页面类型，决定使用哪个 preset */
  pageType: DesignPageType;
  /** 可选：覆盖自动选择的 preset */
  preset?: DesignPreset;
  /** 审查模式，默认 full */
  mode?: DesignAuditMode;
  /** 可选：页面 URL 或路由路径（如 "/memory"），用于截图。不填则跳过视觉审查 */
  pageUrl?: string;
  /** 可选：目标文件路径（相对于项目根目录），不填则由 agent 自动发现 */
  targetFiles?: string[];
  /** 可选：补充审查备注 */
  notes?: string;
  /** 可选：工作区根目录，默认使用配置的项目根目录 */
  workspaceRoot?: string;
}

export interface DesignFinding {
  id: string;
  rule: string;
  severity: DesignFindingSeverity;
  location: string;
  problem: string;
  impact: string;
  evidence?: string;
  /** 标记此 finding 来源：code 审查还是 visual 审查 */
  source?: 'code' | 'visual';
}

export interface DesignFixAction {
  action: string;
  target: string;
  type: string;
  dependsOn?: string[];
}

export interface DesignAuditResult {
  schemaVersion: 1;
  task: 'audit_result';
  page: {
    name: string;
    pageType: DesignPageType;
    preset: DesignPreset;
  };
  summary: {
    status: DesignAuditStatus;
    riskLevel: 'low' | 'medium' | 'high';
    overallAssessment: string;
  };
  findings: DesignFinding[];
  minimalFixPlan: DesignFixAction[];
  noChangeZones: string[];
  primitiveMapping: {
    preferredTokens: string[];
    preferredPrimitives: string[];
  };
  nextAction: {
    recommendedTask: 'refine' | 'none';
    changeBudget: 'minimal' | 'medium';
    handoffPrompt: string;
  };
}

export interface DesignKnowledge {
  coreRules: string;
  pageTypePatterns: string;
  themeTokens: string;
  sharedPrimitives: string;
  preset: string;
  presetName: DesignPreset;
}

export interface RunDesignAuditResult {
  success: boolean;
  /** 合并后的最终审查结果 */
  auditResult: DesignAuditResult | null;
  /** 代码审查原始输出 */
  codeAuditRaw?: string | null;
  /** 视觉审查原始输出 */
  visualAuditRaw?: string | null;
  error: string | null;
  /** 实际执行的审查模式 */
  actualMode: DesignAuditMode;
  durationMs: number;
  costUsd: number;
}

// ── 对话相关类型 ────────────────────────────────

/** 图片输入 */
export interface DesignImageInput {
  /** base64 编码的图片数据（不含 data:image/xxx;base64, 前缀） */
  base64: string;
  /** 图片 MIME 类型 */
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** 用户标注/说明 */
  annotation?: string;
}

/** Design Agent 编排器 / 意图分类器共用的用户意图 */
export type DesignUserIntent =
  | {
      type: 'audit_page';
      pageName: string;
      pageType: DesignPageType;
      pageUrl?: string | null;
      preset?: DesignPreset;
    }
  | { type: 'describe_issue'; description: string }
  | { type: 'upload_screenshot'; images: DesignImageInput[] }
  | { type: 'confirm_changes'; changeIds?: string[]; notes?: string }
  | { type: 'request_modification'; description: string }
  | { type: 'ask_question'; question: string }
  | { type: 'unknown'; raw: string };

/** 设计对话消息 */
export interface DesignConversationMessage {
  id: string;
  conversationId: string;
  role: DesignMessageRole;
  content: string;
  metadata?: {
    /** 用户上传的图片 */
    images?: DesignImageInput[];
    /** 审查结果 */
    auditResult?: DesignAuditResult;
    /** 修改方案 */
    proposedChanges?: ProposedChange[];
    /** 执行结果 */
    executionResult?: {
      success: boolean;
      changedFiles: string[];
      error?: string;
    };
  };
  createdAt: Date;
}

/** 修改方案 */
export interface ProposedChange {
  filePath: string;
  changeType: 'edit' | 'create' | 'delete';
  description: string;
  diff?: string;
}

/** 创建对话请求 */
export interface CreateDesignConversationRequest {
  title?: string;
  pageName?: string;
  pageType?: DesignPageType;
  pageUrl?: string;
  preset?: DesignPreset;
  workspaceRoot?: string;
}

/** 发送消息请求 */
export interface SendDesignMessageRequest {
  content: string;
  /** 用户上传的图片 */
  images?: DesignImageInput[];
  /** 审查参数（首次审查时使用） */
  auditParams?: {
    pageName: string;
    pageType: DesignPageType;
    mode?: DesignAuditMode;
    targetFiles?: string[];
  };
}

/** 对话响应 */
export interface DesignConversationResponse {
  id: string;
  title?: string;
  status: DesignConversationStatus;
  pageName?: string;
  pageType?: string;
  pageUrl?: string;
  preset?: string;
  workspaceRoot?: string;
  createdAt: Date;
  updatedAt: Date;
  messages: DesignConversationMessage[];
}

/** 修改执行请求 */
export interface ApplyChangesRequest {
  conversationId: string;
  /** 确认要应用的修改 IDs（来自 assistant 消息的 proposedChanges） */
  changeIds?: string[];
  /** 用户额外说明 */
  notes?: string;
}

/** 修改执行结果 */
export interface ApplyChangesResult {
  success: boolean;
  changedFiles: string[];
  error?: string;
  newMessageId?: string;
}
