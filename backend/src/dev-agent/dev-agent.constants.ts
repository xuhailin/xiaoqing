import { resolve } from 'path';

export const DEV_AGENT_DATA_DIR = resolve(__dirname, '../../../data/dev-runs');
export const DEV_AGENT_SKILL_COMMAND_RE = /^\/skill\s+([a-z0-9-]+)\s*$/;

export const MAX_STEPS_PER_ROUND = 2;
export const MAX_PLAN_ROUNDS = 4;
export const MAX_AUTO_REPLAN = 1;
export const MAX_CONSECUTIVE_FAILURES = 2;
export const PREVIEW_LIMIT = 400;

// DevAgent 输入预算（字符级，最小可落地方案）
export const GOAL_MAX_CHARS = 2000;
export const REPLAN_REASON_MAX_CHARS = 500;
export const REPORT_USER_INPUT_MAX_CHARS = 1500;
