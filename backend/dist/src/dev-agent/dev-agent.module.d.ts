import { type OnModuleInit } from '@nestjs/common';
import { ShellExecutor } from './executors/shell.executor';
import { OpenClawExecutor } from './executors/openclaw.executor';
import { ClaudeCodeExecutor } from './executors/claude-code.executor';
import { CapabilityRegistry } from '../action/capability-registry.service';
export declare class DevAgentModule implements OnModuleInit {
    private readonly registry;
    private readonly shell;
    private readonly openclaw;
    private readonly claudeCode;
    constructor(registry: CapabilityRegistry, shell: ShellExecutor, openclaw: OpenClawExecutor, claudeCode: ClaudeCodeExecutor);
    onModuleInit(): void;
}
