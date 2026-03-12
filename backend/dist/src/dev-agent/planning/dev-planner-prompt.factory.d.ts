import { CapabilityRegistry } from '../../action/capability-registry.service';
import type { DevTaskContext } from '../dev-task-context';
export declare class DevPlannerPromptFactory {
    private readonly capabilityRegistry;
    constructor(capabilityRegistry: CapabilityRegistry);
    create(goal: string, taskContext: DevTaskContext, options: {
        round: number;
        replanReason: string | null;
    }): {
        systemPrompt: string;
        userPrompt: string;
    };
    private formatTaskContextForPlanner;
}
