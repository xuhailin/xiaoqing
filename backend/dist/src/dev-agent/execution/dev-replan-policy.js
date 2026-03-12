"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevReplanPolicy = void 0;
const common_1 = require("@nestjs/common");
const shell_command_policy_1 = require("../shell-command-policy");
let DevReplanPolicy = class DevReplanPolicy {
    shouldAutoReplan(errorType) {
        return errorType === 'COMMAND_NOT_ALLOWED'
            || errorType === 'FILE_NOT_FOUND'
            || errorType === 'NON_ZERO_EXIT'
            || errorType === 'COMMAND_NOT_FOUND';
    }
    buildFailureSuggestion(taskContext) {
        const lastError = taskContext.errors.at(-1);
        if (!lastError)
            return '请检查步骤命令与路径后重试。';
        switch (lastError.errorType) {
            case 'COMMAND_NOT_ALLOWED':
                return `请改用允许命令：${shell_command_policy_1.ALLOWED_SHELL_COMMANDS.join(', ')}`;
            case 'HIGH_RISK_SYNTAX':
                return '检测到高风险 shell 语法，建议人工确认后手动执行。';
            case 'FILE_NOT_FOUND':
                return '建议先执行 ls/find 确认文件路径，再执行目标命令。';
            case 'COMMAND_NOT_FOUND':
                return '命令不存在，建议改用 node/npx/npm/git/curl 等已允许命令。';
            case 'PERMISSION_DENIED':
                return '权限受限，建议改用只读操作或调整任务目标。';
            case 'TIMEOUT':
                return '命令耗时过长，建议拆分为更小步骤。';
            case 'NON_ZERO_EXIT':
                return '命令返回非 0，建议先查看 stderr 并分步排查。';
            default:
                return '建议缩小任务范围并重试。';
        }
    }
};
exports.DevReplanPolicy = DevReplanPolicy;
exports.DevReplanPolicy = DevReplanPolicy = __decorate([
    (0, common_1.Injectable)()
], DevReplanPolicy);
//# sourceMappingURL=dev-replan-policy.js.map