import { CognitiveGrowthService, type GrowthItemType } from './cognitive-growth.service';
export declare class GrowthController {
    private growth;
    constructor(growth: CognitiveGrowthService);
    getPending(): Promise<import("./cognitive-growth.service").PendingGrowthItem[]>;
    confirm(id: string, body: {
        type: GrowthItemType;
    }): Promise<{
        ok: boolean;
    }>;
    reject(id: string, body: {
        type: GrowthItemType;
    }): Promise<{
        ok: boolean;
    }>;
    private validateType;
}
