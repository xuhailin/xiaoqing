"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadonlyFileCapabilityService = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
let ReadonlyFileCapabilityService = class ReadonlyFileCapabilityService {
    name = 'readonly-file';
    taskIntent = 'internal_readonly_file';
    channels = [];
    description = 'Internal read-only file access capability for local skills.';
    repoRoot = process.cwd();
    allowedReadme = node_path_1.default.resolve(this.repoRoot, 'README.md');
    allowedPackageJson = node_path_1.default.resolve(this.repoRoot, 'package.json');
    allowedSrcRoot = node_path_1.default.resolve(this.repoRoot, 'src');
    isAvailable() {
        return true;
    }
    async execute(request) {
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
                const content = await (0, promises_1.readFile)(resolved.absolutePath, 'utf8');
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
            const dirEntries = await (0, promises_1.readdir)(resolved.absolutePath, { withFileTypes: true });
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
        }
        catch (error) {
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
    parseParams(params) {
        const actionRaw = typeof params.action === 'string' ? params.action.trim() : '';
        const pathRaw = typeof params.path === 'string' ? params.path.trim() : '';
        const action = actionRaw;
        if (!pathRaw)
            return null;
        if (action !== 'exists' && action !== 'read' && action !== 'list') {
            return null;
        }
        return { action, path: pathRaw };
    }
    resolveAllowedPath(rawPath) {
        const absolutePath = node_path_1.default.isAbsolute(rawPath)
            ? node_path_1.default.resolve(rawPath)
            : node_path_1.default.resolve(this.repoRoot, rawPath);
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
    isWithin(target, base) {
        const rel = node_path_1.default.relative(base, target);
        return rel === '' || (!rel.startsWith('..') && !node_path_1.default.isAbsolute(rel));
    }
    async checkExists(absolutePath) {
        try {
            await (0, promises_1.access)(absolutePath);
            return true;
        }
        catch {
            return false;
        }
    }
};
exports.ReadonlyFileCapabilityService = ReadonlyFileCapabilityService;
exports.ReadonlyFileCapabilityService = ReadonlyFileCapabilityService = __decorate([
    (0, common_1.Injectable)()
], ReadonlyFileCapabilityService);
//# sourceMappingURL=readonly-file-capability.service.js.map