export type DesignPageType = 'chat' | 'workbench' | 'memory';
export type DesignPreset = 'warm-tech' | 'serious-workbench' | 'quiet-personal';
export type DesignAuditStatus = 'pass' | 'needs_refine' | 'needs_structure_change' | 'blocked';
export type DesignFindingSeverity = 'high' | 'medium' | 'low';

/** 审查模式：code=只审代码, visual=只看截图, full=两者合并 */
export type DesignAuditMode = 'code' | 'visual' | 'full';

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
