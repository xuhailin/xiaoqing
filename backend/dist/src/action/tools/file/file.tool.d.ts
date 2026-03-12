export interface FileToolOptions {
    allowlist?: string[];
    cwd?: string;
}
export declare class FileTool {
    private readonly cwd;
    private readonly allowlist;
    constructor(opts?: FileToolOptions);
    getAllowlist(): string[];
    ensureDir(targetPath: string): Promise<string>;
    readText(targetPath: string): Promise<string>;
    writeText(targetPath: string, content: string): Promise<string>;
    exists(targetPath: string): Promise<boolean>;
    list(targetPath: string): Promise<string[]>;
    private parseAllowlist;
    private normalizeAndCheck;
    private resolvePath;
}
