import type { StorageState } from './browser.tool';
export declare class BrowserSessionManager {
    private readonly sessionDir;
    constructor(sessionDir?: string);
    private filePath;
    load(siteKey: string): Promise<StorageState | undefined>;
    save(siteKey: string, state: StorageState): Promise<void>;
    clear(siteKey: string): Promise<void>;
}
