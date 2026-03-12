import * as path from 'node:path';
import * as fs from 'node:fs';

export interface TimesheetConfig {
  oaBaseUrl: string;
  workflowEntryUrl: string;
  siteKey: string;
  sessionDir: string;
  loginId: string;
  password: string;
  projectsConfigPath: string;
  gitAuthor: string;
  screenshotDir: string;
  timeoutMs: number;
  headless: boolean;
}

export interface TimesheetProjectMapping {
  /** git 仓库绝对路径 */
  repoPath: string;
  /** OA 研发项目编码，如 Z3008018 */
  rdProjectCode: string;
  /** OA 客户项目编码，如 A3008007 */
  customerProjectCode: string;
  /** 人类可读项目名 */
  displayName: string;
}

export function getTimesheetConfig(env: NodeJS.ProcessEnv = process.env): TimesheetConfig {
  return {
    oaBaseUrl: env.TIMESHEET_OA_URL ?? 'https://oa.synyi.com/wui/index.html',
    workflowEntryUrl: env.TIMESHEET_WORKFLOW_ENTRY_URL
      ?? 'https://oa.synyi.com/wui/index.html?#/main/workflow/add?menuIds=1,12&menuPathIds=1,12&_key=st9cdo',
    siteKey: 'synyi-oa',
    sessionDir: env.RESOURCE_SESSION_DIR ?? '.sessions',
    loginId: env.TIMESHEET_LOGIN_ID ?? '',
    password: env.TIMESHEET_PASSWORD ?? '',
    projectsConfigPath: env.TIMESHEET_PROJECTS_CONFIG ?? 'config/timesheet-projects.json',
    gitAuthor: env.TIMESHEET_GIT_AUTHOR ?? '',
    screenshotDir: env.TIMESHEET_SCREENSHOT_DIR ?? 'assets/timesheet-debug',
    timeoutMs: Number(env.TIMESHEET_TIMEOUT_MS) || 15000,
    headless: env.LOCAL_ACTION_BROWSER_HEADLESS !== 'false',
  };
}

export function loadProjectMappings(configPath: string): TimesheetProjectMapping[] {
  const resolved = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`工时项目映射配置文件不存在: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('工时项目映射配置应为 JSON 数组');
  }
  return parsed as TimesheetProjectMapping[];
}
