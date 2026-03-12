"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevExecutorResolver = void 0;
const common_1 = require("@nestjs/common");
const capability_registry_service_1 = require("../../action/capability-registry.service");
const openclaw_executor_1 = require("../executors/openclaw.executor");
const shell_executor_1 = require("../executors/shell.executor");
const claude_code_executor_1 = require("../executors/claude-code.executor");
let DevExecutorResolver = class DevExecutorResolver {
    capabilityRegistry;
    shellExecutor;
    openclawExecutor;
    claudeCodeExecutor;
    constructor(capabilityRegistry, shellExecutor, openclawExecutor, claudeCodeExecutor) {
        this.capabilityRegistry = capabilityRegistry;
        this.shellExecutor = shellExecutor;
        this.openclawExecutor = openclawExecutor;
        this.claudeCodeExecutor = claudeCodeExecutor;
    }
    resolve(name) {
        const cap = this.capabilityRegistry.get(name);
        if (cap) {
            return cap;
        }
        switch (name) {
            case 'claude-code':
                return this.claudeCodeExecutor;
            case 'openclaw':
                return this.openclawExecutor;
            case 'shell':
            default:
                return this.shellExecutor;
        }
    }
};
exports.DevExecutorResolver = DevExecutorResolver;
exports.DevExecutorResolver = DevExecutorResolver = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [capability_registry_service_1.CapabilityRegistry,
        shell_executor_1.ShellExecutor,
        openclaw_executor_1.OpenClawExecutor,
        claude_code_executor_1.ClaudeCodeExecutor])
], DevExecutorResolver);
//# sourceMappingURL=dev-executor-resolver.js.map