import { IdentityAnchorService } from './identity-anchor.service';
export declare class IdentityAnchorController {
    private service;
    constructor(service: IdentityAnchorService);
    list(): Promise<import("./identity-anchor.service").AnchorDto[]>;
    create(body: {
        label: string;
        content: string;
        sortOrder?: number;
        nickname?: string;
    }): Promise<import("./identity-anchor.service").AnchorDto>;
    update(id: string, body: {
        label?: string;
        content?: string;
        sortOrder?: number;
        nickname?: string;
    }): Promise<import("./identity-anchor.service").AnchorDto>;
    remove(id: string): Promise<import("./identity-anchor.service").AnchorDto>;
    getHistory(): Promise<{
        id: string;
        anchorId: string;
        previousContent: string;
        newContent: string;
        changedAt: Date;
    }[]>;
    migrateFromMemory(): Promise<{
        migrated: number;
    }>;
}
