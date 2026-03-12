"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var WorkspaceManager_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceManager = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
let WorkspaceManager = WorkspaceManager_1 = class WorkspaceManager {
    logger = new common_1.Logger(WorkspaceManager_1.name);
    projectRoot;
    strategy;
    workspacesDir;
    activeWorkspaces = new Map();
    constructor(config) {
        this.projectRoot = config.get('CLAUDE_CODE_PROJECT_ROOT') || process.cwd();
        this.strategy = (config.get('CLAUDE_CODE_WORKSPACE_STRATEGY') || 'shared');
        this.workspacesDir = (0, path_1.resolve)(__dirname, '../../../../data/dev-workspaces');
    }
    async acquire(sessionId) {
        const existing = this.activeWorkspaces.get(sessionId);
        if (existing) {
            return existing;
        }
        const info = this.strategy === 'worktree'
            ? await this.createWorktree(sessionId)
            : this.createShared();
        this.activeWorkspaces.set(sessionId, info);
        this.logger.log(`Workspace acquired: session=${sessionId} strategy=${info.strategy} cwd=${info.cwd}`);
        return info;
    }
    async release(sessionId) {
        const info = this.activeWorkspaces.get(sessionId);
        if (!info)
            return;
        this.activeWorkspaces.delete(sessionId);
        if (info.needsCleanup && info.strategy === 'worktree') {
            await this.removeWorktree(info);
        }
        this.logger.log(`Workspace released: session=${sessionId}`);
    }
    get(sessionId) {
        return this.activeWorkspaces.get(sessionId);
    }
    createShared() {
        return {
            cwd: this.projectRoot,
            strategy: 'shared',
            needsCleanup: false,
        };
    }
    async createWorktree(sessionId) {
        const isGit = await this.isGitRepo();
        if (!isGit) {
            this.logger.warn('Workspace strategy is worktree but project is not a git repo, falling back to shared');
            return this.createShared();
        }
        const branch = `dev-agent/${sessionId}`;
        const worktreePath = (0, path_1.resolve)(this.workspacesDir, sessionId);
        try {
            await (0, promises_1.mkdir)(this.workspacesDir, { recursive: true });
            await execFileAsync('git', [
                'worktree', 'add', '-b', branch, worktreePath,
            ], { cwd: this.projectRoot });
            this.logger.log(`Git worktree created: branch=${branch} path=${worktreePath}`);
            return {
                cwd: worktreePath,
                strategy: 'worktree',
                branch,
                needsCleanup: true,
            };
        }
        catch (err) {
            this.logger.error(`Failed to create worktree: ${err.message}`, err.stack);
            return this.createShared();
        }
    }
    async removeWorktree(info) {
        try {
            await execFileAsync('git', [
                'worktree', 'remove', info.cwd, '--force',
            ], { cwd: this.projectRoot });
            if (info.branch) {
                await execFileAsync('git', [
                    'branch', '-D', info.branch,
                ], { cwd: this.projectRoot });
            }
            this.logger.log(`Git worktree removed: branch=${info.branch}`);
        }
        catch (err) {
            this.logger.warn(`Failed to cleanup worktree: ${err.message}`);
            try {
                await (0, promises_1.rm)(info.cwd, { recursive: true, force: true });
            }
            catch {
            }
        }
    }
    async isGitRepo() {
        try {
            await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: this.projectRoot });
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.WorkspaceManager = WorkspaceManager;
exports.WorkspaceManager = WorkspaceManager = WorkspaceManager_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WorkspaceManager);
//# sourceMappingURL=workspace-manager.service.js.map