import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolError } from '../core/tool-error';

export interface FileToolOptions {
  allowlist?: string[];
  cwd?: string;
}

export class FileTool {
  private readonly cwd: string;
  private readonly allowlist: string[];

  constructor(opts: FileToolOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    const envAllowlist = this.parseAllowlist(process.env.LOCAL_ACTION_FILE_ALLOWLIST);
    const booksDir = this.resolvePath(process.env.BOOKS_DOWNLOAD_DIR ?? 'assets/books');
    const raw = [booksDir, os.tmpdir(), ...envAllowlist, ...(opts.allowlist ?? [])];
    this.allowlist = Array.from(new Set(raw.map((x) => this.resolvePath(x))));
  }

  getAllowlist(): string[] {
    return [...this.allowlist];
  }

  async ensureDir(targetPath: string): Promise<string> {
    const normalized = this.normalizeAndCheck(targetPath);
    try {
      await fs.mkdir(normalized, { recursive: true });
      return normalized;
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `创建目录失败: ${normalized}`, e);
    }
  }

  async readText(targetPath: string): Promise<string> {
    const normalized = this.normalizeAndCheck(targetPath);
    try {
      return await fs.readFile(normalized, 'utf8');
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `读取文件失败: ${normalized}`, e);
    }
  }

  async writeText(targetPath: string, content: string): Promise<string> {
    const normalized = this.normalizeAndCheck(targetPath);
    await this.ensureDir(path.dirname(normalized));
    try {
      await fs.writeFile(normalized, content, 'utf8');
      return normalized;
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `写入文件失败: ${normalized}`, e);
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    const normalized = this.normalizeAndCheck(targetPath);
    try {
      await fs.access(normalized);
      return true;
    } catch {
      return false;
    }
  }

  async list(targetPath: string): Promise<string[]> {
    const normalized = this.normalizeAndCheck(targetPath);
    try {
      const entries = await fs.readdir(normalized, { withFileTypes: true });
      return entries.map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`);
    } catch (e) {
      throw new ToolError('EXECUTION_ERROR', `列出目录失败: ${normalized}`, e);
    }
  }

  private parseAllowlist(value: string | undefined): string[] {
    if (!value) return [];
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private normalizeAndCheck(targetPath: string): string {
    const normalized = this.resolvePath(targetPath);
    const allowed = this.allowlist.some((base) => {
      const rel = path.relative(base, normalized);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    });
    if (!allowed) {
      throw new ToolError('VALIDATION_ERROR', `路径不在白名单内: ${normalized}`);
    }
    return normalized;
  }

  private resolvePath(targetPath: string): string {
    const raw = String(targetPath ?? '').trim();
    if (!raw) throw new ToolError('VALIDATION_ERROR', '路径不能为空');
    return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(this.cwd, raw);
  }
}
