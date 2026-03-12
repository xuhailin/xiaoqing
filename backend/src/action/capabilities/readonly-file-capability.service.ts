import { Injectable } from '@nestjs/common';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ICapability } from '../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../capability.types';
import type { MessageChannel } from '../../gateway/message-router.types';

type ReadonlyAction = 'exists' | 'read' | 'list';

interface ParsedRequest {
  action: ReadonlyAction;
  path: string;
}

@Injectable()
export class ReadonlyFileCapabilityService implements ICapability {
  readonly name = 'readonly-file';
  readonly taskIntent = 'internal_readonly_file';
  readonly channels: MessageChannel[] = [];
  readonly description = 'Internal read-only file access capability for local skills.';

  private readonly repoRoot = process.cwd();
  private readonly allowedReadme = path.resolve(this.repoRoot, 'README.md');
  private readonly allowedPackageJson = path.resolve(this.repoRoot, 'package.json');
  private readonly allowedSrcRoot = path.resolve(this.repoRoot, 'src');

  isAvailable(): boolean {
    return true;
  }

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const parsed = this.parseParams(request.params);
    if (!parsed) {
      return {
        success: false,
        content: null,
        error: 'readonly-file params invalid, expected { action: exists|read|list, path: string }',
      };
    }

    const resolved = this.resolveAllowedPath(parsed.path);
    if (!resolved.allowed) {
      return {
        success: false,
        content: null,
        error: `path not allowed: ${resolved.absolutePath}`,
        meta: {
          action: parsed.action,
          path: parsed.path,
          absolutePath: resolved.absolutePath,
        },
      };
    }

    if (parsed.action === 'exists') {
      const exists = await this.checkExists(resolved.absolutePath);
      return {
        success: true,
        content: exists ? 'true' : 'false',
        error: null,
        meta: {
          action: parsed.action,
          path: parsed.path,
          absolutePath: resolved.absolutePath,
          exists,
        },
      };
    }

    try {
      if (parsed.action === 'read') {
        const content = await readFile(resolved.absolutePath, 'utf8');
        return {
          success: true,
          content,
          error: null,
          meta: {
            action: parsed.action,
            path: parsed.path,
            absolutePath: resolved.absolutePath,
            bytes: content.length,
          },
        };
      }

      const dirEntries = await readdir(resolved.absolutePath, { withFileTypes: true });
      const entries = dirEntries
        .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
        .sort((a, b) => a.localeCompare(b));
      return {
        success: true,
        content: entries.join('\n'),
        error: null,
        meta: {
          action: parsed.action,
          path: parsed.path,
          absolutePath: resolved.absolutePath,
          entries,
          count: entries.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: null,
        error: message,
        meta: {
          action: parsed.action,
          path: parsed.path,
          absolutePath: resolved.absolutePath,
        },
      };
    }
  }

  private parseParams(params: Record<string, unknown>): ParsedRequest | null {
    const actionRaw = typeof params.action === 'string' ? params.action.trim() : '';
    const pathRaw = typeof params.path === 'string' ? params.path.trim() : '';
    const action = actionRaw as ReadonlyAction;
    if (!pathRaw) return null;

    if (action !== 'exists' && action !== 'read' && action !== 'list') {
      return null;
    }

    return { action, path: pathRaw };
  }

  private resolveAllowedPath(rawPath: string): { absolutePath: string; allowed: boolean } {
    const absolutePath = path.isAbsolute(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(this.repoRoot, rawPath);

    // 固定白名单：README.md / package.json / src/
    if (absolutePath === this.allowedReadme) {
      return { absolutePath, allowed: true };
    }
    if (absolutePath === this.allowedPackageJson) {
      return { absolutePath, allowed: true };
    }
    if (this.isWithin(absolutePath, this.allowedSrcRoot)) {
      return { absolutePath, allowed: true };
    }
    return { absolutePath, allowed: false };
  }

  private isWithin(target: string, base: string): boolean {
    const rel = path.relative(base, target);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  private async checkExists(absolutePath: string): Promise<boolean> {
    try {
      await access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
