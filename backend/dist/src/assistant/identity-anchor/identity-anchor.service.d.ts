import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
export interface AnchorDto {
    id: string;
    label: string;
    content: string;
    sortOrder: number;
    nickname: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare class IdentityAnchorService {
    private prisma;
    private readonly defaultUserKey;
    constructor(prisma: PrismaService, config: ConfigService);
    list(): Promise<AnchorDto[]>;
    getActiveAnchors(): Promise<AnchorDto[]>;
    buildAnchorText(anchors: AnchorDto[]): string | null;
    create(data: {
        label: string;
        content: string;
        sortOrder?: number;
        nickname?: string;
    }): Promise<AnchorDto>;
    update(id: string, data: {
        label?: string;
        content?: string;
        sortOrder?: number;
        nickname?: string;
    }): Promise<AnchorDto>;
    remove(id: string): Promise<AnchorDto>;
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
