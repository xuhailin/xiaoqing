import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { mkdir, rm, access } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type WorkspaceStrategy = 'shared' | 'worktree';

export interface WorkspaceInfo {
  /** 实际工作目录路径 */
  cwd: string;
  /** 使用的策略 */
  strategy: WorkspaceStrategy;
  /** worktree 分支名（仅 worktree 策略） */
  branch?: string;
  /** 是否需要清理 */
  needsCleanup: boolean;
}

/**
 * Workspace 隔离管理器。
 *
 * 为 Claude Code Agent 执行提供工作目录隔离：
 * - shared: 直接使用项目根目录（无隔离，默认）
 * - worktree: 通过 git worktree 创建隔离分支（需要 git 仓库）
 *
 * 每个 DevSession 可拥有独立 workspace，避免并发任务冲突。
 */
@Injectable()
export class WorkspaceManager {
  private readonly logger = new Logger(WorkspaceManager.name);
  private readonly projectRoot: string;
  private readonly strategy: WorkspaceStrategy;
  private readonly workspacesDir: string;

  /** 活跃 workspace 记录 */
  private readonly activeWorkspaces = new Map<string, WorkspaceInfo>();

  constructor(config: ConfigService) {
    this.projectRoot = config.get('CLAUDE_CODE_PROJECT_ROOT') || process.cwd();
    this.strategy = (config.get('CLAUDE_CODE_WORKSPACE_STRATEGY') || 'shared') as WorkspaceStrategy;
    this.workspacesDir = resolve(__dirname, '../../../../data/dev-workspaces');
  }

  /**
   * 为指定 session 获取或创建 workspace。
   * 同一 sessionId 多次调用返回同一 workspace。
   */
  async acquire(sessionId: string): Promise<WorkspaceInfo> {
    // 已有活跃 workspace 直接复用
    const existing = this.activeWorkspaces.get(sessionId);
    if (existing) {
      return existing;
    }

    const info = this.strategy === 'worktree'
      ? await this.createWorktree(sessionId)
      : this.createShared();

    this.activeWorkspaces.set(sessionId, info);
    this.logger.log(
      `Workspace acquired: session=${sessionId} strategy=${info.strategy} cwd=${info.cwd}`,
    );
    return info;
  }

  /**
   * 释放 workspace。worktree 策略下会清理分支和目录。
   */
  async release(sessionId: string): Promise<void> {
    const info = this.activeWorkspaces.get(sessionId);
    if (!info) return;

    this.activeWorkspaces.delete(sessionId);

    if (info.needsCleanup && info.strategy === 'worktree') {
      await this.removeWorktree(info);
    }

    this.logger.log(`Workspace released: session=${sessionId}`);
  }

  /**
   * 获取当前活跃 workspace（不创建）。
   */
  get(sessionId: string): WorkspaceInfo | undefined {
    return this.activeWorkspaces.get(sessionId);
  }

  // ── shared 策略 ──────────────────────────────────────────

  private createShared(): WorkspaceInfo {
    return {
      cwd: this.projectRoot,
      strategy: 'shared',
      needsCleanup: false,
    };
  }

  // ── worktree 策略 ────────────────────────────────────────

  private async createWorktree(sessionId: string): Promise<WorkspaceInfo> {
    // 检查是否为 git 仓库
    const isGit = await this.isGitRepo();
    if (!isGit) {
      this.logger.warn(
        'Workspace strategy is worktree but project is not a git repo, falling back to shared',
      );
      return this.createShared();
    }

    const branch = `dev-agent/${sessionId}`;
    const worktreePath = resolve(this.workspacesDir, sessionId);

    try {
      // 确保目录存在
      await mkdir(this.workspacesDir, { recursive: true });

      // 创建 worktree（基于当前 HEAD 的新分支）
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
    } catch (err: any) {
      this.logger.error(`Failed to create worktree: ${err.message}`, err.stack);
      // 降级到 shared
      return this.createShared();
    }
  }

  private async removeWorktree(info: WorkspaceInfo): Promise<void> {
    try {
      // 移除 worktree
      await execFileAsync('git', [
        'worktree', 'remove', info.cwd, '--force',
      ], { cwd: this.projectRoot });

      // 删除分支
      if (info.branch) {
        await execFileAsync('git', [
          'branch', '-D', info.branch,
        ], { cwd: this.projectRoot });
      }

      this.logger.log(`Git worktree removed: branch=${info.branch}`);
    } catch (err: any) {
      this.logger.warn(`Failed to cleanup worktree: ${err.message}`);

      // 尝试强制清理目录
      try {
        await rm(info.cwd, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  private async isGitRepo(): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }
}
