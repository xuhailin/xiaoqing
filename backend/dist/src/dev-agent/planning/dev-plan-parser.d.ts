import type { DevPlan } from '../dev-agent.types';
export declare class DevPlanParser {
    private readonly logger;
    parse(response: string, fallbackCommand: string): DevPlan;
    private extractJson;
}
