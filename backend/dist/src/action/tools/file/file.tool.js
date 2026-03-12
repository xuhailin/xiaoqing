"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTool = void 0;
const fs = __importStar(require("node:fs/promises"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const tool_error_1 = require("../core/tool-error");
class FileTool {
    cwd;
    allowlist;
    constructor(opts = {}) {
        this.cwd = opts.cwd ?? process.cwd();
        const envAllowlist = this.parseAllowlist(process.env.LOCAL_ACTION_FILE_ALLOWLIST);
        const booksDir = this.resolvePath(process.env.BOOKS_DOWNLOAD_DIR ?? 'assets/books');
        const raw = [booksDir, os.tmpdir(), ...envAllowlist, ...(opts.allowlist ?? [])];
        this.allowlist = Array.from(new Set(raw.map((x) => this.resolvePath(x))));
    }
    getAllowlist() {
        return [...this.allowlist];
    }
    async ensureDir(targetPath) {
        const normalized = this.normalizeAndCheck(targetPath);
        try {
            await fs.mkdir(normalized, { recursive: true });
            return normalized;
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `创建目录失败: ${normalized}`, e);
        }
    }
    async readText(targetPath) {
        const normalized = this.normalizeAndCheck(targetPath);
        try {
            return await fs.readFile(normalized, 'utf8');
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `读取文件失败: ${normalized}`, e);
        }
    }
    async writeText(targetPath, content) {
        const normalized = this.normalizeAndCheck(targetPath);
        await this.ensureDir(path.dirname(normalized));
        try {
            await fs.writeFile(normalized, content, 'utf8');
            return normalized;
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `写入文件失败: ${normalized}`, e);
        }
    }
    async exists(targetPath) {
        const normalized = this.normalizeAndCheck(targetPath);
        try {
            await fs.access(normalized);
            return true;
        }
        catch {
            return false;
        }
    }
    async list(targetPath) {
        const normalized = this.normalizeAndCheck(targetPath);
        try {
            const entries = await fs.readdir(normalized, { withFileTypes: true });
            return entries.map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`);
        }
        catch (e) {
            throw new tool_error_1.ToolError('EXECUTION_ERROR', `列出目录失败: ${normalized}`, e);
        }
    }
    parseAllowlist(value) {
        if (!value)
            return [];
        return value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }
    normalizeAndCheck(targetPath) {
        const normalized = this.resolvePath(targetPath);
        const allowed = this.allowlist.some((base) => {
            const rel = path.relative(base, normalized);
            return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
        });
        if (!allowed) {
            throw new tool_error_1.ToolError('VALIDATION_ERROR', `路径不在白名单内: ${normalized}`);
        }
        return normalized;
    }
    resolvePath(targetPath) {
        const raw = String(targetPath ?? '').trim();
        if (!raw)
            throw new tool_error_1.ToolError('VALIDATION_ERROR', '路径不能为空');
        return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(this.cwd, raw);
    }
}
exports.FileTool = FileTool;
//# sourceMappingURL=file.tool.js.map