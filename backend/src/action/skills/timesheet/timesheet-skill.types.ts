export interface TimesheetSkillExecuteParams {
  action: 'preview' | 'confirm' | 'submit' | 'query_missing';
  /** 目标日期，格式 YYYY-MM-DD */
  targetDate?: string;
  /** 目标月份，格式 YYYY-MM（query_missing 时使用） */
  targetMonth?: string;
  /**
   * 用户确认时的原始修改文本，如 "住院医生 松江现场支持 8"。
   * confirm 动作时使用，由 skill service 解析并模糊匹配项目。
   */
  rawOverride?: string;
}

/** 用户对单个项目的工时覆盖 */
export interface TimesheetOverrideEntry {
  /** 模糊匹配到的项目 displayName */
  displayName: string;
  /** 用户自定义的工作内容（替换 git commits） */
  content?: string;
  /** 工时 */
  hours: number;
}

/** 预览阶段返回的单个项目数据 */
export interface TimesheetPreviewEntry {
  rdProjectCode: string;
  customerProjectCode: string;
  displayName: string;
  commits: string[];
  suggestedHours: number;
}

export interface TimesheetSubmittedProject {
  rdProjectCode: string;
  customerProjectCode: string;
  displayName: string;
  hours: number;
  contentPreview: string;
}

export interface TimesheetSkillResult {
  success: boolean;
  content: string;
  error?: string;
  submittedProjects?: TimesheetSubmittedProject[];
  totalHours?: number;
  /** preview 动作返回的预览数据 */
  previewEntries?: TimesheetPreviewEntry[];
}
