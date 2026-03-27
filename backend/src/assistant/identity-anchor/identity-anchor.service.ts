import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';

const MAX_ANCHORS = 5;

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

@Injectable()
export class IdentityAnchorService {
  private readonly defaultUserKey: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.defaultUserKey = config.get<string>('DEFAULT_USER_KEY') || 'default-user';
  }

  /** 返回所有条目（含已停用），按 sortOrder 排序 */
  async list(userKey: string = this.defaultUserKey): Promise<AnchorDto[]> {
    return this.prisma.identityAnchor.findMany({
      where: { userKey },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** 返回所有 active 条目，始终注入用 */
  async getActiveAnchors(userKey: string = this.defaultUserKey): Promise<AnchorDto[]> {
    return this.prisma.identityAnchor.findMany({
      where: { userKey, isActive: true },
      orderBy: { sortOrder: 'asc' },
      take: MAX_ANCHORS,
    });
  }

  /** 将多条 active anchor 拼接为注入文本，返回 null 表示无数据 */
  buildAnchorText(anchors: AnchorDto[]): string | null {
    if (anchors.length === 0) return null;
    const lines = anchors.map((a) => {
      const prefix = a.nickname ? `${a.nickname}` : '';
      const labelTag = `[${a.label}]`;
      return prefix
        ? `- ${labelTag} ${prefix}：${a.content}`
        : `- ${labelTag} ${a.content}`;
    });
    return lines.join('\n');
  }

  async create(data: {
    label: string;
    content: string;
    sortOrder?: number;
    nickname?: string;
  }, userKey: string = this.defaultUserKey): Promise<AnchorDto> {
    const activeCount = await this.prisma.identityAnchor.count({
      where: { userKey, isActive: true },
    });
    if (activeCount >= MAX_ANCHORS) {
      throw new BadRequestException(
        `身份锚定条目上限为 ${MAX_ANCHORS} 条，请先停用或删除现有条目`,
      );
    }
    return this.prisma.identityAnchor.create({
      data: {
        label: data.label,
        content: data.content,
        sortOrder: data.sortOrder ?? 0,
        nickname: data.nickname ?? null,
        userKey,
      },
    });
  }

  async update(
    id: string,
    data: {
      label?: string;
      content?: string;
      sortOrder?: number;
      nickname?: string;
    },
  ): Promise<AnchorDto> {
    // 写变更历史（仅 content 变化时）
    if (data.content !== undefined) {
      const existing = await this.prisma.identityAnchor.findUnique({
        where: { id },
      });
      if (existing && existing.content !== data.content) {
        await this.prisma.identityAnchorHistory.create({
          data: {
            anchorId: id,
            previousContent: existing.content,
            newContent: data.content,
          },
        });
      }
    }

    return this.prisma.identityAnchor.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.nickname !== undefined && { nickname: data.nickname }),
      },
    });
  }

  /** 软删除：设 isActive=false */
  async remove(id: string): Promise<AnchorDto> {
    return this.prisma.identityAnchor.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getHistory(userKey: string = this.defaultUserKey) {
    const anchors = await this.prisma.identityAnchor.findMany({
      where: { userKey },
      select: { id: true },
    });
    return this.prisma.identityAnchorHistory.findMany({
      where: { anchorId: { in: anchors.map((item) => item.id) } },
      orderBy: { changedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * 一次性迁移：将 Memory 表中 category='identity_anchor' 的记录迁移到新表。
   * 迁移后将原记录从 Memory 表软删除（decayScore=0）。
   */
  async migrateFromMemory(userKey: string = this.defaultUserKey): Promise<{ migrated: number }> {
    const oldRecords = await this.prisma.memory.findMany({
      where: { category: 'identity_anchor', userId: userKey },
    });
    if (oldRecords.length === 0) return { migrated: 0 };

    let migrated = 0;
    for (const record of oldRecords) {
      await this.prisma.identityAnchor.create({
        data: {
          userKey,
          label: 'basic',
          content: record.content,
          sortOrder: 0,
          nickname: null,
        },
      });
      // 软删除旧记录
      await this.prisma.memory.update({
        where: { id: record.id },
        data: { decayScore: 0 },
      });
      migrated++;
    }
    return { migrated };
  }
}
