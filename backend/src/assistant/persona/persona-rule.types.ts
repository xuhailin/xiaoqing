export type PersonaRuleCategory =
  | 'BREVITY'
  | 'TONE'
  | 'PACING'
  | 'BOUNDARY'
  | 'ERROR_HANDLING';

export type PersonaRuleStatus = 'CANDIDATE' | 'STABLE' | 'CORE' | 'DEPRECATED';

export type PersonaRuleSource = 'DEFAULT' | 'EVOLVED' | 'USER';

export type PersonaRuleProtect = 'NORMAL' | 'LOCKED';

export interface PersonaRuleRecord {
  id: string;
  key: string;
  content: string;
  category: PersonaRuleCategory;
  status: PersonaRuleStatus;
  weight: number;
  source: PersonaRuleSource;
  protectLevel: PersonaRuleProtect;
  pendingContent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 进化系统提交的合并请求 */
export interface PersonaRuleMergeDraft {
  key: string;
  content: string;
  category: PersonaRuleCategory;
  weight?: number;
  reason: string;
}

export type PersonaRuleUpdateActor = 'user' | 'system';
