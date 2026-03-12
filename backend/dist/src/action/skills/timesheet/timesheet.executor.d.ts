import { BrowserTool } from '../../tools/browser/browser.tool';
import { BrowserSessionManager } from '../../tools/browser/browser-session.manager';
import { type TimesheetConfig, type TimesheetProjectMapping } from './timesheet.config';
import type { TimesheetSubmittedProject } from './timesheet-skill.types';
export interface TimesheetWorkflowResult {
    ok: boolean;
    message: string;
    submittedProjects?: TimesheetSubmittedProject[];
    totalHours?: number;
}
export interface TimesheetOverrideInput {
    displayName: string;
    content?: string;
    hours: number;
}
export interface TimesheetWorkflowDeps {
    browser?: BrowserTool;
    config?: TimesheetConfig;
    sessionManager?: BrowserSessionManager;
    overrides?: TimesheetOverrideInput[];
    mappings?: TimesheetProjectMapping[];
}
export declare function executeTimesheetWorkflow(targetDate: string, deps?: TimesheetWorkflowDeps): Promise<TimesheetWorkflowResult>;
