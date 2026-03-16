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
  devReminder: boolean;
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
