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
    repoPath: string;
    rdProjectCode: string;
    customerProjectCode: string;
    displayName: string;
}
export declare function getTimesheetConfig(env?: NodeJS.ProcessEnv): TimesheetConfig;
export declare function loadProjectMappings(configPath: string): TimesheetProjectMapping[];
