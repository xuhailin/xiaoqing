export interface SystemInfo {
  name: string;
  version: string;
  environment: string;
}

export interface AgentInfo {
  name: string;
  channel: string;
  active: boolean;
}

export interface CapabilityInfo {
  name: string;
  description?: string;
  taskIntent?: string[];
  surface?: string;
  scope?: string;
  visibility?: string;
  strategies?: string[];
  cost?: string;
}

export interface ExecutorInfo extends CapabilityInfo {
  surface: 'dev';
}

export interface FeatureFlags {
  claudeCode: boolean;
  planScheduler: boolean;
  openclaw: boolean;
  [key: string]: boolean;
}

export interface SystemSelf {
  system: SystemInfo;
  agents: AgentInfo[];
  capabilities: CapabilityInfo[];
  features: FeatureFlags;
  executors: ExecutorInfo[];
}

export interface TokenPolicyInfo {
  maxContextTokens: number;
  maxSystemTokens: number;
  memoryMidK: number;
  memoryCandidatesMaxLong: number;
  memoryCandidatesMaxMid: number;
  memoryContentMaxChars: number;
  autoSummarizeThreshold: number;
}

export interface ExternalServiceInfo {
  key: string;
  label: string;
  enabled: boolean;
  summary: string;
  meta?: Record<string, unknown>;
}

export interface SystemSettingsOverview {
  systemSelf: SystemSelf;
  tokenPolicy: TokenPolicyInfo;
  integrations: ExternalServiceInfo[];
}
