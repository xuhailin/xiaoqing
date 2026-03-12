import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAbsolute, relative, resolve } from 'path';
import { constants as fsConstants } from 'fs';
import { mkdir, rm, readdir, access, stat, realpath } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { DevWorkspaceMeta } from './workspace-meta';

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
export class WorkspaceManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkspaceManager.name);
  private readonly projectRoot: string;
  private readonly strategy: WorkspaceStrategy;
  private readonly workspacesDir: string;
  private readonly allowedWorkspaceRoots: string[];

  /** 活跃 workspace 记录 */
  private readonly activeWorkspaces = new Map<string, WorkspaceInfo>();
  /** session 级 workspace 绑定（支持跨 run 复用） */
  private readonly sessionWorkspaceBindings = new Map<string, DevWorkspaceMeta>();

  constructor(config: ConfigService) {
    this.projectRoot = config.get('CLAUDE_CODE_PROJECT_ROOT') || process.cwd();
    this.strategy = (config.get('CLAUDE_CODE_WORKSPACE_STRATEGY') || 'shared') as WorkspaceStrategy;
    this.workspacesDir = resolve(__dirname, '../../../../data/dev-workspaces');
    this.allowedWorkspaceRoots = this.parseAllowedWorkspaceRoots(
      config.get('DEV_AGENT_ALLOWED_WORKSPACE_ROOTS') || '',
    );
  }

  async onModuleInit(): Promise<void> {
    if (this.strategy !== 'worktree') return;
    await this.cleanupOrphanedWorktrees();
  }

  async onModuleDestroy(): Promise<void> {
    const sessions = [...this.activeWorkspaces.keys()];
    for (const sessionId of sessions) {
      try {
        await this.release(sessionId);
      } catch (err) {
        this.logger.warn(`Failed to release workspace on shutdown: session=${sessionId} err=${String(err)}`);
      }
    }
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

    const boundWorkspace = this.sessionWorkspaceBindings.get(sessionId);
    const info = boundWorkspace
      ? this.createShared(boundWorkspace.workspaceRoot)
      : this.strategy === 'worktree'
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

  getDefaultWorkspaceRoot(): string {
    return this.projectRoot;
  }

  getSessionWorkspace(sessionId: string): DevWorkspaceMeta | null {
    return this.sessionWorkspaceBindings.get(sessionId) ?? null;
  }

  hasSessionWorkspace(sessionId: string): boolean {
    return this.sessionWorkspaceBindings.has(sessionId);
  }

  /**
   * 绑定 session 的工作区。后续该 session 的 shell/agent 执行将固定在该路径。
   */
  async bindSessionWorkspace(sessionId: string, workspace: DevWorkspaceMeta): Promise<DevWorkspaceMeta> {
    const workspaceRoot = await this.validateWorkspaceRoot(workspace.workspaceRoot);
    const normalized: DevWorkspaceMeta = {
      workspaceRoot,
      projectScope: workspace.projectScope?.trim() || workspaceRoot,
    };
    this.sessionWorkspaceBindings.set(sessionId, normalized);

    // 绑定变更时释放旧 workspace，确保后续 acquire 使用新目录。
    if (this.activeWorkspaces.has(sessionId)) {
      await this.release(sessionId);
    }

    this.logger.log(
      `Workspace bound: session=${sessionId} project=${normalized.projectScope} root=${normalized.workspaceRoot}`,
    );
    return normalized;
  }

  // ── shared 策略 ──────────────────────────────────────────

  private createShared(cwd = this.projectRoot): WorkspaceInfo {
    return {
      cwd,
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

  /**
   * 启动时扫描 workspacesDir，清理上次进程残留的孤立 worktree 目录。
   */
  private async cleanupOrphanedWorktrees(): Promise<void> {
    try {
      await access(this.workspacesDir);
    } catch {
      return; // 目录不存在，无需清理
    }

    try {
      const entries = await readdir(this.workspacesDir);
      if (entries.length === 0) return;

      this.logger.warn(`Found ${entries.length} orphaned workspace(s), cleaning up...`);

      for (const entry of entries) {
        const worktreePath = resolve(this.workspacesDir, entry);
        const branch = `dev-agent/${entry}`;
        try {
          await this.removeWorktree({ cwd: worktreePath, strategy: 'worktree', branch, needsCleanup: true });
          this.logger.log(`Cleaned up orphaned worktree: ${entry}`);
        } catch (err) {
          this.logger.warn(`Failed to cleanup orphaned worktree ${entry}: ${String(err)}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to scan workspaces dir for cleanup: ${String(err)}`);
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

  private parseAllowedWorkspaceRoots(raw: string): string[] {
    const values = String(raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return values.map((item) => resolve(item));
  }

  private async validateWorkspaceRoot(workspaceRoot: string): Promise<string> {
    const normalized = isAbsolute(workspaceRoot)
      ? resolve(workspaceRoot)
      : resolve(process.cwd(), workspaceRoot);
    const real = await realpath(normalized).catch(() => normalized);

    if (!this.isAllowedWorkspaceRoot(real)) {
      throw new Error(
        `workspaceRoot is not allowed: ${real}. Set DEV_AGENT_ALLOWED_WORKSPACE_ROOTS to allow it.`,
      );
    }

    let targetStat;
    try {
      targetStat = await stat(real);
    } catch {
      throw new Error(`workspaceRoot does not exist: ${real}`);
    }
    if (!targetStat.isDirectory()) {
      throw new Error(`workspaceRoot is not a directory: ${real}`);
    }

    try {
      await access(real, fsConstants.R_OK | fsConstants.X_OK);
    } catch {
      throw new Error(`workspaceRoot is not accessible: ${real}`);
    }

    return real;
  }

  private isAllowedWorkspaceRoot(candidate: string): boolean {
    if (this.allowedWorkspaceRoots.length === 0) {
      return true;
    }
    return this.allowedWorkspaceRoots.some((root) => this.isSameOrSubPath(root, candidate));
  }

  private isSameOrSubPath(parent: string, child: string): boolean {
    const rel = relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  }
}
