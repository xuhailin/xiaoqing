import type { DevPlan } from '../dev-agent.types';
export declare class DevPlanNormalizer {
    private readonly logger;
    normalize(plan: DevPlan, fallbackCommand: string): DevPlan;
    private coerceStep;
    private normalizeShellStep;
}
