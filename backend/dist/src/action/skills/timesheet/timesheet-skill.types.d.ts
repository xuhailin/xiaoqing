export interface TimesheetSkillExecuteParams {
    action: 'preview' | 'confirm' | 'submit' | 'query_missing';
    targetDate?: string;
    targetMonth?: string;
    rawOverride?: string;
}
export interface TimesheetOverrideEntry {
    displayName: string;
    content?: string;
    hours: number;
}
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
    previewEntries?: TimesheetPreviewEntry[];
}
