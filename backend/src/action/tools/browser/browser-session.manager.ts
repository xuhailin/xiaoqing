import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { StorageState } from './browser.tool';

const DEFAULT_SESSION_DIR = path.join(process.cwd(), '.sessions');

export class BrowserSessionManager {
  private readonly sessionDir: string;

  constructor(sessionDir?: string) {
    this.sessionDir = sessionDir ?? DEFAULT_SESSION_DIR;
  }

  /** 获取指定站点的 session 文件路径 */
  private filePath(siteKey: string): string {
    const safe = siteKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.sessionDir, `${safe}.json`);
  }

  /** 加载已保存的 storageState，不存在或格式错误返回 undefined */
  async load(siteKey: string): Promise<StorageState | undefined> {
    try {
      const raw = await fs.readFile(this.filePath(siteKey), 'utf-8');
      const parsed = JSON.parse(raw) as StorageState;
      if (Array.isArray(parsed.cookies) && Array.isArray(parsed.origins)) {
        return parsed;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** 保存 storageState 到磁盘 */
  async save(siteKey: string, state: StorageState): Promise<void> {
    await fs.mkdir(this.sessionDir, { recursive: true });
    await fs.writeFile(this.filePath(siteKey), JSON.stringify(state, null, 2), 'utf-8');
  }

  /** 清除指定站点的 session 文件 */
  async clear(siteKey: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(siteKey));
    } catch {
      // 文件不存在也视为成功
    }
  }
}
