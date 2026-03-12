export interface GitLogEntry {
    repoPath: string;
    commits: string[];
}
export declare function readGitLogForDate(repoPath: string, date: string, author?: string): GitLogEntry;
export declare function distributeHours(projectCount: number, totalHours?: number): number[];
