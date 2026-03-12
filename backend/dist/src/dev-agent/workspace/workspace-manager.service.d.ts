import { ConfigService } from '@nestjs/config';
export type WorkspaceStrategy = 'shared' | 'worktree';
export interface WorkspaceInfo {
    cwd: string;
    strategy: WorkspaceStrategy;
    branch?: string;
    needsCleanup: boolean;
}
export declare class WorkspaceManager {
    private readonly logger;
    private readonly projectRoot;
    private readonly strategy;
    private readonly workspacesDir;
    private readonly activeWorkspaces;
    constructor(config: ConfigService);
    acquire(sessionId: string): Promise<WorkspaceInfo>;
    release(sessionId: string): Promise<void>;
    get(sessionId: string): WorkspaceInfo | undefined;
    private createShared;
    private createWorktree;
    private removeWorktree;
    private isGitRepo;
}
