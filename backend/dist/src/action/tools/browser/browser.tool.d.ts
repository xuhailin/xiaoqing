type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
export interface BrowserToolOptions {
    headless?: boolean;
    timeoutMs?: number;
}
export interface DownloadHandle {
    saveAs(path: string): Promise<void>;
}
export interface DialogHandle {
    message(): string;
    accept(): Promise<void>;
    dismiss(): Promise<void>;
}
export interface LocatorHandle {
    locator(selector: string): LocatorHandle;
    first(): LocatorHandle;
    count(): Promise<number>;
    click(): Promise<void>;
    getAttribute(name: string): Promise<string | null>;
    textContent(): Promise<string | null>;
    all?(): Promise<LocatorHandle[]>;
}
export interface PageHandle {
    goto(url: string, opts?: {
        waitUntil?: WaitUntil;
        timeout?: number;
    }): Promise<void>;
    click(selector: string, opts?: {
        timeout?: number;
    }): Promise<void>;
    fill(selector: string, value: string, opts?: {
        timeout?: number;
    }): Promise<void>;
    waitForSelector(selector: string, opts?: {
        timeout?: number;
    }): Promise<void>;
    waitForEvent(event: 'download', opts?: {
        timeout?: number;
    }): Promise<DownloadHandle>;
    waitForEvent(event: 'popup', opts?: {
        timeout?: number;
    }): Promise<PageHandle>;
    waitForURL(url: string | RegExp, opts?: {
        timeout?: number;
    }): Promise<void>;
    locator(selector: string): LocatorHandle;
    once?(event: 'dialog', handler: (dialog: DialogHandle) => void): void;
    screenshot?(opts?: {
        path?: string;
        fullPage?: boolean;
    }): Promise<Buffer>;
}
export interface StorageState {
    cookies: Array<Record<string, unknown>>;
    origins: Array<Record<string, unknown>>;
}
export declare class BrowserTool {
    private readonly headless;
    private readonly timeoutMs;
    private browser;
    private context;
    constructor(opts?: BrowserToolOptions);
    launch(): Promise<void>;
    createContext(storageState?: StorageState): Promise<void>;
    getStorageState(): Promise<StorageState>;
    newPage(): Promise<PageHandle>;
    goto(page: PageHandle, url: string, waitUntil?: WaitUntil): Promise<void>;
    click(page: PageHandle, selector: string): Promise<void>;
    fill(page: PageHandle, selector: string, value: string): Promise<void>;
    waitFor(page: PageHandle, selector: string): Promise<void>;
    waitForURL(page: PageHandle, url: string | RegExp): Promise<void>;
    waitForDownload(page: PageHandle): Promise<DownloadHandle>;
    waitForPopup(page: PageHandle): Promise<PageHandle>;
    screenshot(page: PageHandle, savePath: string): Promise<void>;
    saveDownload(download: DownloadHandle, savePath: string): Promise<void>;
    close(): Promise<void>;
    private normalizeUrl;
    private normalizeSelector;
}
export {};
